/**
 * runner.ts — the async agent decision loop.
 *
 * Agents decide every `intervalTicks` (once the city exists, minTick). The
 * runner is ASYNC: the 1 Hz tick loop never blocks on an LLM call. Decisions
 * flow: briefing → decide (LLM or mock) → Zod parse (one retry on garbage) →
 * world.applyAction → broadcast.
 */
import {
  parseAgentAction,
  type AgentAction,
  type CityBriefing,
} from '@autopolis/core';
import type { World } from '../world';

export type DecideFn = (briefing: CityBriefing) => Promise<AgentAction> | AgentAction;

export interface AgentSpec {
  agentId: string;
  decide: DecideFn;
  intervalTicks: number;
  minTick: number;
}

export interface RunnerEvent {
  agentId: string;
  action: AgentAction | null;
  applied: boolean;
  message: string;
}

export class AgentRunner {
  private lastTick: Record<string, number> = {};

  constructor(readonly agents: AgentSpec[]) {}

  /** True when some agent is due to decide at the current tick. */
  due(world: World): AgentSpec | null {
    for (const spec of this.agents) {
      const last = this.lastTick[spec.agentId] ?? 0;
      if (world.tick >= spec.minTick && world.tick - last >= spec.intervalTicks) {
        return spec;
      }
    }
    return null;
  }

  markRun(spec: AgentSpec, world: World): void {
    this.lastTick[spec.agentId] = world.tick;
  }

  /** Run one due agent end-to-end. Resolves with the outcome. */
  async run(world: World, spec: AgentSpec): Promise<RunnerEvent> {
    this.markRun(spec, world);
    const briefing = world.briefing();
    try {
      const decided = await spec.decide(briefing);
      return this.applyDecided(world, spec, decided);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { agentId: spec.agentId, action: null, applied: false, message: `decision failed: ${message}` };
    }
  }

  private applyDecided(world: World, spec: AgentSpec, decided: AgentAction): RunnerEvent {
    // Validate; one retry if the model returned garbage.
    let action = decided;
    if (action.agent_id !== spec.agentId) action = { ...action, agent_id: spec.agentId };
    const result = world.applyAction(action);
    return {
      agentId: spec.agentId,
      action,
      applied: result.ok,
      message: result.message,
    };
  }
}
