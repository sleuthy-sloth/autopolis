import { describe, expect, it } from 'vitest';
import {
  SpatialGrid,
  ResourceGrids,
  computeCityStats,
  RESOURCE_MAX_RANGE,
  RoadGraph,
  TILE_TYPES,
} from '../src';

function flatLand(w: number, h: number): SpatialGrid {
  const g = new SpatialGrid(w, h);
  return g;
}

describe('ResourceGrids', () => {
  it('floods power from a plant, attenuating with distance', () => {
    const g = flatLand(30, 30);
    g.set(15, 15, TILE_TYPES.POWER_PLANT);
    const r = new ResourceGrids(g);
    r.recompute(g);
    const idx = (x: number, y: number) => y * 30 + x;
    expect(r.power[idx(15, 15)]).toBe(1); // source
    const near = r.power[idx(15, 17)]; // 2 tiles away
    const far = r.power[idx(15, 28)]; // 13 tiles away
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
    expect(r.power[idx(0, 0)]).toBe(0); // 21+ tiles away — out of range
  });

  it('does not cross water', () => {
    const g = flatLand(20, 20);
    g.set(5, 5, TILE_TYPES.POWER_PLANT);
    for (let y = 0; y < 20; y++) g.set(9, y, TILE_TYPES.WATER); // full-height wall
    const r = new ResourceGrids(g);
    r.recompute(g);
    expect(r.power[9 * 20 + 12]).toBe(0); // far side of the wall
    expect(r.power[9 * 20 + 6]).toBeGreaterThan(0); // near side
  });

  it('separates power and water grids', () => {
    const g = flatLand(20, 20);
    g.set(5, 5, TILE_TYPES.POWER_PLANT);
    g.set(15, 15, TILE_TYPES.WATER_TOWER);
    const r = new ResourceGrids(g);
    r.recompute(g);
    expect(r.power[5 * 20 + 5]).toBe(1);
    expect(r.water[5 * 20 + 5]).toBe(0);
    expect(r.water[15 * 20 + 15]).toBe(1);
    expect(r.power[15 * 20 + 15]).toBe(0);
  });

  it('respects the max range exactly', () => {
    const g = flatLand(60, 60);
    g.set(30, 30, TILE_TYPES.WATER_TOWER);
    const r = new ResourceGrids(g);
    r.recompute(g);
    expect(r.water[30 * 60 + 30 + RESOURCE_MAX_RANGE]).toBe(0); // exactly at range → excluded
    expect(r.water[30 * 60 + 30 + RESOURCE_MAX_RANGE - 1]).toBeGreaterThan(0);
  });
});

describe('computeCityStats', () => {
  it('counts zones and estimates population', () => {
    const g = flatLand(20, 20);
    for (let x = 2; x <= 4; x++) g.set(x, 2, TILE_TYPES.RESIDENTIAL); // 3 R
    g.set(6, 2, TILE_TYPES.COMMERCIAL); // 1 C
    g.set(8, 2, TILE_TYPES.INDUSTRIAL); // 1 I
    g.set(7, 2, TILE_TYPES.POWER_PLANT);
    const resources = new ResourceGrids(g);
    resources.recompute(g);
    const stats = computeCityStats(g, resources, RoadGraph.fromGrid(g));
    expect(stats.zones.residential).toBe(3);
    expect(stats.zones.commercial).toBe(1);
    expect(stats.zones.industrial).toBe(1);
    expect(stats.population).toBe(12);
    expect(stats.infrastructure.powerPlants).toBe(1);
  });

  it('computes coverage from actual resource flood', () => {
    const g = flatLand(20, 20);
    // 2 R tiles: one right next to the plant, one far beyond range.
    g.set(5, 5, TILE_TYPES.POWER_PLANT);
    g.set(6, 5, TILE_TYPES.RESIDENTIAL);
    g.set(18, 18, TILE_TYPES.RESIDENTIAL);
    const resources = new ResourceGrids(g);
    resources.recompute(g);
    const stats = computeCityStats(g, resources, RoadGraph.fromGrid(g));
    expect(stats.powerCoverage).toBeCloseTo(0.5, 5);
    expect(stats.waterCoverage).toBe(0); // no water tower
  });

  it('roadComponents reflects the road network', () => {
    const g = flatLand(20, 20);
    for (let x = 2; x <= 5; x++) g.set(x, 2, TILE_TYPES.ROAD);
    for (let x = 12; x <= 15; x++) g.set(x, 12, TILE_TYPES.ROAD); // island
    const resources = new ResourceGrids(g);
    resources.recompute(g);
    const stats = computeCityStats(g, resources, RoadGraph.fromGrid(g));
    expect(stats.infrastructure.roadTiles).toBe(8);
    expect(stats.roadComponents).toBe(2);
  });
});
