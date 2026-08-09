//! autopolis-core — deterministic city simulation core.
//!
//! A faithful Rust port of the TypeScript simulation core in
//! `packages/core/src/` of the Autopolis project. Every algorithm, constant,
//! and order of operations mirrors the TS reference implementation so the two
//! produce byte-identical worlds for the same (seed, tick) inputs.
//!
//! The crate itself is dependency-free; serde/serde_json appear only as
//! dev-dependencies for the parity fixture tests.

pub mod development;
pub mod grid;
pub mod noise;
pub mod pathfinding;
pub mod resources;
pub mod rng;
pub mod roadgraph;
pub mod terrain;
pub mod tiles;

pub use development::{is_developable_type, is_pavable_type, CityDevelopment};
pub use grid::SpatialGrid;
pub use noise::{fbm2, value_noise};
pub use pathfinding::{
    find_network_path, find_path, find_rail_path, find_road_path, find_terrain_path,
    find_water_path, manhattan, octile, GridPoint, PathRequest, PathResult,
};
pub use resources::{compute_city_stats, CityStats, InfraCounts, ResourceGrids, ZoneCounts};
pub use rng::{hash2, mulberry32};
pub use roadgraph::RoadGraph;
pub use terrain::{biome_for_seed, generate_terrain, Biome, TerrainOptions};
pub use tiles::{
    tile_name, TILE_NAMES, TILE_PALETTE, TILE_TYPE_COUNT, TILE_TYPE_WATER, TILE_TYPE_SAND,
    TILE_TYPE_GRASS, TILE_TYPE_FOREST, TILE_TYPE_STONE, TILE_TYPE_DIRT, TILE_TYPE_ROAD,
    TILE_TYPE_RESIDENTIAL, TILE_TYPE_COMMERCIAL, TILE_TYPE_INDUSTRIAL, TILE_TYPE_POWER_PLANT,
    TILE_TYPE_WATER_TOWER, TILE_TYPE_RAIL,
};
