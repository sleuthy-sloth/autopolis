/**
 * Resource grid dynamics — power & water.
 *
 * Power plants and water towers flood their resource across connected land
 * tiles, attenuating with distance up to MAX_RANGE. Grids are Float32Arrays
 * (0..1 coverage per tile) indexed like the SpatialGrid — cheap to sample,
 * cheap to serialize to the client, deterministic to compute.
 */
import { SpatialGrid } from './grid';
import { TILE_TYPES } from './tiles';
import { RoadGraph } from './roadgraph';

export const RESOURCE_MAX_RANGE = 14;

export class ResourceGrids {
  readonly power: Float32Array;
  readonly water: Float32Array;
  private width: number;
  private height: number;

  constructor(grid: SpatialGrid) {
    this.width = grid.width;
    this.height = grid.height;
    this.power = new Float32Array(grid.width * grid.height);
    this.water = new Float32Array(grid.width * grid.height);
  }

  /** BFS flood from all sources of one resource through non-water land. */
  private flood(
    grid: SpatialGrid,
    sourceType: number,
    out: Float32Array,
  ): void {
    const { width, height } = grid;
    const dist = new Uint16Array(width * height).fill(0xffff);
    const queue: number[] = [];
    grid.forEach((x, y, type) => {
      if (type === sourceType) {
        const idx = y * width + x;
        dist[idx] = 0;
        queue.push(idx);
      }
    });
    if (queue.length === 0) {
      out.fill(0);
      return;
    }
    out.fill(0);
    for (let head = 0; head < queue.length; head++) {
      const idx = queue[head];
      const d = dist[idx];
      if (d >= RESOURCE_MAX_RANGE) continue;
      const x = idx % width;
      const y = Math.floor(idx / width);
      const coverage = 1 - d / RESOURCE_MAX_RANGE;
      if (coverage > out[idx]) out[idx] = coverage;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (dist[nIdx] !== 0xffff || grid.get(nx, ny) === TILE_TYPES.WATER) continue;
        dist[nIdx] = d + 1;
        queue.push(nIdx);
      }
    }
  }

  /** Recompute both grids from the current tile state. Call when the grid changes. */
  recompute(grid: SpatialGrid): void {
    this.width = grid.width;
    this.height = grid.height;
    this.flood(grid, TILE_TYPES.POWER_PLANT, this.power);
    this.flood(grid, TILE_TYPES.WATER_TOWER, this.water);
  }
}

// ── City statistics ─────────────────────────────────────────────────────────

export interface CityStats {
  zones: {
    residential: number;
    commercial: number;
    industrial: number;
  };
  infrastructure: {
    roadTiles: number;
    railTiles: number;
    powerPlants: number;
    waterTowers: number;
    roadComponents: number;
  };
  /** Residential tiles × 4 (a deterministic stand-in for family density). */
  population: number;
  /** Fraction of R+C+I tiles with power ≥ 0.5. */
  powerCoverage: number;
  /** Fraction of residential tiles with water ≥ 0.5. */
  waterCoverage: number;
  /** Road network connectivity — 1 means one connected city. */
  roadComponents: number;
}

export function computeCityStats(grid: SpatialGrid, resources: ResourceGrids, roadGraph: RoadGraph): CityStats {
  let residential = 0;
  let commercial = 0;
  let industrial = 0;
  let powerPlants = 0;
  let waterTowers = 0;
  let roadTiles = 0;
  let railTiles = 0;
  let zoneTiles = 0;
  let poweredZones = 0;
  let wateredResidential = 0;

  grid.forEach((x, y, type) => {
    switch (type) {
      case TILE_TYPES.ROAD:
        roadTiles++;
        break;
      case TILE_TYPES.RAIL:
        railTiles++;
        break;
      case TILE_TYPES.RESIDENTIAL:
        residential++;
        zoneTiles++;
        if (resources.power[y * grid.width + x] >= 0.5) poweredZones++;
        if (resources.water[y * grid.width + x] >= 0.5) wateredResidential++;
        break;
      case TILE_TYPES.COMMERCIAL:
        commercial++;
        zoneTiles++;
        if (resources.power[y * grid.width + x] >= 0.5) poweredZones++;
        break;
      case TILE_TYPES.INDUSTRIAL:
        industrial++;
        zoneTiles++;
        if (resources.power[y * grid.width + x] >= 0.5) poweredZones++;
        break;
      case TILE_TYPES.POWER_PLANT:
        powerPlants++;
        break;
      case TILE_TYPES.WATER_TOWER:
        waterTowers++;
        break;
    }
  });

  return {
    zones: { residential, commercial, industrial },
    infrastructure: {
      roadTiles,
      railTiles,
      powerPlants,
      waterTowers,
      roadComponents: roadGraph.componentCount(),
    },
    population: residential * 4,
    powerCoverage: zoneTiles > 0 ? poweredZones / zoneTiles : 0,
    waterCoverage: residential > 0 ? wateredResidential / residential : 0,
    roadComponents: roadGraph.componentCount(),
  };
}
