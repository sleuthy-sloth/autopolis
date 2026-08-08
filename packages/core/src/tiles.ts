/**
 * Tile type registry.
 * Phase 2 extends this with ROAD / RESIDENTIAL / COMMERCIAL / INDUSTRIAL / POWER / WATER
 * resource types. The numeric codes are stable — they are the serialization contract
 * (stored in typed arrays, matrix snapshots, and agent action payloads).
 */
export const TILE_TYPES = {
  WATER: 0,
  SAND: 1,
  GRASS: 2,
  FOREST: 3,
  STONE: 4,
  DIRT: 5,
} as const;

export type TileType = (typeof TILE_TYPES)[keyof typeof TILE_TYPES];

export const TILE_NAMES: Record<TileType, string> = {
  [TILE_TYPES.WATER]: 'water',
  [TILE_TYPES.SAND]: 'sand',
  [TILE_TYPES.GRASS]: 'grass',
  [TILE_TYPES.FOREST]: 'forest',
  [TILE_TYPES.STONE]: 'stone',
  [TILE_TYPES.DIRT]: 'dirt',
};

export const TILE_PALETTE: Record<TileType, string> = {
  [TILE_TYPES.WATER]: '#2f6f9f',
  [TILE_TYPES.SAND]: '#d8c48a',
  [TILE_TYPES.GRASS]: '#6fae4f',
  [TILE_TYPES.FOREST]: '#3f7d3a',
  [TILE_TYPES.STONE]: '#9aa1a8',
  [TILE_TYPES.DIRT]: '#8a6d4b',
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
