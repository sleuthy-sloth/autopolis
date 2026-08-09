/**
 * mock.ts — deterministic scripted agent.
 *
 * Emits schema-valid actions (the same contract a real LLM must satisfy) so the
 * whole pipeline is testable with zero models. Decisions are a pure function of
 * (briefing.seed, tick) — same seed, same city plans.
 */
import { makeAction, hash2, type AgentAction, type CityBriefing } from '@autopolis/core';

export class MockAgent {
  constructor(readonly agentId = 'city_planner_01') {}

  /** One schema-valid action per call. */
  decide(briefing: CityBriefing): AgentAction {
    const k = Math.floor(briefing.tick / 15); // decision index
    const seed = briefing.seed;
    const cx = Math.floor(briefing.width / 2);
    const cy = Math.floor(briefing.height / 2);
    const mode = k % 4;

    if (mode === 0) {
      // Extend a road east from the city core.
      const y = cy + (Math.floor(hash2(seed, k, 11) * 3) - 1);
      return makeAction({
        agent_id: this.agentId,
        action: 'EXTEND_ROAD',
        coordinates: { from: [cx, y], to: [cx + 5, y] },
        metadata: {},
        reasoning: 'Extending the arterial network eastward.',
      });
    }
    if (mode === 1) {
      // Zone a residential patch near the core.
      const x = cx + Math.floor(hash2(seed, k, 13) * 3) - 1;
      const y = cy + Math.floor(hash2(seed, k, 17) * 3) - 1;
      return makeAction({
        agent_id: this.agentId,
        action: 'SET_ZONING',
        coordinates: { from: [x, y], to: [x + 2, y + 2] },
        metadata: { zone: 'RESIDENTIAL' },
        reasoning: 'Adding housing near the existing road network.',
      });
    }
    if (mode === 2) {
      // Grow the downtown.
      return makeAction({
        agent_id: this.agentId,
        action: 'SET_ZONING',
        coordinates: { from: [cx - 2, cy - 2], to: [cx + 1, cy + 1] },
        metadata: { zone: 'COMMERCIAL' },
        reasoning: 'Expanding the commercial core.',
      });
    }
    // Adjust the tax rate in small, cautious steps.
    return makeAction({
      agent_id: this.agentId,
      action: 'ADJUST_TAX_RATE',
      coordinates: { from: [0, 0], to: [0, 0] },
      metadata: { tax_rate: 7 + (k % 4) },
      reasoning: 'Steering the budget toward growth.',
    });
  }
}
