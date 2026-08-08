import { describe, expect, it } from 'vitest';
import { SpatialGrid, CityDevelopment, RoadGraph, generateTerrain, TILE_TYPES } from '../src';

function runWorld(seed: number, ticks: number): SpatialGrid {
  const g = new SpatialGrid(64, 64);
  generateTerrain(g, { seed });
  const dev = new CityDevelopment(seed);
  for (let t = 1; t <= ticks; t++) dev.step(g, t);
  return g;
}

describe('CityDevelopment', () => {
  it('is deterministic: same seed + tick sequence → identical city', () => {
    const a = runWorld(1337, 15);
    const b = runWorld(1337, 15);
    expect(a.equals(b)).toBe(true);
  });

  it('different seeds diverge', () => {
    const a = runWorld(1337, 15);
    const b = runWorld(4242, 15);
    expect(a.equals(b)).toBe(false);
  });

  it('lays a connected ring road + avenues by tick 1', () => {
    const g = runWorld(1337, 1);
    const graph = RoadGraph.fromGrid(g);
    expect(graph.nodeCount()).toBeGreaterThan(100); // ring + 4 avenues
    expect(graph.componentCount()).toBe(1); // everything connected
    // Ring road exists at radius 8 around the center.
    expect(g.get(32 + 8, 32)).toBe(TILE_TYPES.ROAD);
    expect(g.get(32, 32 + 8)).toBe(TILE_TYPES.ROAD);
  });

  it('never paves water', () => {
    for (const seed of [1, 1337, 777]) {
      const g = runWorld(seed, 15);
      g.forEach((x, y, type) => {
        if (type === TILE_TYPES.ROAD) {
          expect(g.getElevation(x, y)).toBeGreaterThan(0); // water tiles have elevation 0
        }
      });
      // Direct check: no ROAD tile sits on a tile that was water.
      const raw = new SpatialGrid(64, 64);
      generateTerrain(raw, { seed });
      g.forEach((x, y, type) => {
        if (type === TILE_TYPES.ROAD && raw.get(x, y) === TILE_TYPES.WATER) {
          throw new Error(`road on water at ${x},${y}`);
        }
      });
    }
  });

  it('zones the city by tick 2 (R/C/I + infrastructure)', () => {
    const g = runWorld(1337, 2);
    const counts = g.countTypes();
    expect(counts[TILE_TYPES.RESIDENTIAL] ?? 0).toBeGreaterThan(100);
    expect(counts[TILE_TYPES.COMMERCIAL] ?? 0).toBeGreaterThan(0);
    expect(counts[TILE_TYPES.INDUSTRIAL] ?? 0).toBeGreaterThan(0);
    expect(counts[TILE_TYPES.POWER_PLANT] ?? 0).toBeGreaterThan(0);
    expect(counts[TILE_TYPES.WATER_TOWER] ?? 0).toBeGreaterThan(0);
  });

  it('expands with an outer ring by tick 5', () => {
    const g = runWorld(1337, 5);
    expect(g.get(32 + 14, 32)).toBe(TILE_TYPES.ROAD);
    const graph = RoadGraph.fromGrid(g);
    expect(graph.componentCount()).toBe(1); // beltway stays connected
  });

  it('reports changes exactly on development ticks', () => {
    const g = runWorld(1337, 0); // terrain only
    const dev = new CityDevelopment(1337);
    const devTicks = new Set([1, 2, 5, 6, 8, 9, 10]);
    for (let t = 1; t <= 14; t++) {
      const changed = dev.step(g, t);
      expect(changed).toBe(devTicks.has(t));
    }
  });

  it('stops changing the grid after the development schedule is exhausted', () => {
    const g = runWorld(1337, 12);
    const dev = new CityDevelopment(1337);
    const before = g.serialize();
    let changed = false;
    for (let t = 13; t <= 60; t++) {
      changed = dev.step(g, t) || changed;
    }
    expect(changed).toBe(false);
    expect(g.serialize()).toEqual(before);
  });
});
