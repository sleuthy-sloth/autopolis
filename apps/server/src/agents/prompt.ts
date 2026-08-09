/**
 * prompt.ts — builds the agent's system + user prompts from a CityBriefing.
 */
import {
  ACTION_TYPES,
  ZONE_TYPES,
  STRUCTURE_TYPES,
  briefingLegend,
  type CityBriefing,
} from '@autopolis/core';

export function systemPrompt(agentId: string): string {
  return [
    `You are ${agentId}, the City Planner agent in Autopolis, an emergent city simulation.`,
    'You make ONE decision per turn to grow or improve the city.',
    '',
    'ACTIONS (choose exactly one):',
    ...ACTION_TYPES.map((a) => `  ${a}`),
    '',
    `ZONES: ${ZONE_TYPES.join(', ')}  STRUCTURES: ${STRUCTURE_TYPES.join(', ')}`,
    '',
    'RULES:',
    '- Respond with ONLY a single JSON object. No markdown, no commentary.',
    '- EXTEND_ROAD: coordinates.from -> coordinates.to (Manhattan corridor, tiles will be paved).',
    '- SET_ZONING: metadata.zone = one of the ZONES; coordinates define the region to rezone.',
    '- BUILD_STRUCTURE: metadata.structure = one of the STRUCTURES; place at coordinates.from.',
    '- UPGRADE_INFRASTRUCTURE: metadata.target = "power" or "water" (extends coverage range).',
    '- ADJUST_TAX_RATE: metadata.tax_rate = number 0-30 (%).',
    '- coordinates are [x, y] integers on the map.',
    '- Keep reasoning short (one sentence).',
    '',
    'JSON shape:',
    '{"agent_id":"' + agentId + '","action":"EXTEND_ROAD","coordinates":{"from":[0,0],"to":[0,0]},"metadata":{},"reasoning":"..."}',
  ].join('\n');
}

export function userPrompt(b: CityBriefing): string {
  const { stats } = b;
  const lines = [
    `TICK ${b.tick} | seed ${b.seed} | biome ${b.biome}`,
    `population ${stats.population} | zones R${stats.zones.residential} C${stats.zones.commercial} I${stats.zones.industrial}`,
    `coverage power ${(stats.powerCoverage * 100).toFixed(0)}% water ${(stats.waterCoverage * 100).toFixed(0)}%`,
    `roads ${stats.infrastructure.roadTiles} rails ${stats.infrastructure.railTiles} road-components ${stats.roadComponents}`,
    `treasury ${b.treasury} | tax ${b.taxRate}%`,
    `RECENT: ${b.recentEvents.length ? b.recentEvents.join(' | ') : 'nothing yet'}`,
    '',
    '8x8 dominance map (legend ' + briefingLegend() + '):',
    b.map.map((row) => row.join('')).join('\n'),
    '',
    'Choose ONE action. Consider coverage gaps, disconnected roads, and treasury.',
  ].join('\n');
  return lines;
}
