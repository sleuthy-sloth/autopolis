/**
 * entities.ts — CityLife: the visible population & traffic.
 *
 * The server remains the source of truth for CITY STATE (grid, stats, resources);
 * this is a deterministic client-side visualization layer. Citizen count scales
 * with population (server stats: residential × 4), cars scale with road network
 * size. Every trip is a real A* route — citizens use terrain pathfinding, cars
 * use the road graph — so the same seed reproduces the same city choreography.
 *
 * All entities are InstancedMesh (1 draw call each). Spawning is staggered
 * (~10/frame) so a city-state update never hitches the render loop.
 */
import * as THREE from 'three';
import {
  SpatialGrid,
  TILE_TYPES,
  findRoadPath,
  findTerrainPath,
  mulberry32,
  type GridPoint,
} from '@autopolis/core';
import { tileHeight } from './structures';

const MAX_CITIZENS = 400;
const MAX_CARS = 60;
const SPAWNS_PER_FRAME = 12;

const SKIN_TONES = ['#e8b98a', '#d9a06b', '#c68b59', '#f0c8a0', '#b07c4f', '#dbb184'];
const CAR_COLORS = ['#d64541', '#3a7bd5', '#f5f5f5', '#3c3c3c', '#f0c040', '#6fae4f'];

interface Walker {
  path: GridPoint[];
  seg: number;
  t: number; // 0..1 progress along current segment
  speed: number;
  dwell: number;
  dwellT: number;
  phase: number;
}

type Role = 'citizen' | 'car';

export class CityLife {
  readonly citizenMesh: THREE.InstancedMesh;
  readonly carMesh: THREE.InstancedMesh;

  private grid: SpatialGrid | null = null;
  private rng: () => number = () => 0;
  private citizens: Walker[] = [];
  private cars: Walker[] = [];
  private pending: Array<{ role: Role }> = [];
  private citizenColors: THREE.Color[] = [];
  private carColors: THREE.Color[] = [];
  private tiles: Record<string, GridPoint[]> = {};
  private dummy = new THREE.Object3D();
  private citizenBudget = 0;
  private carBudget = 0;

  /** Visible population/traffic targets for the HUD. */
  report(): { citizens: number; cars: number } {
    return { citizens: this.citizenBudget, cars: this.carBudget };
  }

  /** Debug hook: world-grid positions of the first few citizens (motion proof). */
  debugPositions(): Array<{ x: number; y: number }> {
    return this.citizens.slice(0, 4).map((w) => {
      const a = w.path[w.seg];
      const b = w.path[Math.min(w.seg + 1, w.path.length - 1)];
      return { x: a.x + (b.x - a.x) * w.t, y: a.y + (b.y - a.y) * w.t };
    });
  }

  constructor(scene: THREE.Scene, grid: SpatialGrid) {
    const citizenGeo = new THREE.CapsuleGeometry(0.16, 0.46, 4, 8);
    const carGeo = new THREE.BoxGeometry(0.7, 0.28, 0.42);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.citizenMesh = new THREE.InstancedMesh(citizenGeo, mat, MAX_CITIZENS);
    this.carMesh = new THREE.InstancedMesh(carGeo, mat, MAX_CARS);
    scene.add(this.citizenMesh, this.carMesh);
    this.rebuild(grid);
  }

  /** Re-seed the population choreography from a (possibly new) grid. */
  rebuild(grid: SpatialGrid): void {
    this.grid = grid;
    this.rng = mulberry32(grid.seed ^ 0xa5a5a5a5);
    this.citizens = [];
    this.cars = [];
    this.pending = [];
    this.citizenColors = [];
    this.carColors = [];

    // Cache district/road tile lists.
    this.tiles = { residential: [], commercial: [], industrial: [], roads: [] };
    grid.forEach((x, y, type) => {
      if (type === TILE_TYPES.RESIDENTIAL) this.tiles.residential.push({ x, y });
      else if (type === TILE_TYPES.COMMERCIAL) this.tiles.commercial.push({ x, y });
      else if (type === TILE_TYPES.INDUSTRIAL) this.tiles.industrial.push({ x, y });
      else if (type === TILE_TYPES.ROAD) this.tiles.roads.push({ x, y });
    });

    const population = this.tiles.residential.length * 4;
    this.citizenBudget = Math.min(Math.floor(population / 5), MAX_CITIZENS);
    this.carBudget = Math.min(Math.floor(this.tiles.roads.length / 4), MAX_CARS);
    for (let i = 0; i < this.citizenBudget; i++) this.pending.push({ role: 'citizen' });
    for (let i = 0; i < this.carBudget; i++) this.pending.push({ role: 'car' });

    // Pre-allocate instance colors; unused slots get zero-scale matrices.
    for (let i = 0; i < MAX_CITIZENS; i++) {
      const c = new THREE.Color(SKIN_TONES[Math.floor(this.rng() * SKIN_TONES.length)]);
      this.citizenColors.push(c);
      this.citizenMesh.setColorAt(i, c);
    }
    for (let i = 0; i < MAX_CARS; i++) {
      const c = new THREE.Color(CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)]);
      this.carColors.push(c);
      this.carMesh.setColorAt(i, c);
    }
    this.hideAll(this.citizenMesh, MAX_CITIZENS);
    this.hideAll(this.carMesh, MAX_CARS);
  }

  /** Advance the simulation; spawns pending entities progressively. */
  update(dt: number): void {
    if (!this.grid) return;
    for (let s = 0; s < SPAWNS_PER_FRAME && this.pending.length > 0; s++) {
      const job = this.pending.shift()!;
      if (job.role === 'citizen') this.spawnCitizen();
      else this.spawnCar();
    }
    const dtClamped = Math.min(dt, 0.1);
    this.stepWalkers(this.citizens, this.citizenMesh, dtClamped, 'citizen');
    this.stepWalkers(this.cars, this.carMesh, dtClamped, 'car');
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.citizenMesh, this.carMesh);
    this.citizenMesh.geometry.dispose();
    this.carMesh.geometry.dispose();
    (this.citizenMesh.material as THREE.Material).dispose();
    (this.carMesh.material as THREE.Material).dispose();
  }

  // ── internals ────────────────────────────────────────────────────────────

  private pick(list: GridPoint[]): GridPoint | null {
    if (list.length === 0) return null;
    return list[Math.floor(this.rng() * list.length)];
  }

  private spawnCitizen(): void {
    const grid = this.grid!;
    if (this.citizens.length >= MAX_CITIZENS) return;
    const home = this.pick(this.tiles.residential) ?? this.pickAnyLand();
    if (!home) return;
    const walker = this.makeWalker(grid, home, this.citizenDestination(), 1.4, 4);
    if (!walker) return;
    this.citizens.push(walker);
  }

  private spawnCar(): void {
    const grid = this.grid!;
    if (this.cars.length >= MAX_CARS) return;
    if (this.tiles.roads.length < 2) return;
    const start = this.pick(this.tiles.roads)!;
    const walker = this.makeWalker(grid, start, this.pick(this.tiles.roads)!, 5.5, 3, 'car');
    if (!walker) return;
    this.cars.push(walker);
  }

  private citizenDestination(): GridPoint {
    return (
      this.pick(this.tiles.commercial) ??
      this.pick(this.tiles.industrial) ??
      this.pick(this.tiles.residential) ??
      { x: 0, y: 0 }
    );
  }

  private pickAnyLand(): GridPoint | null {
    const grid = this.grid!;
    for (let attempt = 0; attempt < 64; attempt++) {
      const x = Math.floor(this.rng() * grid.width);
      const y = Math.floor(this.rng() * grid.height);
      if (grid.get(x, y) !== TILE_TYPES.WATER) return { x, y };
    }
    return null;
  }

  private makeWalker(
    grid: SpatialGrid,
    start: GridPoint,
    goal: GridPoint,
    speed: number,
    dwell: number,
    role: Role = 'citizen',
  ): Walker | null {
    const result = role === 'car' ? findRoadPath(grid, start, goal) : findTerrainPath(grid, start, goal);
    if (!result.found || result.path.length < 2) return null;
    return {
      path: result.path,
      seg: 0,
      t: 0,
      speed: speed * (0.8 + this.rng() * 0.4),
      dwell: dwell * (0.6 + this.rng() * 0.8),
      dwellT: dwell, // start moving immediately; dwell applies after arrival
      phase: this.rng() * Math.PI * 2,
    };
  }

  private stepWalkers(
    walkers: Walker[],
    mesh: THREE.InstancedMesh,
    dt: number,
    role: Role,
  ): void {
    const grid = this.grid!;
    const cx = grid.width / 2;
    const cz = grid.height / 2;
    const dummy = this.dummy;
    const bodyH = role === 'car' ? 0.14 : 0.45;
    const bobAmp = role === 'car' ? 0 : 0.04;

    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      if (w.dwellT < w.dwell) {
        w.dwellT += dt;
        this.place(dummy, mesh, i, w.path[w.seg], w, bodyH, cx, cz, 0);
        continue;
      }
      // Arrived at the end of the path → head somewhere new (or rest and retry).
      if (w.seg >= w.path.length - 1) {
        w.dwellT = 0;
        const at = w.path[w.path.length - 1];
        const next =
          role === 'car'
            ? this.pick(this.tiles.roads)
            : this.pick(this.tiles.commercial) ?? this.pick(this.tiles.industrial);
        const fresh = next ? this.makeWalker(grid, at, next, w.speed, w.dwell, role) : null;
        if (fresh) {
          walkers[i] = fresh;
          this.place(dummy, mesh, i, fresh.path[0], fresh, bodyH, cx, cz, 0);
        } else {
          this.place(dummy, mesh, i, at, w, bodyH, cx, cz, 0);
        }
        continue;
      }
      const a = w.path[w.seg];
      const b = w.path[w.seg + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      w.t += (dt * w.speed) / segLen;
      if (w.t >= 1) {
        w.seg++;
        w.t = 0;
        if (w.seg >= w.path.length - 1) {
          this.place(dummy, mesh, i, w.path[w.path.length - 1], w, bodyH, cx, cz, 0);
          continue; // arrival branch picks it up next frame
        }
      }
      const ax = w.path[w.seg];
      const bx = w.path[w.seg + 1];
      const px = ax.x + (bx.x - ax.x) * w.t;
      const py = ax.y + (bx.y - ax.y) * w.t;
      this.place(dummy, mesh, i, { x: px, y: py }, w, bodyH, cx, cz, bobAmp);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private place(
    dummy: THREE.Object3D,
    mesh: THREE.InstancedMesh,
    index: number,
    at: GridPoint,
    w: Walker,
    bodyH: number,
    cx: number,
    cz: number,
    bobAmp: number,
  ): void {
    const grid = this.grid!;
    const tx = Math.round(at.x);
    const ty = Math.round(at.y);
    const ground = tileHeight(grid.get(tx, ty), grid.getElevation(tx, ty));
    const bob = bobAmp * Math.sin(w.phase + performance.now() / 240);
    dummy.position.set(at.x - cx, ground + bodyH + bob, at.y - cz);
    const a = w.path[w.seg];
    const b = w.path[Math.min(w.seg + 1, w.path.length - 1)];
    dummy.rotation.set(0, Math.atan2(b.y - a.y, b.x - a.x), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  private hideAll(mesh: THREE.InstancedMesh, count: number): void {
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, m);
    mesh.instanceMatrix.needsUpdate = true;
  }
}
