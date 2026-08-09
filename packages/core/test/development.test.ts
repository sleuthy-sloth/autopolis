import { describe, expect, it } from 'vitest';
import {
  SpatialGrid,
  CityDevelopment,
  RoadGraph,
  findRailPath,
  generateTerrain,
  TILE_TYPES,
  type Biome,
} from '../src';

function runWorld(seed: number, ticks: number, biome?: Biome): SpatialGrid {
  const g = new SpatialGrid(64, 64);
  generateTerrain(g, { seed, biome });
  const dev = new CityDevelopment(seed);
  for (let t = 1; t <= ticks; t++) dev.step(g, t);
  return g;
}

function count(grid: SpatialGrid, type: number): number {
  return grid.countTypes()[type] ?? 0;
}

describe('CityDevelopment — builds from nothing, slowly', () => {
  it('starts with bare terrain: zero development at tick 0', () => {
    const g = runWorld(1337, 0, 'island');
    expect(count(g, TILE_TYPES.ROAD)).toBe(0);
    expect(count(g, TILE_TYPES.RESIDENTIAL)).toBe(0);
    expect(count(g, TILE_TYPES.RAIL)).toBe(0);
  });

  it('lays only a small road stub at tick 1', () => {
    const g = runWorld(1337, 1, 'island');
    const roads = count(g, TILE_TYPES.ROAD);
    expect(roads).toBeGreaterThan(0);
    expect(roads).toBeLessThan(30); // a stub, not a ring
    expect(count(g, TILE_TYPES.RESIDENTIAL)).toBe(0);
  });

  it('grows gradually — transport network (roads + rails) strictly increases', () => {
    const g = new SpatialGrid(64, 64);
    generateTerrain(g, { seed: 1337, biome: 'island' });
    const dev = new CityDevelopment(1337);
    let prev = 0;
    for (let t = 1; t <= 300; t++) {
      dev.step(g, t);
      const transport = count(g, TILE_TYPES.ROAD) + count(g, TILE_TYPES.RAIL);
      expect(transport).toBeGreaterThanOrEqual(prev);
      prev = transport;
    }
    expect(count(g, TILE_TYPES.ROAD)).toBeGreaterThan(150);
  });

  it('zones appear only after the roads have laid groundwork (tick ≥ 40)', () => {
    const before = runWorld(1337, 39, 'island');
    expect(count(before, TILE_TYPES.RESIDENTIAL)).toBe(0);
    const after = runWorld(1337, 60, 'island');
    expect(count(after, TILE_TYPES.RESIDENTIAL)).toBeGreaterThan(0);
  });

  it('zones hug the road network', () => {
    const g = runWorld(1337, 300, 'island');
    let near = 0;
    let total = 0;
    g.forEach((x, y, type) => {
      if (type !== TILE_TYPES.RESIDENTIAL) return;
      total++;
      let hasRoad = false;
      for (let dy = -1; dy <= 1 && !hasRoad; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (g.get(x + dx, y + dy) === TILE_TYPES.ROAD) hasRoad = true;
        }
      }
      if (hasRoad) near++;
    });
    expect(total).toBeGreaterThan(20);
    expect(near / total).toBeGreaterThan(0.9);
  });

  it('lays rails by tick 200 and keeps them once complete', () => {
    const g = runWorld(1337, 200, 'island');
    const at200 = count(g, TILE_TYPES.RAIL);
    expect(at200).toBeGreaterThan(10);
    const g2 = runWorld(1337, 260, 'island');
    expect(count(g2, TILE_TYPES.RAIL)).toBeGreaterThanOrEqual(at200);
    // Rails form one connected line: path from the first to the last rail tile.
    const rails: Array<{ x: number; y: number }> = [];
    g2.forEach((x, y, type) => {
      if (type === TILE_TYPES.RAIL) rails.push({ x, y });
    });
    const a = rails[0];
    const b = rails[rails.length - 1];
    const path = findRailPath(g2, a, b);
    expect(path.found).toBe(true);
    expect(path.path.length).toBeGreaterThan(5);
  });

  it('deploys power + water infrastructure', () => {
    const g = runWorld(1337, 240, 'island');
    expect(count(g, TILE_TYPES.POWER_PLANT)).toBeGreaterThanOrEqual(2);
    expect(count(g, TILE_TYPES.WATER_TOWER)).toBeGreaterThanOrEqual(2);
  });

  it('builds a connected road network by the time rings complete', () => {
    const g = runWorld(1337, 60, 'island');
    const graph = RoadGraph.fromGrid(g);
    expect(graph.nodeCount()).toBeGreaterThan(60);
    expect(graph.componentCount()).toBe(1);
  });

  it('is deterministic: same seed + tick sequence → identical city', () => {
    const a = runWorld(1337, 300, 'island');
    const b = runWorld(1337, 300, 'island');
    expect(a.equals(b)).toBe(true);
  });

  it('different seeds diverge', () => {
    const a = runWorld(1337, 300, 'island');
    const b = runWorld(4242, 300, 'island');
    expect(a.equals(b)).toBe(false);
  });

  it('never paves water, in any biome', () => {
    for (const biome of ['island', 'coastal', 'inland'] as Biome[]) {
      for (const seed of [1, 1337, 777]) {
        const g = runWorld(seed, 300, biome);
        const raw = new SpatialGrid(64, 64);
        generateTerrain(raw, { seed, biome });
        g.forEach((x, y, type) => {
          if (type === TILE_TYPES.ROAD || type === TILE_TYPES.RAIL) {
            expect(raw.get(x, y)).not.toBe(TILE_TYPES.WATER);
          }
        });
      }
    }
  });
});
