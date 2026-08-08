import { describe, expect, it } from 'vitest';
import { SpatialGrid, TILE_TYPES } from '../src';

describe('SpatialGrid', () => {
  it('constructs with all-grass defaults', () => {
    const g = new SpatialGrid(8, 6);
    expect(g.width).toBe(8);
    expect(g.height).toBe(6);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 8; x++) {
        expect(g.get(x, y)).toBe(TILE_TYPES.GRASS);
      }
    }
  });

  it('rejects invalid dimensions', () => {
    expect(() => new SpatialGrid(0, 4)).toThrow();
    expect(() => new SpatialGrid(4, -1)).toThrow();
    expect(() => new SpatialGrid(4.5, 4)).toThrow();
  });

  it('set/get round-trips tile types and elevations', () => {
    const g = new SpatialGrid(4, 4);
    g.set(2, 3, TILE_TYPES.STONE);
    g.setElevation(2, 3, 0.75);
    expect(g.get(2, 3)).toBe(TILE_TYPES.STONE);
    expect(g.getElevation(2, 3)).toBeCloseTo(0.75, 5);
    expect(g.get(1, 1)).toBe(TILE_TYPES.GRASS);
  });

  it('out-of-bounds reads return WATER, writes are ignored', () => {
    const g = new SpatialGrid(4, 4);
    expect(g.get(-1, 0)).toBe(TILE_TYPES.WATER);
    expect(g.get(4, 0)).toBe(TILE_TYPES.WATER);
    expect(g.get(0, 4)).toBe(TILE_TYPES.WATER);
    g.set(-1, 0, TILE_TYPES.FOREST);
    g.set(99, 99, TILE_TYPES.FOREST);
    expect(g.get(-1, 0)).toBe(TILE_TYPES.WATER);
  });

  it('neighbors returns Moore neighborhood and respects bounds', () => {
    const g = new SpatialGrid(5, 5);
    const center = g.neighbors(2, 2, 1);
    expect(center).toHaveLength(8);
    const corner = g.neighbors(0, 0, 1);
    expect(corner).toHaveLength(3);
    const wide = g.neighbors(2, 2, 2);
    expect(wide).toHaveLength(24); // 5x5 minus self
  });

  it('toMatrix is y-major with row = y, col = x', () => {
    const g = new SpatialGrid(3, 2);
    g.set(0, 1, TILE_TYPES.WATER);
    g.set(2, 0, TILE_TYPES.STONE);
    const m = g.toMatrix();
    expect(m).toHaveLength(2);
    expect(m[0]).toHaveLength(3);
    expect(m[1][0]).toBe(TILE_TYPES.WATER);
    expect(m[0][2]).toBe(TILE_TYPES.STONE);
    expect(m[0][0]).toBe(TILE_TYPES.GRASS);
  });

  it('serialize/deserialize round-trips byte-identically', () => {
    const a = new SpatialGrid(7, 5);
    a.seed = 42;
    a.set(1, 1, TILE_TYPES.FOREST);
    a.setElevation(1, 1, 0.9);
    const b = SpatialGrid.deserialize(a.serialize());
    expect(b.equals(a)).toBe(true);
    expect(b.seed).toBe(42);
    expect(b.width).toBe(7);
  });

  it('clone is independent of the original', () => {
    const a = new SpatialGrid(4, 4);
    a.set(0, 0, TILE_TYPES.SAND);
    const b = a.clone();
    b.set(0, 0, TILE_TYPES.WATER);
    expect(a.get(0, 0)).toBe(TILE_TYPES.SAND);
    expect(b.get(0, 0)).toBe(TILE_TYPES.WATER);
  });
});
