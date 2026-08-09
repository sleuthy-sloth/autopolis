/**
 * events.ts — the city's newsroom.
 *
 * Derives narrative events from simulation state transitions: population
 * milestones, infrastructure coming online, coverage breakthroughs, rail
 * launch, treasury thresholds, network connectivity. Pure and deterministic —
 * same state history ⇒ same headlines.
 */
import type { CityStats } from '@autopolis/core';

export interface EventState {
  population: number;
  powerPlants: number;
  waterTowers: number;
  powerCoverage: number;
  waterCoverage: number;
  roadComponents: number;
  railTiles: number;
  treasury: number;
}

export function stateOf(stats: CityStats, railTiles: number, treasury: number): EventState {
  return {
    population: stats.population,
    powerPlants: stats.infrastructure.powerPlants,
    waterTowers: stats.infrastructure.waterTowers,
    powerCoverage: stats.powerCoverage,
    waterCoverage: stats.waterCoverage,
    roadComponents: stats.roadComponents,
    railTiles,
    treasury,
  };
}

const POP_MILESTONES = [100, 250, 500, 1000, 2500, 5000];
const POP_LINES = [
  'the streets begin to fill',
  'a real town is taking shape',
  'the city hums with life',
  'neighborhoods stretch to the horizon',
  'Autopolis is a major metropolis',
  'an empire of concrete and glass',
];
const TREASURY_MILESTONES = [2000, 5000, 10000];
const COVERAGE_STEPS = [0.5, 0.75];

/** Headlines generated from prev → next state. Empty when nothing notable. */
export function generateCityEvents(prev: EventState, next: EventState): string[] {
  const out: string[] = [];
  if (prev.population < next.population) {
    for (let i = 0; i < POP_MILESTONES.length; i++) {
      if (prev.population < POP_MILESTONES[i] && next.population >= POP_MILESTONES[i]) {
        out.push(`🏠 Population passes ${POP_MILESTONES[i].toLocaleString()} — ${POP_LINES[i]}.`);
      }
    }
  }
  if (prev.powerPlants < next.powerPlants) out.push('⚡ A new power plant comes online.');
  if (prev.waterTowers < next.waterTowers) out.push('💧 A new water tower is commissioned.');
  for (const step of COVERAGE_STEPS) {
    if (prev.powerCoverage < step && next.powerCoverage >= step) {
      out.push(`⚡ The power grid now reaches ${Math.round(step * 100)}% of the city.`);
    }
    if (prev.waterCoverage < step && next.waterCoverage >= step) {
      out.push(`💧 Water service now covers ${Math.round(step * 100)}% of the city.`);
    }
  }
  if (prev.roadComponents > 1 && next.roadComponents === 1) {
    out.push('🛣 The road network is fully connected.');
  }
  if (prev.railTiles === 0 && next.railTiles > 0) {
    out.push('🚆 Commuter rail service launches!');
  }
  for (const t of TREASURY_MILESTONES) {
    if (prev.treasury < t && next.treasury >= t) {
      out.push(`🏦 Treasury passes ${t.toLocaleString()}¤.`);
    }
  }
  return out;
}

const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** Compass name for a grid coordinate relative to the city center. */
export function districtName(x: number, y: number, width: number, height: number): string {
  const cx = width / 2;
  const cy = height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= 3.5) return 'downtown';
  // Screen coords: y grows downward, so north = negative dy.
  const angle = Math.atan2(dx, -dy); // 0 = north, clockwise
  const idx = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  return `the ${DIRS[idx]} district`;
}
