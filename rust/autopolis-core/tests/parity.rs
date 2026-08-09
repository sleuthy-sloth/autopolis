//! Parity tests — golden fixtures generated FROM the TypeScript core
//! (packages/core/src). Same seed ⇒ same world, tick for tick.

use autopolis_core::development::CityDevelopment;
use autopolis_core::grid::SpatialGrid;
use autopolis_core::noise::fbm2;
use autopolis_core::pathfinding::{find_terrain_path, GridPoint};
use autopolis_core::roadgraph::RoadGraph;
use autopolis_core::rng::{hash2, mulberry32};
use autopolis_core::terrain::{generate_terrain, Biome, TerrainOptions};
use autopolis_core::tiles::{
    TILE_TYPE_COMMERCIAL, TILE_TYPE_INDUSTRIAL, TILE_TYPE_RAIL, TILE_TYPE_RESIDENTIAL,
    TILE_TYPE_ROAD,
};
use serde_json::Value;
use std::fs;

fn fixture() -> Value {
    let raw = fs::read_to_string("tests/fixtures/parity.json").expect("fixture missing");
    serde_json::from_str(&raw).expect("fixture invalid JSON")
}

fn f(v: &Value) -> f64 {
    v.as_f64().expect("expected number")
}

fn close(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol
}

#[test]
fn mulberry32_parity() {
    let fx = fixture();
    let mut rng = mulberry32(1337);
    for (i, expected) in fx["rng"].as_array().unwrap().iter().enumerate() {
        let got = rng();
        assert!(
            close(got, f(expected), 1e-9),
            "rng[{i}]: rust {got} vs fixture {}",
            f(expected)
        );
    }
}

#[test]
fn hash2_parity() {
    let fx = fixture();
    let inputs: [(i32, i32, i32); 5] = [(3, 7, 1337), (12, 42, 1337), (0, 0, 1), (63, 63, 999), (31, 31, 1337)];
    for (i, (x, y, s)) in inputs.iter().enumerate() {
        let got = hash2(*x, *y, *s);
        let expected = f(&fx["hash2"][i]);
        assert!(close(got, expected, 1e-9), "hash2[{i}]: rust {got} vs fixture {expected}");
    }
}

#[test]
fn fbm_parity() {
    let fx = fixture();
    let inputs: [(f64, f64, i32); 4] = [(0.1, 0.2, 1337), (1.5, 2.5, 1337), (5.0, 5.0, 42), (30.5, 30.5, 1337)];
    for (i, (x, y, s)) in inputs.iter().enumerate() {
        let got = fbm2(*x, *y, *s, 4);
        let expected = f(&fx["fbm"][i]);
        assert!(close(got, expected, 1e-6), "fbm[{i}]: rust {got} vs fixture {expected}");
    }
}

fn terrain_opts(seed: u32, biome: Option<Biome>) -> TerrainOptions {
    TerrainOptions {
        seed: Some(seed),
        biome,
        water_level: None,
        sand_level: None,
        forest_level: None,
        stone_level: None,
        noise_scale: None,
        island_strength: None,
        lake_level: None,
    }
}

#[test]
fn terrain_parity() {
    let fx = fixture();
    let mut grid = SpatialGrid::new(64, 64);
    let biome = generate_terrain(&mut grid, &terrain_opts(1337, None));
    assert_eq!(
        biome.name(),
        fx["terrain"]["biome"].as_str().unwrap(),
        "biome roll must match TS"
    );
    assert_eq!(grid.biome, fx["terrain"]["biome"].as_str().unwrap());
    let expected_types: Vec<u8> = fx["terrain"]["types"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_u64().unwrap() as u8)
        .collect();
    assert_eq!(grid.types, expected_types, "tile codes must match EXACTLY");
    let expected_elev: Vec<f64> = fx["terrain"]["elevations"]
        .as_array()
        .unwrap()
        .iter()
        .map(f)
        .collect();
    for (i, e) in grid.elevations.iter().enumerate() {
        assert!(
            close(*e as f64, expected_elev[i], 1e-5),
            "elevation[{i}]: rust {} vs fixture {}",
            e,
            expected_elev[i]
        );
    }
}

#[test]
fn developed300_parity() {
    let fx = fixture();
    let mut grid = SpatialGrid::new(64, 64);
    generate_terrain(&mut grid, &terrain_opts(1337, Some(Biome::Island)));
    let mut dev = CityDevelopment::new(1337);
    for t in 1..=300i64 {
        dev.step(&mut grid, t);
    }
    let counts = grid.count_types();
    let components = RoadGraph::from_grid(&grid).component_count();
    let got = (
        counts[TILE_TYPE_ROAD as usize] as u64,
        counts[TILE_TYPE_RAIL as usize] as u64,
        counts[TILE_TYPE_RESIDENTIAL as usize] as u64,
        counts[TILE_TYPE_COMMERCIAL as usize] as u64,
        counts[TILE_TYPE_INDUSTRIAL as usize] as u64,
        components as u64,
    );
    let exp = fx["developed300"].clone();
    let expected = (
        exp["roadTiles"].as_u64().unwrap(),
        exp["railTiles"].as_u64().unwrap(),
        exp["res"].as_u64().unwrap(),
        exp["comm"].as_u64().unwrap(),
        exp["ind"].as_u64().unwrap(),
        exp["components"].as_u64().unwrap(),
    );
    assert_eq!(got, expected, "tick-300 city counts must match TS exactly");
}

#[test]
fn terrain_path_parity() {
    let fx = fixture();
    let mut grid = SpatialGrid::new(64, 64);
    generate_terrain(&mut grid, &terrain_opts(1337, Some(Biome::Island)));
    let mut dev = CityDevelopment::new(1337);
    for t in 1..=300i64 {
        dev.step(&mut grid, t);
    }
    let result = find_terrain_path(
        &grid,
        GridPoint { x: 10, y: 10 },
        GridPoint { x: 50, y: 50 },
    );
    assert_eq!(result.found, fx["path"]["found"].as_bool().unwrap());
    assert!(
        close(result.cost, f(&fx["path"]["cost"]), 1e-6),
        "path cost: rust {} vs fixture {}",
        result.cost,
        f(&fx["path"]["cost"])
    );
    assert_eq!(result.path.len() as u64, fx["path"]["len"].as_u64().unwrap());
    let head: Vec<(i64, i64)> = fx["path"]["head"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| (p[0].as_i64().unwrap(), p[1].as_i64().unwrap()))
        .collect();
    for (i, p) in result.path.iter().take(head.len()).enumerate() {
        assert_eq!((p.x as i64, p.y as i64), head[i], "path head[{i}]");
    }
    let tail: Vec<(i64, i64)> = fx["path"]["tail"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| (p[0].as_i64().unwrap(), p[1].as_i64().unwrap()))
        .collect();
    let n = result.path.len();
    for (i, p) in result.path.iter().skip(n - tail.len()).enumerate() {
        assert_eq!((p.x as i64, p.y as i64), tail[i], "path tail[{i}]");
    }
}
