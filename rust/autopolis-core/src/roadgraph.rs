//! RoadGraph — the road network as a graph.
//!
//! Nodes are road tiles; edges connect orthogonally adjacent road tiles
//! (4-connectivity: cars don't cut diagonally across blocks). Built lazily
//! from the grid, so it always mirrors the authoritative SpatialGrid state.
//! Port of roadgraph.ts.

use crate::grid::SpatialGrid;
use crate::tiles::TILE_TYPE_ROAD;

const DIRS4: [(i32, i32); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];

pub struct RoadGraph {
    /// node_flags[i] = 1 if tile i is a road node
    pub node_flags: Vec<u8>,
    pub width: usize,
    pub height: usize,
    /// adjacency index → array of neighbor indices
    adj: Vec<Vec<usize>>,
}

impl RoadGraph {
    fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            node_flags: vec![0; width * height],
            adj: vec![Vec::new(); width * height],
        }
    }

    pub fn from_grid(grid: &SpatialGrid) -> RoadGraph {
        let mut g = RoadGraph::new(grid.width, grid.height);
        grid.for_each(|x, y, type_code, _| {
            if type_code == TILE_TYPE_ROAD {
                let idx = grid.index(x, y);
                g.node_flags[idx] = 1;
                g.adj[idx] = Vec::new();
            }
        });
        // Build edges: for each node, orthogonal neighbors that are also roads.
        for idx in 0..g.adj.len() {
            if g.node_flags[idx] == 0 {
                continue;
            }
            let x = (idx % g.width) as i32;
            let y = (idx / g.width) as i32;
            for (dx, dy) in DIRS4 {
                let nx = x + dx;
                let ny = y + dy;
                if g.in_bounds(nx, ny) && g.node_flags[g.index(nx, ny)] == 1 {
                    let ni = g.index(nx, ny);
                    g.adj[idx].push(ni);
                }
            }
        }
        g
    }

    fn index(&self, x: i32, y: i32) -> usize {
        y as usize * self.width + x as usize
    }

    fn in_bounds(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && (x as usize) < self.width && (y as usize) < self.height
    }

    pub fn has_node(&self, x: i32, y: i32) -> bool {
        self.in_bounds(x, y) && self.node_flags[self.index(x, y)] == 1
    }

    /// Orthogonal road neighbors of a road tile (empty if the tile isn't a road).
    pub fn neighbors(&self, x: i32, y: i32) -> Vec<(i32, i32)> {
        if !self.in_bounds(x, y) {
            return Vec::new();
        }
        let idx = self.index(x, y);
        self.adj[idx]
            .iter()
            .map(|&i| ((i % self.width) as i32, (i / self.width) as i32))
            .collect()
    }

    pub fn node_count(&self) -> usize {
        self.node_flags.iter().filter(|&&f| f == 1).count()
    }

    /// Number of connected components (BFS over the node flags).
    /// A well-formed city should have exactly 1 road component.
    pub fn component_count(&self) -> usize {
        let mut seen = vec![0u8; self.node_flags.len()];
        let mut components = 0usize;
        for i in 0..self.node_flags.len() {
            if self.node_flags[i] == 1 && seen[i] == 0 {
                components += 1;
                // BFS
                let mut queue = vec![i];
                seen[i] = 1;
                let mut head = 0usize;
                while head < queue.len() {
                    let cur = queue[head];
                    head += 1;
                    for &nb in &self.adj[cur] {
                        if seen[nb] == 0 {
                            seen[nb] = 1;
                            queue.push(nb);
                        }
                    }
                }
            }
        }
        components
    }

    /// True if both points are on the road network and connected by roads.
    pub fn is_connected(&self, ax: i32, ay: i32, bx: i32, by: i32) -> bool {
        if !self.in_bounds(ax, ay) || !self.in_bounds(bx, by) {
            return false;
        }
        let start = self.index(ax, ay);
        let goal = self.index(bx, by);
        if self.node_flags[start] == 0 || self.node_flags[goal] == 0 {
            return false;
        }
        if start == goal {
            return true;
        }
        let mut seen = vec![0u8; self.node_flags.len()];
        let mut queue = vec![start];
        seen[start] = 1;
        let mut head = 0usize;
        while head < queue.len() {
            let cur = queue[head];
            head += 1;
            if cur == goal {
                return true;
            }
            for &nb in &self.adj[cur] {
                if seen[nb] == 0 {
                    seen[nb] = 1;
                    queue.push(nb);
                }
            }
        }
        false
    }
}
