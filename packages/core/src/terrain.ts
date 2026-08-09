/**
 * Seeded terrain generation with biomes.
 *
 * Not every world is an island. The biome is derived from the seed (or forced
 * via options), and each biome uses a different elevation model:
 *
 *   island  — radial falloff: ocean ring, raised interior (classic Autopolis)
 *   coastal — land rises away from one ocean edge (sea on one side of the map)
 *   inland  — no ocean: rolling land with noise-carved lakes
 *
 * Same seed + same grid size ⇒ byte-identical world, biome included.
 */
import { SpatialGrid } from './grid';
import { fbm2 } from './noise';
import { hash2 } from './rng';
import { TILE_TYPES, TileType } from './tiles';

export type Biome = 'island' | 'coastal' | 'inland';

export const BIOMES: Biome[] = ['island', 'coastal', 'inland'];

export interface TerrainOptions {
  seed?: number;
  /** Force a biome; otherwise derived deterministically from the seed. */
  biome?: Biome;
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
  /** 0..1 — how strongly the biome's falloff shapes the land */
  islandStrength?: number;
  /** inland lakes: elevation below this → WATER even in interior */
  lakeLevel?: number;
}

export const DEFAULT_TERRAIN: Required<TerrainOptions> = {
  seed: 1337,
  biome: 'island',
  waterLevel: 0.36,
  sandLevel: 0.42,
  forestLevel: 0.66,
  stoneLevel: 0.8,
  noiseScale: 0.055,
  islandStrength: 0.6,
  lakeLevel: 0.24,
};

/** Deterministic biome roll for a seed (callers may override with opts.biome). */
export function biomeForSeed(seed: number): Biome {
  return BIOMES[Math.floor(hash2(seed, 999983, 7) * BIOMES.length)];
}

/** Elevation [0,1] for a tile under the biome's model. */
function elevationFor(
  biome: Biome,
  x: number,
  y: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
  seed: number,
  o: Required<TerrainOptions>,
): number {
  const n = fbm2(x * o.noiseScale, y * o.noiseScale, seed, 4);
  const s = o.islandStrength;

  if (biome === 'island') {
    const d = Math.hypot(x - cx, y - cy) / Math.hypot(cx, cy);
    const falloff = Math.pow(Math.max(0, 1 - d), 2.2) * s;
    return n * (1 - s) + falloff;
  }

  if (biome === 'coastal') {
    // Ocean edge: 0=N, 1=E, 2=S, 3=W. Land rises away from that edge.
    const edge = Math.floor(hash2(seed, 424242, 7) * 4);
    let dEdge: number;
    if (edge === 0) dEdge = y / height; // north edge → water up top
    else if (edge === 1) dEdge = x / width;
    else if (edge === 2) dEdge = (height - 1 - y) / height;
    else dEdge = (width - 1 - x) / width;
    const falloff = Math.pow(Math.min(1, Math.max(0, dEdge)), 1.6) * s;
    return n * (1 - s) + falloff;
  }

  // inland: rolling land, no ocean — lakes from the noise floor.
  return n;
}

/**
 * Fills the grid with terrain derived from the seed (+ biome) and returns the
 * biome used. Same inputs ⇒ byte-identical grid (see SpatialGrid.equals).
 */
export function generateTerrain(grid: SpatialGrid, opts: TerrainOptions = {}): Biome {
  const o = { ...DEFAULT_TERRAIN, ...opts };
  const biome = opts.biome ?? biomeForSeed(o.seed);
  grid.biome = biome;
  grid.seed = o.seed;
  const cx = grid.width / 2;
  const cy = grid.height / 2;

  grid.forEach((x, y) => {
    const e = elevationFor(biome, x, y, cx, cy, grid.width, grid.height, o.seed, o);

    let type: TileType = TILE_TYPES.GRASS;
    let elevation = e;

    const isWater =
      biome === 'inland' ? e < o.lakeLevel : e < o.waterLevel;

    if (isWater) {
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

  return biome;
}
