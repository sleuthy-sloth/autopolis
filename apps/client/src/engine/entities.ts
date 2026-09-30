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
import { terrainHeightAt } from './terrain';
import { modelMaterial, modelSet, type ModelKind } from './models';

/**
 * Tunables for the population/traffic simulation. Defaults match the classic
 * tuned values; every numeric value can be overridden at runtime through the
 * localStorage key `autopolis.perf.<key>` (e.g. `autopolis.perf.maxCitizens=200`)
 * to A/B performance without rebuilding.
 */
export interface PerfConfig {
  maxCitizens: number;
  maxCars: number;
  maxShips: number;
  maxTrains: number;
  spawnsPerFrame: number;
  /** Max A* path computations resolved per frame (arrivals + spawns share it). */
  pathsPerFrame: number;
  /** Frames a computed path stays valid in the cache (0 disables caching). */
  pathCacheFrames: number;
}

const DEFAULT_PERF_CONFIG: PerfConfig = {
  maxCitizens: 400,
  maxCars: 60,
  maxShips: 10,
  maxTrains: 3,
  spawnsPerFrame: 12,
  pathsPerFrame: 8,
  pathCacheFrames: 180,
};

function perfOverrides(): Partial<PerfConfig> {
  const out: Partial<PerfConfig> = {};
  if (typeof localStorage === 'undefined') return out;
  try {
    for (const key of Object.keys(DEFAULT_PERF_CONFIG) as Array<keyof PerfConfig>) {
      const raw = localStorage.getItem(`autopolis.perf.${key}`);
      if (raw === null) continue;
      const v = Number(raw);
      if (Number.isFinite(v) && v >= 0) out[key] = Math.floor(v);
    }
  } catch {
    // localStorage blocked (private mode / sandbox) — keep defaults.
  }
  if (out.pathsPerFrame !== undefined && out.pathsPerFrame < 1) out.pathsPerFrame = 1;
  return out;
}

/** Active performance config: defaults, plus any `autopolis.perf.*` overrides. */
export const PERF_CONFIG: PerfConfig = { ...DEFAULT_PERF_CONFIG, ...perfOverrides() };

const CAR_TINTS = ['#d64541', '#3a7bd5', '#f5f5f5', '#3c3c3c', '#f0c040', '#6fae4f', '#c8a2c8'];

type Role = 'citizen' | 'car' | 'ship';
type PendingJob = Role | 'train';
type RepathRequest = { role: Role; walkerId: number; from: GridPoint; candidates: GridPoint[] };
type SpawnRequest = { role: Role | 'train'; from: GridPoint; to: GridPoint };

interface Walker {
  path: GridPoint[];
  seg: number;
  t: number;
  speed: number;
  dwell: number;
  dwellT: number;
  phase: number;
  /** Set while a fresh path is being resolved by the budgeted pathfinder. */
  awaitingPath: boolean;
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
  // Per-frame A* budget + path cache (see PERF_CONFIG.pathsPerFrame/pathCacheFrames).
  private frame = 0;
  private budgetUsed = 0;
  private readonly pathCache = new Map<string, { path: GridPoint[] | null; frame: number }>();
  private pathQueue: RepathRequest[] = [];
  private spawnQueue: SpawnRequest[] = [];

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
      citizen: make('person', PERF_CONFIG.maxCitizens),
      car: make('car', PERF_CONFIG.maxCars),
      ship: make('ship', PERF_CONFIG.maxShips),
      trainEngine: make('trainEngine', PERF_CONFIG.maxTrains),
      trainCar: make('trainCar', PERF_CONFIG.maxTrains * 2),
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
    this.budgets.citizens = Math.min(Math.floor(population / 5), PERF_CONFIG.maxCitizens);
    this.budgets.cars = Math.min(Math.floor(this.tiles.roads.length / 4), PERF_CONFIG.maxCars);
    this.budgets.ships = Math.min(Math.floor(this.tiles.waterEdge.length / 40), PERF_CONFIG.maxShips);
    this.budgets.trains = Math.min(Math.floor(this.tiles.rails.length / 25), PERF_CONFIG.maxTrains);

    // The grid changed: cached paths and in-flight requests are stale.
    this.pathCache.clear();
    this.pathQueue = [];
    this.spawnQueue = [];
    for (const list of [this.citizens, this.cars, this.ships]) {
      for (const w of list) w.awaitingPath = false;
    }

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
      this.hideAll(this.meshOf.citizen, PERF_CONFIG.maxCitizens);
      this.hideAll(this.meshOf.car, PERF_CONFIG.maxCars);
      this.hideAll(this.meshOf.ship, PERF_CONFIG.maxShips);
      this.hideAll(this.meshOf.trainEngine, PERF_CONFIG.maxTrains);
      this.hideAll(this.meshOf.trainCar, PERF_CONFIG.maxTrains * 2);
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
    this.frame++;
    this.budgetUsed = 0;

    // Spawn pending population/traffic; every path lookup shares the same
    // per-frame A* budget (cached results cost nothing).
    for (let s = 0; s < PERF_CONFIG.spawnsPerFrame && this.pending.length > 0; s++) {
      const job = this.pending.shift()!;
      if (job === 'citizen') this.spawnCitizen();
      else if (job === 'car') this.spawnCar();
      else if (job === 'ship') this.spawnShip();
      else this.spawnTrain();
    }
    // Spawns deferred earlier because the frame budget was exhausted.
    for (let s = 0; s < PERF_CONFIG.spawnsPerFrame && this.spawnQueue.length > 0 && this.budgetUsed < PERF_CONFIG.pathsPerFrame; s++) {
      const req = this.spawnQueue.shift()!;
      this.requestSpawn(req.role, req.from, req.to);
    }

    const dtClamped = Math.min(dt, 0.1);
    this.stepWalkers(this.citizens, this.meshOf.citizen, dtClamped, 'citizen');
    this.stepWalkers(this.cars, this.meshOf.car, dtClamped, 'car');
    this.stepWalkers(this.ships, this.meshOf.ship, dtClamped, 'ship');
    this.stepTrains(dtClamped);

    // Walkers that arrived this frame enqueued repath requests above; drain
    // them within the same budget so trips resume with at most a frame's pause.
    while (this.pathQueue.length > 0 && this.budgetUsed < PERF_CONFIG.pathsPerFrame) {
      this.processRepath(this.pathQueue.shift()!);
    }
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
    if (this.citizens.length >= PERF_CONFIG.maxCitizens) return;
    const home = this.pick(this.tiles.residential) ?? this.pickAnyLand();
    if (!home) return;
    const goal = this.pick(this.tiles.commercial) ?? this.pick(this.tiles.industrial) ?? home;
    this.requestSpawn('citizen', home, goal);
  }

  private spawnCar(): void {
    if (this.cars.length >= PERF_CONFIG.maxCars || this.tiles.roads.length < 2) return;
    const start = this.pick(this.tiles.roads)!;
    this.requestSpawn('car', start, this.pick(this.tiles.roads)!);
  }

  private spawnShip(): void {
    if (this.ships.length >= PERF_CONFIG.maxShips || this.tiles.waterEdge.length < 2) return;
    const start = this.pick(this.tiles.waterEdge)!;
    this.requestSpawn('ship', start, this.pick(this.tiles.waterEdge)!);
  }

  private spawnTrain(): void {
    if (this.trains.length >= PERF_CONFIG.maxTrains || this.tiles.rails.length < 4) return;
    const start = this.pick(this.tiles.rails)!;
    this.requestSpawn('train', start, this.pick(this.tiles.rails)!);
  }

  /** Path lookup: cache first; otherwise budgeted A*; `undefined` = defer. */
  private pathFor(role: Role | 'train', from: GridPoint, to: GridPoint): GridPoint[] | null | undefined {
    const key = `${role}|${from.x},${from.y}>${to.x},${to.y}`;
    const entry = this.pathCache.get(key);
    if (entry && this.frame - entry.frame <= PERF_CONFIG.pathCacheFrames) return entry.path;
    if (this.budgetUsed >= PERF_CONFIG.pathsPerFrame) return undefined;
    this.budgetUsed++;
    const path = this.computePath(role, from, to);
    this.cachePath(key, path);
    return path;
  }

  private computePath(role: Role | 'train', from: GridPoint, to: GridPoint): GridPoint[] | null {
    const grid = this.grid!;
    const result =
      role === 'car'
        ? findRoadPath(grid, from, to)
        : role === 'ship'
          ? findWaterPath(grid, from, to)
          : role === 'train'
            ? findRailPath(grid, from, to)
            : findTerrainPath(grid, from, to);
    return result.found && result.path.length >= 2 ? result.path : null;
  }

  private cachePath(key: string, path: GridPoint[] | null): void {
    this.pathCache.set(key, { path, frame: this.frame });
    if (this.pathCache.size > 4096) {
      const cutoff = this.frame - PERF_CONFIG.pathCacheFrames;
      for (const [k, v] of this.pathCache) {
        if (v.frame < cutoff) this.pathCache.delete(k);
      }
    }
  }

  /** Route a spawn through the path budget, deferring when it's exhausted. */
  private requestSpawn(role: Role | 'train', from: GridPoint, to: GridPoint): void {
    const path = this.pathFor(role, from, to);
    if (path === undefined) {
      this.spawnQueue.push({ role, from, to });
      return;
    }
    if (path) this.spawnWithPath(role, path);
  }

  private spawnWithPath(role: Role | 'train', path: GridPoint[]): void {
    if (role === 'train') {
      if (this.trains.length >= PERF_CONFIG.maxTrains) return;
      this.trains.push({
        path,
        dist: 0,
        total: pathLength(path),
        speed: 3 + this.rng() * 1.2,
        dwell: 4 + this.rng() * 4,
        dwellT: 4, // depart immediately
      });
      return;
    }
    const list = role === 'citizen' ? this.citizens : role === 'car' ? this.cars : this.ships;
    const mesh = this.meshOf[role];
    const cap = role === 'citizen' ? PERF_CONFIG.maxCitizens : role === 'car' ? PERF_CONFIG.maxCars : PERF_CONFIG.maxShips;
    if (list.length >= cap) return;
    const speed = role === 'citizen' ? 1.4 : role === 'car' ? 5.5 : 2.8;
    const dwell = role === 'citizen' ? 4 : role === 'car' ? 3 : 7;
    const walker = this.makeWalkerFromPath(path, speed, dwell);
    this.tint(mesh, list.length, role === 'car' ? 0.9 : 0.85, role === 'car' ? 1.1 : 1.15);
    list.push(walker);
  }

  private makeWalkerFromPath(path: GridPoint[], speed: number, dwell: number): Walker {
    return {
      path,
      seg: 0,
      t: 0,
      speed: speed * (0.8 + this.rng() * 0.4),
      dwell: dwell * (0.6 + this.rng() * 0.8),
      dwellT: dwell, // start moving immediately; dwell applies after arrival
      phase: this.rng() * Math.PI * 2,
      awaitingPath: false,
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

  /** Up to 4 distinct candidate destinations, mirroring the old attempt loop. */
  private pickDestinations(role: Role): GridPoint[] {
    const picks: GridPoint[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      const next = this.nextDestination(role);
      if (next && !picks.some((c) => c.x === next.x && c.y === next.y)) picks.push(next);
    }
    return picks;
  }

  private walkerAt(role: Role, id: number): Walker {
    if (role === 'citizen') return this.citizens[id];
    if (role === 'car') return this.cars[id];
    return this.ships[id];
  }

  private setWalker(role: Role, id: number, w: Walker): void {
    if (role === 'citizen') this.citizens[id] = w;
    else if (role === 'car') this.cars[id] = w;
    else this.ships[id] = w;
  }

  /** A walker finished its trip: pick destinations and resolve a fresh path.
   *  Cache hits are free; budgeted A* fills the gaps; when the frame budget is
   *  exhausted the walker parks and the request goes through the queue. */
  private repathAfterArrival(role: Role, walkerId: number): Walker | null {
    const candidates = this.pickDestinations(role);
    return candidates.length === 0 ? null : this.resolveCandidates(role, walkerId, candidates);
  }

  private resolveCandidates(role: Role, walkerId: number, candidates: GridPoint[]): Walker | null {
    const w = this.walkerAt(role, walkerId);
    const from = w.path[w.path.length - 1];
    for (const to of candidates) {
      const path = this.pathFor(role, from, to);
      if (path === undefined) {
        // Frame budget exhausted — park the walker and resume from this candidate.
        w.awaitingPath = true;
        this.pathQueue.push({ role, walkerId, from, candidates: candidates.slice(candidates.indexOf(to)) });
        return null;
      }
      if (path) return this.makeWalkerFromPath(path, w.speed, w.dwell);
    }
    return null; // no route to any candidate — dwell & try again later
  }

  private processRepath(req: RepathRequest): void {
    const w = this.walkerAt(req.role, req.walkerId);
    w.awaitingPath = false;
    const fresh = this.resolveCandidates(req.role, req.walkerId, req.candidates);
    if (fresh) this.setWalker(req.role, req.walkerId, fresh);
  }

  private stepWalkers(walkers: Walker[], mesh: THREE.InstancedMesh, dt: number, role: Role): void {
    const grid = this.grid!;
    const cx = grid.width / 2;
    const cz = grid.height / 2;
    const bodyH = role === 'ship' ? 0.025 : 0.01;
    const bobAmp = role === 'citizen' ? 0.03 : role === 'ship' ? 0.02 : 0;
    const scale = role === 'citizen' ? 0.45 : role === 'car' ? 0.65 : 1;

    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      if (w.awaitingPath) {
        // Waiting on the budgeted pathfinder for a new trip — stay at the
        // destination instead of recomputing A* right now.
        this.place(mesh, i, w.path[w.path.length - 1], w, bodyH, cx, cz, 0, scale);
        continue;
      }
      if (w.dwellT < w.dwell) {
        w.dwellT += dt;
        this.place(mesh, i, w.path[w.seg], w, bodyH, cx, cz, 0, scale);
        continue;
      }
      if (w.seg >= w.path.length - 1) {
        w.dwellT = 0;
        const at = w.path[w.path.length - 1];
        const fresh = this.repathAfterArrival(role, i);
        if (fresh) {
          walkers[i] = fresh;
          this.place(mesh, i, fresh.path[0], fresh, bodyH, cx, cz, 0, scale);
        } else {
          // Parked: no route (dwell will retry later) or path still resolving.
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
    this.dummy.position.set(at.x - cx, railH + 0.035, at.y - cz);
    this.dummy.rotation.set(0, -at.angle, 0);
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
    const ground = terrainHeightAt(grid, at.x, at.y);
    const bob = bobAmp * Math.sin(w.phase + performance.now() / 240);
    this.dummy.position.set(at.x - cx, ground + bodyH + bob, at.y - cz);
    const a = w.path[w.seg];
    const b = w.path[Math.min(w.seg + 1, w.path.length - 1)];
    this.dummy.rotation.set(0, -Math.atan2(b.y - a.y, b.x - a.x), 0);
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
