import { describe, expect, it } from 'vitest';
import { parseAgentAction, makeAction, AgentActionSchema } from '@autopolis/core';
import { MockAgent } from '../src/agents/mock';
import { AgentRunner } from '../src/agents/runner';
import { World } from '../src/world';

describe('MockAgent', () => {
  it('emits schema-valid actions for many decision indices', () => {
    const mock = new MockAgent();
    for (let tick = 120; tick <= 400; tick += 15) {
      const w = new World(1337);
      for (let i = 0; i < tick; i++) w.step();
      const action = mock.decide(w.briefing());
      expect(AgentActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it('is deterministic for the same briefing', () => {
    const mock = new MockAgent();
    const w = new World(1337);
    for (let i = 0; i < 150; i++) w.step();
    const a = mock.decide(w.briefing());
    const b = mock.decide(w.briefing());
    expect(a).toEqual(b);
  });
});

describe('AgentRunner', () => {
  it('does not fire before minTick or before the interval elapses', () => {
    const mock = new MockAgent();
    const runner = new AgentRunner([
      { agentId: 'city_planner_01', intervalTicks: 15, minTick: 120, decide: (b) => mock.decide(b) },
    ]);
    const early = new World(1337);
    for (let i = 0; i < 119; i++) early.step();
    expect(runner.due(early)).toBeNull();
    const w = new World(1337);
    for (let i = 0; i < 130; i++) w.step();
    expect(runner.due(w)).not.toBeNull();
    runner.markRun(runner.due(w)!, w);
    expect(runner.due(w)).toBeNull(); // just ran
    for (let i = 0; i < 14; i++) w.step();
    expect(runner.due(w)).toBeNull(); // interval not elapsed
    w.step();
    expect(runner.due(w)).not.toBeNull();
  });

  it('applies the decided action to the world and logs it', async () => {
    const mock = new MockAgent();
    const runner = new AgentRunner([
      { agentId: 'city_planner_01', intervalTicks: 15, minTick: 120, decide: (b) => mock.decide(b) },
    ]);
    const w = new World(1337);
    for (let i = 0; i < 135; i++) w.step();
    const spec = runner.due(w)!;
    const outcome = await runner.run(w, spec);
    expect(outcome.applied).toBe(true);
    expect(w.events[0]).toContain('city_planner_01');
  });
});

describe('parseAgentAction', () => {
  it('parses clean JSON', () => {
    const r = parseAgentAction(JSON.stringify(makeAction({ action: 'EXTEND_ROAD' })));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.action).toBe('EXTEND_ROAD');
  });

  it('strips markdown fences', () => {
    const r = parseAgentAction('```json\n' + JSON.stringify(makeAction({ action: 'SET_ZONING' })) + '\n```');
    expect(r.ok).toBe(true);
  });

  it('extracts JSON from prose', () => {
    const wrapped = `Here you go:\n${JSON.stringify(makeAction({ action: 'ADJUST_TAX_RATE' }))}\nHope that helps!`;
    const r = parseAgentAction(wrapped);
    expect(r.ok).toBe(true);
  });

  it('repairs point actions that omitted coordinates.to', () => {
    const r = parseAgentAction(
      '{"agent_id":"p","action":"BUILD_STRUCTURE","coordinates":{"from":[5,5]},"metadata":{"structure":"POWER_PLANT"}}',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.coordinates.to).toEqual([5, 5]);
  });

  it('rejects invalid output with useful errors', () => {
    const bad = parseAgentAction('{"agent_id":"p","action":"FLY_TO_MOON"}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(0);
    const notJson = parseAgentAction('I think we should build more roads.');
    expect(notJson.ok).toBe(false);
  });
});
