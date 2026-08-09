/**
 * structures.ts — the built environment, instanced for 60 fps.
 *
 * Zone tiles become real buildings: per-district heights and colors, with a
 * darker roof slab on top. Forest tiles get trees. Everything is seeded from
 * the grid seed (hash2), so the same seed always builds the same city.
 *
 * All meshes are InstancedMesh → a few draw calls regardless of city size.
 */
import * as THREE from 'three';
import { SpatialGrid, TILE_TYPES, TileType, hash2 } from '@autopolis/core';

/** Ground slab height per tile type (shared with the tile renderer). */
export function tileHeight(type: TileType, elevation: number): number {
  switch (type) {
    case TILE_TYPES.WATER:
      return 0.06;
    case TILE_TYPES.SAND:
      return 0.16 + elevation * 0.35;
    case TILE_TYPES.STONE:
      return 0.5 + elevation * 1.1;
    case TILE_TYPES.FOREST:
      return 0.34 + elevation * 0.8;
    case TILE_TYPES.DIRT:
      return 0.22 + elevation * 0.55;
    case TILE_TYPES.ROAD:
      return 0.14;
    case TILE_TYPES.RESIDENTIAL:
      return 0.3 + elevation * 0.35;
    case TILE_TYPES.COMMERCIAL:
      return 0.4 + elevation * 0.4;
    case TILE_TYPES.INDUSTRIAL:
      return 0.45 + elevation * 0.45;
    case TILE_TYPES.POWER_PLANT:
      return 1.1;
    case TILE_TYPES.WATER_TOWER:
      return 1.1;
    default:
      return 0.2 + elevation * 0.55;
  }
}

const STRUCTURE_STYLE: Record<number, { color: string; minH: number; maxH: number }> = {
  [TILE_TYPES.RESIDENTIAL]: { color: '#7fb2e0', minH: 0.55, maxH: 1.05 },
  [TILE_TYPES.COMMERCIAL]: { color: '#e8c96a', minH: 1.4, maxH: 2.6 },
  [TILE_TYPES.INDUSTRIAL]: { color: '#c98a5e', minH: 0.8, maxH: 1.3 },
  [TILE_TYPES.POWER_PLANT]: { color: '#a55eea', minH: 1.6, maxH: 1.6 },
  [TILE_TYPES.WATER_TOWER]: { color: '#45aaf2', minH: 1.5, maxH: 1.5 },
};

export interface Structures {
  body: THREE.InstancedMesh;
  roof: THREE.InstancedMesh;
  trees: THREE.InstancedMesh;
}

/** Build instanced buildings (zone tiles + plants/towers) and forest trees. */
export function buildStructures(grid: SpatialGrid): Structures {
  const { width, height } = grid;
  const cx = width / 2;
  const cz = height / 2;

  // Count buildable tiles first so InstancedMesh counts are exact.
  let buildCount = 0;
  let treeCount = 0;
  grid.forEach((_x, _y, type) => {
    if (STRUCTURE_STYLE[type]) buildCount++;
    else if (type === TILE_TYPES.FOREST) treeCount++;
  });

  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(0.94, 0.1, 0.94);
  const treeGeo = new THREE.ConeGeometry(0.48, 1.05, 6);
  const lambert = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const treeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  const body = new THREE.InstancedMesh(bodyGeo, lambert, Math.max(buildCount, 1));
  const roof = new THREE.InstancedMesh(roofGeo, lambert, Math.max(buildCount, 1));
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, Math.max(treeCount, 1));

  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const seed = grid.seed;

  let bi = 0;
  grid.forEach((x, y, type, elevation) => {
    const style = STRUCTURE_STYLE[type];
    if (!style) return;
    const pad = tileHeight(type, elevation);
    const h = style.minH + hash2(x, y, seed ^ 0x51ed) * (style.maxH - style.minH);
    // Body
    pos.set(x - cx, pad + h / 2, y - cz);
    scale.set(0.88, h, 0.88);
    matrix.compose(pos, quat, scale);
    body.setMatrixAt(bi, matrix);
    // Roof slab
    pos.set(x - cx, pad + h + 0.05, y - cz);
    scale.set(1, 1, 1);
    matrix.compose(pos, quat, scale);
    roof.setMatrixAt(bi, matrix);
    // Colors: district hue with deterministic jitter; roofs darker.
    const jitter = 0.82 + hash2(x, y, seed ^ 0x9e37) * 0.36;
    color.set(style.color).multiplyScalar(jitter);
    body.setColorAt(bi, color);
    color.multiplyScalar(0.55);
    roof.setColorAt(bi, color);
    bi++;
  });

  // Trees (separate pass keeps indices clean).
  let tIdx = 0;
  grid.forEach((x, y, type, elevation) => {
    if (type !== TILE_TYPES.FOREST) return;
    const s = 0.8 + hash2(x, y, seed ^ 0x22f1) * 0.7;
    pos.set(x - cx, tileHeight(type, elevation) + s * 0.55, y - cz);
    scale.set(s, s, s);
    matrix.compose(pos, quat, scale);
    trees.setMatrixAt(tIdx, matrix);
    color.set('#3f7d3a').multiplyScalar(0.85 + hash2(x, y, seed ^ 0x77aa) * 0.3);
    trees.setColorAt(tIdx, color);
    tIdx++;
  });

  body.instanceMatrix.needsUpdate = true;
  roof.instanceMatrix.needsUpdate = true;
  trees.instanceMatrix.needsUpdate = true;
  if (body.instanceColor) body.instanceColor.needsUpdate = true;
  if (roof.instanceColor) roof.instanceColor.needsUpdate = true;
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true;

  return { body, roof, trees };
}
