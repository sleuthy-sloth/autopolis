//! autopolis-sim — CLI entry point.
//!
//! Builds a 64x64 island grid, generates terrain with the seed from argv
//! (default 1337), runs the CityDevelopment schedule to tick 300, and prints
//! a single JSON line with the resulting city counts.

use autopolis_core::development::CityDevelopment;
use autopolis_core::grid::SpatialGrid;
use autopolis_core::roadgraph::RoadGraph;
use autopolis_core::terrain::{generate_terrain, Biome, TerrainOptions};
use autopolis_core::tiles::{
    TILE_TYPE_COMMERCIAL, TILE_TYPE_INDUSTRIAL, TILE_TYPE_RAIL, TILE_TYPE_RESIDENTIAL,
    TILE_TYPE_ROAD,
};

fn main() {
    let seed: u32 = std::env::args()
        .nth(1)
        .map(|s| s.parse().unwrap_or(1337))
        .unwrap_or(1337);

    let mut grid = SpatialGrid::new(64, 64);
    let biome = generate_terrain(
        &mut grid,
        &TerrainOptions {
            seed: Some(seed),
            // The parity fixture was generated with the island biome forced;
            // force it here too so seed 1337 matches the golden counts.
            biome: Some(Biome::Island),
            ..TerrainOptions::default()
        },
    );

    let mut dev = CityDevelopment::new(seed);
    for tick in 1..=300 {
        dev.step(&mut grid, tick);
    }

    let counts = grid.count_types();
    let components = RoadGraph::from_grid(&grid).component_count();
    let res = counts[TILE_TYPE_RESIDENTIAL as usize];
    let population = res * 4;

    println!(
        "{{\"seed\":{},\"biome\":\"{}\",\"roadTiles\":{},\"railTiles\":{},\"res\":{},\"comm\":{},\"ind\":{},\"components\":{},\"population\":{}}}",
        seed,
        biome.name(),
        counts[TILE_TYPE_ROAD as usize],
        counts[TILE_TYPE_RAIL as usize],
        res,
        counts[TILE_TYPE_COMMERCIAL as usize],
        counts[TILE_TYPE_INDUSTRIAL as usize],
        components,
        population,
    );
}
