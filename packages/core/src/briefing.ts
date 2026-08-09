/**
 * briefing.ts — the compressed city view that agents reason over.
 *
 * A 4,096-cell grid would blow an LLM context window; instead agents get a
 * coarse 8×8 dominance map + aggregate stats + treasury + recent events.
 * Same seed ⇒ same briefing, so agent runs stay replayable.
 */
import { SpatialGrid } from './grid';
import { TILE_NAMES } from './tiles';
import type { CityStats } from './resources';

export const BRIEFING_GRID = 8;

export interface CityBriefing {
  tick: number;
  seed: number;
  biome: string;
  width: number;
  height: number;
  stats: CityStats;
  treasury: number;
  taxRate: number;
  /** BRIEFING_GRID × BRIEFING_GRID dominance map: tile code per block. */
  map: number[][];
  recentEvents: string[];
}

/** Coarse dominance map: the most common tile code in each block. */
function dominanceMap(grid: SpatialGrid): number[][] {
  const { width, height } = grid;
  const bs = Math.max(1, Math.ceil(width / BRIEFING_GRID));
  const map: number[][] = [];
  for (let by = 0; by < BRIEFING_GRID; by++) {
    const row: number[] = [];
    for (let bx = 0; bx < BRIEFING_GRID; bx++) {
      const counts = new Map<number, number>();
      for (let y = by * bs; y < Math.min((by + 1) * bs, height); y++) {
        for (let x = bx * bs; x < Math.min((bx + 1) * bs, width); x++) {
          const t = grid.get(x, y);
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
      let best = 0;
      let bestCount = -1;
      for (const [code, count] of counts) {
        if (count > bestCount) {
          best = code;
          bestCount = count;
        }
      }
      row.push(best);
    }
    map.push(row);
  }
  return map;
}

export function buildBriefing(
  grid: SpatialGrid,
  stats: CityStats,
  treasury: number,
  taxRate: number,
  recentEvents: string[],
  tick: number,
): CityBriefing {
  return {
    tick,
    seed: grid.seed,
    biome: grid.biome,
    width: grid.width,
    height: grid.height,
    stats,
    treasury,
    taxRate,
    map: dominanceMap(grid),
    recentEvents: recentEvents.slice(-5),
  };
}

/** Human-readable legend line for the map (name:code). */
export function briefingLegend(): string {
  return Object.entries(TILE_NAMES)
    .map(([code, name]) => `${name}:${code}`)
    .join(' ');
}
