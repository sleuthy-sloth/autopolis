/**
 * executor.ts — applies Zod-validated agent actions to the grid.
 *
 * Placement rules are shared with CityDevelopment (isDevelopableType /
 * isPavableType / core-flatten semantics), so agent-built roads and zones obey
 * the same laws as the deterministic city.
 */
import {
  SpatialGrid,
  TILE_TYPES,
  isDevelopableType,
  isPavableType,
  ZONE_TYPES,
  STRUCTURE_TYPES,
  type AgentAction,
  type TileType,
} from '@autopolis/core';

export interface ExecutionResult {
  ok: boolean;
  message: string;
  cost: number;
  changed: boolean;
}

export const ACTION_COSTS: Record<string, number> = {
  EXTEND_ROAD: 10, // per tile
  SET_ZONING: 5, // per tile
  BUILD_STRUCTURE: 200,
  UPGRADE_INFRASTRUCTURE: 300,
  ADJUST_TAX_RATE: 0,
};

const ZONE_MAP: Record<string, TileType> = {
  RESIDENTIAL: TILE_TYPES.RESIDENTIAL,
  COMMERCIAL: TILE_TYPES.COMMERCIAL,
  INDUSTRIAL: TILE_TYPES.INDUSTRIAL,
};

const STRUCTURE_MAP: Record<string, TileType> = {
  POWER_PLANT: TILE_TYPES.POWER_PLANT,
  WATER_TOWER: TILE_TYPES.WATER_TOWER,
};

export class ActionExecutor {
  constructor(private readonly grid: SpatialGrid) {}

  execute(action: AgentAction): ExecutionResult {
    switch (action.action) {
      case 'EXTEND_ROAD':
        return this.extendRoad(action);
      case 'SET_ZONING':
        return this.setZoning(action);
      case 'BUILD_STRUCTURE':
        return this.buildStructure(action);
      case 'UPGRADE_INFRASTRUCTURE':
        return { ok: true, message: 'infrastructure upgrade queued', cost: ACTION_COSTS.UPGRADE_INFRASTRUCTURE, changed: false };
      case 'ADJUST_TAX_RATE':
        return this.adjustTaxRate(action);
      default:
        return { ok: false, message: `unknown action ${action.action}`, cost: 0, changed: false };
    }
  }

  /** Straight (Manhattan) road corridor from → to. */
  private extendRoad(action: AgentAction): ExecutionResult {
    const [[x1, y1], [x2, y2]] = [action.coordinates.from, action.coordinates.to];
    if (!this.inGrid(x1, y1) || !this.inGrid(x2, y2)) {
      return { ok: false, message: `coordinates out of bounds (${x1},${y1})→(${x2},${y2})`, cost: 0, changed: false };
    }
    let paved = 0;
    const step = (x: number, y: number): void => {
      if (isPavableType(this.grid.get(x, y)) && this.grid.get(x, y) !== TILE_TYPES.ROAD) {
        this.grid.set(x, y, TILE_TYPES.ROAD);
        paved++;
      }
    };
    // Walk x then y (Manhattan corridor).
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) step(x, y1);
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) step(x2, y);
    return {
      ok: true,
      message: `paved ${paved} road tile(s) (${x1},${y1})→(${x2},${y2})`,
      cost: paved * ACTION_COSTS.EXTEND_ROAD,
      changed: paved > 0,
    };
  }

  /** Zone the inclusive region from→to. */
  private setZoning(action: AgentAction): ExecutionResult {
    const zone = String(action.metadata.zone ?? '').toUpperCase();
    if (!ZONE_TYPES.includes(zone as (typeof ZONE_TYPES)[number])) {
      return { ok: false, message: `invalid zone '${zone}' (use ${ZONE_TYPES.join('/')})`, cost: 0, changed: false };
    }
    const type = ZONE_MAP[zone];
    const [[x1, y1], [x2, y2]] = [action.coordinates.from, action.coordinates.to];
    let zoned = 0;
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (!this.inGrid(x, y)) continue;
        if (isDevelopableType(this.grid.get(x, y))) {
          this.grid.set(x, y, type);
          zoned++;
        }
      }
    }
    return {
      ok: true,
      message: `zoned ${zoned} tile(s) as ${zone} (${x1},${y1})→(${x2},${y2})`,
      cost: zoned * ACTION_COSTS.SET_ZONING,
      changed: zoned > 0,
    };
  }

  /** Build a structure at `from` (core-flatten semantics: not water/road/rail). */
  private buildStructure(action: AgentAction): ExecutionResult {
    const structure = String(action.metadata.structure ?? '').toUpperCase();
    if (!STRUCTURE_TYPES.includes(structure as (typeof STRUCTURE_TYPES)[number])) {
      return { ok: false, message: `invalid structure '${structure}'`, cost: 0, changed: false };
    }
    const [x, y] = action.coordinates.from;
    if (!this.inGrid(x, y)) return { ok: false, message: 'out of bounds', cost: 0, changed: false };
    const cur = this.grid.get(x, y);
    if (cur === TILE_TYPES.WATER || cur === TILE_TYPES.ROAD || cur === TILE_TYPES.RAIL) {
      return { ok: false, message: `cannot build on ${cur === TILE_TYPES.WATER ? 'water' : 'transport'} at (${x},${y})`, cost: 0, changed: false };
    }
    this.grid.set(x, y, STRUCTURE_MAP[structure]);
    return {
      ok: true,
      message: `built ${structure.toLowerCase()} at (${x},${y})`,
      cost: ACTION_COSTS.BUILD_STRUCTURE,
      changed: true,
    };
  }

  private adjustTaxRate(action: AgentAction): ExecutionResult {
    const rate = Number(action.metadata.tax_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 30) {
      return { ok: false, message: `invalid tax_rate ${action.metadata.tax_rate} (0-30)`, cost: 0, changed: false };
    }
    return { ok: true, message: `tax rate set to ${rate}%`, cost: 0, changed: true };
  }

  private inGrid(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.grid.width && y < this.grid.height;
  }
}
