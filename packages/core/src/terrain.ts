/**
 * Seeded island terrain generation.
 * Elevation = fBm noise blended with a radial island falloff, so the map is
 * surrounded by ocean with a raised interior — a natural city site.
 */
import { SpatialGrid } from './grid';
import { fbm2 } from './noise';
import { hash2 } from './rng';
import { TILE_TYPES, type TileType } from './tiles';

export interface TerrainOptions {
  seed?: number;
  /** elevation below this → WATER */
  waterLevel?: number;
  /** elevation below this (above water) → SAND coast */
  sandLevel?: number;
  /** elevation above this → FOREST */
  forestLevel?: number;
  /** elevation above this → STONE highlands */
  stoneLevel?: number;
  /** lower = larger terrain features */
  noiseScale?: number;
  /** 0..1 — how strongly the radial falloff raises the center / sinks the edges */
  islandStrength?: number;
}

export const DEFAULT_TERRAIN: Required<TerrainOptions> = {
  seed: 1337,
  waterLevel: 0.36,
  sandLevel: 0.42,
  forestLevel: 0.66,
  stoneLevel: 0.8,
  noiseScale: 0.055,
  islandStrength: 0.6,
};

/**
 * Fills the grid with terrain derived from the seed and returns the seed used.
 * Same grid size + same seed ⇒ byte-identical grid (see SpatialGrid.equals).
 */
export function generateTerrain(grid: SpatialGrid, opts: TerrainOptions = {}): number {
  const o = { ...DEFAULT_TERRAIN, ...opts };
  grid.seed = o.seed;
  const cx = grid.width / 2;
  const cy = grid.height / 2;
  const maxD = Math.hypot(cx, cy);

  grid.forEach((x, y) => {
    const n = fbm2(x * o.noiseScale, y * o.noiseScale, o.seed, 4);
    const d = Math.hypot(x - cx, y - cy) / maxD;
    const falloff = Math.pow(Math.max(0, 1 - d), 2.2) * o.islandStrength;
    const e = n * (1 - o.islandStrength) + falloff;

    let type: TileType = TILE_TYPES.GRASS;
    let elevation = e;

    if (e < o.waterLevel) {
      type = TILE_TYPES.WATER;
      elevation = 0;
    } else if (e < o.sandLevel) {
      type = TILE_TYPES.SAND;
      elevation = e * 0.6;
    } else if (e > o.stoneLevel) {
      type = TILE_TYPES.STONE;
    } else if (e > o.forestLevel) {
      type = TILE_TYPES.FOREST;
    } else if (hash2(x, y, o.seed ^ 0x9e3779b9) < 0.05) {
      type = TILE_TYPES.DIRT; // sparse dirt sprinkles on grassland
    }

    grid.set(x, y, type);
    grid.setElevation(x, y, elevation);
  });

  return o.seed;
}
