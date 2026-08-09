/**
 * prompt.ts — builds the agent's system + user prompts from a CityBriefing.
 */
import {
  ACTION_TYPES,
  ZONE_TYPES,
  STRUCTURE_TYPES,
  briefingLegend,
  BRIEFING_GRID,
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
    '- coordinates ALWAYS contain BOTH from and to, each an [x, y] pair.',
    '  For point actions (BUILD_STRUCTURE, UPGRADE_INFRASTRUCTURE, ADJUST_TAX_RATE) set to = from.',
    '- EXTEND_ROAD: from -> to is the Manhattan road corridor to pave.',
    '- SET_ZONING: metadata.zone = one of the ZONES; from/to define the region to rezone.',
    '- BUILD_STRUCTURE: metadata.structure = one of the STRUCTURES; place at coordinates.from.',
    '- UPGRADE_INFRASTRUCTURE: metadata.target = "power" or "water" (extends coverage range).',
    '- ADJUST_TAX_RATE: metadata.tax_rate = number 0-30 (%).',
    '- Keep reasoning short (one sentence).',
    '',
    'JSON shape:',
    '{"agent_id":"' + agentId + '","action":"EXTEND_ROAD","coordinates":{"from":[30,32],"to":[35,32]},"metadata":{},"reasoning":"..."}',
  ].join('\n');
}

export function userPrompt(b: CityBriefing): string {
  const { stats } = b;
  const block = Math.max(1, Math.ceil(b.width / BRIEFING_GRID));
  const lines = [
    `TICK ${b.tick} | seed ${b.seed} | biome ${b.biome}`,
    `population ${stats.population} | zones R${stats.zones.residential} C${stats.zones.commercial} I${stats.zones.industrial}`,
    `coverage power ${(stats.powerCoverage * 100).toFixed(0)}% water ${(stats.waterCoverage * 100).toFixed(0)}%`,
    `roads ${stats.infrastructure.roadTiles} rails ${stats.infrastructure.railTiles} road-components ${stats.roadComponents}`,
    `treasury ${b.treasury} | tax ${b.taxRate}%`,
    `RECENT: ${b.recentEvents.length ? b.recentEvents.join(' | ') : 'nothing yet'}`,
    '',
    `Grid is ${b.width}x${b.height}; coordinates are FULL-GRID integers 0-${b.width - 1}, 0-${b.height - 1}.`,
    `The city center is approximately (${Math.floor(b.width / 2)}, ${Math.floor(b.height / 2)}).`,
    `8x8 dominance map (legend ${briefingLegend()}) — block (bx,by) covers grid x=bx*${block}..bx*${block}+${block - 1}:`,
    b.map.map((row) => row.join('')).join('\n'),
    '',
    'Choose ONE action. Consider coverage gaps, disconnected roads, and treasury.',
  ].join('\n');
  return lines;
}
