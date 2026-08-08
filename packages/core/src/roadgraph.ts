/**
 * RoadGraph — the road network as a graph.
 *
 * Nodes are road tiles; edges connect orthogonally adjacent road tiles
 * (4-connectivity: cars don't cut diagonally across blocks). Built lazily from
 * the grid, so it always mirrors the authoritative SpatialGrid state.
 *
 * Used by vehicle pathfinding and for connectivity statistics.
 */
import { SpatialGrid } from './grid';
import { TILE_TYPES } from './tiles';

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export interface RoadNode {
  x: number;
  y: number;
}

export class RoadGraph {
  /** nodeFlags[i] = 1 if tile i is a road node */
  readonly nodeFlags: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** adjacency index → array of neighbor indices */
  private readonly adj: Map<number, number[]>;

  private constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.nodeFlags = new Uint8Array(width * height);
    this.adj = new Map();
  }

  static fromGrid(grid: SpatialGrid): RoadGraph {
    const g = new RoadGraph(grid.width, grid.height);
    grid.forEach((x, y, type) => {
      if (type === TILE_TYPES.ROAD) {
        const idx = grid.index(x, y);
        g.nodeFlags[idx] = 1;
        g.adj.set(idx, []);
      }
    });
    // Build edges: for each node, orthogonal neighbors that are also roads.
    for (const [idx, neighbors] of g.adj) {
      const x = idx % g.width;
      const y = Math.floor(idx / g.width);
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (g.inBounds(nx, ny) && g.nodeFlags[g.index(nx, ny)]) {
          neighbors.push(g.index(nx, ny));
        }
      }
    }
    return g;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  hasNode(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.nodeFlags[this.index(x, y)] === 1;
  }

  /** Orthogonal road neighbors of a road tile (empty if the tile isn't a road). */
  neighbors(x: number, y: number): RoadNode[] {
    const idx = this.index(x, y);
    const list = this.adj.get(idx);
    if (!list) return [];
    return list.map((i) => ({ x: i % this.width, y: Math.floor(i / this.width) }));
  }

  nodeCount(): number {
    return this.adj.size;
  }

  /**
   * Number of connected components (BFS over the node flags).
   * A well-formed city should have exactly 1 road component.
   */
  componentCount(): number {
    const seen = new Uint8Array(this.nodeFlags.length);
    let components = 0;
    for (let i = 0; i < this.nodeFlags.length; i++) {
      if (this.nodeFlags[i] && !seen[i]) {
        components++;
        // BFS
        const queue = [i];
        seen[i] = 1;
        for (let head = 0; head < queue.length; head++) {
          const cur = queue[head];
          const x = cur % this.width;
          const y = Math.floor(cur / this.width);
          for (const nb of this.adj.get(cur) ?? []) {
            if (!seen[nb]) {
              seen[nb] = 1;
              queue.push(nb);
            }
          }
        }
      }
    }
    return components;
  }

  /** True if both points are on the road network and connected by roads. */
  isConnected(ax: number, ay: number, bx: number, by: number): boolean {
    const start = this.index(ax, ay);
    const goal = this.index(bx, by);
    if (!this.nodeFlags[start] || !this.nodeFlags[goal]) return false;
    if (start === goal) return true;
    const seen = new Uint8Array(this.nodeFlags.length);
    const queue = [start];
    seen[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      if (cur === goal) return true;
      for (const nb of this.adj.get(cur) ?? []) {
        if (!seen[nb]) {
          seen[nb] = 1;
          queue.push(nb);
        }
      }
    }
    return false;
  }
}
