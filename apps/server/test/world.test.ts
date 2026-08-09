import { describe, expect, it } from 'vitest';
import { World } from '../src/world';
import { makeAction, TILE_TYPES, BRIEFING_GRID } from '@autopolis/core';

function worldAt(ticks: number): World {
  const w = new World(1337);
  for (let i = 0; i < ticks; i++) w.step();
  return w;
}

describe('World agent integration', () => {
  it('debits treasury and logs events on applied actions', () => {
    const w = worldAt(130); // city exists, treasury accruing
    const before = w.treasury;
    const r = w.applyAction(
      makeAction({
        agent_id: 'city_planner_01',
        action: 'SET_ZONING',
        coordinates: { from: [30, 30], to: [31, 31] },
        metadata: { zone: 'RESIDENTIAL' },
        reasoning: 'test',
      }),
    );
    expect(r.ok).toBe(true);
    expect(w.treasury).toBeLessThan(before);
    expect(w.events.length).toBeGreaterThan(0);
    expect(w.events[0]).toContain('city_planner_01');
  });

  it('records failed actions without charging', () => {
    const w = worldAt(130);
    const before = w.treasury;
    const r = w.applyAction(
      makeAction({
        agent_id: 'city_planner_01',
        action: 'SET_ZONING',
        coordinates: { from: [0, 0], to: [1, 1] },
        metadata: { zone: 'CASINO' },
      }),
    );
    expect(r.ok).toBe(false);
    expect(w.treasury).toBe(before);
    expect(w.events[0]).toContain('invalid zone');
  });

  it('applies tax rate changes', () => {
    const w = worldAt(10);
    w.applyAction(
      makeAction({
        agent_id: 'mayor',
        action: 'ADJUST_TAX_RATE',
        coordinates: { from: [0, 0], to: [0, 0] },
        metadata: { tax_rate: 14 },
      }),
    );
    expect(w.taxRate).toBe(14);
  });

  it('infrastructure upgrades extend power range', () => {
    const w = worldAt(130);
    w.applyAction(
      makeAction({
        agent_id: 'city_planner_01',
        action: 'BUILD_STRUCTURE',
        coordinates: { from: [32, 32], to: [0, 0] },
        metadata: { structure: 'POWER_PLANT' },
      }),
    );
    const before = w.briefing().stats.powerCoverage;
    w.applyAction(
      makeAction({
        agent_id: 'city_planner_01',
        action: 'UPGRADE_INFRASTRUCTURE',
        coordinates: { from: [0, 0], to: [0, 0] },
        metadata: { target: 'power' },
      }),
    );
    expect(w.briefing().stats.powerCoverage).toBeGreaterThanOrEqual(before);
  });

  it('builds a valid briefing with a coarse map', () => {
    const w = worldAt(200);
    const b = w.briefing();
    expect(b.map).toHaveLength(BRIEFING_GRID);
    expect(b.map[0]).toHaveLength(BRIEFING_GRID);
    expect(b.width).toBe(64);
    expect(b.height).toBe(64);
    expect(b.tick).toBe(200);
    expect(b.seed).toBe(1337);
    expect(typeof b.treasury).toBe('number');
  });

  it('accrues tax income as population grows', () => {
    const w = new World(1337);
    const start = w.treasury;
    for (let i = 0; i < 300; i++) w.step();
    expect(w.treasury).toBeGreaterThan(start);
  });

  it('resets the city ledger on reset', () => {
    const w = worldAt(200);
    w.applyAction(
      makeAction({
        agent_id: 'x',
        action: 'ADJUST_TAX_RATE',
        coordinates: { from: [0, 0], to: [0, 0] },
        metadata: { tax_rate: 20 },
      }),
    );
    w.reset();
    expect(w.treasury).toBe(1000);
    expect(w.taxRate).toBe(9);
    expect(w.events).toHaveLength(0);
  });

  it('agent roads join the road graph', () => {
    const w = worldAt(130);
    w.applyAction(
      makeAction({
        agent_id: 'city_planner_01',
        action: 'EXTEND_ROAD',
        coordinates: { from: [32, 24], to: [32, 30] },
      }),
    );
    // 32,24 is on the inner ring; the corridor connects to it.
    expect(w.grid.get(32, 30)).toBe(TILE_TYPES.ROAD);
  });
});
