import { describe, expect, it } from 'vitest';
import { SpatialGrid, generateTerrain, TILE_TYPES } from '../src';

describe('generateTerrain', () => {
  it('is deterministic: same seed → identical grid', () => {
    const a = new SpatialGrid(64, 64);
    const b = new SpatialGrid(64, 64);
    generateTerrain(a, { seed: 1337 });
    generateTerrain(b, { seed: 1337 });
    expect(a.equals(b)).toBe(true);
  });

  it('is deterministic across serialization boundaries', () => {
    const a = new SpatialGrid(32, 32);
    generateTerrain(a, { seed: 99 });
    const b = SpatialGrid.deserialize(a.serialize());
    const c = new SpatialGrid(32, 32);
    generateTerrain(c, { seed: 99 });
    expect(b.equals(c)).toBe(true);
  });

  it('different seeds produce different terrain', () => {
    const a = new SpatialGrid(64, 64);
    const b = new SpatialGrid(64, 64);
    generateTerrain(a, { seed: 1 });
    generateTerrain(b, { seed: 2 });
    expect(a.equals(b)).toBe(false);
  });

  it('stores the seed on the grid', () => {
    const g = new SpatialGrid(16, 16);
    const used = generateTerrain(g, { seed: 777 });
    expect(used).toBe(777);
    expect(g.seed).toBe(777);
  });

  it('produces only valid tile codes', () => {
    const g = new SpatialGrid(48, 48);
    generateTerrain(g, { seed: 20260808 });
    const valid = new Set(Object.values(TILE_TYPES));
    g.forEach((_x, _y, type) => {
      expect(valid.has(type)).toBe(true);
    });
  });

  it('produces an island: interior land, edges water', () => {
    const g = new SpatialGrid(64, 64);
    generateTerrain(g, { seed: 1337 });
    let land = 0;
    let total = 0;
    let edgeWater = 0;
    g.forEach((x, y, type) => {
      total++;
      if (type !== TILE_TYPES.WATER) land++;
      const onEdge = x === 0 || y === 0 || x === 63 || y === 63;
      if (onEdge && type === TILE_TYPES.WATER) edgeWater++;
    });
    const edgeCells = 4 * 64 - 4;
    expect(land / total).toBeGreaterThan(0.2); // a real landmass
    expect(land / total).toBeLessThan(0.95);
    expect(edgeWater / edgeCells).toBeGreaterThan(0.5); // mostly ocean at borders
  });

  it('is stable across grid sizes for the same seed region', () => {
    const a = new SpatialGrid(64, 64);
    const b = new SpatialGrid(64, 64);
    generateTerrain(a, { seed: 5 });
    generateTerrain(b, { seed: 5 });
    expect(a.equals(b)).toBe(true);
  });
});
