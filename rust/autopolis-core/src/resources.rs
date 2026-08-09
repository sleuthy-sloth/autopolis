//! Resource grid dynamics — power & water.
//!
//! Power plants and water towers flood their resource across connected land
//! tiles, attenuating with distance up to MAX_RANGE. Grids are f32 arrays
//! (0..1 coverage per tile) indexed like the SpatialGrid — deterministic to
//! compute. Port of resources.ts.

use crate::grid::SpatialGrid;
use crate::roadgraph::RoadGraph;
use crate::tiles::{
    TILE_TYPE_COMMERCIAL, TILE_TYPE_INDUSTRIAL, TILE_TYPE_POWER_PLANT, TILE_TYPE_RAIL,
    TILE_TYPE_RESIDENTIAL, TILE_TYPE_ROAD, TILE_TYPE_WATER, TILE_TYPE_WATER_TOWER,
};

pub const RESOURCE_MAX_RANGE: u32 = 14;

#[derive(Clone, Debug)]
pub struct ResourceRangeOptions {
    pub power_range: Option<u32>,
    pub water_range: Option<u32>,
}

impl Default for ResourceRangeOptions {
    fn default() -> Self {
        Self {
            power_range: None,
            water_range: None,
        }
    }
}

pub struct ResourceGrids {
    pub power: Vec<f32>,
    pub water: Vec<f32>,
    pub power_range: u32,
    pub water_range: u32,
    width: usize,
    height: usize,
}

impl ResourceGrids {
    pub fn new(grid: &SpatialGrid, opts: &ResourceRangeOptions) -> Self {
        Self {
            power: vec![0.0; grid.width * grid.height],
            water: vec![0.0; grid.width * grid.height],
            power_range: opts.power_range.unwrap_or(RESOURCE_MAX_RANGE),
            water_range: opts.water_range.unwrap_or(RESOURCE_MAX_RANGE),
            width: grid.width,
            height: grid.height,
        }
    }

    /// BFS flood from all sources of one resource through non-water land.
    fn flood(grid: &SpatialGrid, source_type: u8, max_range: u32, out: &mut [f32]) {
        let width = grid.width;
        let height = grid.height;
        let mut dist = vec![u16::MAX; width * height];
        let mut queue: Vec<usize> = Vec::new();
        grid.for_each(|x, y, type_code, _| {
            if type_code == source_type {
                let idx = y as usize * width + x as usize;
                dist[idx] = 0;
                queue.push(idx);
            }
        });
        out.fill(0.0);
        if queue.is_empty() {
            return;
        }
        let mut head = 0usize;
        while head < queue.len() {
            let idx = queue[head];
            head += 1;
            let d = dist[idx] as u32;
            if d >= max_range {
                continue;
            }
            let x = (idx % width) as i32;
            let y = (idx / width) as i32;
            let coverage = 1.0 - d as f64 / max_range as f64;
            if coverage > out[idx] as f64 {
                out[idx] = coverage as f32;
            }
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let nx = x + dx;
                let ny = y + dy;
                if nx < 0 || ny < 0 || nx as usize >= width || ny as usize >= height {
                    continue;
                }
                let n_idx = ny as usize * width + nx as usize;
                if dist[n_idx] != u16::MAX || grid.get(nx, ny) == TILE_TYPE_WATER {
                    continue;
                }
                dist[n_idx] = (d + 1) as u16;
                queue.push(n_idx);
            }
        }
    }

    /// Recompute both grids from the current tile state. Call when the grid changes.
    pub fn recompute(&mut self, grid: &SpatialGrid) {
        self.width = grid.width;
        self.height = grid.height;
        let pr = self.power_range;
        Self::flood(grid, TILE_TYPE_POWER_PLANT, pr, &mut self.power);
        let wr = self.water_range;
        Self::flood(grid, TILE_TYPE_WATER_TOWER, wr, &mut self.water);
    }
}

// ── City statistics ─────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, Default)]
pub struct ZoneCounts {
    pub residential: usize,
    pub commercial: usize,
    pub industrial: usize,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct InfraCounts {
    pub road_tiles: usize,
    pub rail_tiles: usize,
    pub power_plants: usize,
    pub water_towers: usize,
    pub road_components: usize,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct CityStats {
    pub zones: ZoneCounts,
    pub infrastructure: InfraCounts,
    /// Residential tiles × 4 (a deterministic stand-in for family density).
    pub population: usize,
    /// Fraction of R+C+I tiles with power ≥ 0.5.
    pub power_coverage: f64,
    /// Fraction of residential tiles with water ≥ 0.5.
    pub water_coverage: f64,
    /// Road network connectivity — 1 means one connected city.
    pub road_components: usize,
}

pub fn compute_city_stats(
    grid: &SpatialGrid,
    resources: &ResourceGrids,
    road_graph: &RoadGraph,
) -> CityStats {
    let mut residential = 0usize;
    let mut commercial = 0usize;
    let mut industrial = 0usize;
    let mut power_plants = 0usize;
    let mut water_towers = 0usize;
    let mut road_tiles = 0usize;
    let mut rail_tiles = 0usize;
    let mut zone_tiles = 0usize;
    let mut powered_zones = 0usize;
    let mut watered_residential = 0usize;

    grid.for_each(|x, y, type_code, _| {
        let idx = y as usize * grid.width + x as usize;
        match type_code {
            TILE_TYPE_ROAD => road_tiles += 1,
            TILE_TYPE_RAIL => rail_tiles += 1,
            TILE_TYPE_RESIDENTIAL => {
                residential += 1;
                zone_tiles += 1;
                if resources.power[idx] >= 0.5 {
                    powered_zones += 1;
                }
                if resources.water[idx] >= 0.5 {
                    watered_residential += 1;
                }
            }
            TILE_TYPE_COMMERCIAL => {
                commercial += 1;
                zone_tiles += 1;
                if resources.power[idx] >= 0.5 {
                    powered_zones += 1;
                }
            }
            TILE_TYPE_INDUSTRIAL => {
                industrial += 1;
                zone_tiles += 1;
                if resources.power[idx] >= 0.5 {
                    powered_zones += 1;
                }
            }
            TILE_TYPE_POWER_PLANT => power_plants += 1,
            TILE_TYPE_WATER_TOWER => water_towers += 1,
            _ => {}
        }
    });

    let road_components = road_graph.component_count();
    CityStats {
        zones: ZoneCounts {
            residential,
            commercial,
            industrial,
        },
        infrastructure: InfraCounts {
            road_tiles,
            rail_tiles,
            power_plants,
            water_towers,
            road_components,
        },
        population: residential * 4,
        power_coverage: if zone_tiles > 0 {
            powered_zones as f64 / zone_tiles as f64
        } else {
            0.0
        },
        water_coverage: if residential > 0 {
            watered_residential as f64 / residential as f64
        } else {
            0.0
        },
        road_components,
    }
}
