import { describe, expect, it } from 'vitest';
import { SpatialGrid, generateTerrain, gridToSnapshot, TILE_TYPES, TILE_NAMES } from '../src';

describe('gridToSnapshot', () => {
  it('emits the LLM contract shape', () => {
    const g = new SpatialGrid(8, 8);
    generateTerrain(g, { seed: 7 });
    const snap = gridToSnapshot(g, 41);
    expect(snap.tick).toBe(41);
    expect(snap.width).toBe(8);
    expect(snap.height).toBe(8);
    expect(snap.seed).toBe(7);
    expect(snap.tiles).toHaveLength(8);
    expect(snap.tiles[0]).toHaveLength(8);
  });

  it('legend maps names to the codes used in the matrix', () => {
    const g = new SpatialGrid(4, 4);
    generateTerrain(g, { seed: 3 });
    const snap = gridToSnapshot(g);
    for (const [name, code] of Object.entries(snap.legend)) {
      expect(TILE_NAMES[code as keyof typeof TILE_NAMES]).toBe(name);
    }
    // every matrix cell is a code that appears in the legend
    for (const row of snap.tiles) {
      for (const cell of row) {
        expect(Object.values(snap.legend)).toContain(cell);
      }
    }
  });

  it('tick defaults to 0', () => {
    const g = new SpatialGrid(2, 2);
    expect(gridToSnapshot(g).tick).toBe(0);
  });

  it('reflects current grid state', () => {
    const g = new SpatialGrid(3, 3);
    g.set(1, 1, TILE_TYPES.STONE);
    const snap = gridToSnapshot(g);
    expect(snap.tiles[1][1]).toBe(TILE_TYPES.STONE);
  });
});
