import { describe, expect, it } from 'vitest';
import { SpatialGrid, TILE_TYPES, makeAction } from '@autopolis/core';
import { ActionExecutor } from '../src/agents/executor';

function emptyGrid(): SpatialGrid {
  return new SpatialGrid(20, 20);
}

describe('ActionExecutor', () => {
  it('paves a Manhattan road corridor and charges per tile', () => {
    const g = emptyGrid();
    const ex = new ActionExecutor(g);
    const r = ex.execute(
      makeAction({
        agent_id: 'p',
        action: 'EXTEND_ROAD',
        coordinates: { from: [5, 5], to: [9, 7] },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(70); // 5 horizontal + 2 vertical tiles × 10
    expect(g.get(5, 5)).toBe(TILE_TYPES.ROAD);
    expect(g.get(9, 7)).toBe(TILE_TYPES.ROAD);
    expect(g.get(9, 6)).toBe(TILE_TYPES.ROAD); // vertical leg
  });

  it('rejects out-of-bounds roads', () => {
    const ex = new ActionExecutor(emptyGrid());
    const r = ex.execute(
      makeAction({
        agent_id: 'p',
        action: 'EXTEND_ROAD',
        coordinates: { from: [5, 5], to: [99, 7] },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('zones only developable tiles', () => {
    const g = emptyGrid();
    g.set(6, 6, TILE_TYPES.WATER);
    g.set(7, 6, TILE_TYPES.FOREST);
    const ex = new ActionExecutor(g);
    const r = ex.execute(
      makeAction({
        agent_id: 'p',
        action: 'SET_ZONING',
        coordinates: { from: [5, 5], to: [8, 8] },
        metadata: { zone: 'RESIDENTIAL' },
      }),
    );
    expect(r.ok).toBe(true);
    expect(g.get(5, 5)).toBe(TILE_TYPES.RESIDENTIAL);
    expect(g.get(7, 6)).toBe(TILE_TYPES.RESIDENTIAL); // forest cleared
    expect(g.get(6, 6)).toBe(TILE_TYPES.WATER); // water untouched
    expect(r.cost).toBe(75); // 15 zoned tiles × 5 (16 in region − 1 water)
  });

  it('rejects unknown zones', () => {
    const ex = new ActionExecutor(emptyGrid());
    const r = ex.execute(
      makeAction({
        agent_id: 'p',
        action: 'SET_ZONING',
        coordinates: { from: [0, 0], to: [1, 1] },
        metadata: { zone: 'CASINO' },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('builds structures on land but not water or roads', () => {
    const g = emptyGrid();
    g.set(3, 3, TILE_TYPES.WATER);
    const ex = new ActionExecutor(g);
    const ok = ex.execute(
      makeAction({
        agent_id: 'p',
        action: 'BUILD_STRUCTURE',
        coordinates: { from: [5, 5], to: [0, 0] },
        metadata: { structure: 'POWER_PLANT' },
      }),
    );
    expect(ok.ok).toBe(true);
    expect(g.get(5, 5)).toBe(TILE_TYPES.POWER_PLANT);
    const bad = ex.execute(
      makeAction({
        agent_id: 'p',
        action: 'BUILD_STRUCTURE',
        coordinates: { from: [3, 3], to: [0, 0] },
        metadata: { structure: 'WATER_TOWER' },
      }),
    );
    expect(bad.ok).toBe(false);
  });

  it('validates tax rate bounds', () => {
    const ex = new ActionExecutor(emptyGrid());
    expect(
      ex.execute(
        makeAction({
          agent_id: 'p',
          action: 'ADJUST_TAX_RATE',
          coordinates: { from: [0, 0], to: [0, 0] },
          metadata: { tax_rate: 12 },
        }),
      ).ok,
    ).toBe(true);
    expect(
      ex.execute(
        makeAction({
          agent_id: 'p',
          action: 'ADJUST_TAX_RATE',
          coordinates: { from: [0, 0], to: [0, 0] },
          metadata: { tax_rate: 99 },
        }),
      ).ok,
    ).toBe(false);
  });
});
