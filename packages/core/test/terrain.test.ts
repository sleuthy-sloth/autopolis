import { describe, expect, it } from 'vitest';
import {
  SpatialGrid,
  generateTerrain,
  biomeForSeed,
  TILE_TYPES,
  type Biome,
} from '../src';

function waterFraction(grid: SpatialGrid, edge: 'N' | 'E' | 'S' | 'W'): number {
  let water = 0;
  let total = 0;
  grid.forEach((x, y, type) => {
    const onEdge =
      (edge === 'N' && y === 0) ||
      (edge === 'S' && y === grid.height - 1) ||
      (edge === 'E' && x === grid.width - 1) ||
      (edge === 'W' && x === 0);
    if (onEdge) {
      total++;
      if (type === TILE_TYPES.WATER) water++;
    }
  });
  return total > 0 ? water / total : 0;
}

describe('terrain biomes', () => {
  it('derives a deterministic biome from the seed', () => {
    expect(biomeForSeed(1337)).toBe(biomeForSeed(1337));
    const rolls = new Set(Array.from({ length: 40 }, (_, i) => biomeForSeed(i * 7919 + 3)));
    expect(rolls.size).toBeGreaterThan(1); // variety across seeds
  });

  it('stores the biome on the grid and survives serialization', () => {
    const g = new SpatialGrid(32, 32);
    generateTerrain(g, { seed: 5, biome: 'coastal' });
    expect(g.biome).toBe('coastal');
    const back = SpatialGrid.deserialize(g.serialize());
    expect(back.biome).toBe('coastal');
  });

  it('island: ocean ring surrounds land', () => {
    const g = new SpatialGrid(64, 64);
    generateTerrain(g, { seed: 1337, biome: 'island' });
    expect(g.biome).toBe('island');
    // All four edges are ocean.
    expect(waterFraction(g, 'N')).toBeGreaterThan(0.9);
    expect(waterFraction(g, 'E')).toBeGreaterThan(0.9);
    expect(waterFraction(g, 'S')).toBeGreaterThan(0.9);
    expect(waterFraction(g, 'W')).toBeGreaterThan(0.9);
    // Interior is land.
    let interiorWater = 0;
    let interior = 0;
    g.forEach((x, y, type) => {
      if (x > 10 && y > 10 && x < 53 && y < 53) {
        interior++;
        if (type === TILE_TYPES.WATER) interiorWater++;
      }
    });
    expect(interiorWater / interior).toBeLessThan(0.5);
  });

  it('coastal: ocean on one side only, land opposite', () => {
    const g = new SpatialGrid(64, 64);
    generateTerrain(g, { seed: 1337, biome: 'coastal' });
    expect(g.biome).toBe('coastal');
    const edges = {
      N: waterFraction(g, 'N'),
      E: waterFraction(g, 'E'),
      S: waterFraction(g, 'S'),
      W: waterFraction(g, 'W'),
    };
    const max = Math.max(...Object.values(edges));
    const min = Math.min(...Object.values(edges));
    expect(max).toBeGreaterThan(0.5); // a real sea
    expect(min).toBeLessThan(0.25); // and a real coast opposite
  });

  it('inland: no ocean — water exists only as lakes', () => {
    const g = new SpatialGrid(64, 64);
    generateTerrain(g, { seed: 1337, biome: 'inland' });
    expect(g.biome).toBe('inland');
    // No edge is dominated by water.
    const edges = [waterFraction(g, 'N'), waterFraction(g, 'E'), waterFraction(g, 'S'), waterFraction(g, 'W')];
    for (const f of edges) expect(f).toBeLessThan(0.5);
    // But lakes exist somewhere.
    const water = g.countTypes()[TILE_TYPES.WATER] ?? 0;
    expect(water).toBeGreaterThan(0);
    expect(water / (64 * 64)).toBeLessThan(0.3);
  });

  it('all three biomes exist across seeds', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60 && seen.size < 3; i++) {
      const seed = i * 104729 + 11;
      const g = new SpatialGrid(32, 32);
      generateTerrain(g, { seed });
      seen.add(g.biome);
    }
    expect(seen.size).toBe(3);
  });

  it('biome is part of the determinism contract', () => {
    const a = new SpatialGrid(64, 64);
    const b = new SpatialGrid(64, 64);
    generateTerrain(a, { seed: 1337 });
    generateTerrain(b, { seed: 1337 });
    expect(a.biome).toBe(b.biome);
    expect(a.equals(b)).toBe(true);
  });
});
