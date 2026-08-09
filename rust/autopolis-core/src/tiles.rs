//! Tile type registry.
//!
//! Numeric codes are the serialization contract (typed arrays, matrix
//! snapshots, agent action payloads). Existing codes NEVER renumber — new
//! types are always appended. Codes match tiles.ts exactly:
//! WATER 0 ... RAIL 12.

pub const TILE_TYPE_WATER: u8 = 0;
pub const TILE_TYPE_SAND: u8 = 1;
pub const TILE_TYPE_GRASS: u8 = 2;
pub const TILE_TYPE_FOREST: u8 = 3;
pub const TILE_TYPE_STONE: u8 = 4;
pub const TILE_TYPE_DIRT: u8 = 5;
pub const TILE_TYPE_ROAD: u8 = 6;
pub const TILE_TYPE_RESIDENTIAL: u8 = 7;
pub const TILE_TYPE_COMMERCIAL: u8 = 8;
pub const TILE_TYPE_INDUSTRIAL: u8 = 9;
pub const TILE_TYPE_POWER_PLANT: u8 = 10;
pub const TILE_TYPE_WATER_TOWER: u8 = 11;
pub const TILE_TYPE_RAIL: u8 = 12;

pub const TILE_TYPE_COUNT: usize = 13;

pub const TILE_NAMES: [&str; TILE_TYPE_COUNT] = [
    "water",
    "sand",
    "grass",
    "forest",
    "stone",
    "dirt",
    "road",
    "residential",
    "commercial",
    "industrial",
    "power_plant",
    "water_tower",
    "rail",
];

/// Color palette — unused by the simulation itself, kept for fidelity.
pub const TILE_PALETTE: [&str; TILE_TYPE_COUNT] = [
    "#2f6f9f",
    "#d8c48a",
    "#6fae4f",
    "#3f7d3a",
    "#9aa1a8",
    "#8a6d4b",
    "#4a5058",
    "#6fa8dc",
    "#e6c15c",
    "#c98a5e",
    "#a55eea",
    "#45aaf2",
    "#6b5b3e",
];

pub fn tile_name(type_code: u8) -> String {
    if (type_code as usize) < TILE_TYPE_COUNT {
        TILE_NAMES[type_code as usize].to_string()
    } else {
        format!("unknown({type_code})")
    }
}
