//! Contract parity — consumes the SAME golden fixtures as the TypeScript side.
//!
//! Source of truth: `packages/core/test/contract.test.ts` exports the pinned
//! fixtures (`contractFixture`) and documents the format in its header. The
//! golden file here is an identical copy:
//!
//!   tests/fixtures/contract.json  ← regenerated from TS via
//!                                    `GEN_CONTRACT=1 vitest run test/contract.test.ts`
//!
//! What is verified, case by case:
//!   - `cases[]`   seed + ticks → the FNV-1a 32-bit grid hash over row-major
//!                 type codes then little-endian f32 elevation bits (see
//!                 `fnv1a32`), the derived biome name, and full tile counts.
//!   - `snapshots[]` full 16×16 worlds: raw type codes (the WorldSnapshot
//!                 tiles matrix flattened) and elevations.
//!
//! No new dependencies: the crate stays dependency-free (serde/serde_json are
//! already dev-only for the existing parity.rs fixtures). Plain `cargo test`.

use autopolis_core::development::CityDevelopment;
use autopolis_core::grid::SpatialGrid;
use autopolis_core::terrain::{generate_terrain, TerrainOptions};
use serde_json::Value;
use std::fs;

fn fixture() -> Value {
    let raw = fs::read_to_string("tests/fixtures/contract.json").expect("contract.json missing");
    serde_json::from_str(&raw).expect("contract.json invalid")
}

/// FNV-1a 32-bit over the full grid — MUST match `fnv1a32` in
/// packages/core/test/contract.test.ts, byte for byte.
fn fnv1a32(types: &[u8], elevations: &[f32]) -> String {
    let mut h: u32 = 0x811c_9dc5;
    let mut step = |b: u8| {
        h ^= b as u32;
        h = h.wrapping_mul(0x0100_0193);
    };
    for &t in types {
        step(t);
    }
    for &e in elevations {
        for b in e.to_bits().to_le_bytes() {
            step(b);
        }
    }
    format!("{h:08x}")
}

fn derived_opts(seed: u32) -> TerrainOptions {
    // biome: None → derived from the seed, exactly like the TS fixture pipeline.
    TerrainOptions {
        seed: Some(seed),
        biome: None,
        water_level: None,
        sand_level: None,
        forest_level: None,
        stone_level: None,
        noise_scale: None,
        island_strength: None,
        lake_level: None,
    }
}

fn run_world(seed: u32, ticks: i64, width: usize, height: usize) -> SpatialGrid {
    let mut grid = SpatialGrid::new(width, height);
    generate_terrain(&mut grid, &derived_opts(seed));
    let mut dev = CityDevelopment::new(seed);
    for t in 1..=ticks {
        dev.step(&mut grid, t);
    }
    grid
}

fn f(v: &Value) -> f64 {
    v.as_f64().expect("expected number")
}

#[test]
fn grid_cases_match_the_ts_contract() {
    let fx = fixture();
    assert_eq!(fx["format"].as_str().unwrap(), "autopolis-contract/v1");

    let world = &fx["world"];
    let width = world["width"].as_u64().unwrap() as usize;
    let height = world["height"].as_u64().unwrap() as usize;

    let cases = fx["cases"].as_array().unwrap();
    assert!(cases.len() >= 9, "contract should pin at least 9 cases");
    for (i, c) in cases.iter().enumerate() {
        let seed = c["seed"].as_u64().unwrap() as u32;
        let ticks = c["ticks"].as_i64().unwrap();

        let grid = run_world(seed, ticks, width, height);

        // Biome roll (derived from seed) must match.
        assert_eq!(
            grid.biome,
            c["biome"].as_str().unwrap(),
            "case[{i}] seed={seed} ticks={ticks}: biome mismatch"
        );

        // Full-grid hash must match bit-for-bit.
        let hash = fnv1a32(&grid.types, &grid.elevations);
        let expected_hash = c["hash"].as_str().unwrap();
        assert_eq!(
            hash, expected_hash,
            "case[{i}] seed={seed} ticks={ticks}: grid hash mismatch"
        );

        // Tile counts for every code 0..=12.
        let counts = grid.count_types();
        for code in 0..=12usize {
            let expected = c["counts"][code.to_string()].as_u64().unwrap();
            assert_eq!(
                counts[code] as u64,
                expected,
                "case[{i}] seed={seed} ticks={ticks}: count for code {code} mismatch"
            );
        }
    }
}

#[test]
fn snapshots_match_the_ts_contract() {
    let fx = fixture();
    let snaps = fx["snapshots"].as_array().unwrap();
    assert!(snaps.len() >= 4, "contract should pin at least 4 snapshots");
    for (i, s) in snaps.iter().enumerate() {
        let seed = s["seed"].as_u64().unwrap() as u32;
        let ticks = s["ticks"].as_i64().unwrap();
        let width = s["width"].as_u64().unwrap() as usize;
        let height = s["height"].as_u64().unwrap() as usize;

        let grid = run_world(seed, ticks, width, height);

        assert_eq!(
            grid.biome,
            s["biome"].as_str().unwrap(),
            "snapshot[{i}] seed={seed} ticks={ticks}: biome mismatch"
        );

        // Raw type codes (WorldSnapshot tiles matrix flattened) — exact.
        let expected_types: Vec<u8> = s["types"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_u64().unwrap() as u8)
            .collect();
        assert_eq!(
            grid.types, expected_types,
            "snapshot[{i}] seed={seed} ticks={ticks}: types mismatch"
        );

        // Elevations — f32 values read from JSON (f64 → f32 is exact here
        // because TS serialized the f32 values), compare with a tiny tolerance.
        let expected_elev: Vec<f64> = s["elevations"]
            .as_array()
            .unwrap()
            .iter()
            .map(f)
            .collect();
        assert_eq!(grid.elevations.len(), expected_elev.len());
        for (j, &e) in grid.elevations.iter().enumerate() {
            let exp = expected_elev[j] as f32;
            assert!(
                (e - exp).abs() <= 1e-6,
                "snapshot[{i}] seed={seed} ticks={ticks}: elevation[{j}] rust {e} vs fixture {exp}"
            );
        }
    }
}

#[test]
fn regeneration_copy_is_in_sync_with_the_ts_fixture_export() {
    // Cheap structural sanity: both golden files must exist and carry the
    // same format marker so a stale/mismatched copy is caught immediately.
    let here = fixture();
    let ts_copy = fs::read_to_string("../../packages/core/test/contract.fixture.json")
        .expect("TS fixture copy missing (packages/core/test/contract.fixture.json)");
    let ts: Value = serde_json::from_str(&ts_copy).expect("TS fixture invalid");
    assert_eq!(here["format"], ts["format"]);
    assert_eq!(here["cases"].as_array().unwrap().len(), ts["cases"].as_array().unwrap().len());
    assert_eq!(
        here["snapshots"].as_array().unwrap().len(),
        ts["snapshots"].as_array().unwrap().len()
    );
}