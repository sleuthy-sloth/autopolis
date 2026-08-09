/**
 * World — server-authoritative simulation state.
 *
 * Phase 2/2.5: deterministic city development on a slow schedule.
 * Phase 3: agents (LLM or mock) issue Zod-validated actions via applyAction,
 * which the executor applies to the grid. Treasury, tax rate, and a rolling
 * event log (the newsfeed) live here.
 */
import {
  SpatialGrid,
  generateTerrain,
  CityDevelopment,
  RoadGraph,
  ResourceGrids,
  computeCityStats,
  TILE_TYPES,
  buildBriefing,
  type AgentAction,
  type CityBriefing,
  type CityStats,
} from '@autopolis/core';
import { ActionExecutor, type ExecutionResult } from './agents/executor';
import { generateCityEvents, stateOf, districtName, type EventState } from './events';
import { mulberry32 } from '@autopolis/core';

const STARTING_TREASURY = 1000;
const EVENT_LOG_CAP = 20;
const HISTORY_CAP = 360; // ~6 minutes at 1 Hz

export type Weather = 'clear' | 'rain' | 'storm';

export interface HistoryPoint {
  tick: number;
  population: number;
  treasury: number;
  taxRate: number;
  powerCoverage: number;
  waterCoverage: number;
  roadTiles: number;
  railTiles: number;
}

export class World {
  readonly grid: SpatialGrid;
  seed: number;
  tick = 0;
  stats: CityStats;
  treasury = STARTING_TREASURY;
  taxRate = 9;
  events: string[] = [];
  weather: Weather = 'clear';
  history: HistoryPoint[] = [];
  private dev: CityDevelopment;
  private roadGraph: RoadGraph;
  private resources: ResourceGrids;
  private eventState: EventState | null = null;

  constructor(seed: number, width = 64, height = 64) {
    this.seed = seed;
    this.grid = new SpatialGrid(width, height);
    generateTerrain(this.grid, { seed });
    this.dev = new CityDevelopment(seed);
    this.resources = new ResourceGrids(this.grid, { powerRange: 14, waterRange: 14 });
    this.roadGraph = RoadGraph.fromGrid(this.grid);
    this.stats = computeCityStats(this.grid, this.resources, this.roadGraph);
  }

  /**
   * Advance one tick. Returns true if the world state changed (grid mutated) —
   * callers broadcast a full state message only then.
   */
  step(): boolean {
    this.tick++;
    const changed = this.dev.step(this.grid, this.tick);
    if (changed) this.refresh();
    // Tax income: population × rate, tick by tick.
    this.treasury += Math.floor((this.stats.population * this.taxRate) / 200);
    this.observe();
    this.history.push({
      tick: this.tick,
      population: this.stats.population,
      treasury: this.treasury,
      taxRate: this.taxRate,
      powerCoverage: this.stats.powerCoverage,
      waterCoverage: this.stats.waterCoverage,
      roadTiles: this.stats.infrastructure.roadTiles,
      railTiles: this.stats.infrastructure.railTiles,
    });
    if (this.history.length > HISTORY_CAP) this.history.shift();
    return changed;
  }

  /** Reseed the world (god-mode "New Seed"). Deterministic from the new seed onward. */
  reset(): void {
    this.seed = Math.floor(Math.random() * 1_000_000_000);
    this.tick = 0;
    this.grid.fill(TILE_TYPES.GRASS);
    this.grid.elevations.fill(0);
    generateTerrain(this.grid, { seed: this.seed });
    this.dev = new CityDevelopment(this.seed);
    this.treasury = STARTING_TREASURY;
    this.taxRate = 9;
    this.events = [];
    this.weather = 'clear';
    this.history = [];
    this.eventState = null;
    this.refresh();
  }

  /**
   * Validate + apply an agent action. Returns the execution result; on success
   * the treasury is debited, the event log updated, and derived state refreshed
   * if the grid changed. Failures are recorded too (agents should see them).
   */
  applyAction(action: AgentAction): ExecutionResult {
    const result = new ActionExecutor(this.grid).execute(action);
    if (result.ok) {
      if (action.action === 'ADJUST_TAX_RATE') {
        this.taxRate = Number(action.metadata.tax_rate);
      } else if (action.action === 'UPGRADE_INFRASTRUCTURE') {
        const target = String(action.metadata.target ?? '').toLowerCase();
        if (target === 'power') {
          this.resources.powerRange = Math.min(30, this.resources.powerRange + 3);
          result.message = `power grid range extended to ${this.resources.powerRange}`;
        } else if (target === 'water') {
          this.resources.waterRange = Math.min(30, this.resources.waterRange + 3);
          result.message = `water network range extended to ${this.resources.waterRange}`;
        } else {
          return { ok: false, message: `invalid upgrade target '${target}'`, cost: 0, changed: false };
        }
        this.resources.recompute(this.grid);
        this.stats = computeCityStats(this.grid, this.resources, this.roadGraph);
      }
      this.treasury -= result.cost;
      if (result.changed) this.refresh();
    }
    const where = this.districtFor(action);
    this.pushEvent(
      `${action.agent_id === 'god' ? '🏛 God' : action.agent_id}: ${result.message}${where}${result.ok && result.cost > 0 ? ` (−${result.cost}¤)` : ''}`,
    );
    this.observe();
    return result;
  }

  /** Public event injection (god-mode commands etc.). */
  logEvent(text: string): void {
    this.pushEvent(text);
  }

  /** Set the global weather; affects viewport rendering + flavor events. */
  setWeather(weather: string): boolean {
    if (weather !== 'clear' && weather !== 'rain' && weather !== 'storm') return false;
    this.weather = weather;
    this.pushEvent(
      weather === 'clear' ? '☀️ The skies clear over Autopolis.' : weather === 'rain' ? '🌧 Rain moves in.' : '⛈ A storm front hits the city!',
    );
    return true;
  }

  /**
   * Natural disaster — deterministic damage from (seed, tick): zones burn in
   * fires, quakes topple buildings, floods claim the waterfront. Treasury takes
   * the hit; the newsroom reports it.
   */
  disaster(kind: string): boolean {
    if (kind !== 'earthquake' && kind !== 'flood' && kind !== 'fire') return false;
    const { width, height } = this.grid;
    const cx = width / 2;
    const cy = height / 2;
    const destroyed = new Set<number>();
    const rng = mulberry32((this.seed ^ this.tick) >>> 0);
    const targets = kind === 'flood' ? this.coastalZoneTiles() : null;
    const budget = kind === 'fire' ? 30 : kind === 'earthquake' ? 24 : 20;

    for (let attempt = 0; attempt < budget * 6 && destroyed.size < budget; attempt++) {
      let x: number;
      let y: number;
      if (targets && targets.length > 0) {
        const t = targets[Math.floor(rng() * targets.length)];
        x = t[0];
        y = t[1];
      } else {
        x = Math.floor(rng() * width);
        y = Math.floor(rng() * height);
      }
      const type = this.grid.get(x, y);
      const isBuilding =
        type === TILE_TYPES.RESIDENTIAL ||
        type === TILE_TYPES.COMMERCIAL ||
        type === TILE_TYPES.INDUSTRIAL ||
        type === TILE_TYPES.POWER_PLANT ||
        type === TILE_TYPES.WATER_TOWER;
      const isRoad = type === TILE_TYPES.ROAD || type === TILE_TYPES.RAIL;
      if (!isBuilding && !(kind === 'earthquake' && isRoad)) continue;
      if (kind === 'fire' && Math.hypot(x - cx, y - cy) < 6) continue; // downtown firebreak
      this.grid.set(x, y, TILE_TYPES.GRASS);
      this.grid.setElevation(x, y, this.grid.getElevation(x, y) * 0.5);
      destroyed.add(y * width + x);
    }

    if (destroyed.size === 0) {
      this.pushEvent(`⚠️ The ${kind} passes with little damage.`);
      return false;
    }
    this.treasury = Math.max(0, this.treasury - destroyed.size * 15);
    const headline =
      kind === 'fire'
        ? `🔥 A fire sweeps the city — ${destroyed.size} structure(s) lost!`
        : kind === 'earthquake'
          ? `🌋 Earthquake! ${destroyed.size} buildings damaged.`
          : `🌊 Flooding claims ${destroyed.size} waterfront lot(s)!`;
    this.pushEvent(headline);
    this.refresh();
    this.observe();
    return true;
  }

  /** Zone tiles adjacent to water (flood targets). */
  private coastalZoneTiles(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    this.grid.forEach((x, y, type) => {
      const isZone =
        type === TILE_TYPES.RESIDENTIAL ||
        type === TILE_TYPES.COMMERCIAL ||
        type === TILE_TYPES.INDUSTRIAL;
      if (
        isZone &&
        (this.grid.get(x + 1, y) === TILE_TYPES.WATER ||
          this.grid.get(x - 1, y) === TILE_TYPES.WATER ||
          this.grid.get(x, y + 1) === TILE_TYPES.WATER ||
          this.grid.get(x, y - 1) === TILE_TYPES.WATER)
      ) {
        out.push([x, y]);
      }
    });
    return out;
  }

  /** Emit news headlines when notable state transitions occur. */
  private observe(): void {
    const next = stateOf(this.stats, this.railTiles(), this.treasury);
    if (this.eventState) {
      for (const headline of generateCityEvents(this.eventState, next)) {
        this.pushEvent(headline);
      }
    }
    this.eventState = next;
  }

  private railTiles(): number {
    return this.stats.infrastructure.railTiles;
  }

  private districtFor(action: AgentAction): string {
    // District context only makes sense for grid-located actions.
    if (action.action !== 'EXTEND_ROAD' && action.action !== 'SET_ZONING' && action.action !== 'BUILD_STRUCTURE') {
      return '';
    }
    const [x, y] = action.coordinates.from;
    if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) return '';
    return ` in ${districtName(x, y, this.grid.width, this.grid.height)}`;
  }

  /** Compressed agent-facing view of the city. */
  briefing(): CityBriefing {
    return buildBriefing(this.grid, this.stats, this.treasury, this.taxRate, this.events, this.tick);
  }

  /** Rebuild derived state (road graph, resource grids, stats) from the grid. */
  private refresh(): void {
    this.roadGraph = RoadGraph.fromGrid(this.grid);
    this.resources.recompute(this.grid);
    this.stats = computeCityStats(this.grid, this.resources, this.roadGraph);
  }

  private pushEvent(text: string): void {
    this.events.unshift(`t${this.tick} ${text}`);
    if (this.events.length > EVENT_LOG_CAP) this.events.length = EVENT_LOG_CAP;
  }

  /** Full client-sync payload — grid + stats + resource coverage + city ledger. */
  stateMessage(): Record<string, unknown> {
    return {
      type: 'world:state',
      tick: this.tick,
      grid: this.grid.serialize(),
      stats: this.stats,
      city: { treasury: this.treasury, taxRate: this.taxRate, weather: this.weather },
      events: this.events.slice(0, 8),
      history: this.history.slice(-HISTORY_CAP),
      resources: {
        power: Array.from(this.resources.power),
        water: Array.from(this.resources.water),
      },
    };
  }

  health(): Record<string, unknown> {
    return {
      ok: true,
      service: 'autopolis-core',
      tick: this.tick,
      grid: { width: this.grid.width, height: this.grid.height, seed: this.seed, biome: this.grid.biome },
      city: { treasury: this.treasury, taxRate: this.taxRate, weather: this.weather },
      stats: {
        population: this.stats.population,
        zones: this.stats.zones,
        powerCoverage: this.stats.powerCoverage,
        waterCoverage: this.stats.waterCoverage,
        roadComponents: this.stats.roadComponents,
      },
    };
  }
}
