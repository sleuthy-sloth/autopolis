/**
 * World — server-authoritative simulation state.
 *
 * Phase 2: the 1 Hz step() now drives deterministic city development (roads,
 * zones, infrastructure), rebuilds the road graph, and recomputes power/water
 * resource grids + city statistics whenever the grid changes. The client is
 * purely a viewport: it applies whatever `stateMessage()` emits.
 */
import {
  SpatialGrid,
  generateTerrain,
  CityDevelopment,
  RoadGraph,
  ResourceGrids,
  computeCityStats,
  TILE_TYPES,
  type CityStats,
} from '@autopolis/core';

export class World {
  readonly grid: SpatialGrid;
  seed: number;
  tick = 0;
  stats: CityStats;
  private dev: CityDevelopment;
  private roadGraph: RoadGraph;
  private resources: ResourceGrids;

  constructor(seed: number, width = 64, height = 64) {
    this.seed = seed;
    this.grid = new SpatialGrid(width, height);
    generateTerrain(this.grid, { seed });
    this.dev = new CityDevelopment(seed);
    this.resources = new ResourceGrids(this.grid);
    this.roadGraph = RoadGraph.fromGrid(this.grid);
    this.stats = computeCityStats(this.grid, this.resources, this.roadGraph);
  }

  /**
   * Advance one tick. Returns true if the world state changed (grid mutated) —
   * callers broadcast a full state message only then.
   */
  step(): boolean {
    this.tick++;
    const changed = this.dev.step(this.grid, this.tick);
    if (changed) this.refresh();
    return changed;
  }

  /** Reseed the world (god-mode "New Seed"). Deterministic from the new seed onward. */
  reset(): void {
    this.seed = Math.floor(Math.random() * 1_000_000_000);
    this.tick = 0;
    this.grid.fill(TILE_TYPES.GRASS);
    this.grid.elevations.fill(0);
    generateTerrain(this.grid, { seed: this.seed });
    this.dev = new CityDevelopment(this.seed);
    this.refresh();
  }

  /** Rebuild derived state (road graph, resource grids, stats) from the grid. */
  private refresh(): void {
    this.roadGraph = RoadGraph.fromGrid(this.grid);
    this.resources.recompute(this.grid);
    this.stats = computeCityStats(this.grid, this.resources, this.roadGraph);
  }

  /** Full client-sync payload — grid + stats + resource coverage arrays. */
  stateMessage(): Record<string, unknown> {
    return {
      type: 'world:state',
      tick: this.tick,
      grid: this.grid.serialize(),
      stats: this.stats,
      resources: {
        power: Array.from(this.resources.power),
        water: Array.from(this.resources.water),
      },
    };
  }

  health(): Record<string, unknown> {
    return {
      ok: true,
      service: 'autopolis-core',
      tick: this.tick,
      grid: { width: this.grid.width, height: this.grid.height, seed: this.seed },
      stats: {
        population: this.stats.population,
        zones: this.stats.zones,
        powerCoverage: this.stats.powerCoverage,
        waterCoverage: this.stats.waterCoverage,
        roadComponents: this.stats.roadComponents,
      },
    };
  }
}
