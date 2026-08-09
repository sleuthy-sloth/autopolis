/**
 * CityScene — Three.js viewport for Autopolis.
 *
 * Performance strategy: the entire tile grid is ONE InstancedMesh (one draw call
 * for 4k+ tiles), with per-instance color and transforms. Hover/selection mutate
 * instance colors in place — no geometry churn, no rebuilds. Raycasting reuses a
 * single Raycaster against the same instanced mesh (instanceId → grid coords).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SpatialGrid, TILE_PALETTE, TILE_TYPES, TileType, hash2, tileName } from '@autopolis/core';
import { CityLife } from './entities';
import { buildStructures, tileHeight, type Structures } from './structures';

export interface TileSelection {
  x: number;
  y: number;
  type: TileType;
  name: string;
  elevation: number;
}

export interface SceneStats {
  fps: number;
  tiles: number;
}

/** Resource coverage visualization mode. */
export type OverlayMode = 'none' | 'power' | 'water';

export interface OverlayResources {
  power: number[];
  water: number[];
}

export interface SceneCallbacks {
  onSelection?: (selection: TileSelection | null) => void;
  onStats?: (stats: SceneStats) => void;
  /** Visible population/traffic counts after a grid rebuild. */
  onLife?: (life: { citizens: number; cars: number }) => void;
}

const MAX_DEVICE_PIXEL_RATIO = 2;
const HOVER_TINT = new THREE.Color(1.35, 1.3, 1.05);
const DRAG_THRESHOLD_PX = 5;

export class CityScene {
  private readonly container: HTMLElement;
  private grid: SpatialGrid;
  private readonly callbacks: SceneCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private tilesMesh: THREE.InstancedMesh;
  private readonly selectionRing: THREE.LineSegments;
  private gridLinesMesh: THREE.LineSegments;
  private structures: Structures;
  private cityLife: CityLife;
  private overlayMesh: THREE.InstancedMesh | null = null;
  private overlayMode: OverlayMode = 'none';
  private overlayResources: OverlayResources | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(-2, -2); // off-screen until first move
  private readonly baseColors: THREE.Color[] = [];
  private readonly timer = new THREE.Timer();
  private hoverIndex: number | null = null;
  private selection: TileSelection | null = null;
  private frames = 0;
  private fpsWindow = 0;
  private disposed = false;
  private dragStart: { x: number; y: number } | null = null;

  private readonly onPointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.dragStart = { x: e.clientX, y: e.clientY };
  };

  private readonly onClick = (e: MouseEvent): void => {
    // Ignore clicks that ended an orbit/zoom drag.
    if (this.dragStart) {
      const moved = Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y);
      if (moved > DRAG_THRESHOLD_PX) return;
    }
    this.selectHovered();
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.set(-2, -2);
    this.clearHover();
  };

  private readonly onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  constructor(container: HTMLElement, grid: SpatialGrid, callbacks: SceneCallbacks = {}) {
    this.container = container;
    this.grid = grid;
    this.callbacks = callbacks;
    const { width, height } = grid;
    const cx = width / 2;
    const cz = height / 2;
    const extent = Math.max(width, height);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DEVICE_PIXEL_RATIO));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x0b0e13, 1);
    container.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(0x0b0e13, extent * 1.6, extent * 3.2);

    // Camera — default isometric-style vantage, free orbit after that
    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.5,
      extent * 10,
    );
    const camDist = extent * 0.85;
    this.camera.position.set(camDist, camDist * 1.05, camDist);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = extent * 0.35;
    this.controls.maxDistance = extent * 6;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    // Lights
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2e3a2c, 1.15));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(camDist * 0.6, camDist * 1.4, camDist * 0.8);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    // World geometry
    this.tilesMesh = this.buildTilesMesh();
    this.gridLinesMesh = this.buildGridLines();
    this.selectionRing = this.buildSelectionRing();
    this.structures = buildStructures(this.grid);
    this.cityLife = new CityLife(this.scene, this.grid);
    // Debug/verification hook — lets the console sample live entity positions.
    (window as unknown as Record<string, unknown>).__autopolisLife = this.cityLife;
    this.scene.add(
      this.tilesMesh,
      this.gridLinesMesh,
      this.selectionRing,
      this.structures.body,
      this.structures.roof,
      this.structures.trees,
    );
    this.emitLife();

    this.bindEvents();
    this.renderer.setAnimationLoop(() => this.loop());
  }

  private buildTilesMesh(): THREE.InstancedMesh {
    const { width, height } = this.grid;
    const cx = width / 2;
    const cz = height / 2;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geometry, material, width * height);

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    this.grid.forEach((x, y, type, elevation) => {
      const index = this.grid.index(x, y);
      const h = tileHeight(type, elevation);
      pos.set(x - cx, h / 2, y - cz);
      scale.set(0.94, Math.max(h, 0.02), 0.94);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(index, matrix);

      const jitter = 0.88 + hash2(x, y, this.grid.seed ^ 0x5bd1e995) * 0.24;
      color.set(TILE_PALETTE[type]).multiplyScalar(jitter);
      this.baseColors[index] = color.clone();
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
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

  private bindEvents(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('click', this.onClick);
    el.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('resize', this.onResize);
  }

  private loop(): void {
    if (this.disposed) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.cityLife.update(dt);
    this.controls.update();
    this.updateHover();
    this.renderer.render(this.scene, this.camera);

    this.frames++;
    const elapsed = this.timer.getElapsed();
    if (elapsed - this.fpsWindow >= 0.5) {
      const fps = this.frames / (elapsed - this.fpsWindow);
      this.frames = 0;
      this.fpsWindow = elapsed;
      this.callbacks.onStats?.({ fps, tiles: this.grid.width * this.grid.height });
    }
  }

  private updateHover(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.tilesMesh, false);
    const index = hits.length > 0 ? (hits[0].instanceId ?? null) : null;

    if (index === this.hoverIndex) return;
    if (this.hoverIndex !== null) {
      this.tilesMesh.setColorAt(this.hoverIndex, this.baseColors[this.hoverIndex]);
    }
    this.hoverIndex = index;
    if (index !== null) {
      this.tilesMesh.setColorAt(index, this.baseColors[index].clone().multiply(HOVER_TINT));
    }
    if (this.tilesMesh.instanceColor) this.tilesMesh.instanceColor.needsUpdate = true;
    this.renderer.domElement.style.cursor = index !== null ? 'pointer' : 'default';
  }

  private clearHover(): void {
    if (this.hoverIndex !== null) {
      this.tilesMesh.setColorAt(this.hoverIndex, this.baseColors[this.hoverIndex]);
      if (this.tilesMesh.instanceColor) this.tilesMesh.instanceColor.needsUpdate = true;
      this.hoverIndex = null;
    }
  }

  private selectHovered(): void {
    if (this.hoverIndex === null) return;
    const { width, height } = this.grid;
    const x = this.hoverIndex % width;
    const y = Math.floor(this.hoverIndex / width);
    const type = this.grid.get(x, y);
    const elevation = this.grid.getElevation(x, y);

    this.selectionRing.position.set(x - width / 2, tileHeight(type, elevation) + 0.55, y - height / 2);
    this.selectionRing.visible = true;
    this.callbacks.onSelection?.({ x, y, type, name: tileName(type), elevation });
  }

  /**
   * Swap in a new authoritative grid (server state). Rebuilds tile geometry in
   * place — camera, controls, and lighting are untouched, so god-mode watching
   * is never interrupted by city updates.
   */
  replaceGrid(grid: SpatialGrid): void {
    this.grid = grid;
    this.clearHover();
    this.selection = null;
    this.selectionRing.visible = false;
    this.callbacks.onSelection?.(null);

    this.scene.remove(this.tilesMesh, this.gridLinesMesh);
    this.disposeObject(this.tilesMesh);
    this.disposeObject(this.gridLinesMesh);
    this.tilesMesh = this.buildTilesMesh();
    this.gridLinesMesh = this.buildGridLines();
    this.scene.add(this.tilesMesh, this.gridLinesMesh);

    // Rebuild the built environment + population choreography for the new grid.
    this.scene.remove(this.structures.body, this.structures.roof, this.structures.trees);
    this.disposeObject(this.structures.body);
    this.disposeObject(this.structures.roof);
    this.disposeObject(this.structures.trees);
    this.structures = buildStructures(this.grid);
    this.scene.add(this.structures.body, this.structures.roof, this.structures.trees);
    this.cityLife.rebuild(this.grid);
    this.emitLife();

    if (this.overlayMode !== 'none') {
      this.rebuildOverlay(this.overlayMode, this.overlayResources);
    }
  }

  private emitLife(): void {
    const life = this.cityLife.report();
    this.callbacks.onLife?.(life);
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

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('click', this.onClick);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);

    this.cityLife.dispose(this.scene);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.dispose();
      }
    });
    this.overlayMesh = null;
    this.renderer.dispose();
    if (el.parentElement === this.container) this.container.removeChild(el);
  }
}
