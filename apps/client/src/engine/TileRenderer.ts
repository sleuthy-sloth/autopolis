/**
 * TileRenderer — owns the instanced tile grid, the grid-line overlay, the
 * resource-coverage overlay, and the tile selection ring + hover outline.
 *
 * The entire tile grid is ONE InstancedMesh (one draw call for 4k+ tiles) with
 * per-instance color and transforms. Depth comes from a baked per-face vertex
 * shade (top lit, sides dark) multiplied by per-instance ambient occlusion
 * (crevices next to taller neighbors) — fully instanced, zero per-frame cost.
 */
import * as THREE from 'three';
import { SpatialGrid, TILE_PALETTE, TILE_TYPES, hash2, tileName } from '@autopolis/core';
import { tileHeight } from './structures';
import type { OverlayMode, OverlayResources, TileSelection } from './CityScene';

const HOVER_TINT = new THREE.Color(1.35, 1.3, 1.05);

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
  overlayMesh: THREE.InstancedMesh | null = null;
  overlayMode: OverlayMode = 'none';
  overlayResources: OverlayResources | null = null;
  /** Indices of water tiles, in grid order — drives the water surface rebuild. */
  waterIndices: number[] = [];
  waterSurfaceMesh: THREE.InstancedMesh | null = null;

  private readonly scene: THREE.Scene;
  private readonly canvas: HTMLCanvasElement;
  private grid: SpatialGrid;
  private readonly baseColors: THREE.Color[] = [];
  private hoverIndex: number | null = null;

  constructor(scene: THREE.Scene, canvas: HTMLCanvasElement, grid: SpatialGrid) {
    this.scene = scene;
    this.canvas = canvas;
    this.grid = grid;
    this.tilesMesh = this.buildTilesMesh();
    this.gridLinesMesh = this.buildGridLines();
    this.selectionRing = this.buildSelectionRing();
    this.hoverOutline = this.buildHoverOutline();
    scene.add(this.tilesMesh, this.gridLinesMesh, this.selectionRing, this.hoverOutline);
  }

  private buildTilesMesh(): THREE.InstancedMesh {
    const { width, height } = this.grid;
    const cx = width / 2;
    const cz = height / 2;
    const geometry = buildShadedBoxGeometry();
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    const mesh = new THREE.InstancedMesh(geometry, material, width * height);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.receiveShadow = true;

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
      scale.set(0.94, Math.max(h, 0.02), 0.94);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(index, matrix);

      // Per-instance: palette × jitter × baked AO (crevices next to taller neighbors).
      const jitter = 0.88 + hash2(x, y, this.grid.seed ^ 0x5bd1e995) * 0.24;
      let ao = 1;
      const neighborTop = Math.max(topOf(x + 1, y), topOf(x - 1, y), topOf(x, y + 1), topOf(x, y - 1));
      if (neighborTop > h) ao = 1 - Math.min(0.45, (neighborTop - h) * 0.9);
      color.set(TILE_PALETTE[type]).multiplyScalar(jitter * ao);
      if (type === TILE_TYPES.WATER) color.multiplyScalar(0.78);
      this.baseColors[index] = color.clone();
      mesh.setColorAt(index, color);
      if (type === TILE_TYPES.WATER) this.waterIndices.push(index);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
      color: 0x5fb8e8,
      transparent: true,
      opacity: 0.82,
      shininess: 90,
      specular: 0x88aacc,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.02, 0.9), material, this.waterIndices.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
      tint.setScalar(0.85 + hash2(x, y, 0x77aa) * 0.3);
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
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 });
    return new THREE.LineSegments(geo, mat);
  }

  private buildSelectionRing(): THREE.LineSegments {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.08, 1.08, 1.08));
    const mat = new THREE.LineBasicMaterial({ color: 0xffcf4d });
    const ring = new THREE.LineSegments(geo, mat);
    ring.visible = false;
    return ring;
  }

  private buildHoverOutline(): THREE.LineSegments {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.0, 1.0, 1.0));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    const outline = new THREE.LineSegments(geo, mat);
    outline.visible = false;
    return outline;
  }

  /** Raycast hover — tint the hovered tile and show the outline. */
  updateHover(raycaster: THREE.Raycaster, pointer: THREE.Vector2, camera: THREE.Camera): void {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(this.tilesMesh, false);
    const index = hits.length > 0 ? (hits[0].instanceId ?? null) : null;

    if (index === this.hoverIndex) return;
    if (this.hoverIndex !== null) {
      this.tilesMesh.setColorAt(this.hoverIndex, this.baseColors[this.hoverIndex]);
    }
    this.hoverIndex = index;
    if (index !== null) {
      this.tilesMesh.setColorAt(index, this.baseColors[index].clone().multiply(HOVER_TINT));
      const { width, height } = this.grid;
      const x = index % width;
      const y = Math.floor(index / width);
      const h = tileHeight(this.grid.get(x, y), this.grid.getElevation(x, y));
      this.hoverOutline.position.set(x - width / 2, h + 0.52, y - height / 2);
      this.hoverOutline.visible = true;
    } else {
      this.hoverOutline.visible = false;
    }
    if (this.tilesMesh.instanceColor) this.tilesMesh.instanceColor.needsUpdate = true;
    this.canvas.style.cursor = index !== null ? 'pointer' : 'default';
  }

  clearHover(): void {
    if (this.hoverIndex !== null) {
      this.tilesMesh.setColorAt(this.hoverIndex, this.baseColors[this.hoverIndex]);
      if (this.tilesMesh.instanceColor) this.tilesMesh.instanceColor.needsUpdate = true;
      this.hoverIndex = null;
    }
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

    this.selectionRing.position.set(x - width / 2, tileHeight(type, elevation) + 0.55, y - height / 2);
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

  private rebuildOverlay(mode: OverlayMode, resources: OverlayResources | null): void {
    if (this.overlayMesh) {
      this.scene.remove(this.overlayMesh);
      this.disposeObject(this.overlayMesh);
      this.overlayMesh = null;
    }
    if (mode === 'none' || !resources) return;

    const { width, height } = this.grid;
    const cx = width / 2;
    const cz = height / 2;
    const data = mode === 'power' ? resources.power : resources.water;

    const geometry = new THREE.BoxGeometry(0.94, 0.02, 0.94);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, width * height);
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const quat = new THREE.Quaternion();
    const color = new THREE.Color();

    this.grid.forEach((x, y, type, elevation) => {
      const index = this.grid.index(x, y);
      const v = data[index] ?? 0;
      const h = tileHeight(type, elevation);
      pos.set(x - cx, h + 0.02, y - cz);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(index, matrix);
      // red (unserviced) → green (covered)
      color.setRGB(0.9 - 0.7 * v, 0.15 + 0.6 * v, 0.2 - 0.08 * v);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.overlayMesh = mesh;
    this.scene.add(mesh);
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.dispose();
      }
    });
  }
}