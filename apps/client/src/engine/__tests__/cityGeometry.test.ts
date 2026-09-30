import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SpatialGrid, TILE_TYPES } from '@autopolis/core';
import { buildModelSet, modelSet } from '../models';
import { buildStructures, tileHeight } from '../structures';

describe('city geometry', () => {
  it('builds finite, colored geometry for every model, including rounded canopies', () => {
    for (const geometry of Object.values(buildModelSet())) {
      geometry.computeBoundingBox();
      expect(geometry.attributes.color.count).toBe(
        geometry.attributes.position.count,
      );
      expect(
        [...geometry.attributes.position.array].every(Number.isFinite),
      ).toBe(true);
      expect(geometry.boundingBox!.isEmpty()).toBe(false);
      geometry.dispose();
    }
  });

  it('keeps infrastructure and buildings on the same street datum', () => {
    for (const type of [
      TILE_TYPES.RESIDENTIAL,
      TILE_TYPES.COMMERCIAL,
      TILE_TYPES.INDUSTRIAL,
      TILE_TYPES.POWER_PLANT,
      TILE_TYPES.WATER_TOWER,
      TILE_TYPES.RAIL,
    ]) {
      expect(tileHeight(type, 0.8)).toBe(tileHeight(TILE_TYPES.ROAD, 0.2));
    }
  });

  it('rebuilds deterministically and owns geometry independently from the model cache', () => {
    const grid = new SpatialGrid(6, 6);
    grid.seed = 42;
    grid.forEach((x, y) =>
      grid.set(x, y, y === 2 ? TILE_TYPES.ROAD : TILE_TYPES.RESIDENTIAL),
    );
    const first = buildStructures(grid);
    const second = buildStructures(grid);
    expect(first.meshes.map((m) => [...m.instanceMatrix.array])).toEqual(
      second.meshes.map((m) => [...m.instanceMatrix.array]),
    );
    for (const mesh of first.meshes) {
      expect(Object.values(modelSet())).not.toContain(mesh.geometry);
      mesh.computeBoundingBox();
      expect(mesh.boundingBox!.min.x).toBeGreaterThanOrEqual(-3.5);
      expect(mesh.boundingBox!.max.x).toBeLessThanOrEqual(2.5);
      mesh.geometry.dispose();
    }
    for (const mesh of second.meshes) mesh.geometry.dispose();
  });

  it('orients rail geometry along connected neighboring tiles', () => {
    const grid = new SpatialGrid(3, 3);
    for (let x = 0; x < 3; x++) grid.set(x, 1, TILE_TYPES.RAIL);
    const { meshes } = buildStructures(grid);
    expect(meshes).toHaveLength(1);
    const box = new THREE.Box3().setFromBufferAttribute(
      meshes[0].geometry.attributes.position as THREE.BufferAttribute,
    );
    expect(box.max.x - box.min.x).toBeCloseTo(1);
    expect(box.max.z - box.min.z).toBeCloseTo(0.55);
  });
});

import { buildTerrainGeometry } from '../terrain';

describe('continuous terrain', () => {
  it('joins adjacent natural tiles without cracks, with upward facing triangles', () => {
    const grid = new SpatialGrid(2, 1);
    grid.setElevation(0, 0, 0.3);
    grid.setElevation(1, 0, 0.8);
    const geometry = buildTerrainGeometry(grid, [
      new THREE.Color('#719566'),
      new THREE.Color('#d9cdac'),
    ]);
    const position = geometry.attributes.position;
    const seamHeights = new Map<number, Set<number>>();
    for (let i = 0; i < position.count; i++) {
      if (position.getX(i) !== -0.5 || position.getY(i) < 0) continue;
      const z = position.getZ(i);
      if (!seamHeights.has(z)) seamHeights.set(z, new Set());
      seamHeights.get(z)!.add(position.getY(i));
    }
    expect(seamHeights.size).toBe(2);
    for (const heights of seamHeights.values()) expect(heights.size).toBe(1);
    expect(geometry.attributes.normal.getY(0)).toBeGreaterThan(0.9);
    geometry.dispose();
  });

  it('builds a finite closed edge for a single tile', () => {
    const geometry = buildTerrainGeometry(new SpatialGrid(1, 1), [
      new THREE.Color('#719566'),
    ]);
    expect(geometry.attributes.position.count).toBe(36);
    expect([...geometry.attributes.position.array].every(Number.isFinite)).toBe(
      true,
    );
    geometry.dispose();
  });
});

import { TileRenderer } from '../TileRenderer';

describe('terrain interactions', () => {
  it('keeps narrow waterways below the continuous water surface', () => {
    const grid = new SpatialGrid(3, 1);
    grid.set(1, 0, TILE_TYPES.WATER);
    grid.set(2, 0, TILE_TYPES.STONE);
    grid.setElevation(2, 0, 1);
    const geometry = buildTerrainGeometry(
      grid,
      Array.from({ length: 3 }, () => new THREE.Color('#719566')),
    );
    const ids = geometry.userData.tileIndices as number[];
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      if (ids[Math.floor(i / 3)] === 1)
        expect(positions.getY(i)).toBeLessThan(0.085);
    }
    geometry.dispose();
  });

  it('picks the visible terrain and keeps outlines and coverage above raised corners', () => {
    const grid = new SpatialGrid(2, 1);
    grid.set(1, 0, TILE_TYPES.STONE);
    grid.setElevation(1, 0, 1);
    const scene = new THREE.Scene();
    const tiles = new TileRenderer(
      scene,
      document.createElement('canvas'),
      grid,
    );
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(-1, 5, -0.5);
    camera.lookAt(-1, 0, -0.5);
    camera.updateMatrixWorld();
    tiles.updateHover(new THREE.Raycaster(), new THREE.Vector2(0, 0), camera);
    expect(tiles.selectHovered()).toMatchObject({
      x: 0,
      y: 0,
      type: TILE_TYPES.GRASS,
    });
    expect(tiles.selectionRing.position.y).toBeGreaterThan(0.35);
    tiles.setOverlay('power', { power: [0, 1], water: [0, 1] });
    const surface = scene.children.find(
      (child) =>
        child instanceof THREE.Mesh &&
        child !== tiles.overlayMesh &&
        child.geometry.userData.tileIndices,
    ) as THREE.Mesh;
    const ground = surface.geometry.attributes.position;
    const overlay = tiles.overlayMesh!.geometry.attributes.position;
    for (let i = 0; i < ground.count; i++)
      expect(overlay.getY(i)).toBeGreaterThan(ground.getY(i));
    const old = surface;
    tiles.replaceGrid(new SpatialGrid(1, 1));
    expect(scene.children).not.toContain(old);
    expect(tiles.selectionRing.visible).toBe(false);
    expect(tiles.overlayMesh!.geometry.attributes.position.count).toBe(36);
  });
});

import { terrainHeightAt } from '../terrain';

it('samples the rendered triangle height continuously for moving citizens', () => {
  const grid = new SpatialGrid(2, 1);
  grid.set(1, 0, TILE_TYPES.STONE);
  grid.setElevation(1, 0, 1);
  const mesh = new THREE.Mesh(
    buildTerrainGeometry(grid, [
      new THREE.Color('#719566'),
      new THREE.Color('#9a9e98'),
    ]),
    new THREE.MeshBasicMaterial(),
  );
  for (const x of [0.2, 0.49, 0.5, 0.51, 0.8]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x - 1, 3, -0.5),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(mesh)[0];
    expect(terrainHeightAt(grid, x, 0)).toBeCloseTo(hit.point.y, 6);
  }
  expect(
    Math.abs(terrainHeightAt(grid, 0.499, 0) - terrainHeightAt(grid, 0.501, 0)),
  ).toBeLessThan(0.002);
});
