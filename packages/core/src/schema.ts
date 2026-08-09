/**
 * schema.ts — the agent action contract (Phase 3).
 *
 * Every agent decision MUST validate against AgentActionSchema: strict JSON,
 * no markdown wrapping, no free-form chatter. The mission contract:
 *
 *   { agent_id, action, coordinates: {from, to}, metadata, reasoning }
 *
 * Bounds checking happens at execution time (the executor knows the grid);
 * this schema enforces structure and types only.
 */
import { z } from 'zod';

export const ACTION_TYPES = [
  'EXTEND_ROAD',
  'SET_ZONING',
  'BUILD_STRUCTURE',
  'UPGRADE_INFRASTRUCTURE',
  'ADJUST_TAX_RATE',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ZONE_TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL'] as const;
export const STRUCTURE_TYPES = ['POWER_PLANT', 'WATER_TOWER'] as const;

export const AgentActionSchema = z.object({
  agent_id: z.string().min(1).max(64),
  action: z.enum(ACTION_TYPES),
  coordinates: z.object({
    from: z.tuple([z.number().int(), z.number().int()]),
    to: z.tuple([z.number().int(), z.number().int()]),
  }),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  reasoning: z.string().max(400).default(''),
});

export type AgentAction = z.infer<typeof AgentActionSchema>;

export type ParseResult =
  | { ok: true; action: AgentAction }
  | { ok: false; errors: string[] };

/**
 * Parse + validate raw model output. Defensively strips markdown code fences
 * and extracts the first JSON object if the model wrapped it anyway.
 */
export function parseAgentAction(raw: string): ParseResult {
  let text = raw.trim();
  // Strip ```json ... ``` fences.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  // Fall back to the first {...} block if there's prose around it.
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['output is not valid JSON'] };
  }
  const result = AgentActionSchema.safeParse(parsed);
  if (result.success) return { ok: true, action: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

/** Deterministic action generator for the mock agent and tests. */
export function makeAction(partial: Partial<AgentAction> & { action: ActionType }): AgentAction {
  return {
    agent_id: 'mock',
    coordinates: { from: [0, 0], to: [0, 0] },
    metadata: {},
    reasoning: '',
    ...partial,
  };
}
