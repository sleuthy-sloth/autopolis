/**
 * CityScene — Three.js viewport for Autopolis.
 *
 * Performance strategy: the entire tile grid is ONE InstancedMesh (one draw call
 * for 4k+ tiles), with per-instance color and transforms. Depth comes from a
 * baked per-face vertex shade (top lit, sides dark) multiplied by per-instance
 * ambient occlusion (crevices next to taller neighbors) — fully instanced, zero
 * per-frame cost. A real shadow map grounds buildings, cars, and people.
 *
 * CityScene wires three owned subsystems: TileRenderer (tiles + overlays +
 * selection/hover), WeatherSystem (sky, fog, lights, rain, water animation),
 * and InputHandler (pointer/raycast, click selection, resize).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SpatialGrid, type TileType } from '@autopolis/core';
import { CityLife } from './entities';
import { buildStructures, type Structures } from './structures';
import { TileRenderer } from './TileRenderer';
import { WeatherSystem } from './WeatherSystem';
import { InputHandler } from './InputHandler';

export type Weather = 'clear' | 'rain' | 'storm';

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
  onLife?: (life: { citizens: number; cars: number; ships: number; trains: number }) => void;
}

export { rainCount } from './WeatherSystem';

const MAX_DEVICE_PIXEL_RATIO = 2;

export class CityScene {
  private readonly container: HTMLElement;
  private grid: SpatialGrid;
  private readonly callbacks: SceneCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private structures: Structures;
  private cityLife: CityLife;
  private readonly tileRenderer: TileRenderer;
  private readonly weatherSystem: WeatherSystem;
  private readonly inputHandler: InputHandler;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly timer = new THREE.Timer();
  private selection: TileSelection | null = null;
  private frames = 0;
  private fpsWindow = 0;
  private disposed = false;

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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

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
    this.controls.minDistance = extent * 0.08;
    this.controls.maxDistance = extent * 6;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xdfe9ff, 0x2e3a2c, 1.15);
    this.scene.add(hemiLight);
    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sunLight.position.set(camDist * 0.6, camDist * 1.4, camDist * 0.8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const sh = sunLight.shadow.camera;
    const s = extent * 0.72;
    sh.left = -s;
    sh.right = s;
    sh.top = s;
    sh.bottom = -s;
    sh.near = 1;
    sh.far = extent * 4;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.03;
    this.scene.add(sunLight);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.16));

    // Sky — gradient background, fog, rain; weather tracks the visible state.
    this.weatherSystem = new WeatherSystem(this.scene, hemiLight, sunLight, extent, () => this.grid);

    // Postprocessing: subtle bloom + vignette-free tone mapping pass.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.14, 0.5, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // World geometry: tiles, grid lines, selection ring, hover outline, water.
    this.tileRenderer = new TileRenderer(this.scene, this.renderer.domElement, this.grid);
    this.structures = buildStructures(this.grid);
    this.cityLife = new CityLife(this.scene, this.grid);
    // Debug/verification hook — lets the console sample live entity positions.
    (window as unknown as Record<string, unknown>).__autopolisLife = this.cityLife;
    this.scene.add(...this.structures.meshes);
    this.emitLife();

    // Input: pointer/raycast hover, click selection, viewport resize.
    this.inputHandler = new InputHandler(container, this.renderer, this.camera, this.composer, {
      onSelect: () => this.selectHovered(),
      onPointerLeave: () => this.tileRenderer.clearHover(),
    });

    this.renderer.setAnimationLoop(() => this.loop());
  }

  /** Change the global weather: sky, fog, lights, rain. */
  setWeather(weather: Weather): void {
    this.weatherSystem.setWeather(weather);
  }

  private loop(): void {
    if (this.disposed) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const elapsed = this.timer.getElapsed();
    this.cityLife.update(dt);
    this.controls.update();
    this.tileRenderer.updateHover(this.inputHandler.raycaster, this.inputHandler.pointer, this.camera);
    this.weatherSystem.animateWater(elapsed, this.tileRenderer);
    this.weatherSystem.update(dt);
    this.composer.render();

    this.frames++;
    if (elapsed - this.fpsWindow >= 0.5) {
      const fps = this.frames / (elapsed - this.fpsWindow);
      this.frames = 0;
      this.fpsWindow = elapsed;
      this.callbacks.onStats?.({ fps, tiles: this.grid.width * this.grid.height });
    }
  }

  private selectHovered(): void {
    const selection = this.tileRenderer.selectHovered();
    if (selection) this.callbacks.onSelection?.(selection);
  }

  /**
   * Swap in a new authoritative grid (server state). Rebuilds tile geometry in
   * place — camera, controls, and lighting are untouched, so god-mode watching
   * is never interrupted by city updates.
   */
  replaceGrid(grid: SpatialGrid): void {
    this.grid = grid;
    this.tileRenderer.replaceGrid(grid);
    this.selection = null;
    this.callbacks.onSelection?.(null);

    // Rebuild the built environment + population choreography for the new grid.
    for (const mesh of this.structures.meshes) {
      this.scene.remove(mesh);
      this.disposeObject(mesh);
    }
    this.structures = buildStructures(this.grid);
    this.scene.add(...this.structures.meshes);
    this.cityLife.rebuild(this.grid);
    this.emitLife();
  }

  private emitLife(): void {
    const life = this.cityLife.report();
    this.callbacks.onLife?.(life);
  }

  /** Toggle the resource coverage overlay ('none' | 'power' | 'water'). */
  setOverlay(mode: OverlayMode, resources: OverlayResources | null): void {
    this.tileRenderer.setOverlay(mode, resources);
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
    this.inputHandler.dispose();

    this.cityLife.dispose(this.scene);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.dispose();
      }
    });
    this.weatherSystem.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}