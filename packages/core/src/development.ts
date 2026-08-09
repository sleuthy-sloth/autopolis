/**
 * CityDevelopment — deterministic, seed-driven city growth, built from NOTHING.
 *
 * Growth is deliberately slow and visible: a road stub appears at tick 1, then
 * avenues extend every few seconds, ring roads arc together over minutes, zones
 * hug the roads as they appear, and rails/infrastructure arrive later. Every
 * action is a pure function of (seed, tick, grid state) — same seed, same city,
 * tick for tick, so the whole emergence can be replayed.
 *
 * Schedule (1 Hz ticks):
 *   tick 1        central road stub
 *   every 5 ticks avenues extend (from tick 5)
 *   ticks 20-44   inner ring road arcs (r=8)
 *   every 4 ticks zone patches (from tick 40, road-hugging)
 *   tick 90/100   power plant + water tower
 *   ticks 120-144 mid ring arcs (r=11)
 *   ticks 150+    rail line extends (along one avenue)
 *   ticks 220/230 second plant + tower
 *   ticks 240-264 outer ring arcs (r=14)
 *   ticks 400+    slow sprawl: roads + patches at growing radius
 */
import { SpatialGrid } from './grid';
import { hash2 } from './rng';
import { TILE_TYPES, TileType } from './tiles';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Zones & infrastructure may claim grassland, dirt, sand, or cleared forest. */
export function isDevelopableType(type: TileType): boolean {
  return (
    type === TILE_TYPES.GRASS ||
    type === TILE_TYPES.DIRT ||
    type === TILE_TYPES.SAND ||
    type === TILE_TYPES.FOREST
  );
}

/** Roads may blast through any land except water and existing rails. */
export function isPavableType(type: TileType): boolean {
  return type !== TILE_TYPES.WATER && type !== TILE_TYPES.RAIL;
}

/** Rails claim undeveloped land and cross roads at grade (level crossings). */
function isRailable(type: TileType): boolean {
  return (
    type === TILE_TYPES.GRASS ||
    type === TILE_TYPES.DIRT ||
    type === TILE_TYPES.SAND ||
    type === TILE_TYPES.FOREST ||
    type === TILE_TYPES.ROAD
  );
}

/** Downtown flattens stone and zones, but never paves roads or rails. */
function isCorePavable(type: TileType): boolean {
  return type !== TILE_TYPES.WATER && type !== TILE_TYPES.ROAD && type !== TILE_TYPES.RAIL;
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

    if (tick === 1) this.stub(grid, cx, cy);
    if (tick >= 5 && (tick - 5) % 5 === 0) this.extendAvenue(grid, cx, cy, tick);
    if (this.ringTick(tick, 8, 20)) this.ringArc(grid, cx, cy, 8, this.ringTick(tick, 8, 20) - 1);
    if (this.ringTick(tick, 11, 120)) this.ringArc(grid, cx, cy, 11, this.ringTick(tick, 11, 120) - 1);
    if (this.ringTick(tick, 14, 240)) this.ringArc(grid, cx, cy, 14, this.ringTick(tick, 14, 240) - 1);
    if (tick >= 40 && (tick - 40) % 4 === 0) this.zonePatch(grid, cx, cy, tick);
    if (tick >= 44 && (tick - 44) % 8 === 0) this.downtown(grid, cx, cy, tick);
    if (tick === 90) this.placeCore(grid, cx + 2, cy - 2, TILE_TYPES.POWER_PLANT);
    if (tick === 100) this.placeCore(grid, cx - 2, cy + 2, TILE_TYPES.WATER_TOWER);
    if (tick === 220) this.placeCore(grid, cx - 9, cy - 9, TILE_TYPES.POWER_PLANT);
    if (tick === 230) this.placeCore(grid, cx + 9, cy + 9, TILE_TYPES.WATER_TOWER);
    if (tick >= 150 && (tick - 150) % 6 === 0) this.extendRail(grid, cx, cy, tick);
    if (tick >= 400 && (tick - 400) % 8 === 0) this.sprawl(grid, cx, cy, tick);

    return this.changed;
  }

  /** Which ring arc fires this tick (1..4) for a radius scheduled at `start`, or 0. */
  private ringTick(tick: number, _r: number, start: number): number {
    if (tick < start) return 0;
    const k = (tick - start) / 8;
    return Number.isInteger(k) && k >= 0 && k < 4 ? k + 1 : 0;
  }

  /** Central plus-shaped road stub — the first stone of the city. */
  private stub(grid: SpatialGrid, cx: number, cy: number): void {
    for (const [dx, dy] of DIRS) {
      this.pave(grid, cx + dx, cy);
      this.pave(grid, cx, cy + dy);
      this.pave(grid, cx + dx * 2, cy);
      this.pave(grid, cx, cy + dy * 2);
    }
  }

  /** Extend one avenue outward by one step (2 tiles). Avenues cycle 0..3. */
  private extendAvenue(grid: SpatialGrid, cx: number, cy: number, tick: number): void {
    const k = (tick - 5) / 5; // global step: 0,1,2,...
    const avenue = k % DIRS.length;
    const stepForThisAvenue = Math.floor(k / DIRS.length);
    const [dx, dy] = DIRS[avenue];
    const len = 3 + stepForThisAvenue * 2; // each avenue grows independently
    for (let r = len - 1; r <= len; r++) {
      const x = cx + dx * r;
      const y = cy + dy * r;
      if (!grid.inBounds(x, y) || grid.get(x, y) === TILE_TYPES.WATER) break;
      this.pave(grid, x, y);
    }
  }

  /** One side of a square ring road (arc 0=top, 1=right, 2=bottom, 3=left). */
  private ringArc(grid: SpatialGrid, cx: number, cy: number, r: number, arc: number): void {
    for (let i = -r; i <= r; i++) {
      if (arc === 0) this.pave(grid, cx + i, cy - r);
      else if (arc === 1) this.pave(grid, cx + r, cy + i);
      else if (arc === 2) this.pave(grid, cx + i, cy + r);
      else this.pave(grid, cx - r, cy + i);
    }
  }

  /**
   * A small zone patch that hugs the road network: tiles are zoned only if
   * they're developable AND near a road, so districts grow organically along
   * the streets. Type by distance from center: commercial core, then
   * residential, industrial beyond the ring.
   */
  private zonePatch(grid: SpatialGrid, cx: number, cy: number, tick: number): void {
    const k = (tick - 40) / 4;
    // Deterministic scatter across the map (k*37/91 mod 41 keeps it spread).
    const px = cx + (((k * 37) % 41) - 20);
    const py = cy + (((k * 91) % 41) - 20);
    const centerR = Math.max(Math.abs(px - cx), Math.abs(py - cy));

    let type: TileType = TILE_TYPES.RESIDENTIAL;
    if (centerR <= 3) type = TILE_TYPES.COMMERCIAL;
    else if (centerR >= 12 && tick >= 120) type = TILE_TYPES.INDUSTRIAL;

    let anyNear = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (this.nearRoad(grid, px + dx, py + dy)) anyNear = true;
      }
    }
    if (!anyNear) return; // no roads yet here — later patches will find them
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (this.nearRoad(grid, x, y)) this.placeZone(grid, x, y, type);
      }
    }
  }

  /** Downtown spreads one commercial block at a time near the center. */
  private downtown(grid: SpatialGrid, cx: number, cy: number, tick: number): void {
    const k = (tick - 44) / 8;
    const px = cx + (((k * 5) % 7) - 3);
    const py = cy + (((k * 13) % 7) - 3);
    if (this.nearRoad(grid, px, py)) this.placeZone(grid, px, py, TILE_TYPES.COMMERCIAL);
  }

  /** True if a ROAD tile exists orthogonally adjacent (zones front the street). */
  private nearRoad(grid: SpatialGrid, x: number, y: number): boolean {
    return (
      grid.get(x + 1, y) === TILE_TYPES.ROAD ||
      grid.get(x - 1, y) === TILE_TYPES.ROAD ||
      grid.get(x, y + 1) === TILE_TYPES.ROAD ||
      grid.get(x, y - 1) === TILE_TYPES.ROAD
    );
  }

  /** Rail line along one avenue (offset 1 tile), growing outward over time. */
  private extendRail(grid: SpatialGrid, cx: number, cy: number, tick: number): void {
    const d = Math.floor(hash2(this.seed, 555, 7) * 4);
    const [dx, dy] = DIRS[d];
    // Perpendicular offset (choose side deterministically).
    const side = hash2(this.seed, 556, 7) < 0.5 ? 1 : -1;
    const perpX = dx === 0 ? side : 0;
    const perpY = dy === 0 ? side : 0;
    const len = 4 + Math.floor((tick - 150) / 6) * 4;
    for (let r = 2; r <= len; r++) {
      this.placeRail(grid, cx + dx * r + perpX, cy + dy * r + perpY);
    }
  }

  /** Late-game sprawl: occasional roads + patches at growing radius. */
  private sprawl(grid: SpatialGrid, cx: number, cy: number, tick: number): void {
    const k = (tick - 400) / 8;
    const avenue = Math.floor(k) % DIRS.length;
    const [dx, dy] = DIRS[avenue];
    const r = 16 + (Math.floor(k / DIRS.length) % 6) * 2;
    this.pave(grid, cx + dx * r, cy + dy * r);
    this.zonePatch(grid, cx, cy, 40 + k * 4); // reuse patch logic at new offsets
  }

  private placeZone(grid: SpatialGrid, x: number, y: number, type: TileType): void {
    if (grid.inBounds(x, y) && isDevelopableType(grid.get(x, y))) {
      grid.set(x, y, type);
      this.changed = true;
    }
  }

  private placeCore(grid: SpatialGrid, x: number, y: number, type: TileType): void {
    if (grid.inBounds(x, y) && isCorePavable(grid.get(x, y))) {
      grid.set(x, y, type);
      this.changed = true;
    }
  }

  private pave(grid: SpatialGrid, x: number, y: number): void {
    if (!grid.inBounds(x, y)) return;
    const cur = grid.get(x, y);
    if (cur === TILE_TYPES.ROAD || !isPavableType(cur)) return;
    grid.set(x, y, TILE_TYPES.ROAD);
    this.changed = true;
  }

  private placeRail(grid: SpatialGrid, x: number, y: number): void {
    if (!grid.inBounds(x, y)) return;
    const cur = grid.get(x, y);
    if (cur === TILE_TYPES.RAIL || !isRailable(cur)) return;
    grid.set(x, y, TILE_TYPES.RAIL);
    this.changed = true;
  }
}
