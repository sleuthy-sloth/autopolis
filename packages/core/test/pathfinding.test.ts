import { describe, expect, it } from 'vitest';
import {
  SpatialGrid,
  findRoadPath,
  findRailPath,
  findTerrainPath,
  findWaterPath,
  TILE_TYPES,
} from '../src';

function roadLine(grid: SpatialGrid, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      grid.set(x, y, TILE_TYPES.ROAD);
    }
  }
}

function pathIsValid(path: { x: number; y: number }[], grid: SpatialGrid): boolean {
  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i].x - path[i - 1].x);
    const dy = Math.abs(path[i].y - path[i - 1].y);
    if (dx > 1 || dy > 1 || (dx + dy === 0)) return false;
    if (grid.get(path[i].x, path[i].y) === TILE_TYPES.WATER) return false;
  }
  return true;
}

describe('findRoadPath', () => {
  it('finds the straight path along a road line', () => {
    const g = new SpatialGrid(10, 10);
    roadLine(g, 0, 4, 9, 4);
    const r = findRoadPath(g, { x: 0, y: 4 }, { x: 9, y: 4 });
    expect(r.found).toBe(true);
    expect(r.cost).toBe(9);
    expect(r.path).toHaveLength(10);
    expect(r.path[0]).toEqual({ x: 0, y: 4 });
    expect(r.path[9]).toEqual({ x: 9, y: 4 });
  });

  it('routes around road gaps (no grass shortcuts)', () => {
    const g = new SpatialGrid(12, 12);
    roadLine(g, 1, 1, 10, 1); // top road
    roadLine(g, 1, 9, 10, 9); // bottom road
    roadLine(g, 1, 1, 1, 9); // left connector
    roadLine(g, 10, 1, 10, 9); // right connector
    g.set(4, 1, TILE_TYPES.GRASS); // gap in top road
    g.set(5, 1, TILE_TYPES.GRASS);
    const r = findRoadPath(g, { x: 2, y: 1 }, { x: 8, y: 1 });
    expect(r.found).toBe(true);
    // The detour must stay on roads: every path tile is ROAD.
    for (const p of r.path) {
      expect(g.get(p.x, p.y)).toBe(TILE_TYPES.ROAD);
    }
    expect(r.cost).toBeGreaterThan(6); // longer than the direct 6
  });

  it('returns not found when start/goal are not on roads', () => {
    const g = new SpatialGrid(10, 10);
    roadLine(g, 2, 2, 4, 2);
    expect(findRoadPath(g, { x: 0, y: 0 }, { x: 3, y: 2 }).found).toBe(false);
    expect(findRoadPath(g, { x: 2, y: 2 }, { x: 9, y: 9 }).found).toBe(false);
  });

  it('is deterministic across repeated runs', () => {
    const g = new SpatialGrid(16, 16);
    roadLine(g, 0, 2, 15, 2);
    roadLine(g, 15, 2, 15, 12);
    roadLine(g, 15, 12, 2, 12);
    roadLine(g, 2, 12, 2, 2);
    const a = findRoadPath(g, { x: 0, y: 2 }, { x: 2, y: 12 });
    const b = findRoadPath(g, { x: 0, y: 2 }, { x: 2, y: 12 });
    expect(a.path).toEqual(b.path);
    expect(a.cost).toBe(b.cost);
  });
});

describe('findWaterPath', () => {
  it('sails across open ocean', () => {
    const g = new SpatialGrid(20, 20);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) g.set(x, y, TILE_TYPES.WATER);
    }
    const r = findWaterPath(g, { x: 2, y: 2 }, { x: 17, y: 17 });
    expect(r.found).toBe(true);
    for (const p of r.path) expect(g.get(p.x, p.y)).toBe(TILE_TYPES.WATER);
  });

  it('cannot cross land (lakes stay separate)', () => {
    const g = new SpatialGrid(20, 20); // all land
    for (let x = 2; x <= 4; x++) {
      for (let y = 2; y <= 4; y++) g.set(x, y, TILE_TYPES.WATER); // lake A
    }
    for (let x = 14; x <= 16; x++) {
      for (let y = 14; y <= 16; y++) g.set(x, y, TILE_TYPES.WATER); // lake B
    }
    expect(findWaterPath(g, { x: 3, y: 3 }, { x: 15, y: 15 }).found).toBe(false);
  });

  it('is deterministic', () => {
    const g = new SpatialGrid(20, 20);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) g.set(x, y, TILE_TYPES.WATER);
    }
    const a = findWaterPath(g, { x: 1, y: 1 }, { x: 18, y: 18 });
    const b = findWaterPath(g, { x: 1, y: 1 }, { x: 18, y: 18 });
    expect(a.path).toEqual(b.path);
  });
});

describe('findRailPath', () => {
  it('routes trains along a rail line only', () => {
    const g = new SpatialGrid(20, 20);
    for (let y = 8; y <= 10; y++) {
      for (let x = 2; x <= 17; x++) g.set(x, y, TILE_TYPES.RAIL);
    }
    const r = findRailPath(g, { x: 2, y: 9 }, { x: 17, y: 9 });
    expect(r.found).toBe(true);
    for (const p of r.path) expect(g.get(p.x, p.y)).toBe(TILE_TYPES.RAIL);
  });

  it('returns not found off the rails', () => {
    const g = new SpatialGrid(20, 20);
    for (let x = 2; x <= 6; x++) g.set(x, 9, TILE_TYPES.RAIL);
    expect(findRailPath(g, { x: 3, y: 9 }, { x: 15, y: 15 }).found).toBe(false);
  });
});

describe('findTerrainPath', () => {
  it('walks diagonally across open land with octile cost', () => {
    const g = new SpatialGrid(10, 10);
    const r = findTerrainPath(g, { x: 0, y: 0 }, { x: 4, y: 4 });
    expect(r.found).toBe(true);
    expect(r.cost).toBeCloseTo(4 * Math.SQRT2, 6);
    expect(r.path[0]).toEqual({ x: 0, y: 0 });
    expect(r.path[r.path.length - 1]).toEqual({ x: 4, y: 4 });
  });

  it('avoids water', () => {
    const g = new SpatialGrid(10, 10);
    for (let x = 2; x <= 8; x++) g.set(x, 5, TILE_TYPES.WATER); // partial wall — detour exists
    const r = findTerrainPath(g, { x: 1, y: 2 }, { x: 8, y: 8 });
    expect(r.found).toBe(true);
    expect(pathIsValid(r.path, g)).toBe(true);
    // No path tile sits on the water wall.
    for (const p of r.path) {
      expect(g.get(p.x, p.y)).not.toBe(TILE_TYPES.WATER);
    }
  });

  it('returns not found when the goal is surrounded by water', () => {
    const g = new SpatialGrid(10, 10);
    g.set(5, 5, TILE_TYPES.GRASS);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        g.set(5 + dx, 5 + dy, TILE_TYPES.WATER);
      }
    }
    const r = findTerrainPath(g, { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(r.found).toBe(false);
  });

  it('is deterministic', () => {
    const g = new SpatialGrid(10, 10);
    for (let x = 0; x < 10; x++) g.set(x, 5, TILE_TYPES.WATER);
    const a = findTerrainPath(g, { x: 1, y: 2 }, { x: 8, y: 8 });
    const b = findTerrainPath(g, { x: 1, y: 2 }, { x: 8, y: 8 });
    expect(a.path).toEqual(b.path);
  });
});
