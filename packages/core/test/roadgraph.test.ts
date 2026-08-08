import { describe, expect, it } from 'vitest';
import { SpatialGrid, RoadGraph, TILE_TYPES } from '../src';

function roadLine(grid: SpatialGrid, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      grid.set(x, y, TILE_TYPES.ROAD);
    }
  }
}

describe('RoadGraph', () => {
  it('builds nodes only from road tiles', () => {
    const g = new SpatialGrid(10, 10);
    roadLine(g, 2, 2, 6, 2);
    const graph = RoadGraph.fromGrid(g);
    expect(graph.nodeCount()).toBe(5);
    expect(graph.hasNode(2, 2)).toBe(true);
    expect(graph.hasNode(7, 2)).toBe(false);
    expect(graph.hasNode(3, 3)).toBe(false);
  });

  it('connects orthogonal road neighbors', () => {
    const g = new SpatialGrid(10, 10);
    roadLine(g, 2, 2, 6, 2);
    roadLine(g, 6, 2, 6, 6);
    const graph = RoadGraph.fromGrid(g);
    expect(graph.neighbors(5, 2)).toHaveLength(2); // horizontal + corner
    expect(graph.neighbors(6, 4)).toHaveLength(2); // vertical
    expect(graph.neighbors(6, 6)).toHaveLength(1); // dead end
    expect(graph.neighbors(0, 0)).toHaveLength(0); // not a road
  });

  it('counts connected components (an L-shape is one component)', () => {
    const g = new SpatialGrid(10, 10);
    roadLine(g, 2, 2, 6, 2);
    roadLine(g, 6, 2, 6, 6);
    const graph = RoadGraph.fromGrid(g);
    expect(graph.componentCount()).toBe(1);
  });

  it('detects disconnected road islands', () => {
    const g = new SpatialGrid(10, 10);
    roadLine(g, 1, 1, 3, 1);
    roadLine(g, 7, 7, 9, 7); // separate island
    const graph = RoadGraph.fromGrid(g);
    expect(graph.componentCount()).toBe(2);
    expect(graph.isConnected(1, 1, 8, 7)).toBe(false);
    expect(graph.isConnected(1, 1, 3, 1)).toBe(true);
  });

  it('isConnected handles non-road endpoints', () => {
    const g = new SpatialGrid(10, 10);
    roadLine(g, 2, 2, 4, 2);
    const graph = RoadGraph.fromGrid(g);
    expect(graph.isConnected(2, 2, 0, 0)).toBe(false);
    expect(graph.isConnected(2, 2, 2, 2)).toBe(true);
  });
});
