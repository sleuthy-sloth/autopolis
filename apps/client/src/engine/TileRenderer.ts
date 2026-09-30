/**
 * TileRenderer — owns continuous terrain, instanced water, coverage overlays,
 * and tile selection. Visible surface triangles retain authoritative tile IDs.
 * Natural colors blend at shared corners while developed plots stay crisp.
 */
import * as THREE from 'three';
import {
  SpatialGrid,
  TILE_PALETTE,
  TILE_TYPES,
  hash2,
  tileName,
} from '@autopolis/core';
import { tileHeight } from './structures';
import { buildTerrainGeometry } from './terrain';
import type { OverlayMode, OverlayResources, TileSelection } from './CityScene';

const TERRAIN_PALETTE: Record<number, string> = {
  [TILE_TYPES.WATER]: '#287f8d',
  [TILE_TYPES.GRASS]: '#7e9c68',
  [TILE_TYPES.FOREST]: '#6f8c5d',
  [TILE_TYPES.SAND]: '#d9cdac',
  [TILE_TYPES.ROAD]: '#596967',
  [TILE_TYPES.RAIL]: '#9c9b8b',
  [TILE_TYPES.RESIDENTIAL]: '#a8b79a',
  [TILE_TYPES.COMMERCIAL]: '#b9bbaa',
  [TILE_TYPES.INDUSTRIAL]: '#aca998',
  [TILE_TYPES.POWER_PLANT]: '#adb5a6',
  [TILE_TYPES.WATER_TOWER]: '#adb5a6',
};

/** Per-face vertex shade: top 1.0, sides ~0.62, bottom ~0.42. */
function buildShadedBoxGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const shade = y > 0.49 ? 1.0 : y < -0.49 ? 0.42 : 0.62;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export class TileRenderer {
  tilesMesh: THREE.InstancedMesh;
  gridLinesMesh: THREE.LineSegments;
  readonly selectionRing: THREE.LineSegments;
  readonly hoverOutline: THREE.LineSegments;
  overlayMesh: THREE.Mesh | null = null;
  overlayMode: OverlayMode = 'none';
  overlayResources: OverlayResources | null = null;
  /** Indices of water tiles, in grid order — drives the water surface rebuild. */
  waterIndices: number[] = [];
  waterSurfaceMesh: THREE.InstancedMesh | null = null;
  private terrainMesh: THREE.Mesh | null = null;

  private readonly scene: THREE.Scene;
  private readonly canvas: HTMLCanvasElement;
  private grid: SpatialGrid;
  private readonly baseColors: THREE.Color[] = [];
  private hoverIndex: number | null = null;
  private surfaceHeights: number[] = [];

  constructor(
    scene: THREE.Scene,
    canvas: HTMLCanvasElement,
    grid: SpatialGrid,
  ) {
    this.scene = scene;
    this.canvas = canvas;
    this.grid = grid;
    this.tilesMesh = this.buildTilesMesh();
    this.gridLinesMesh = this.buildGridLines();
    this.selectionRing = this.buildSelectionRing();
    this.hoverOutline = this.buildHoverOutline();
    scene.add(
      this.tilesMesh,
      this.gridLinesMesh,
      this.selectionRing,
      this.hoverOutline,
    );
  }

  private buildTilesMesh(): THREE.InstancedMesh {
    const { width, height } = this.grid;
    const cx = width / 2;
    const cz = height / 2;
    const geometry = buildShadedBoxGeometry();
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, width * height);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.receiveShadow = true;
    // Retain the tile transforms as grid metadata; the continuous surface renders
    // and supplies picking IDs. Hide the slabs so they cannot occlude sloped ground.
    mesh.visible = false;
    material.colorWrite = false;
    material.depthWrite = false;

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    this.waterIndices = [];

    const topOf = (x: number, y: number): number => {
      const t = this.grid.get(x, y);
      return tileHeight(t, this.grid.getElevation(x, y));
    };

    this.grid.forEach((x, y, type, elevation) => {
      const index = this.grid.index(x, y);
      const h = tileHeight(type, elevation);
      pos.set(x - cx, h / 2, y - cz);
      scale.set(1, Math.max(h, 0.02), 1);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(index, matrix);

      // Per-instance: palette × jitter × baked AO (crevices next to taller neighbors).
      const jitter = 0.97 + hash2(x, y, this.grid.seed ^ 0x5bd1e995) * 0.06;
      let ao = 1;
      const neighborTop = Math.max(
        topOf(x + 1, y),
        topOf(x - 1, y),
        topOf(x, y + 1),
        topOf(x, y - 1),
      );
      if (neighborTop > h) ao = 1 - Math.min(0.45, (neighborTop - h) * 0.9);
      color
        .set(TERRAIN_PALETTE[type] ?? TILE_PALETTE[type])
        .multiplyScalar(jitter * ao);
      if (type === TILE_TYPES.WATER) color.multiplyScalar(0.78);
      this.baseColors[index] = color.clone();
      mesh.setColorAt(index, color);
      if (type === TILE_TYPES.WATER) this.waterIndices.push(index);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.disposeObject(this.terrainMesh);
    }
    this.terrainMesh = new THREE.Mesh(
      buildTerrainGeometry(this.grid, this.baseColors),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    this.surfaceHeights = [];
    const surfacePositions = this.terrainMesh.geometry.attributes.position;
    const ids: number[] = this.terrainMesh.geometry.userData.tileIndices;
    for (let i = 0; i < surfacePositions.count; i++) {
      const id = ids[Math.floor(i / 3)];
      this.surfaceHeights[id] = Math.max(
        this.surfaceHeights[id] ?? 0,
        surfacePositions.getY(i),
      );
    }
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
    this.buildWaterSurface();
    return mesh;
  }

  /** Translucent animated surface layer over deep water. */
  private buildWaterSurface(): void {
    if (this.waterSurfaceMesh) {
      this.scene.remove(this.waterSurfaceMesh);
      this.waterSurfaceMesh.geometry.dispose();
      (this.waterSurfaceMesh.material as THREE.Material).dispose();
      this.waterSurfaceMesh = null;
    }
    if (this.waterIndices.length === 0) return;
    const { width, height } = this.grid;
    const cx = width / 2;
    const cz = height / 2;
    const material = new THREE.MeshPhongMaterial({
      color: 0x398f9b,
      transparent: true,
      opacity: 0.9,
      shininess: 65,
      specular: 0x93c6c4,
      depthWrite: false,
    });
    // Shared world-space ripples cross tile boundaries; one uniform replaces
    // thousands of per-frame matrix uploads and avoids disconnected bobbing squares.
    const time = { value: 0 };
    material.userData.waterTime = time;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.waterTime = time;
      shader.vertexShader = 'varying vec2 waterWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nwaterWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xz;',
      );
      shader.fragmentShader =
        'uniform float waterTime;\nvarying vec2 waterWorld;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat ripple = sin(waterWorld.x * 2.4 + waterWorld.y * 1.7 + waterTime * .65) * sin(waterWorld.y * 3.1 - waterTime * .45);\ndiffuseColor.rgb *= .96 + .04 * ripple;',
      );
    };
    material.customProgramCacheKey = () => 'autopolis-continuous-water-v1';
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2),
      material,
      this.waterIndices.length,
    );
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const tint = new THREE.Color();
    this.waterIndices.forEach((index, slot) => {
      const x = index % width;
      const y = Math.floor(index / width);
      pos.set(x - cx, 0.085, y - cz);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(slot, matrix);
      tint.setScalar(1);
      mesh.setColorAt(slot, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.waterSurfaceMesh = mesh;
    this.scene.add(mesh);
  }

  private buildGridLines(): THREE.LineSegments {
    const { width, height } = this.grid;
    const cx = width / 2;
    const cz = height / 2;
    const pts: number[] = [];
    for (let x = 0; x <= width; x++) {
      pts.push(x - cx, 0.02, -cz, x - cx, 0.02, height - cz);
    }
    for (let y = 0; y <= height; y++) {
      pts.push(-cx, 0.02, y - cz, width - cx, 0.02, y - cz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    return new THREE.LineSegments(geo, mat);
  }

  private buildSelectionRing(): THREE.LineSegments {
    const geo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(1.02, 0.025, 1.02),
    );
    const mat = new THREE.LineBasicMaterial({ color: 0xffcf4d });
    const ring = new THREE.LineSegments(geo, mat);
    ring.visible = false;
    return ring;
  }

  private buildHoverOutline(): THREE.LineSegments {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.0, 0.02, 1.0));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
    });
    const outline = new THREE.LineSegments(geo, mat);
    outline.visible = false;
    return outline;
  }

  /** Raycast the visible surface and outline its authoritative tile footprint. */
  updateHover(
    raycaster: THREE.Raycaster,
    pointer: THREE.Vector2,
    camera: THREE.Camera,
  ): void {
    raycaster.setFromCamera(pointer, camera);
    const hits = this.terrainMesh
      ? raycaster.intersectObject(this.terrainMesh, false)
      : [];
    const index =
      hits.length > 0 && hits[0].faceIndex != null
        ? (this.terrainMesh!.geometry.userData.tileIndices[
            hits[0].faceIndex
          ] as number)
        : null;

    if (index === this.hoverIndex) return;
    this.hoverIndex = index;
    if (index !== null) {
      const { width, height } = this.grid;
      const x = index % width;
      const y = Math.floor(index / width);
      const h = tileHeight(this.grid.get(x, y), this.grid.getElevation(x, y));
      this.hoverOutline.position.set(
        x - width / 2,
        this.surfaceCeiling(index, h) + 0.025,
        y - height / 2,
      );
      this.hoverOutline.visible = true;
    } else {
      this.hoverOutline.visible = false;
    }
    if (this.tilesMesh.instanceColor)
      this.tilesMesh.instanceColor.needsUpdate = true;
    this.canvas.style.cursor = index !== null ? 'pointer' : 'default';
  }

  private surfaceCeiling(index: number, fallback: number): number {
    return this.surfaceHeights[index] ?? fallback;
  }

  clearHover(): void {
    this.hoverIndex = null;
    this.hoverOutline.visible = false;
  }

  /** Select the currently hovered tile; returns its description for dispatch. */
  selectHovered(): TileSelection | null {
    if (this.hoverIndex === null) return null;
    const { width, height } = this.grid;
    const x = this.hoverIndex % width;
    const y = Math.floor(this.hoverIndex / width);
    const type = this.grid.get(x, y);
    const elevation = this.grid.getElevation(x, y);

    this.selectionRing.position.set(
      x - width / 2,
      this.surfaceCeiling(this.hoverIndex, tileHeight(type, elevation)) + 0.03,
      y - height / 2,
    );
    this.selectionRing.visible = true;
    return { x, y, type, name: tileName(type), elevation };
  }

  /** Swap in a new authoritative grid — tiles, grid lines, and overlay rebuild. */
  replaceGrid(grid: SpatialGrid): void {
    this.clearHover();
    this.selectionRing.visible = false;
    this.scene.remove(this.tilesMesh, this.gridLinesMesh);
    this.disposeObject(this.tilesMesh);
    this.disposeObject(this.gridLinesMesh);
    this.grid = grid;
    this.tilesMesh = this.buildTilesMesh();
    this.gridLinesMesh = this.buildGridLines();
    this.scene.add(this.tilesMesh, this.gridLinesMesh);
    if (this.overlayMode !== 'none') {
      this.rebuildOverlay(this.overlayMode, this.overlayResources);
    }
  }

  /** Toggle the resource coverage overlay ('none' | 'power' | 'water'). */
  setOverlay(mode: OverlayMode, resources: OverlayResources | null): void {
    this.overlayMode = mode;
    this.overlayResources = resources;
    this.rebuildOverlay(mode, resources);
  }

  private rebuildOverlay(
    mode: OverlayMode,
    resources: OverlayResources | null,
  ): void {
    if (this.overlayMesh) {
      this.scene.remove(this.overlayMesh);
      this.disposeObject(this.overlayMesh);
      this.overlayMesh = null;
    }
    if (mode === 'none' || !resources) return;

    const data = mode === 'power' ? resources.power : resources.water;
    const geometry = this.terrainMesh!.geometry.clone();
    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;
    const color = new THREE.Color();
    const ids: number[] = geometry.userData.tileIndices;
    for (let i = 0; i < positions.count; i++) {
      const v = data[ids[Math.floor(i / 3)]] ?? 0;
      positions.setY(i, Math.max(0.095, positions.getY(i) + 0.012));
      color.setRGB(0.9 - 0.7 * v, 0.15 + 0.6 * v, 0.2 - 0.08 * v);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.overlayMesh = mesh;
    this.scene.add(mesh);
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const m of mats) m.dispose();
      }
    });
  }
}
