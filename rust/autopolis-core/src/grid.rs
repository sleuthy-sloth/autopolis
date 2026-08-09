//! SpatialGrid — the heart of the simulation.
//!
//! Storage: flat typed arrays (u8 tile codes + f32 elevations), indexed
//! `y * width + x`. Port of grid.ts; the struct is pure data + queries.

use crate::tiles::{TILE_TYPE_GRASS, TILE_TYPE_WATER};

pub struct SpatialGrid {
    pub width: usize,
    pub height: usize,
    pub types: Vec<u8>,
    pub elevations: Vec<f32>,
    pub seed: u32,
    pub biome: String,
}

impl SpatialGrid {
    pub fn new(width: usize, height: usize) -> Self {
        assert!(width > 0 && height > 0, "SpatialGrid: invalid dimensions");
        Self {
            width,
            height,
            types: vec![TILE_TYPE_GRASS; width * height],
            elevations: vec![0.0; width * height],
            seed: 0,
            biome: "island".to_string(),
        }
    }

    pub fn index(&self, x: i32, y: i32) -> usize {
        y as usize * self.width + x as usize
    }

    pub fn in_bounds(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && (x as usize) < self.width && (y as usize) < self.height
    }

    /// Out-of-bounds reads return WATER — defensive default (matches TS).
    pub fn get(&self, x: i32, y: i32) -> u8 {
        if !self.in_bounds(x, y) {
            TILE_TYPE_WATER
        } else {
            self.types[self.index(x, y)]
        }
    }

    pub fn set(&mut self, x: i32, y: i32, type_code: u8) {
        if self.in_bounds(x, y) {
            let i = self.index(x, y);
            self.types[i] = type_code;
        }
    }

    pub fn get_elevation(&self, x: i32, y: i32) -> f32 {
        if !self.in_bounds(x, y) {
            0.0
        } else {
            self.elevations[self.index(x, y)]
        }
    }

    pub fn set_elevation(&mut self, x: i32, y: i32, elevation: f32) {
        if self.in_bounds(x, y) {
            let i = self.index(x, y);
            self.elevations[i] = elevation;
        }
    }

    /// Moore neighborhood within `radius` (Chebyshev distance), excluding
    /// self. Iteration order matches TS: dy outer, dx inner.
    pub fn neighbors(&self, x: i32, y: i32, radius: i32) -> Vec<(i32, i32, u8)> {
        let mut out = Vec::new();
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x + dx;
                let ny = y + dy;
                if self.in_bounds(nx, ny) {
                    out.push((nx, ny, self.get(nx, ny)));
                }
            }
        }
        out
    }

    pub fn for_each(&self, mut cb: impl FnMut(i32, i32, u8, f32)) {
        for y in 0..self.height {
            for x in 0..self.width {
                let xi = x as i32;
                let yi = y as i32;
                cb(xi, yi, self.get(xi, yi), self.get_elevation(xi, yi));
            }
        }
    }

    /// Fill every tile with one type (used by World.reset before
    /// regenerating terrain).
    pub fn fill(&mut self, type_code: u8) {
        self.types.fill(type_code);
    }

    /// Count of each tile code across the grid, indexed by code (0..13).
    pub fn count_types(&self) -> [usize; crate::tiles::TILE_TYPE_COUNT] {
        let mut counts = [0usize; crate::tiles::TILE_TYPE_COUNT];
        for &t in &self.types {
            counts[t as usize] += 1;
        }
        counts
    }

    /// Byte-level equality of types + elevations (determinism check).
    pub fn equals(&self, other: &SpatialGrid) -> bool {
        self.width == other.width
            && self.height == other.height
            && self.types == other.types
            && self.elevations == other.elevations
    }
}
