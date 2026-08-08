/**
 * Tile type registry.
 *
 * Numeric codes are the serialization contract (typed arrays, matrix snapshots,
 * agent action payloads). Existing codes NEVER renumber — new types are always
 * appended. Phase 2 adds roads, R/C/I zoning, and power/water infrastructure.
 */
export const TILE_TYPES = {
  WATER: 0,
  SAND: 1,
  GRASS: 2,
  FOREST: 3,
  STONE: 4,
  DIRT: 5,
  // ── Phase 2: infrastructure & zoning ──
  ROAD: 6,
  RESIDENTIAL: 7,
  COMMERCIAL: 8,
  INDUSTRIAL: 9,
  POWER_PLANT: 10,
  WATER_TOWER: 11,
} as const;

export type TileType = (typeof TILE_TYPES)[keyof typeof TILE_TYPES];

export const TILE_NAMES: Record<TileType, string> = {
  [TILE_TYPES.WATER]: 'water',
  [TILE_TYPES.SAND]: 'sand',
  [TILE_TYPES.GRASS]: 'grass',
  [TILE_TYPES.FOREST]: 'forest',
  [TILE_TYPES.STONE]: 'stone',
  [TILE_TYPES.DIRT]: 'dirt',
  [TILE_TYPES.ROAD]: 'road',
  [TILE_TYPES.RESIDENTIAL]: 'residential',
  [TILE_TYPES.COMMERCIAL]: 'commercial',
  [TILE_TYPES.INDUSTRIAL]: 'industrial',
  [TILE_TYPES.POWER_PLANT]: 'power_plant',
  [TILE_TYPES.WATER_TOWER]: 'water_tower',
};

export const TILE_PALETTE: Record<TileType, string> = {
  [TILE_TYPES.WATER]: '#2f6f9f',
  [TILE_TYPES.SAND]: '#d8c48a',
  [TILE_TYPES.GRASS]: '#6fae4f',
  [TILE_TYPES.FOREST]: '#3f7d3a',
  [TILE_TYPES.STONE]: '#9aa1a8',
  [TILE_TYPES.DIRT]: '#8a6d4b',
  [TILE_TYPES.ROAD]: '#4a5058',
  [TILE_TYPES.RESIDENTIAL]: '#6fa8dc',
  [TILE_TYPES.COMMERCIAL]: '#e6c15c',
  [TILE_TYPES.INDUSTRIAL]: '#c98a5e',
  [TILE_TYPES.POWER_PLANT]: '#a55eea',
  [TILE_TYPES.WATER_TOWER]: '#45aaf2',
};

export const TILE_TYPE_COUNT = Object.keys(TILE_TYPES).length;

export function tileName(type: TileType): string {
  return TILE_NAMES[type] ?? `unknown(${type})`;
}

/** Inverse of TILE_NAMES: name → numeric code (for agent-readable legends). */
export function buildLegend(): Record<string, number> {
  const legend: Record<string, number> = {};
  for (const [code, name] of Object.entries(TILE_NAMES)) {
    legend[name] = Number(code);
  }
  return legend;
}
