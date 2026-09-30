import * as THREE from 'three';
import { SpatialGrid, TILE_TYPES } from '@autopolis/core';
import { tileHeight } from './structures';

/** Shared by the visible mesh and moving entities. Water corners stay submerged. */
export function terrainCornerHeight(
  grid: SpatialGrid,
  x: number,
  y: number,
): number {
  let count = 0,
    sum = 0,
    street = false,
    water = false;
  for (const dx of [-1, 0])
    for (const dy of [-1, 0]) {
      const nx = x + dx,
        ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const type = grid.get(nx, ny);
      sum += tileHeight(type, grid.getElevation(nx, ny));
      street ||= type >= TILE_TYPES.ROAD;
      water ||= type === TILE_TYPES.WATER;
      count++;
    }
  return water ? 0.06 : street ? 0.18 : count ? sum / count : 0.06;
}

/** Exact triangle-fan interpolation in uncentered grid coordinates. */
export function terrainHeightAt(
  grid: SpatialGrid,
  x: number,
  y: number,
): number {
  const tx = Math.max(0, Math.min(grid.width - 1, Math.floor(x + 0.5)));
  const ty = Math.max(0, Math.min(grid.height - 1, Math.floor(y + 0.5)));
  const u = Math.max(-0.5, Math.min(0.5, x - tx));
  const v = Math.max(-0.5, Math.min(0.5, y - ty));
  const center = tileHeight(grid.get(tx, ty), grid.getElevation(tx, ty));
  let edge: number, weight: number;
  if (Math.abs(u) > Math.abs(v)) {
    const cx = tx + (u > 0 ? 1 : 0);
    const along = v / Math.abs(u) / 2 + 0.5;
    edge =
      terrainCornerHeight(grid, cx, ty) * (1 - along) +
      terrainCornerHeight(grid, cx, ty + 1) * along;
    weight = Math.abs(u) * 2;
  } else if (Math.abs(v) > 0) {
    const cy = ty + (v > 0 ? 1 : 0);
    const along = u / Math.abs(v) / 2 + 0.5;
    edge =
      terrainCornerHeight(grid, tx, cy) * (1 - along) +
      terrainCornerHeight(grid, tx + 1, cy) * along;
    weight = Math.abs(v) * 2;
  } else return center;
  return center * (1 - weight) + edge * weight;
}

/** Continuous triangle surface: natural colors and heights meet at shared corners.
 * Developed plots remain crisp, and the picking grid retains authoritative tile IDs. */
export function buildTerrainGeometry(
  grid: SpatialGrid,
  colors: THREE.Color[],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const tileIndices: number[] = [];
  let tileIndex = 0;
  const shades: number[] = [];
  type Vertex = { x: number; y: number; z: number; color: THREE.Color };
  const developed = (x: number, y: number) => grid.get(x, y) >= TILE_TYPES.ROAD;
  const corner = (x: number, y: number): Vertex => {
    const color = new THREE.Color(0, 0, 0);
    let count = 0;
    for (const dx of [-1, 0])
      for (const dy of [-1, 0]) {
        const nx = x + dx,
          ny = y + dy;
        if (!grid.inBounds(nx, ny)) continue;
        color.add(colors[grid.index(nx, ny)]);
        count++;
      }
    return {
      x: x - grid.width / 2 - 0.5,
      y: terrainCornerHeight(grid, x, y),
      z: y - grid.height / 2 - 0.5,
      color: color.multiplyScalar(1 / count),
    };
  };
  const emit = (a: Vertex, b: Vertex, c: Vertex) => {
    tileIndices.push(tileIndex);
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      shades.push(v.color.r, v.color.g, v.color.b);
    }
  };
  grid.forEach((x, y, type, elevation) => {
    tileIndex = grid.index(x, y);
    const center: Vertex = {
      x: x - grid.width / 2,
      y: tileHeight(type, elevation),
      z: y - grid.height / 2,
      color: colors[grid.index(x, y)],
    };
    const vertices = [
      corner(x, y),
      corner(x, y + 1),
      corner(x + 1, y + 1),
      corner(x + 1, y),
    ];
    if (developed(x, y)) for (const v of vertices) v.color = center.color;
    for (let i = 0; i < 4; i++)
      emit(center, vertices[i], vertices[(i + 1) % 4]);
    // Close the outer edge so the city reads as a solid miniature landscape.
    for (const [side, boundary] of [
      [0, x === 0],
      [1, y === grid.height - 1],
      [2, x === grid.width - 1],
      [3, y === 0],
    ] as const) {
      if (!boundary) continue;
      const a = vertices[side],
        b = vertices[(side + 1) % 4];
      const bottomA = {
        ...a,
        y: -0.08,
        color: a.color.clone().multiplyScalar(0.65),
      };
      const bottomB = {
        ...b,
        y: -0.08,
        color: b.color.clone().multiplyScalar(0.65),
      };
      emit(a, bottomA, b);
      emit(b, bottomA, bottomB);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
  geometry.userData.tileIndices = tileIndices;
  geometry.computeVertexNormals();
  // Average surface normals across coincident vertices, preserving hard outer skirts.
  const normals = geometry.attributes.normal;
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < positions.length / 3; i++) {
    if (normals.getY(i) <= 0) continue;
    const key = positions.slice(i * 3, i * 3 + 3).join(',');
    const sum = sums.get(key) ?? new THREE.Vector3();
    sum.add(
      new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i)),
    );
    sums.set(key, sum);
  }
  for (let i = 0; i < positions.length / 3; i++) {
    if (normals.getY(i) <= 0) continue;
    const normal = sums
      .get(positions.slice(i * 3, i * 3 + 3).join(','))!
      .clone()
      .normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  geometry.computeBoundingSphere();
  return geometry;
}
