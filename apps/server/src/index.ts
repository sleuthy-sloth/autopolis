/**
 * Autopolis Core Engine — entrypoint.
 *
 * HTTP:  GET /health → JSON engine status + city stats
 * WS:    world:state on connect/grid-change, tick heartbeats at 1 Hz;
 *        accepts { type: 'reset' } from clients
 *
 * Phase 3: agents decide every few ticks. With AUTOPOLIS_LLM_API_KEY set the
 * City Planner reasons via an OpenAI-compatible endpoint (OpenRouter by
 * default — free models like deepseek-chat:free work); without a key the
 * deterministic MockAgent keeps the pipeline alive and testable.
 *
 * Env (loaded from apps/server/.env when present): PORT (8788), SEED (1337),
 *      AUTOPOLIS_LLM_BASE_URL, AUTOPOLIS_LLM_API_KEY, AUTOPOLIS_LLM_MODEL.
 */
import 'dotenv/config';
import http from 'node:http';
import { parseAgentAction, type AgentAction, type CityBriefing } from '@autopolis/core';
import { World } from './world';
import { attachWs } from './ws';
import { AgentRunner, type DecideFn } from './agents/runner';
import { MockAgent } from './agents/mock';
import { completeJson, llmConfigFromEnv, type LlmConfig } from './agents/llm';
import { systemPrompt, userPrompt } from './agents/prompt';

const PORT = Number(process.env.PORT ?? 8788);
const SEED = Number(process.env.SEED ?? 1337);

const world = new World(SEED);

/** Real-LLM decide: chat → Zod-validate (one retry on garbage). */
function makeLlmDecide(cfg: LlmConfig, agentId: string): DecideFn {
  return async (briefing: CityBriefing): Promise<AgentAction> => {
    let lastErrors = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await completeJson(cfg, systemPrompt(agentId), userPrompt(briefing));
      const parsed = parseAgentAction(raw);
      if (parsed.ok) return parsed.action;
      lastErrors = parsed.errors.join('; ');
    }
    throw new Error(`agent returned invalid JSON (${lastErrors})`);
  };
}

const llm = llmConfigFromEnv();
const mock = new MockAgent('city_planner_01');
const runner = new AgentRunner([
  {
    agentId: 'city_planner_01',
    intervalTicks: 15,
    minTick: 120,
    decide: llm.apiKey ? makeLlmDecide(llm, 'city_planner_01') : (b) => mock.decide(b),
  },
]);
console.log(
  `[autopolis] agent pipeline: ${llm.apiKey ? `LLM (${llm.model}) via ${llm.baseUrl}` : 'MOCK (set AUTOPOLIS_LLM_API_KEY for a real model — OpenRouter free works)'}`,
);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(world.health()));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

const broadcast = attachWs(server, {
  onConnect: () => world.stateMessage(),
  onReset: () => {
    world.reset();
    broadcast(world.stateMessage());
  },
  onGodAction: (action) => {
    const godAction = { ...action, agent_id: 'god' };
    world.applyAction(godAction);
    broadcast(world.stateMessage());
  },
  onCommand: (command, amount, value) => {
    if (command === 'grant' && typeof amount === 'number' && amount > 0) {
      world.treasury += amount;
      world.logEvent(`🏛 God: treasury boosted by ${Math.round(amount).toLocaleString()}¤`);
      broadcast(world.stateMessage());
    } else if (command === 'weather' && value) {
      if (world.setWeather(String(value))) broadcast(world.stateMessage());
    } else if (command === 'disaster' && value) {
      if (world.disaster(String(value))) broadcast(world.stateMessage());
    }
  },
});

setInterval(() => {
  const changed = world.step();
  if (changed) broadcast(world.stateMessage());
  else broadcast({ type: 'tick', tick: world.tick });

  // Async agent turn — never blocks the 1 Hz loop.
  const due = runner.due(world);
  if (due) {
    runner.run(world, due).then((outcome) => {
      // Broadcast after every decision so the newsfeed stays fresh — even
      // failures are news (the event log changed even if the grid didn't).
      broadcast(world.stateMessage());
    });
  }
}, 1000);

server.listen(PORT, () => {
  console.log(
    `[autopolis] core engine on :${PORT} — tick 1 Hz, seed ${world.seed}, grid ${world.grid.width}x${world.grid.height}`,
  );
});
