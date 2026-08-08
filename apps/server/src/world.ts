/**
 * World — server-authoritative simulation state.
 *
 * Phase 1: owns the SpatialGrid + tick counter. The 1 Hz step() is the seam where
 * Phase 2 (pathfinding, resource grids, budget) plugs in — it stays deterministic
 * so any client can replay the same seed+tick sequence.
 */
import { SpatialGrid, generateTerrain, gridToSnapshot, type WorldSnapshot } from '@autopolis/core';

export class World {
  readonly grid: SpatialGrid;
  seed: number;
  tick = 0;

  constructor(seed: number, width = 64, height = 64) {
    this.seed = seed;
    this.grid = new SpatialGrid(width, height);
    generateTerrain(this.grid, { seed });
  }

  /** Advance simulation by one tick (called at 1 Hz by the engine). */
  step(): void {
    this.tick++;
    // Phase 2: road graph, A* traffic, power/water distribution, zoning, budget.
  }

  snapshot(): WorldSnapshot {
    return gridToSnapshot(this.grid, this.tick);
  }
}
