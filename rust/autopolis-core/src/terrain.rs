//! Seeded terrain generation with biomes.
//!
//! Port of terrain.ts. Same seed + same grid size ⇒ identical world, biome
//! included. All elevation math is f64 (JS number semantics); values are cast
//! to f32 only when stored into the grid's Float32Array-equivalent.

use crate::grid::SpatialGrid;
use crate::noise::fbm2;
use crate::rng::hash2;
use crate::tiles::{
    TILE_TYPE_DIRT, TILE_TYPE_FOREST, TILE_TYPE_GRASS, TILE_TYPE_SAND, TILE_TYPE_STONE,
    TILE_TYPE_WATER,
};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Biome {
    Island,
    Coastal,
    Inland,
}

impl Biome {
    pub fn name(&self) -> &'static str {
        match self {
            Biome::Island => "island",
            Biome::Coastal => "coastal",
            Biome::Inland => "inland",
        }
    }
}

pub const BIOMES: [Biome; 3] = [Biome::Island, Biome::Coastal, Biome::Inland];

#[derive(Clone, Debug)]
pub struct TerrainOptions {
    pub seed: Option<u32>,
    /// Force a biome; otherwise derived deterministically from the seed.
    pub biome: Option<Biome>,
    /// elevation below this → WATER
    pub water_level: Option<f64>,
    /// elevation below this (above water) → SAND coast
    pub sand_level: Option<f64>,
    /// elevation above this → FOREST
    pub forest_level: Option<f64>,
    /// elevation above this → STONE highlands
    pub stone_level: Option<f64>,
    /// lower = larger terrain features
    pub noise_scale: Option<f64>,
    /// 0..1 — how strongly the biome's falloff shapes the land
    pub island_strength: Option<f64>,
    /// inland lakes: elevation below this → WATER even in interior
    pub lake_level: Option<f64>,
}

pub const DEFAULT_TERRAIN: TerrainOptions = TerrainOptions {
    seed: Some(1337),
    biome: Some(Biome::Island),
    water_level: Some(0.36),
    sand_level: Some(0.42),
    forest_level: Some(0.66),
    stone_level: Some(0.8),
    noise_scale: Some(0.055),
    island_strength: Some(0.6),
    lake_level: Some(0.24),
};

impl Default for TerrainOptions {
    fn default() -> Self {
        DEFAULT_TERRAIN.clone()
    }
}

/// Deterministic biome roll for a seed (callers may override with opts.biome).
pub fn biome_for_seed(seed: u32) -> Biome {
    BIOMES[(hash2(seed as i32, 999983, 7) * BIOMES.len() as f64).floor() as usize]
}

/// Elevation [0,1] for a tile under the biome's model (f64, mirrors TS).
#[allow(clippy::too_many_arguments)]
fn elevation_for(
    biome: Biome,
    x: f64,
    y: f64,
    cx: f64,
    cy: f64,
    width: f64,
    height: f64,
    seed: i32,
    o: &TerrainOptions,
) -> f64 {
    let n = fbm2(x * o.noise_scale.unwrap_or(0.055), y * o.noise_scale.unwrap_or(0.055), seed, 4);
    let s = o.island_strength.unwrap_or(0.6);

    match biome {
        Biome::Island => {
            let d = (x - cx).hypot(y - cy) / cx.hypot(cy);
            let falloff = (1.0 - d).max(0.0).powf(2.2) * s;
            n * (1.0 - s) + falloff
        }
        Biome::Coastal => {
            // Ocean edge: 0=N, 1=E, 2=S, 3=W. Land rises away from that edge.
            let edge = (hash2(seed, 424242, 7) * 4.0).floor() as i32;
            let d_edge: f64 = if edge == 0 {
                y / height // north edge → water up top
            } else if edge == 1 {
                x / width
            } else if edge == 2 {
                (height - 1.0 - y) / height
            } else {
                (width - 1.0 - x) / width
            };
            let falloff = d_edge.min(1.0).max(0.0).powf(1.6) * s;
            n * (1.0 - s) + falloff
        }
        // inland: rolling land, no ocean — lakes from the noise floor.
        Biome::Inland => n,
    }
}

/// Fills the grid with terrain derived from the seed (+ biome) and returns
/// the biome used. Same inputs ⇒ identical grid.
pub fn generate_terrain(grid: &mut SpatialGrid, opts: &TerrainOptions) -> Biome {
    let o = opts.clone();
    let biome = o.biome.unwrap_or_else(|| biome_for_seed(o.seed.unwrap()));
    grid.biome = biome.name().to_string();
    grid.seed = o.seed.unwrap();
    let cx = grid.width as f64 / 2.0;
    let cy = grid.height as f64 / 2.0;
    let seed = o.seed.unwrap() as i32;
    let width = grid.width as f64;
    let height = grid.height as f64;

    let water_level = o.water_level.unwrap_or(0.36);
    let sand_level = o.sand_level.unwrap_or(0.42);
    let forest_level = o.forest_level.unwrap_or(0.66);
    let stone_level = o.stone_level.unwrap_or(0.8);
    let lake_level = o.lake_level.unwrap_or(0.24);

    for y in 0..grid.height {
        for x in 0..grid.width {
            let (xi, yi) = (x as i32, y as i32);
            let e = elevation_for(biome, xi as f64, yi as f64, cx, cy, width, height, seed, &o);

            let mut type_code = TILE_TYPE_GRASS;
            let mut elevation = e;

            let is_water = if biome == Biome::Inland {
                e < lake_level
            } else {
                e < water_level
            };

            if is_water {
                type_code = TILE_TYPE_WATER;
                elevation = 0.0;
            } else if e < sand_level {
                type_code = TILE_TYPE_SAND;
                elevation = e * 0.6;
            } else if e > stone_level {
                type_code = TILE_TYPE_STONE;
            } else if e > forest_level {
                type_code = TILE_TYPE_FOREST;
            } else if hash2(xi, yi, (o.seed.unwrap() as i32) ^ (-1640531527i32)) < 0.05 {
                type_code = TILE_TYPE_DIRT; // sparse dirt sprinkles on grassland
            }

            grid.set(xi, yi, type_code);
            grid.set_elevation(xi, yi, elevation as f32);
        }
    }

    biome
}
