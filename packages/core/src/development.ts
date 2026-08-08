/**
 * CityDevelopment — deterministic, seed-driven city growth.
 *
 * A scripted stand-in for the Phase 3 Developer/Planner agents: given only
 * (seed, tick) it lays roads, zones, and infrastructure in a believable order:
 *
 *   tick 1  → ring road + 4 arterial avenues
 *   tick 2  → power plant + water tower, then residential ring,
 *             commercial core, industrial band
 *   tick 5  → outer ring road
 *   tick 6  → outer residential ring
 *   tick 8  → second power plant (outer ring)
 *   tick 9  → second water tower (outer ring)
 *   tick 10 → arterial extensions (connect to island edge)
 *
 * Pure function of (seed, tick): the same seed reproduces the same city,
 * tick for tick — required for agent replay in Phase 3.
 */
import { SpatialGrid } from './grid';
import { hash2 } from './rng';
import { TILE_TYPES, TileType } from './tiles';

const RING_INNER = 8;
const RING_OUTER = 14;

/** Zones & infrastructure may claim grassland, dirt, sand, or cleared forest. */
function isDevelopable(type: TileType): boolean {
  return (
    type === TILE_TYPES.GRASS ||
    type === TILE_TYPES.DIRT ||
    type === TILE_TYPES.SAND ||
    type === TILE_TYPES.FOREST
  );
}

/** Roads may blast through any land except water — beltways don't stop for hills. */
function isPavable(type: TileType): boolean {
  return type !== TILE_TYPES.WATER;
}

/** Downtown flattens stone too — the commercial core and power plant claim any land. */
function isCorePavable(type: TileType): boolean {
  return isPavable(type) || type === TILE_TYPES.STONE;
}

export class CityDevelopment {
  constructor(readonly seed: number) {}

  /** Set by any placement this tick — returned from step() so callers know to refresh derived state. */
  private changed = false;

  /** Advance development by one tick. Returns true if the grid changed. */
  step(grid: SpatialGrid, tick: number): boolean {
    this.changed = false;

    const cx = Math.floor(grid.width / 2);
    const cy = Math.floor(grid.height / 2);

    switch (tick) {
      case 1:
        this.ringRoad(grid, cx, cy, RING_INNER);
        this.avenues(grid, cx, cy, RING_INNER);
        break;
      case 2:
        // Infrastructure first — it must claim grass before the zones do.
        this.infrastructure(grid, cx, cy);
        this.residentialRing(grid, cx, cy, 2, RING_INNER - 2);
        this.commercialCore(grid, cx, cy, 1);
        this.industrialBand(grid, cx, cy, RING_INNER + 1, RING_INNER + 6);
        break;
      case 5:
        this.ringRoad(grid, cx, cy, RING_OUTER);
        this.avenues(grid, cx, cy, RING_OUTER);
        break;
      case 6:
        this.residentialRing(grid, cx, cy, RING_INNER + 2, RING_OUTER - 1);
        break;
      case 8:
        this.outerPowerPlant(grid, cx, cy);
        break;
      case 9:
        this.outerWaterTower(grid, cx, cy);
        break;
      case 10:
        this.avenues(grid, cx, cy, RING_OUTER + 1);
        break;
    }

    return this.changed;
  }

  /** Square ring road centered on (cx, cy) at Chebyshev radius r. */
  private ringRoad(grid: SpatialGrid, cx: number, cy: number, r: number): void {
    for (let dx = -r; dx <= r; dx++) {
      this.pave(grid, cx + dx, cy - r);
      this.pave(grid, cx + dx, cy + r);
      this.pave(grid, cx - r, cy + dx);
      this.pave(grid, cx + r, cy + dx);
    }
  }

  /** Four arterial avenues from radius r outward to the island edge. */
  private avenues(grid: SpatialGrid, cx: number, cy: number, fromR: number): void {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      let r = fromR;
      for (;;) {
        const x = cx + dx * r;
        const y = cy + dy * r;
        if (!grid.inBounds(x, y) || grid.get(x, y) === TILE_TYPES.WATER) break;
        this.pave(grid, x, y);
        r++;
      }
    }
  }

  private residentialRing(grid: SpatialGrid, cx: number, cy: number, rMin: number, rMax: number): void {
    grid.forEach((x, y, type) => {
      if (!isDevelopable(type)) return;
      const r = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (r >= rMin && r <= rMax) {
        grid.set(x, y, TILE_TYPES.RESIDENTIAL);
        this.changed = true;
      }
    });
  }

  private commercialCore(grid: SpatialGrid, cx: number, cy: number, r: number): void {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        this.placeCore(grid, cx + dx, cy + dy, TILE_TYPES.COMMERCIAL);
      }
    }
  }

  /** Industrial band in one cardinal direction (chosen deterministically by seed). */
  private industrialBand(grid: SpatialGrid, cx: number, cy: number, rMin: number, rMax: number): void {
    const dir = Math.floor(hash2(this.seed, 101, 7) * 4);
    const [dx, dy] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ][dir];
    for (let r = rMin; r <= rMax; r++) {
      const bx = cx + dx * r;
      const by = cy + dy * r;
      for (let w = -2; w <= 2; w++) {
        const x = dx !== 0 ? bx : cx + w;
        const y = dy !== 0 ? by : cy + w;
        this.placeIf(grid, x, y, TILE_TYPES.INDUSTRIAL);
      }
    }
  }

  /** Power plant near the commercial core, water tower inside the industrial band. */
  private infrastructure(grid: SpatialGrid, cx: number, cy: number): void {
    // Power plant: just inside the inner ring, offset deterministically.
    const px = cx + (hash2(this.seed, 202, 7) < 0.5 ? -2 : 2);
    const py = cy + (hash2(this.seed, 203, 7) < 0.5 ? -2 : 2);
    this.placeCore(grid, px, py, TILE_TYPES.POWER_PLANT);

    // Water tower: adjacent to the industrial band's inner edge.
    const dir = Math.floor(hash2(this.seed, 101, 7) * 4);
    const [dx, dy] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ][dir];
    const wx = dx !== 0 ? cx + dx * (RING_INNER - 1) : cx + 1;
    const wy = dy !== 0 ? cy + dy * (RING_INNER - 1) : cy + 1;
    this.placeIf(grid, wx, wy, TILE_TYPES.WATER_TOWER);
  }

  /** Second power plant on the outer ring — capacity grows with the city. */
  private outerPowerPlant(grid: SpatialGrid, cx: number, cy: number): void {
    const side = hash2(this.seed, 301, 7) < 0.5 ? 1 : -1;
    const px = cx + 11 * side;
    const py = cy + (hash2(this.seed, 302, 7) < 0.5 ? 3 : -3);
    this.placeCore(grid, px, py, TILE_TYPES.POWER_PLANT);
  }

  /** Second water tower on the opposite side of the outer ring. */
  private outerWaterTower(grid: SpatialGrid, cx: number, cy: number): void {
    const side = hash2(this.seed, 301, 7) < 0.5 ? 1 : -1;
    const wx = cx - 11 * side;
    const wy = cy + (hash2(this.seed, 303, 7) < 0.5 ? 4 : -4);
    this.placeCore(grid, wx, wy, TILE_TYPES.WATER_TOWER);
  }

  private placeIf(grid: SpatialGrid, x: number, y: number, type: TileType): void {
    if (grid.inBounds(x, y) && isDevelopable(grid.get(x, y))) {
      grid.set(x, y, type);
      this.changed = true;
    }
  }

  /** Core-area placement: flattens stone, stops only at water. */
  private placeCore(grid: SpatialGrid, x: number, y: number, type: TileType): void {
    if (grid.inBounds(x, y) && isCorePavable(grid.get(x, y))) {
      grid.set(x, y, type);
      this.changed = true;
    }
  }

  private pave(grid: SpatialGrid, x: number, y: number): void {
    if (grid.inBounds(x, y) && isPavable(grid.get(x, y))) {
      grid.set(x, y, TILE_TYPES.ROAD);
      this.changed = true;
    }
  }
}
