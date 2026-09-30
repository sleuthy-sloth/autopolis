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
  if (type === TILE_TYPES.WATER) return 0.06;
  // A common datum keeps streets, foundations and vegetation connected.
  // Elevation still reads in natural terrain without creating tall zone pedestals.
  if (type === TILE_TYPES.STONE) return 0.22 + elevation * 0.35;
  if (
    (
      [
        TILE_TYPES.ROAD,
        TILE_TYPES.RAIL,
        TILE_TYPES.RESIDENTIAL,
        TILE_TYPES.COMMERCIAL,
        TILE_TYPES.INDUSTRIAL,
        TILE_TYPES.POWER_PLANT,
        TILE_TYPES.WATER_TOWER,
      ] as TileType[]
    ).includes(type)
  )
    return 0.18;
  return 0.14 + elevation * 0.12;
}

/** Tile type → model kind (+ scale range). */
const BUILDING_MAP: Record<
  number,
  { kind: ModelKind; min: number; max: number }
> = {
  [TILE_TYPES.RESIDENTIAL]: { kind: 'house', min: 0.85, max: 1.05 },
  [TILE_TYPES.COMMERCIAL]: { kind: 'tower', min: 0.85, max: 1.05 },
  [TILE_TYPES.INDUSTRIAL]: { kind: 'factory', min: 0.85, max: 1.05 },
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

  const kindAt = (x: number, y: number, type: TileType): ModelKind | null => {
    const variation = hash2(x, y, grid.seed ^ 0x419a);
    if (type === TILE_TYPES.RESIDENTIAL)
      return variation < 0.25
        ? 'apartment'
        : variation < 0.6
          ? 'villa'
          : 'house';
    if (type === TILE_TYPES.COMMERCIAL)
      return variation < 0.4 ? 'shop' : 'tower';
    if (type === TILE_TYPES.FOREST)
      return variation < 0.65 ? 'broadleaf' : 'tree';
    if (type === TILE_TYPES.ROAD || type === TILE_TYPES.RAIL) {
      const vertical =
        grid.get(x, y - 1) === type || grid.get(x, y + 1) === type;
      const horizontal =
        grid.get(x - 1, y) === type || grid.get(x + 1, y) === type;
      if (type === TILE_TYPES.RAIL) {
        const north = grid.get(x, y - 1) === type,
          south = grid.get(x, y + 1) === type;
        const east = grid.get(x + 1, y) === type,
          west = grid.get(x - 1, y) === type;
        if (Number(north) + Number(south) + Number(east) + Number(west) > 2)
          return 'railCross';
        if (north && east) return 'railNE';
        if (north && west) return 'railNW';
        if (south && east) return 'railSE';
        if (south && west) return 'railSW';
        return vertical ? 'railNS' : 'railEW';
      }
      if (vertical && horizontal) {
        const openCorners = [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ].filter(([dx, dy]) => grid.get(x + dx, y + dy) !== type).length;
        return openCorners >= 2 ? 'roadCross' : 'roadPlain';
      }
      return vertical ? 'roadNS' : 'roadEW';
    }
    return BUILDING_MAP[type]?.kind ?? null;
  };
  const counts = new Map<ModelKind, number>();
  grid.forEach((x, y, type) => {
    const kind = kindAt(x, y, type);
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  });

  const meshes: THREE.InstancedMesh[] = [];
  const meshOf = (kind: ModelKind): THREE.InstancedMesh => {
    const count = counts.get(kind) ?? 0;
    const mesh = new THREE.InstancedMesh(
      models[kind].clone(),
      material,
      Math.max(count, 1),
    );
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
    const kind = kindAt(x, y, type);
    if (!kind) return;
    const mesh = meshByKind.get(kind)!;
    const i = counters.get(kind) ?? 0;
    counters.set(kind, i + 1);
    const entry = BUILDING_MAP[type];
    const natural = type === TILE_TYPES.FOREST;
    const s = natural
      ? 0.75 + hash2(x, y, seed ^ 0x22f1) * 0.5
      : entry
        ? entry.min + hash2(x, y, seed ^ 0x51ed) * (entry.max - entry.min)
        : 1;
    // Orient entrances toward adjacent roads; preserve connected street geometry.
    let rot = natural ? hash2(x, y, seed ^ 0x77aa) * Math.PI * 2 : 0;
    if (entry) {
      if (grid.get(x + 1, y) === TILE_TYPES.ROAD) rot = Math.PI / 2;
      else if (grid.get(x - 1, y) === TILE_TYPES.ROAD) rot = -Math.PI / 2;
      else if (grid.get(x, y - 1) === TILE_TYPES.ROAD) rot = Math.PI;
    }
    const offsetX = natural ? (hash2(x, y, seed ^ 0x981a) - 0.5) * 0.12 : 0;
    const offsetZ = natural ? (hash2(x, y, seed ^ 0x183b) - 0.5) * 0.12 : 0;
    place(
      mesh,
      i,
      x - cx + offsetX,
      tileHeight(type, elevation),
      y - cz + offsetZ,
      s,
      rot,
      0x51ed,
    );
  });

  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  return { meshes };
}
