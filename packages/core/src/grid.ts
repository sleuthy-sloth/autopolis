/**
 * SpatialGrid — the heart of the simulation.
 *
 * Storage: flat typed arrays (Uint8Array tile codes + Float32Array elevations),
 * indexed `y * width + x`. This keeps cache-friendly O(1) access for the tick
 * loop and trivial serialization for agent snapshots (Phase 3).
 *
 * The class is pure data + queries — no I/O, no randomness of its own, so every
 * grid instance with the same contents is byte-identical (see `equals`).
 */
import { TILE_TYPES, TileType } from './tiles';

export interface SerializedGrid {
  width: number;
  height: number;
  seed: number;
  types: number[];
  elevations: number[];
}

export class SpatialGrid {
  readonly width: number;
  readonly height: number;
  readonly types: Uint8Array;
  readonly elevations: Float32Array;
  seed = 0;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`SpatialGrid: invalid dimensions ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.types = new Uint8Array(width * height).fill(TILE_TYPES.GRASS);
    this.elevations = new Float32Array(width * height);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Out-of-bounds reads return WATER — defensive default for future pathfinding/agents. */
  get(x: number, y: number): TileType {
    if (!this.inBounds(x, y)) return TILE_TYPES.WATER;
    return this.types[this.index(x, y)] as TileType;
  }

  set(x: number, y: number, type: TileType): void {
    if (this.inBounds(x, y)) this.types[this.index(x, y)] = type;
  }

  getElevation(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.elevations[this.index(x, y)];
  }

  setElevation(x: number, y: number, elevation: number): void {
    if (this.inBounds(x, y)) this.elevations[this.index(x, y)] = elevation;
  }

  /** Moore neighborhood within `radius` (Chebyshev distance), excluding self. */
  neighbors(
    x: number,
    y: number,
    radius = 1,
  ): Array<{ x: number; y: number; type: TileType }> {
    const out: Array<{ x: number; y: number; type: TileType }> = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny)) out.push({ x: nx, y: ny, type: this.get(nx, ny) });
      }
    }
    return out;
  }

  forEach(cb: (x: number, y: number, type: TileType, elevation: number) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        cb(x, y, this.get(x, y), this.getElevation(x, y));
      }
    }
  }

  /** rows = y, cols = x — the canonical matrix form for LLM agent snapshots. */
  toMatrix(): number[][] {
    const rows: number[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.width; x++) row.push(this.get(x, y));
      rows.push(row);
    }
    return rows;
  }

  serialize(): SerializedGrid {
    return {
      width: this.width,
      height: this.height,
      seed: this.seed,
      types: Array.from(this.types),
      elevations: Array.from(this.elevations),
    };
  }

  static deserialize(data: SerializedGrid): SpatialGrid {
    const grid = new SpatialGrid(data.width, data.height);
    grid.seed = data.seed;
    grid.types.set(data.types);
    grid.elevations.set(data.elevations);
    return grid;
  }

  clone(): SpatialGrid {
    return SpatialGrid.deserialize(this.serialize());
  }

  /** Byte-level equality of types + elevations (determinism check). */
  equals(other: SpatialGrid): boolean {
    if (this.width !== other.width || this.height !== other.height) return false;
    for (let i = 0; i < this.types.length; i++) {
      if (this.types[i] !== other.types[i] || this.elevations[i] !== other.elevations[i]) {
        return false;
      }
    }
    return true;
  }
}
