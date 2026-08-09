/**
 * structures.ts — the built environment, from the low-poly model library.
 *
 * One InstancedMesh per model kind (house, tower, factory, ...), so a whole
 * district renders in a handful of draw calls. Per-instance tint varies
 * brightness/color deterministically from the grid seed.
 */
import * as THREE from 'three';
import { SpatialGrid, TILE_TYPES, TileType, hash2 } from '@autopolis/core';
import { modelMaterial, modelSet, type ModelKind } from './models';

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
    case TILE_TYPES.RAIL:
      return 0.1;
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

/** Tile type → model kind (+ scale range). */
const BUILDING_MAP: Record<number, { kind: ModelKind; min: number; max: number }> = {
  [TILE_TYPES.RESIDENTIAL]: { kind: 'house', min: 0.85, max: 1.2 },
  [TILE_TYPES.COMMERCIAL]: { kind: 'tower', min: 0.9, max: 1.4 },
  [TILE_TYPES.INDUSTRIAL]: { kind: 'factory', min: 0.9, max: 1.25 },
  [TILE_TYPES.POWER_PLANT]: { kind: 'powerplant', min: 1, max: 1 },
  [TILE_TYPES.WATER_TOWER]: { kind: 'watertower', min: 1, max: 1 },
};

export interface Structures {
  meshes: THREE.InstancedMesh[];
}

/** Build instanced models for zone tiles, infrastructure, and forest trees. */
export function buildStructures(grid: SpatialGrid): Structures {
  const models = modelSet();
  const material = modelMaterial();
  const { width, height } = grid;
  const cx = width / 2;
  const cz = height / 2;

  // Count instances per kind.
  const counts = new Map<ModelKind, number>();
  const record = (kind: ModelKind): void => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  };
  grid.forEach((_x, _y, type) => {
    const entry = BUILDING_MAP[type];
    if (entry) record(entry.kind);
    else if (type === TILE_TYPES.FOREST) record('tree');
  });

  const meshes: THREE.InstancedMesh[] = [];
  const meshOf = (kind: ModelKind): THREE.InstancedMesh => {
    const count = counts.get(kind) ?? 0;
    const mesh = new THREE.InstancedMesh(models[kind], material, Math.max(count, 1));
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
    return mesh;
  };

  const meshByKind = new Map<ModelKind, THREE.InstancedMesh>();
  for (const kind of counts.keys()) meshByKind.set(kind, meshOf(kind));

  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  const tint = new THREE.Color();
  const seed = grid.seed;

  const place = (
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    s: number,
    rotationY: number,
    seedKey: number,
  ): void => {
    pos.set(x, y, z);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
    scaleV.set(s, s, s);
    matrix.compose(pos, quat, scaleV);
    mesh.setMatrixAt(index, matrix);
    tint.setScalar(0.85 + hash2(x + seed, z + seedKey, seed ^ seedKey) * 0.3);
    mesh.setColorAt(index, tint);
  };

  const counters = new Map<ModelKind, number>();
  grid.forEach((x, y, type, elevation) => {
    const entry = BUILDING_MAP[type];
    if (entry) {
      const mesh = meshByKind.get(entry.kind)!;
      const i = counters.get(entry.kind) ?? 0;
      counters.set(entry.kind, i + 1);
      const s = entry.min + hash2(x, y, seed ^ 0x51ed) * (entry.max - entry.min);
      place(mesh, i, x - cx, tileHeight(type, elevation), y - cz, s, 0, 0x51ed);
    } else if (type === TILE_TYPES.FOREST) {
      const mesh = meshByKind.get('tree')!;
      const i = counters.get('tree') ?? 0;
      counters.set('tree', i + 1);
      const s = 0.75 + hash2(x, y, seed ^ 0x22f1) * 0.6;
      const rot = hash2(x, y, seed ^ 0x77aa) * Math.PI * 2;
      place(mesh, i, x - cx, tileHeight(type, elevation), y - cz, s, rot, 0x22f1);
    }
  });

  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  return { meshes };
}
