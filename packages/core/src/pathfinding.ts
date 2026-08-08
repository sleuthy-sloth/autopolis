/**
 * A* pathfinding — deterministic, allocation-light, grid-native.
 *
 * Works over any neighbor/cost function, so vehicles (road graph, 4-dir) and
 * citizens (walkable terrain, 8-dir) share one engine. Open set is a binary
 * heap; closed/g-score/parent are flat typed arrays sized to the grid — no
 * Map churn, no Math.random(), fully reproducible across runs.
 */
import { SpatialGrid } from './grid';
import { TILE_TYPES } from './tiles';

export interface GridPoint {
  x: number;
  y: number;
}

export interface PathRequest {
  width: number;
  height: number;
  start: GridPoint;
  goal: GridPoint;
  /** Valid moves from a cell. */
  neighbors: (x: number, y: number) => GridPoint[];
  /** Movement cost between adjacent cells (default 1). */
  cost?: (ax: number, ay: number, bx: number, by: number) => number;
  /** Admissible heuristic to the goal. */
  heuristic: (x: number, y: number) => number;
  /** Safety valve against pathological inputs (default: 4× the cell count). */
  maxIterations?: number;
}

export interface PathResult {
  found: boolean;
  /** Ordered waypoints start → goal (inclusive). Empty when not found. */
  path: GridPoint[];
  /** Total movement cost of the path. */
  cost: number;
  /** Cells closed during the search — a cheap proxy for work done. */
  visited: number;
}

/** Minimal binary min-heap of [priority, key] pairs, tie-broken by key. */
class MinHeap {
  private data: number[] = []; // [f, key, f, key, ...]

  get size(): number {
    return this.data.length / 2;
  }

  push(key: number, f: number): void {
    const d = this.data;
    d.push(f, key);
    let i = d.length / 2 - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(i, parent)) {
        this.swap(i, parent);
        i = parent;
      } else break;
    }
  }

  pop(): number {
    const d = this.data;
    const top = d[1];
    const lastF = d[d.length - 2];
    const lastK = d[d.length - 1];
    d.length -= 2;
    if (d.length > 0) {
      d[0] = lastF;
      d[1] = lastK;
      let i = 0;
      const n = d.length / 2;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let best = i;
        if (l < n && this.less(l, best)) best = l;
        if (r < n && this.less(r, best)) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return top;
  }

  /** Compare heap slots a vs b by (f, then key) — deterministic ordering. */
  private less(a: number, b: number): boolean {
    const d = this.data;
    const fa = d[2 * a];
    const fb = d[2 * b];
    if (fa !== fb) return fa < fb;
    return d[2 * a + 1] < d[2 * b + 1];
  }

  private swap(a: number, b: number): void {
    const d = this.data;
    const ia = 2 * a;
    const ib = 2 * b;
    const tf = d[ia];
    const tk = d[ia + 1];
    d[ia] = d[ib];
    d[ia + 1] = d[ib + 1];
    d[ib] = tf;
    d[ib + 1] = tk;
  }
}

export function findPath(req: PathRequest): PathResult {
  const { width, height, start, goal } = req;
  const N = width * height;
  const startIdx = start.y * width + start.x;
  const goalIdx = goal.y * width + goal.x;

  const gScore = new Float64Array(N).fill(Infinity);
  const cameFrom = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();

  const costFn = req.cost ?? (() => 1);
  const maxIterations = req.maxIterations ?? N * 4;

  gScore[startIdx] = 0;
  heap.push(startIdx, req.heuristic(start.x, start.y));

  let visited = 0;
  while (heap.size > 0 && visited < maxIterations) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    visited++;

    if (cur === goalIdx) {
      // Reconstruct: goal → start, then reverse.
      const path: GridPoint[] = [{ x: goal.x, y: goal.y }];
      let node = goalIdx;
      while (node !== startIdx) {
        const prev = cameFrom[node];
        path.push({ x: prev % width, y: Math.floor(prev / width) });
        node = prev;
      }
      path.reverse();
      return { found: true, path, cost: gScore[goalIdx], visited };
    }

    const cx = cur % width;
    const cy = Math.floor(cur / width);
    for (const nb of req.neighbors(cx, cy)) {
      const ni = nb.y * width + nb.x;
      if (closed[ni]) continue;
      const tentative = gScore[cur] + costFn(cx, cy, nb.x, nb.y);
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        cameFrom[ni] = cur;
        heap.push(ni, tentative + req.heuristic(nb.x, nb.y));
      }
    }
  }

  return { found: false, path: [], cost: 0, visited };
}

// ── Domain-specific builders ────────────────────────────────────────────────

export function manhattan(dx: number, dy: number): number {
  return Math.abs(dx) + Math.abs(dy);
}

export function octile(dx: number, dy: number): number {
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  const s = Math.min(Math.abs(dx), Math.abs(dy));
  return d + (Math.SQRT2 - 1) * s;
}

/** Vehicle movement: road tiles only, orthogonal (4-dir), cost 1 per step. */
export function findRoadPath(grid: SpatialGrid, start: GridPoint, goal: GridPoint): PathResult {
  const { width, height } = grid;
  return findPath({
    width,
    height,
    start,
    goal,
    neighbors: (x, y) => {
      const out: GridPoint[] = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && grid.get(nx, ny) === TILE_TYPES.ROAD) {
          out.push({ x: nx, y: ny });
        }
      }
      return out;
    },
    heuristic: (x, y) => manhattan(goal.x - x, goal.y - y),
  });
}

/** Citizen movement: any land (non-water), 8-dir, diagonal costs √2. */
export function findTerrainPath(grid: SpatialGrid, start: GridPoint, goal: GridPoint): PathResult {
  const { width, height } = grid;
  const walkable = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && grid.get(x, y) !== TILE_TYPES.WATER;
  return findPath({
    width,
    height,
    start,
    goal,
    neighbors: (x, y) => {
      const out: GridPoint[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (walkable(nx, ny)) out.push({ x: nx, y: ny });
        }
      }
      return out;
    },
    cost: (ax, ay, bx, by) => (ax === bx || ay === by ? 1 : Math.SQRT2),
    heuristic: (x, y) => octile(goal.x - x, goal.y - y),
  });
}
