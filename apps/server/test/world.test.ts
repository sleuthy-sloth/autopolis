import { describe, expect, it } from 'vitest';
import { World } from '../src/world';
import { makeAction, TILE_TYPES, BRIEFING_GRID } from '@autopolis/core';
import { generateCityEvents, districtName, type EventState } from '../src/events';

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

  it('god actions flow through the same contract and read as God in the feed', () => {
    const w = worldAt(130);
    w.applyAction(
      makeAction({
        agent_id: 'god',
        action: 'SET_ZONING',
        coordinates: { from: [30, 34], to: [32, 36] },
        metadata: { zone: 'RESIDENTIAL' },
        reasoning: 'god-mode directive',
      }),
    );
    expect(w.grid.get(31, 35)).toBe(TILE_TYPES.RESIDENTIAL);
    expect(w.events[0]).toContain('🏛 God');
  });

  it('logs treasury grants', () => {
    const w = worldAt(10);
    const before = w.treasury;
    w.logEvent('🏛 God: treasury boosted by 1,000¤');
    w.treasury += 1000;
    expect(w.treasury).toBe(before + 1000);
    expect(w.events[0]).toContain('boosted');
  });

  it('sets weather with newsroom flavor', () => {
    const w = worldAt(10);
    expect(w.setWeather('storm')).toBe(true);
    expect(w.weather).toBe('storm');
    expect(w.events[0]).toContain('⛈');
    expect(w.setWeather('blizzard')).toBe(false);
    expect(w.weather).toBe('storm');
  });

  it('disasters destroy buildings, cost treasury, and hit the news', () => {
    const w = worldAt(200); // city with zones
    const before = w.treasury;
    const destroyedBefore = w.grid.types.filter(
      (t) => t === TILE_TYPES.RESIDENTIAL || t === TILE_TYPES.COMMERCIAL || t === TILE_TYPES.INDUSTRIAL,
    ).length;
    expect(w.disaster('fire')).toBe(true);
    const destroyedAfter = w.grid.types.filter(
      (t) => t === TILE_TYPES.RESIDENTIAL || t === TILE_TYPES.COMMERCIAL || t === TILE_TYPES.INDUSTRIAL,
    ).length;
    expect(destroyedAfter).toBeLessThan(destroyedBefore);
    expect(w.treasury).toBeLessThan(before);
    expect(w.events[0]).toContain('🔥');
    expect(w.disaster('tornado')).toBe(false);
  });

  it('records telemetry history across ticks', () => {
    const w = new World(1337);
    for (let i = 0; i < 50; i++) w.step();
    expect(w.history.length).toBe(50);
    expect(w.history[49].tick).toBe(50);
    expect(typeof w.history[10].population).toBe('number');
  });
});

describe('city events', () => {
  const base: EventState = {
    population: 90,
    powerPlants: 1,
    waterTowers: 1,
    powerCoverage: 0.3,
    waterCoverage: 0.3,
    roadComponents: 2,
    railTiles: 0,
    treasury: 500,
  };

  it('announces population milestones', () => {
    const events = generateCityEvents(base, { ...base, population: 120 });
    expect(events.some((e) => e.includes('Population passes 100'))).toBe(true);
  });

  it('announces new infrastructure and rail launch', () => {
    const events = generateCityEvents(base, { ...base, powerPlants: 2, railTiles: 12 });
    expect(events.some((e) => e.includes('new power plant'))).toBe(true);
    expect(events.some((e) => e.includes('Commuter rail'))).toBe(true);
  });

  it('announces coverage and connectivity breakthroughs', () => {
    const events = generateCityEvents(base, {
      ...base,
      powerCoverage: 0.6,
      waterCoverage: 0.55,
      roadComponents: 1,
    });
    expect(events.some((e) => e.includes('50%'))).toBe(true);
    expect(events.some((e) => e.includes('fully connected'))).toBe(true);
  });

  it('announces treasury thresholds', () => {
    const events = generateCityEvents(base, { ...base, treasury: 2500 });
    expect(events.some((e) => e.includes('2,000'))).toBe(true);
  });

  it('is quiet when nothing notable changes', () => {
    expect(generateCityEvents(base, { ...base, population: 91 })).toHaveLength(0);
  });

  it('names districts by compass from center', () => {
    expect(districtName(32, 32, 64, 64)).toBe('downtown');
    expect(districtName(60, 32, 64, 64)).toBe('the east district');
    expect(districtName(32, 60, 64, 64)).toBe('the south district');
    expect(districtName(2, 2, 64, 64)).toBe('the northwest district');
  });
});
