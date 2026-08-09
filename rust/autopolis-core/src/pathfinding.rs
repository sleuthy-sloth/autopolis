//! A* pathfinding — deterministic, allocation-light, grid-native.
//!
//! Port of pathfinding.ts. Works over any neighbor/cost function; the open
//! set is a binary min-heap ordered by (f, key) with the exact same
//! tie-breaking as the TS `MinHeap`, so results (paths, costs, visited
//! counts) match the reference implementation exactly.

use crate::grid::SpatialGrid;
use crate::tiles::{TILE_TYPE_RAIL, TILE_TYPE_ROAD, TILE_TYPE_WATER};

pub const SQRT2: f64 = std::f64::consts::SQRT_2;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct GridPoint {
    pub x: i32,
    pub y: i32,
}

pub struct PathRequest<'a> {
    pub width: usize,
    pub height: usize,
    pub start: GridPoint,
    pub goal: GridPoint,
    /// Valid moves from a cell.
    pub neighbors: &'a dyn Fn(i32, i32) -> Vec<GridPoint>,
    /// Movement cost between adjacent cells (default 1).
    pub cost: &'a dyn Fn(i32, i32, i32, i32) -> f64,
    /// Admissible heuristic to the goal.
    pub heuristic: &'a dyn Fn(i32, i32) -> f64,
    /// Safety valve against pathological inputs (default: 4× the cell count).
    pub max_iterations: Option<usize>,
}

pub struct PathResult {
    pub found: bool,
    /// Ordered waypoints start → goal (inclusive). Empty when not found.
    pub path: Vec<GridPoint>,
    /// Total movement cost of the path.
    pub cost: f64,
    /// Cells closed during the search — a cheap proxy for work done.
    pub visited: usize,
}

/// Minimal binary min-heap of (f, key) pairs, tie-broken by key.
///
/// Mirrors the TS `MinHeap` (flat [f, key, f, key, ...] array) exactly:
/// element i holds f = data[2i], key = data[2i+1]; sift-up on push, sift-down
/// on pop, `less` compares (f, then key).
struct MinHeap {
    data: Vec<(f64, usize)>,
}

impl MinHeap {
    fn new() -> Self {
        Self { data: Vec::new() }
    }

    fn size(&self) -> usize {
        self.data.len()
    }

    fn push(&mut self, key: usize, f: f64) {
        self.data.push((f, key));
        let mut i = self.data.len() - 1;
        while i > 0 {
            let parent = (i - 1) >> 1;
            if self.less(i, parent) {
                self.data.swap(i, parent);
                i = parent;
            } else {
                break;
            }
        }
    }

    fn pop(&mut self) -> usize {
        let top = self.data[0].1;
        let last = self.data.pop().unwrap();
        if !self.data.is_empty() {
            self.data[0] = last;
            let mut i = 0usize;
            let n = self.data.len();
            loop {
                let l = 2 * i + 1;
                let r = 2 * i + 2;
                let mut best = i;
                if l < n && self.less(l, best) {
                    best = l;
                }
                if r < n && self.less(r, best) {
                    best = r;
                }
                if best == i {
                    break;
                }
                self.data.swap(i, best);
                i = best;
            }
        }
        top
    }

    /// Compare heap slots a vs b by (f, then key) — deterministic ordering.
    fn less(&self, a: usize, b: usize) -> bool {
        let (fa, ka) = self.data[a];
        let (fb, kb) = self.data[b];
        if fa != fb {
            fa < fb
        } else {
            ka < kb
        }
    }
}

pub fn find_path(req: &PathRequest) -> PathResult {
    let width = req.width;
    let height = req.height;
    let start = req.start;
    let goal = req.goal;
    let n = width * height;
    let start_idx = start.y as usize * width + start.x as usize;
    let goal_idx = goal.y as usize * width + goal.x as usize;

    let mut g_score = vec![f64::INFINITY; n];
    let mut came_from = vec![-1i64; n];
    let mut closed = vec![0u8; n];
    let mut heap = MinHeap::new();

    let cost_fn = req.cost;
    let max_iterations = req.max_iterations.unwrap_or(n * 4);

    g_score[start_idx] = 0.0;
    heap.push(start_idx, (req.heuristic)(start.x, start.y));

    let mut visited = 0usize;
    while heap.size() > 0 && visited < max_iterations {
        let cur = heap.pop();
        if closed[cur] != 0 {
            continue;
        }
        closed[cur] = 1;
        visited += 1;

        if cur == goal_idx {
            // Reconstruct: goal → start, then reverse.
            let mut path = vec![GridPoint {
                x: goal.x,
                y: goal.y,
            }];
            let mut node = goal_idx;
            while node != start_idx {
                let prev = came_from[node] as usize;
                path.push(GridPoint {
                    x: (prev % width) as i32,
                    y: (prev / width) as i32,
                });
                node = prev;
            }
            path.reverse();
            return PathResult {
                found: true,
                path,
                cost: g_score[goal_idx],
                visited,
            };
        }

        let cx = (cur % width) as i32;
        let cy = (cur / width) as i32;
        for nb in (req.neighbors)(cx, cy) {
            let ni = nb.y as usize * width + nb.x as usize;
            if closed[ni] != 0 {
                continue;
            }
            let tentative = g_score[cur] + cost_fn(cx, cy, nb.x, nb.y);
            if tentative < g_score[ni] {
                g_score[ni] = tentative;
                came_from[ni] = cur as i64;
                heap.push(ni, tentative + (req.heuristic)(nb.x, nb.y));
            }
        }
    }

    PathResult {
        found: false,
        path: Vec::new(),
        cost: 0.0,
        visited,
    }
}

// ── Domain-specific builders ────────────────────────────────────────────────

pub fn manhattan(dx: i32, dy: i32) -> f64 {
    (dx.abs() + dy.abs()) as f64
}

pub fn octile(dx: i32, dy: i32) -> f64 {
    let d = dx.abs().max(dy.abs()) as f64;
    let s = dx.abs().min(dy.abs()) as f64;
    d + (SQRT2 - 1.0) * s
}

fn default_cost(_ax: i32, _ay: i32, _bx: i32, _by: i32) -> f64 {
    1.0
}

/// Vehicle movement: road tiles only, orthogonal (4-dir), cost 1 per step.
pub fn find_network_path(
    grid: &SpatialGrid,
    tile_type: u8,
    start: GridPoint,
    goal: GridPoint,
) -> PathResult {
    let width = grid.width;
    let height = grid.height;
    let neighbors = |x: i32, y: i32| -> Vec<GridPoint> {
        let mut out = Vec::new();
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let nx = x + dx;
            let ny = y + dy;
            if nx >= 0 && ny >= 0 && (nx as usize) < width && (ny as usize) < height && grid.get(nx, ny) == tile_type {
                out.push(GridPoint { x: nx, y: ny });
            }
        }
        out
    };
    let heuristic = |x: i32, y: i32| manhattan(goal.x - x, goal.y - y);
    find_path(&PathRequest {
        width,
        height,
        start,
        goal,
        neighbors: &neighbors,
        cost: &default_cost,
        heuristic: &heuristic,
        max_iterations: None,
    })
}

/// Road network path (cars).
pub fn find_road_path(grid: &SpatialGrid, start: GridPoint, goal: GridPoint) -> PathResult {
    find_network_path(grid, TILE_TYPE_ROAD, start, goal)
}

/// Rail network path (trains).
pub fn find_rail_path(grid: &SpatialGrid, start: GridPoint, goal: GridPoint) -> PathResult {
    find_network_path(grid, TILE_TYPE_RAIL, start, goal)
}

fn water_path_cost(ax: i32, ay: i32, bx: i32, by: i32) -> f64 {
    if ax == bx || ay == by {
        1.0
    } else {
        SQRT2
    }
}

/// Ship movement: water tiles only, 8-dir, diagonal √2 — open-ocean routes.
pub fn find_water_path(grid: &SpatialGrid, start: GridPoint, goal: GridPoint) -> PathResult {
    let width = grid.width;
    let height = grid.height;
    let on_water = |x: i32, y: i32| -> bool {
        x >= 0 && y >= 0 && (x as usize) < width && (y as usize) < height && grid.get(x, y) == TILE_TYPE_WATER
    };
    let neighbors = |x: i32, y: i32| -> Vec<GridPoint> {
        let mut out = Vec::new();
        for dy in -1..=1 {
            for dx in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x + dx;
                let ny = y + dy;
                if on_water(nx, ny) {
                    out.push(GridPoint { x: nx, y: ny });
                }
            }
        }
        out
    };
    let heuristic = |x: i32, y: i32| octile(goal.x - x, goal.y - y);
    find_path(&PathRequest {
        width,
        height,
        start,
        goal,
        neighbors: &neighbors,
        cost: &water_path_cost,
        heuristic: &heuristic,
        max_iterations: None,
    })
}

/// Citizen movement: any land (non-water), 8-dir, diagonal costs √2.
pub fn find_terrain_path(grid: &SpatialGrid, start: GridPoint, goal: GridPoint) -> PathResult {
    let width = grid.width;
    let height = grid.height;
    let walkable = |x: i32, y: i32| -> bool {
        x >= 0 && y >= 0 && (x as usize) < width && (y as usize) < height && grid.get(x, y) != TILE_TYPE_WATER
    };
    let neighbors = |x: i32, y: i32| -> Vec<GridPoint> {
        let mut out = Vec::new();
        for dy in -1..=1 {
            for dx in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x + dx;
                let ny = y + dy;
                if walkable(nx, ny) {
                    out.push(GridPoint { x: nx, y: ny });
                }
            }
        }
        out
    };
    let heuristic = |x: i32, y: i32| octile(goal.x - x, goal.y - y);
    find_path(&PathRequest {
        width,
        height,
        start,
        goal,
        neighbors: &neighbors,
        cost: &water_path_cost,
        heuristic: &heuristic,
        max_iterations: None,
    })
}
