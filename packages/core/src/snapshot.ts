/**
 * LLM-ready world snapshots (Phase 3 input contract).
 * A compact, fully-serializable view of the grid that agent prompts will consume:
 * plain number[][] matrix + legend, no class instances, no surprises.
 */
import { SpatialGrid } from './grid';
import { buildLegend } from './tiles';

export interface WorldSnapshot {
  tick: number;
  width: number;
  height: number;
  seed: number;
  /** name → tile code, e.g. { water: 0, grass: 2, ... } */
  legend: Record<string, number>;
  /** matrix[y][x] = tile code */
  tiles: number[][];
}

export function gridToSnapshot(grid: SpatialGrid, tick = 0): WorldSnapshot {
  return {
    tick,
    width: grid.width,
    height: grid.height,
    seed: grid.seed,
    legend: buildLegend(),
    tiles: grid.toMatrix(),
  };
}
