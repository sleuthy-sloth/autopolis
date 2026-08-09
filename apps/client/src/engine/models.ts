/**
 * models.ts — procedural low-poly models, GLTF-style.
 *
 * Every model is built from primitives (boxes, cones, cylinders, capsules),
 * colored per part via vertex colors, and merged into ONE BufferGeometry per
 * kind. That keeps the InstancedMesh fast path: a whole district of houses is
 * a single draw call, and per-instance tint still works (instance color
 * multiplies the vertex colors). Real GLTF assets can replace these later —
 * swap the builder for a loader and nothing else changes.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type ModelKind =
  | 'house'
  | 'shop'
  | 'tower'
  | 'factory'
  | 'powerplant'
  | 'watertower'
  | 'tree'
  | 'car'
  | 'ship'
  | 'trainEngine'
  | 'trainCar'
  | 'person';

export type ModelSet = Record<ModelKind, THREE.BufferGeometry>;

type Part = { geo: THREE.BufferGeometry; color: string };

function colorize(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const color = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Box sitting on y=0 (centered on x/z). */
function box(w: number, h: number, d: number, color: string): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return colorize(g, color);
}

/** Cylinder sitting on y=0. */
function cyl(rt: number, rb: number, h: number, seg: number, color: string): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(0, h / 2, 0);
  return colorize(g, color);
}

/** Cone (n segments) sitting on y=0. */
function cone(r: number, h: number, seg: number, color: string): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(0, h / 2, 0);
  return colorize(g, color);
}

function merge(parts: Part[]): THREE.BufferGeometry {
  const result = mergeGeometries(
    parts.map((p) => p.geo),
    false,
  );
  if (!result) throw new Error('mergeGeometries failed');
  return result;
}

/** Small part placed at an offset (geometry local coords, y-up). */
function at(geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  geo.translate(x, y, z);
  return geo;
}

export function buildModelSet(): ModelSet {
  return {
    house: merge([
      { geo: box(0.9, 0.55, 0.9, '#d9c9a3'), color: '#d9c9a3' },
      { geo: at(cone(0.74, 0.42, 4, '#b3563f').rotateY(Math.PI / 4), 0, 0.55, 0), color: '#b3563f' },
      { geo: at(box(0.16, 0.3, 0.06, '#6b4a2b'), 0, 0.12, 0.46), color: '#6b4a2b' },
      { geo: at(box(0.16, 0.16, 0.06, '#9ec7e8'), -0.22, 0.34, 0.46), color: '#9ec7e8' },
      { geo: at(box(0.16, 0.16, 0.06, '#9ec7e8'), 0.22, 0.34, 0.46), color: '#9ec7e8' },
    ]),
    shop: merge([
      { geo: box(0.9, 0.5, 0.9, '#e8c96a'), color: '#e8c96a' },
      { geo: box(1.02, 0.08, 1.02, '#8a6d4b'), color: '#8a6d4b' },
      { geo: at(box(0.62, 0.1, 0.18, '#c0392b'), 0, 0.62, 0.47), color: '#c0392b' },
      { geo: at(box(0.2, 0.34, 0.06, '#6b4a2b'), 0, 0.16, 0.46), color: '#6b4a2b' },
    ]),
    tower: merge([
      { geo: box(0.8, 1.6, 0.8, '#d9b45a'), color: '#d9b45a' },
      { geo: at(box(0.72, 0.3, 0.08, '#8a6d4b'), 0, 0.5, 0.41), color: '#8a6d4b' },
      { geo: at(box(0.72, 0.3, 0.08, '#8a6d4b'), 0, 1.0, 0.41), color: '#8a6d4b' },
      { geo: at(box(0.08, 0.3, 0.72, '#8a6d4b'), 0.41, 0.75, 0), color: '#8a6d4b' },
      { geo: at(cyl(0.03, 0.03, 0.4, 6, '#999999'), 0, 1.85, 0), color: '#999999' },
    ]),
    factory: merge([
      { geo: box(1.0, 0.5, 1.0, '#c98a5e'), color: '#c98a5e' },
      { geo: at(cone(0.45, 0.34, 4, '#8a6d4b').rotateY(Math.PI / 4), -0.22, 0.5, 0), color: '#8a6d4b' },
      { geo: at(cone(0.45, 0.34, 4, '#8a6d4b').rotateY(Math.PI / 4), 0.22, 0.5, 0), color: '#8a6d4b' },
      { geo: at(cyl(0.07, 0.09, 0.6, 8, '#7a4a3a'), 0.3, 0.5, 0.3), color: '#7a4a3a' },
    ]),
    powerplant: merge([
      { geo: box(0.9, 0.5, 0.9, '#a55eea'), color: '#a55eea' },
      { geo: at(cyl(0.2, 0.3, 0.75, 8, '#c8a8e8'), -0.2, 0.5, 0.15), color: '#c8a8e8' },
      { geo: at(cyl(0.06, 0.08, 0.7, 8, '#6b4a3a'), 0.28, 0.5, -0.25), color: '#6b4a3a' },
    ]),
    watertower: merge([
      { geo: at(box(0.08, 0.55, 0.08, '#8a8a8a'), -0.24, 0.27, -0.24), color: '#8a8a8a' },
      { geo: at(box(0.08, 0.55, 0.08, '#8a8a8a'), 0.24, 0.27, -0.24), color: '#8a8a8a' },
      { geo: at(box(0.08, 0.55, 0.08, '#8a8a8a'), -0.24, 0.27, 0.24), color: '#8a8a8a' },
      { geo: at(box(0.08, 0.55, 0.08, '#8a8a8a'), 0.24, 0.27, 0.24), color: '#8a8a8a' },
      { geo: at(cyl(0.34, 0.34, 0.38, 10, '#45aaf2'), 0, 0.82, 0), color: '#45aaf2' },
      { geo: at(cone(0.36, 0.22, 10, '#2e86de'), 0, 1.12, 0), color: '#2e86de' },
    ]),
    tree: merge([
      { geo: at(cyl(0.05, 0.07, 0.4, 5, '#6b4a2b'), 0, 0.2, 0), color: '#6b4a2b' },
      { geo: at(cone(0.36, 0.42, 6, '#3f7d3a'), 0, 0.6, 0), color: '#3f7d3a' },
      { geo: at(cone(0.28, 0.34, 6, '#4c8f42'), 0, 0.94, 0), color: '#4c8f42' },
    ]),
    car: merge([
      { geo: box(0.66, 0.16, 0.38, '#ffffff'), color: '#ffffff' },
      { geo: at(box(0.3, 0.14, 0.32, '#222222'), 0.04, 0.2, 0), color: '#222222' },
      { geo: at(box(0.66, 0.1, 0.1, '#111111'), 0, 0.05, 0.2), color: '#111111' },
      { geo: at(box(0.66, 0.1, 0.1, '#111111'), 0, 0.05, -0.2), color: '#111111' },
    ]),
    ship: merge([
      { geo: box(1.0, 0.22, 0.4, '#8a5a44'), color: '#8a5a44' },
      { geo: at(cone(0.3, 0.28, 4, '#8a5a44').rotateX(Math.PI / 2).rotateY(Math.PI / 4), 0.55, 0.12, 0), color: '#8a5a44' },
      { geo: at(box(0.28, 0.24, 0.3, '#f0f0f0'), -0.2, 0.32, 0), color: '#f0f0f0' },
      { geo: at(cyl(0.02, 0.02, 0.5, 5, '#666666'), -0.05, 0.6, 0), color: '#666666' },
      { geo: at(cyl(0.05, 0.06, 0.18, 8, '#c0392b'), 0.1, 0.45, 0), color: '#c0392b' },
    ]),
    trainEngine: merge([
      { geo: box(0.34, 0.32, 0.34, '#e8e8e8'), color: '#e8e8e8' },
      { geo: at(box(0.46, 0.4, 0.34, '#c0392b'), -0.4, 0.32, 0), color: '#c0392b' },
      { geo: at(cyl(0.05, 0.06, 0.22, 8, '#333333'), -0.4, 0.68, 0.08), color: '#333333' },
      { geo: at(box(0.84, 0.1, 0.4, '#333333'), -0.22, 0.05, 0), color: '#333333' },
    ]),
    trainCar: merge([
      { geo: box(0.86, 0.34, 0.34, '#e8c15a'), color: '#e8c15a' },
      { geo: at(box(0.86, 0.1, 0.26, '#8a6d4b'), 0, 0.42, 0), color: '#8a6d4b' },
      { geo: at(box(0.9, 0.1, 0.4, '#333333'), 0, 0.05, 0), color: '#333333' },
    ]),
    person: merge([
      { geo: at(new THREE.CapsuleGeometry(0.13, 0.36, 4, 8), 0, 0.5, 0), color: '#3a7bd5' },
      { geo: at(new THREE.SphereGeometry(0.11, 8, 8), 0, 0.95, 0), color: '#e8b98a' },
    ]),
  };
}

/** App-lifetime singleton — geometries are shared across scene instances. */
let cached: ModelSet | null = null;
export function modelSet(): ModelSet {
  if (!cached) cached = buildModelSet();
  return cached;
}

/** Shared vertex-colored material for every model instanced mesh. */
export function modelMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}
