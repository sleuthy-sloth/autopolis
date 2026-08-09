/**
 * entities.ts — CityLife: the visible population, traffic, shipping & rail.
 *
 * Server state stays authoritative; this is a deterministic client-side layer
 * seeded from the world seed. Every entity is a low-poly model (see models.ts)
 * in an InstancedMesh — a draw call per fleet, not per entity. Trips are real
 * A* routes: citizens walk terrain, cars drive roads, ships sail water, trains
 * run rails. Ships appear whenever the map has water; trains whenever rails
 * exist (the city lays them around tick 150).
 */
import * as THREE from 'three';
import {
  SpatialGrid,
  TILE_TYPES,
  findRailPath,
  findRoadPath,
  findTerrainPath,
  findWaterPath,
  mulberry32,
  type GridPoint,
} from '@autopolis/core';
import { tileHeight } from './structures';
import { modelMaterial, modelSet, type ModelKind } from './models';

const MAX_CITIZENS = 400;
const MAX_CARS = 60;
const MAX_SHIPS = 10;
const MAX_TRAINS = 3;
const SPAWNS_PER_FRAME = 12;

const CAR_TINTS = ['#d64541', '#3a7bd5', '#f5f5f5', '#3c3c3c', '#f0c040', '#6fae4f', '#c8a2c8'];

type Role = 'citizen' | 'car' | 'ship';
type PendingJob = Role | 'train';

interface Walker {
  path: GridPoint[];
  seg: number;
  t: number;
  speed: number;
  dwell: number;
  dwellT: number;
  phase: number;
}

interface Train {
  path: GridPoint[];
  dist: number;
  total: number;
  speed: number;
  dwell: number;
  dwellT: number;
}

function pathLength(path: GridPoint[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
  }
  return total;
}

/** Position + heading at a distance along a path (used for trains). */
function pointAt(path: GridPoint[], dist: number): { x: number; y: number; angle: number } {
  let d = Math.max(0, dist);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= len) {
      const t = len === 0 ? 0 : d / len;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    d -= len;
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

export class CityLife {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly meshOf: Record<Role | 'trainEngine' | 'trainCar', THREE.InstancedMesh>;

  private grid: SpatialGrid | null = null;
  private rng: () => number = () => 0;
  private citizens: Walker[] = [];
  private cars: Walker[] = [];
  private ships: Walker[] = [];
  private trains: Train[] = [];
  private pending: PendingJob[] = [];
  private tiles: Record<string, GridPoint[]> = {};
  private dummy = new THREE.Object3D();
  private budgets = { citizens: 0, cars: 0, ships: 0, trains: 0 };

  /** Visible population/traffic/shipping/rail targets for the HUD. */
  report(): { citizens: number; cars: number; ships: number; trains: number } {
    return { ...this.budgets };
  }

  /** Debug hook: world-grid positions of the first few citizens + ships (motion proof). */
  debugPositions(): { citizens: Array<{ x: number; y: number }>; ships: Array<{ x: number; y: number }> } {
    const sample = (list: Walker[]): Array<{ x: number; y: number }> =>
      list.slice(0, 4).map((w) => {
        const a = w.path[w.seg];
        const b = w.path[Math.min(w.seg + 1, w.path.length - 1)];
        return { x: a.x + (b.x - a.x) * w.t, y: a.y + (b.y - a.y) * w.t };
      });
    return { citizens: sample(this.citizens), ships: sample(this.ships) };
  }

  constructor(scene: THREE.Scene, grid: SpatialGrid) {
    const models = modelSet();
    const material = modelMaterial();
    const make = (kind: ModelKind, count: number): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(models[kind], material, count);
      mesh.castShadow = true;
      this.meshes.push(mesh);
      scene.add(mesh);
      return mesh;
    };
    this.meshOf = {
      citizen: make('person', MAX_CITIZENS),
      car: make('car', MAX_CARS),
      ship: make('ship', MAX_SHIPS),
      trainEngine: make('trainEngine', MAX_TRAINS),
      trainCar: make('trainCar', MAX_TRAINS * 2),
    };
    this.rebuild(grid);
  }

  /** Re-seed the population choreography from a (possibly new) grid. */
  rebuild(grid: SpatialGrid): void {
    const sameSeed = this.grid !== null && this.grid.seed === grid.seed;
    this.grid = grid;
    this.rng = mulberry32(grid.seed ^ 0xa5a5a5a5);

    // Cache district / road / rail / coastal-water tile lists.
    this.tiles = { residential: [], commercial: [], industrial: [], roads: [], rails: [], waterEdge: [] };
    grid.forEach((x, y, type) => {
      if (type === TILE_TYPES.RESIDENTIAL) this.tiles.residential.push({ x, y });
      else if (type === TILE_TYPES.COMMERCIAL) this.tiles.commercial.push({ x, y });
      else if (type === TILE_TYPES.INDUSTRIAL) this.tiles.industrial.push({ x, y });
      else if (type === TILE_TYPES.ROAD) this.tiles.roads.push({ x, y });
      else if (type === TILE_TYPES.RAIL) this.tiles.rails.push({ x, y });
      else if (
        type === TILE_TYPES.WATER &&
        (grid.get(x + 1, y) !== TILE_TYPES.WATER ||
          grid.get(x - 1, y) !== TILE_TYPES.WATER ||
          grid.get(x, y + 1) !== TILE_TYPES.WATER ||
          grid.get(x, y - 1) !== TILE_TYPES.WATER)
      ) {
        this.tiles.waterEdge.push({ x, y });
      }
    });

    const population = this.tiles.residential.length * 4;
    this.budgets.citizens = Math.min(Math.floor(population / 5), MAX_CITIZENS);
    this.budgets.cars = Math.min(Math.floor(this.tiles.roads.length / 4), MAX_CARS);
    this.budgets.ships = Math.min(Math.floor(this.tiles.waterEdge.length / 40), MAX_SHIPS);
    this.budgets.trains = Math.min(Math.floor(this.tiles.rails.length / 25), MAX_TRAINS);

    if (!sameSeed) {
      // Brand-new world: full reseed.
      this.citizens = [];
      this.cars = [];
      this.ships = [];
      this.trains = [];
      this.pending = [];
      for (let i = 0; i < this.budgets.citizens; i++) this.pending.push('citizen');
      for (let i = 0; i < this.budgets.cars; i++) this.pending.push('car');
      for (let i = 0; i < this.budgets.ships; i++) this.pending.push('ship');
      for (let i = 0; i < this.budgets.trains; i++) this.pending.push('train');
      this.hideAll(this.meshOf.citizen, MAX_CITIZENS);
      this.hideAll(this.meshOf.car, MAX_CARS);
      this.hideAll(this.meshOf.ship, MAX_SHIPS);
      this.hideAll(this.meshOf.trainEngine, MAX_TRAINS);
      this.hideAll(this.meshOf.trainCar, MAX_TRAINS * 2);
    } else {
      // City grew: keep existing entities walking, top up to the new budgets.
      this.pending = [];
      for (let i = this.citizens.length; i < this.budgets.citizens; i++) this.pending.push('citizen');
      for (let i = this.cars.length; i < this.budgets.cars; i++) this.pending.push('car');
      for (let i = this.ships.length; i < this.budgets.ships; i++) this.pending.push('ship');
      for (let i = this.trains.length; i < this.budgets.trains; i++) this.pending.push('train');
    }
  }

  /** Advance the simulation; spawns pending entities progressively. */
  update(dt: number): void {
    if (!this.grid) return;
    for (let s = 0; s < SPAWNS_PER_FRAME && this.pending.length > 0; s++) {
      const job = this.pending.shift()!;
      if (job === 'citizen') this.spawnCitizen();
      else if (job === 'car') this.spawnCar();
      else if (job === 'ship') this.spawnShip();
      else this.spawnTrain();
    }
    const dtClamped = Math.min(dt, 0.1);
    this.stepWalkers(this.citizens, this.meshOf.citizen, dtClamped, 'citizen');
    this.stepWalkers(this.cars, this.meshOf.car, dtClamped, 'car');
    this.stepWalkers(this.ships, this.meshOf.ship, dtClamped, 'ship');
    this.stepTrains(dtClamped);
  }

  dispose(scene: THREE.Scene): void {
    for (const mesh of this.meshes) scene.remove(mesh);
    // Shared model geometry/material are app-lifetime singletons — not disposed here.
  }

  // ── spawning ─────────────────────────────────────────────────────────────

  private pick(list: GridPoint[]): GridPoint | null {
    if (list.length === 0) return null;
    return list[Math.floor(this.rng() * list.length)];
  }

  private spawnCitizen(): void {
    if (this.citizens.length >= MAX_CITIZENS) return;
    const home = this.pick(this.tiles.residential) ?? this.pickAnyLand();
    if (!home) return;
    const goal = this.pick(this.tiles.commercial) ?? this.pick(this.tiles.industrial) ?? home;
    const walker = this.makeWalker(home, goal, 1.4, 4, 'citizen');
    if (walker) {
      this.tint(this.meshOf.citizen, this.citizens.length, 0.85, 1.15);
      this.citizens.push(walker);
    }
  }

  private spawnCar(): void {
    if (this.cars.length >= MAX_CARS || this.tiles.roads.length < 2) return;
    const start = this.pick(this.tiles.roads)!;
    const walker = this.makeWalker(start, this.pick(this.tiles.roads)!, 5.5, 3, 'car');
    if (walker) {
      this.tint(this.meshOf.car, this.cars.length, 0.9, 1.1);
      this.cars.push(walker);
    }
  }

  private spawnShip(): void {
    if (this.ships.length >= MAX_SHIPS || this.tiles.waterEdge.length < 2) return;
    const start = this.pick(this.tiles.waterEdge)!;
    const walker = this.makeWalker(start, this.pick(this.tiles.waterEdge)!, 2.8, 7, 'ship');
    if (walker) {
      this.tint(this.meshOf.ship, this.ships.length, 0.85, 1.15);
      this.ships.push(walker);
    }
  }

  private spawnTrain(): void {
    if (this.trains.length >= MAX_TRAINS || this.tiles.rails.length < 4) return;
    const start = this.pick(this.tiles.rails)!;
    const goal = this.pick(this.tiles.rails)!;
    const result = findRailPath(this.grid!, start, goal);
    if (!result.found || result.path.length < 2) return;
    this.trains.push({
      path: result.path,
      dist: 0,
      total: pathLength(result.path),
      speed: 3 + this.rng() * 1.2,
      dwell: 4 + this.rng() * 4,
      dwellT: 4, // depart immediately
    });
  }

  private makeWalker(start: GridPoint, goal: GridPoint, speed: number, dwell: number, role: Role): Walker | null {
    const grid = this.grid!;
    const result =
      role === 'car'
        ? findRoadPath(grid, start, goal)
        : role === 'ship'
          ? findWaterPath(grid, start, goal)
          : findTerrainPath(grid, start, goal);
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

  private pickAnyLand(): GridPoint | null {
    const grid = this.grid!;
    for (let attempt = 0; attempt < 64; attempt++) {
      const x = Math.floor(this.rng() * grid.width);
      const y = Math.floor(this.rng() * grid.height);
      if (grid.get(x, y) !== TILE_TYPES.WATER) return { x, y };
    }
    return null;
  }

  // ── movement ─────────────────────────────────────────────────────────────

  private nextDestination(role: Role): GridPoint | null {
    if (role === 'car') return this.pick(this.tiles.roads);
    if (role === 'ship') return this.pick(this.tiles.waterEdge);
    return this.pick(this.tiles.commercial) ?? this.pick(this.tiles.industrial);
  }

  private stepWalkers(walkers: Walker[], mesh: THREE.InstancedMesh, dt: number, role: Role): void {
    const grid = this.grid!;
    const cx = grid.width / 2;
    const cz = grid.height / 2;
    const bodyH = role === 'car' ? 0.22 : role === 'ship' ? 0.18 : 0.55;
    const bobAmp = role === 'citizen' ? 0.03 : role === 'ship' ? 0.02 : 0;
    const scale = role === 'citizen' ? 0.85 : 1;

    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      if (w.dwellT < w.dwell) {
        w.dwellT += dt;
        this.place(mesh, i, w.path[w.seg], w, bodyH, cx, cz, 0, scale);
        continue;
      }
      if (w.seg >= w.path.length - 1) {
        w.dwellT = 0;
        const at = w.path[w.path.length - 1];
        let fresh: Walker | null = null;
        for (let attempt = 0; attempt < 4 && !fresh; attempt++) {
          const next = this.nextDestination(role);
          if (next) fresh = this.makeWalker(at, next, w.speed, w.dwell, role);
        }
        if (fresh) {
          walkers[i] = fresh;
          this.place(mesh, i, fresh.path[0], fresh, bodyH, cx, cz, 0, scale);
        } else {
          this.place(mesh, i, at, w, bodyH, cx, cz, 0, scale);
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
          this.place(mesh, i, w.path[w.path.length - 1], w, bodyH, cx, cz, 0, scale);
          continue;
        }
      }
      const ax = w.path[w.seg];
      const bx = w.path[w.seg + 1];
      const px = ax.x + (bx.x - ax.x) * w.t;
      const py = ax.y + (bx.y - ax.y) * w.t;
      this.place(mesh, i, { x: px, y: py }, w, bodyH, cx, cz, bobAmp, scale);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Trains run by distance along a rail path; cars trail the engine. */
  private stepTrains(dt: number): void {
    const grid = this.grid!;
    const cx = grid.width / 2;
    const cz = grid.height / 2;
    const railH = tileHeight(TILE_TYPES.RAIL, 0);
    const engineMesh = this.meshOf.trainEngine;
    const carMesh = this.meshOf.trainCar;

    for (let i = 0; i < this.trains.length; i++) {
      const tr = this.trains[i];
      if (tr.dwellT < tr.dwell) {
        tr.dwellT += dt;
      } else {
        tr.dist += tr.speed * dt;
        if (tr.dist >= tr.total) {
          tr.path.reverse();
          tr.dist = 0;
          tr.total = pathLength(tr.path);
          tr.dwellT = 0;
        }
      }
      const head = pointAt(tr.path, tr.dist);
      this.placeTrain(engineMesh, i, head, railH, cx, cz);
      for (let c = 0; c < 2; c++) {
        const carDist = Math.max(0, tr.dist - (c + 1) * 1.5);
        const at = pointAt(tr.path, carDist);
        this.placeTrain(carMesh, i * 2 + c, at, railH, cx, cz);
      }
    }
    engineMesh.instanceMatrix.needsUpdate = true;
    carMesh.instanceMatrix.needsUpdate = true;
  }

  private placeTrain(
    mesh: THREE.InstancedMesh,
    index: number,
    at: { x: number; y: number; angle: number },
    railH: number,
    cx: number,
    cz: number,
  ): void {
    this.dummy.position.set(at.x - cx, railH + 0.22, at.y - cz);
    this.dummy.rotation.set(0, at.angle, 0);
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private place(
    mesh: THREE.InstancedMesh,
    index: number,
    at: GridPoint,
    w: Walker,
    bodyH: number,
    cx: number,
    cz: number,
    bobAmp: number,
    scale: number,
  ): void {
    const grid = this.grid!;
    const tx = Math.round(at.x);
    const ty = Math.round(at.y);
    const ground = tileHeight(grid.get(tx, ty), grid.getElevation(tx, ty));
    const bob = bobAmp * Math.sin(w.phase + performance.now() / 240);
    this.dummy.position.set(at.x - cx, ground + bodyH + bob, at.y - cz);
    const a = w.path[w.seg];
    const b = w.path[Math.min(w.seg + 1, w.path.length - 1)];
    this.dummy.rotation.set(0, Math.atan2(b.y - a.y, b.x - a.x), 0);
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private tint(mesh: THREE.InstancedMesh, index: number, min: number, max: number): void {
    const c = new THREE.Color(
      mesh === this.meshOf.car
        ? CAR_TINTS[Math.floor(this.rng() * CAR_TINTS.length)]
        : '#ffffff',
    );
    const v = min + this.rng() * (max - min);
    mesh.setColorAt(index, c.multiplyScalar(v));
  }

  private hideAll(mesh: THREE.InstancedMesh, count: number): void {
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, m);
    mesh.instanceMatrix.needsUpdate = true;
  }
}
