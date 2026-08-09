//! CityDevelopment — deterministic, seed-driven city growth, built from NOTHING.
//!
//! Port of development.ts. Growth is deliberately slow and visible: a road
//! stub appears at tick 1, then avenues extend every few ticks, ring roads arc
//! together, zones hug the roads as they appear, and rails/infrastructure
//! arrive later. Every action is a pure function of (seed, tick, grid state) —
//! same seed, same city, tick for tick.
//!
//! Schedule (1 Hz ticks):
//!   tick 1        central road stub
//!   every 5 ticks avenues extend (from tick 5)
//!   ticks 20-44   inner ring road arcs (r=8)
//!   every 4 ticks zone patches (from tick 40, road-hugging)
//!   tick 90/100   power plant + water tower
//!   ticks 120-144 mid ring arcs (r=11)
//!   ticks 150+    rail line extends (along one avenue)
//!   ticks 220/230 second plant + tower
//!   ticks 240-264 outer ring arcs (r=14)
//!   ticks 400+    slow sprawl: roads + patches at growing radius

use crate::grid::SpatialGrid;
use crate::rng::hash2;
use crate::tiles::{
    TILE_TYPE_COMMERCIAL, TILE_TYPE_DIRT, TILE_TYPE_FOREST, TILE_TYPE_GRASS,
    TILE_TYPE_INDUSTRIAL, TILE_TYPE_POWER_PLANT, TILE_TYPE_RAIL, TILE_TYPE_RESIDENTIAL,
    TILE_TYPE_ROAD, TILE_TYPE_SAND, TILE_TYPE_WATER, TILE_TYPE_WATER_TOWER,
};

const DIRS: [(i32, i32); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];

/// Zones & infrastructure may claim grassland, dirt, sand, or cleared forest.
pub fn is_developable_type(type_code: u8) -> bool {
    type_code == TILE_TYPE_GRASS
        || type_code == TILE_TYPE_DIRT
        || type_code == TILE_TYPE_SAND
        || type_code == TILE_TYPE_FOREST
}

/// Roads may blast through any land except water and existing rails.
pub fn is_pavable_type(type_code: u8) -> bool {
    type_code != TILE_TYPE_WATER && type_code != TILE_TYPE_RAIL
}

/// Rails claim undeveloped land and cross roads at grade (level crossings).
fn is_railable_type(type_code: u8) -> bool {
    type_code == TILE_TYPE_GRASS
        || type_code == TILE_TYPE_DIRT
        || type_code == TILE_TYPE_SAND
        || type_code == TILE_TYPE_FOREST
        || type_code == TILE_TYPE_ROAD
}

/// Downtown flattens stone and zones, but never paves roads or rails.
fn is_core_pavable(type_code: u8) -> bool {
    type_code != TILE_TYPE_WATER && type_code != TILE_TYPE_ROAD && type_code != TILE_TYPE_RAIL
}

pub struct CityDevelopment {
    seed: u32,
    /// Set by any placement this tick — returned from step() so callers know
    /// to refresh derived state.
    changed: bool,
}

impl CityDevelopment {
    pub fn new(seed: u32) -> Self {
        Self {
            seed,
            changed: false,
        }
    }

    /// Advance development by one tick. Returns true if the grid changed.
    pub fn step(&mut self, grid: &mut SpatialGrid, tick: i64) -> bool {
        self.changed = false;
        let cx = (grid.width / 2) as i32;
        let cy = (grid.height / 2) as i32;

        if tick == 1 {
            self.stub(grid, cx, cy);
        }
        if tick >= 5 && (tick - 5) % 5 == 0 {
            self.extend_avenue(grid, cx, cy, tick);
        }
        if self.ring_tick(tick, 8, 20) != 0 {
            self.ring_arc(grid, cx, cy, 8, self.ring_tick(tick, 8, 20) - 1);
        }
        if self.ring_tick(tick, 11, 120) != 0 {
            self.ring_arc(grid, cx, cy, 11, self.ring_tick(tick, 11, 120) - 1);
        }
        if self.ring_tick(tick, 14, 240) != 0 {
            self.ring_arc(grid, cx, cy, 14, self.ring_tick(tick, 14, 240) - 1);
        }
        if tick >= 40 && (tick - 40) % 4 == 0 {
            self.zone_patch(grid, cx, cy, tick);
        }
        if tick >= 44 && (tick - 44) % 8 == 0 {
            self.downtown(grid, cx, cy, tick);
        }
        if tick == 90 {
            self.place_core(grid, cx + 2, cy - 2, TILE_TYPE_POWER_PLANT);
        }
        if tick == 100 {
            self.place_core(grid, cx - 2, cy + 2, TILE_TYPE_WATER_TOWER);
        }
        if tick == 220 {
            self.place_core(grid, cx - 9, cy - 9, TILE_TYPE_POWER_PLANT);
        }
        if tick == 230 {
            self.place_core(grid, cx + 9, cy + 9, TILE_TYPE_WATER_TOWER);
        }
        if tick >= 150 && (tick - 150) % 6 == 0 {
            self.extend_rail(grid, cx, cy, tick);
        }
        if tick >= 400 && (tick - 400) % 8 == 0 {
            self.sprawl(grid, cx, cy, tick);
        }

        self.changed
    }

    /// Which ring arc fires this tick (1..4) for a radius scheduled at
    /// `start`, or 0. `_r` is unused in the TS implementation; kept for
    /// signature fidelity.
    fn ring_tick(&self, tick: i64, _r: i32, start: i64) -> i64 {
        if tick < start {
            return 0;
        }
        let k = (tick - start) / 8;
        if (tick - start) % 8 == 0 && k >= 0 && k < 4 {
            k + 1
        } else {
            0
        }
    }

    /// Central plus-shaped road stub — the first stone of the city.
    fn stub(&mut self, grid: &mut SpatialGrid, cx: i32, cy: i32) {
        for (dx, dy) in DIRS {
            self.pave(grid, cx + dx, cy);
            self.pave(grid, cx, cy + dy);
            self.pave(grid, cx + dx * 2, cy);
            self.pave(grid, cx, cy + dy * 2);
        }
    }

    /// Extend one avenue outward by one step (2 tiles). Avenues cycle 0..3.
    fn extend_avenue(&mut self, grid: &mut SpatialGrid, cx: i32, cy: i32, tick: i64) {
        let k = (tick - 5) / 5; // global step: 0,1,2,...
        let avenue = (k % DIRS.len() as i64) as usize;
        let step_for_this_avenue = k / DIRS.len() as i64;
        let (dx, dy) = DIRS[avenue];
        let len = 3 + step_for_this_avenue * 2; // each avenue grows independently
        for r in (len - 1)..=len {
            let x = cx + dx * r as i32;
            let y = cy + dy * r as i32;
            if !grid.in_bounds(x, y) || grid.get(x, y) == TILE_TYPE_WATER {
                break;
            }
            self.pave(grid, x, y);
        }
    }

    /// One side of a square ring road (arc 0=top, 1=right, 2=bottom, 3=left).
    fn ring_arc(&mut self, grid: &mut SpatialGrid, cx: i32, cy: i32, r: i32, arc: i64) {
        for i in -r..=r {
            match arc {
                0 => self.pave(grid, cx + i, cy - r),
                1 => self.pave(grid, cx + r, cy + i),
                2 => self.pave(grid, cx + i, cy + r),
                _ => self.pave(grid, cx - r, cy + i),
            }
        }
    }

    /// A small zone patch that hugs the road network: tiles are zoned only if
    /// they're developable AND near a road. Type by distance from center:
    /// commercial core, then residential, industrial beyond the ring.
    fn zone_patch(&mut self, grid: &mut SpatialGrid, cx: i32, cy: i32, tick: i64) {
        let k = (tick - 40) / 4;
        // Deterministic scatter across the map (k*37/91 mod 41 keeps it spread).
        let px = cx + (((k * 37) % 41) - 20) as i32;
        let py = cy + (((k * 91) % 41) - 20) as i32;
        let center_r = (px - cx).abs().max((py - cy).abs());

        let mut type_code = TILE_TYPE_RESIDENTIAL;
        if center_r <= 3 {
            type_code = TILE_TYPE_COMMERCIAL;
        } else if center_r >= 12 && tick >= 120 {
            type_code = TILE_TYPE_INDUSTRIAL;
        }

        let mut any_near = false;
        for dy in -1..=1 {
            for dx in -1..=1 {
                if self.near_road(grid, px + dx, py + dy) {
                    any_near = true;
                }
            }
        }
        if !any_near {
            return; // no roads yet here — later patches will find them
        }
        for dy in -1..=1 {
            for dx in -1..=1 {
                let x = px + dx;
                let y = py + dy;
                if self.near_road(grid, x, y) {
                    self.place_zone(grid, x, y, type_code);
                }
            }
        }
    }

    /// Downtown spreads one commercial block at a time near the center.
    fn downtown(&mut self, grid: &mut SpatialGrid, cx: i32, cy: i32, tick: i64) {
        let k = (tick - 44) / 8;
        let px = cx + (((k * 5) % 7) - 3) as i32;
        let py = cy + (((k * 13) % 7) - 3) as i32;
        if self.near_road(grid, px, py) {
            self.place_zone(grid, px, py, TILE_TYPE_COMMERCIAL);
        }
    }

    /// True if a ROAD tile exists orthogonally adjacent (zones front the street).
    fn near_road(&self, grid: &SpatialGrid, x: i32, y: i32) -> bool {
        grid.get(x + 1, y) == TILE_TYPE_ROAD
            || grid.get(x - 1, y) == TILE_TYPE_ROAD
            || grid.get(x, y + 1) == TILE_TYPE_ROAD
            || grid.get(x, y - 1) == TILE_TYPE_ROAD
    }

    /// Rail line along one avenue (offset 1 tile), growing outward over time.
    fn extend_rail(&mut self, grid: &mut SpatialGrid, cx: i32, cy: i32, tick: i64) {
        let d = (hash2(self.seed as i32, 555, 7) * 4.0).floor() as usize;
        let (dx, dy) = DIRS[d];
        // Perpendicular offset (choose side deterministically).
        let side: i32 = if hash2(self.seed as i32, 556, 7) < 0.5 { 1 } else { -1 };
        let perp_x = if dx == 0 { side } else { 0 };
        let perp_y = if dy == 0 { side } else { 0 };
        let len = 4 + ((tick - 150) / 6) * 4;
        for r in 2..=len {
            self.place_rail(grid, cx + dx * r as i32 + perp_x, cy + dy * r as i32 + perp_y);
        }
    }

    /// Late-game sprawl: occasional roads + patches at growing radius.
    fn sprawl(&mut self, grid: &mut SpatialGrid, cx: i32, cy: i32, tick: i64) {
        let k = (tick - 400) / 8;
        let avenue = (k % DIRS.len() as i64) as usize;
        let (dx, dy) = DIRS[avenue];
        let r = 16 + ((k / DIRS.len() as i64) % 6) * 2;
        self.pave(grid, cx + dx * r as i32, cy + dy * r as i32);
        self.zone_patch(grid, cx, cy, 40 + k * 4); // reuse patch logic at new offsets
    }

    fn place_zone(&mut self, grid: &mut SpatialGrid, x: i32, y: i32, type_code: u8) {
        if grid.in_bounds(x, y) && is_developable_type(grid.get(x, y)) {
            grid.set(x, y, type_code);
            self.changed = true;
        }
    }

    fn place_core(&mut self, grid: &mut SpatialGrid, x: i32, y: i32, type_code: u8) {
        if grid.in_bounds(x, y) && is_core_pavable(grid.get(x, y)) {
            grid.set(x, y, type_code);
            self.changed = true;
        }
    }

    fn pave(&mut self, grid: &mut SpatialGrid, x: i32, y: i32) {
        if !grid.in_bounds(x, y) {
            return;
        }
        let cur = grid.get(x, y);
        if cur == TILE_TYPE_ROAD || !is_pavable_type(cur) {
            return;
        }
        grid.set(x, y, TILE_TYPE_ROAD);
        self.changed = true;
    }

    fn place_rail(&mut self, grid: &mut SpatialGrid, x: i32, y: i32) {
        if !grid.in_bounds(x, y) {
            return;
        }
        let cur = grid.get(x, y);
        if cur == TILE_TYPE_RAIL || !is_railable_type(cur) {
            return;
        }
        grid.set(x, y, TILE_TYPE_RAIL);
        self.changed = true;
    }
}
