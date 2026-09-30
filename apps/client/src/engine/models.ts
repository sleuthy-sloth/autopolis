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
  | 'villa'
  | 'apartment'
  | 'broadleaf'
  | 'roadNS'
  | 'roadEW'
  | 'roadCross'
  | 'roadPlain'
  | 'railNS'
  | 'railEW'
  | 'railNE'
  | 'railNW'
  | 'railSE'
  | 'railSW'
  | 'railCross'
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

function colorize(
  geo: THREE.BufferGeometry,
  hex: string,
): THREE.BufferGeometry {
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
function box(
  w: number,
  h: number,
  d: number,
  color: string,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return colorize(g, color);
}

/** Cylinder sitting on y=0. */
function cyl(
  rt: number,
  rb: number,
  h: number,
  seg: number,
  color: string,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(0, h / 2, 0);
  return colorize(g, color);
}

/** Cone (n segments) sitting on y=0. */
function cone(
  r: number,
  h: number,
  seg: number,
  color: string,
): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(0, h / 2, 0);
  return colorize(g, color);
}

function merge(parts: Part[]): THREE.BufferGeometry {
  // Polyhedra are non-indexed; normalize primitive topology before merging.
  for (const part of parts) {
    if (!part.geo.attributes.color) colorize(part.geo, part.color);
  }
  const geometries = parts.map((p) =>
    p.geo.index ? p.geo.toNonIndexed() : p.geo,
  );
  const result = mergeGeometries(geometries, false);
  if (!result) throw new Error('mergeGeometries failed');
  for (const geo of new Set([...geometries, ...parts.map((p) => p.geo)]))
    geo.dispose();
  return result;
}

/** Small part placed at an offset (geometry local coords, y-up). */
function at(
  geo: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  geo.translate(x, y, z);
  return geo;
}

/** Facades face every street: windows and roof details remain visible from any orbit. */
function office(floors: number, wall: string): THREE.BufferGeometry {
  const parts: Part[] = [];
  const add = (geo: THREE.BufferGeometry) => parts.push({ geo, color: '' });
  const h = floors * 0.28;
  add(box(0.7, h, 0.7, wall));
  add(box(0.84, 0.045, 0.84, '#b7b8ad'));
  for (let f = 0; f < floors; f++) {
    for (const side of [-1, 1])
      for (const offset of [-0.23, 0, 0.23]) {
        add(
          at(
            box(0.15, 0.16, 0.012, '#426674'),
            offset,
            0.08 + f * 0.28,
            side * 0.356,
          ),
        );
        add(
          at(
            box(0.012, 0.16, 0.15, '#426674'),
            side * 0.356,
            0.08 + f * 0.28,
            offset,
          ),
        );
      }
    add(at(box(0.73, 0.025, 0.73, '#e4e2d6'), 0, (f + 1) * 0.28 - 0.025, 0));
  }
  add(at(box(0.77, 0.07, 0.77, '#61757b'), 0, h, 0));
  add(at(box(0.26, 0.1, 0.2, '#a0b0b0'), -0.12, h + 0.07, -0.12));
  add(at(box(0.32, 0.045, 0.15, '#d3ba85'), 0, 0.25, 0.43));
  return merge(parts);
}
function residence(villa: boolean): THREE.BufferGeometry {
  const parts: Part[] = [];
  const add = (geo: THREE.BufferGeometry) => parts.push({ geo, color: '' });
  const h = villa ? 0.65 : 0.48;
  add(box(0.68, h, 0.66, villa ? '#e5dfce' : '#d7c5aa'));
  add(box(0.82, 0.04, 0.8, '#b8b8a7'));
  // Two sloped planes make a gabled silhouette instead of a pyramid.
  for (const side of [-1, 1]) {
    const roof = box(0.45, 0.045, 0.8, villa ? '#657981' : '#976e58');
    roof.rotateZ((-side * Math.PI) / 5);
    add(at(roof, side * 0.17, h + 0.11, 0));
    for (const offset of [-0.21, 0.21]) {
      add(at(box(0.14, 0.17, 0.015, '#527985'), offset, 0.19, side * 0.337));
      add(at(box(0.015, 0.17, 0.14, '#527985'), side * 0.347, 0.19, offset));
    }
  }
  add(at(box(0.13, 0.29, 0.018, '#6b5848'), 0, 0.04, 0.34));
  add(at(box(0.3, 0.04, 0.16, '#d5d2bf'), 0, 0.015, 0.4));
  add(at(box(0.09, 0.3, 0.1, '#b0a296'), -0.2, h, -0.16));
  if (villa) add(at(box(0.22, 0.18, 0.28, '#d4cdb9'), 0.22, h - 0.1, -0.17));
  return merge(parts);
}
function industry(utility: boolean): THREE.BufferGeometry {
  const parts: Part[] = [];
  const add = (geo: THREE.BufferGeometry) => parts.push({ geo, color: '' });
  add(box(0.76, 0.43, 0.72, utility ? '#babdb0' : '#b9997d'));
  add(at(box(0.8, 0.07, 0.78, '#667776'), 0, 0.43, 0));
  for (const x of [-0.22, 0, 0.22])
    add(at(box(0.14, 0.13, 0.015, '#497580'), x, 0.22, 0.368));
  add(at(box(0.28, 0.24, 0.02, '#7d8b89'), 0.1, 0.025, 0.37));
  add(at(cyl(0.055, 0.08, 0.7, 12, '#8c8174'), -0.24, 0.5, -0.2));
  for (const y of [0.75, 0.9])
    add(at(cyl(0.06, 0.06, 0.035, 12, '#e0d5be'), -0.24, y, -0.2));
  add(
    at(
      cyl(
        utility ? 0.18 : 0.1,
        utility ? 0.25 : 0.1,
        utility ? 0.6 : 0.22,
        16,
        '#c4cec8',
      ),
      0.15,
      0.5,
      -0.12,
    ),
  );
  return merge(parts);
}
function foliage(broad: boolean): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: cyl(0.035, 0.055, 0.5, 8, '#7a6950'), color: '' },
  ];
  if (broad) {
    for (const [x, y, z, r, c] of [
      [0, 0.72, 0, 0.32, '#628b58'],
      [-0.18, 0.6, 0.06, 0.24, '#739862'],
      [0.16, 0.65, -0.09, 0.26, '#507d51'],
    ] as const) {
      parts.push({
        geo: at(colorize(new THREE.IcosahedronGeometry(r, 1), c), x, y, z),
        color: '',
      });
    }
  } else {
    for (const [y, r, h, c] of [
      [0.22, 0.32, 0.54, '#427464'],
      [0.48, 0.25, 0.48, '#508471'],
      [0.72, 0.17, 0.4, '#60937b'],
    ] as const)
      parts.push({ geo: at(cone(r, h, 10, c), 0, y, 0), color: '' });
  }
  return merge(parts);
}
/** Quarter-circle tracks join both branches at bends. */
function railBend(): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (const radius of [0.32, 0.68]) {
    const track = new THREE.TorusGeometry(radius, 0.014, 6, 16, Math.PI / 2);
    track
      .rotateZ(Math.PI / 2)
      .rotateX(Math.PI / 2)
      .translate(0.5, 0.035, -0.5);
    parts.push({ geo: colorize(track, '#8b9b99'), color: '' });
  }
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 10;
    const sleeper = box(0.55, 0.025, 0.065, '#887a65').rotateY(-angle);
    parts.push({
      geo: at(
        sleeper,
        0.5 + 0.5 * Math.cos(angle),
        0.002,
        -0.5 + 0.5 * Math.sin(angle),
      ),
      color: '',
    });
  }
  return merge(parts);
}
function street(cross: boolean, rail: boolean): THREE.BufferGeometry {
  const parts: Part[] = [];
  const add = (geo: THREE.BufferGeometry) => parts.push({ geo, color: '' });
  if (rail) {
    for (const x of [-0.18, 0.18])
      add(at(box(0.028, 0.035, 1, '#8b9b99'), x, 0.018, 0));
    for (const z of [-0.4, -0.2, 0, 0.2, 0.4])
      add(at(box(0.55, 0.025, 0.065, '#887a65'), 0, 0.002, z));
  } else {
    for (const side of [-1, 1]) {
      if (!cross) {
        add(at(box(0.15, 0.035, 1, '#c4c7b9'), side * 0.425, 0.005, 0));
        if (side === 1) {
          add(at(cyl(0.012, 0.018, 0.42, 6, '#526863'), 0.43, 0.04, -0.34));
          add(at(box(0.09, 0.025, 0.045, '#ebdfb2'), 0.39, 0.46, -0.34));
        } else {
          add(at(box(0.13, 0.025, 0.18, '#758568'), -0.425, 0.04, 0.25));
          add(at(cyl(0.015, 0.024, 0.16, 6, '#7a6950'), -0.425, 0.065, 0.25));
          add(
            at(
              colorize(new THREE.IcosahedronGeometry(0.1, 1), '#618657'),
              -0.425,
              0.24,
              0.25,
            ),
          );
        }
      }
      for (const z of [-0.34, 0.34])
        add(at(box(0.025, 0.008, 0.18, '#e5d9ab'), 0, 0.005, z));
      if (cross)
        for (const offset of [-0.16, -0.08, 0, 0.08, 0.16]) {
          add(
            at(box(0.04, 0.008, 0.12, '#e5e3d3'), offset, 0.008, side * 0.37),
          );
          add(
            at(box(0.12, 0.008, 0.04, '#e5e3d3'), side * 0.37, 0.008, offset),
          );
        }
    }
  }
  return merge(parts);
}

export function buildModelSet(): ModelSet {
  return {
    house: residence(false),
    villa: residence(true),
    apartment: office(3, '#d8cbbb'),
    shop: office(2, '#e0d4b8'),
    tower: office(6, '#a7bdc4'),
    factory: industry(false),
    powerplant: industry(true),
    watertower: merge([
      ...[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => ({
          geo: at(cyl(0.025, 0.035, 0.85, 8, '#788b8d'), x * 0.23, 0, z * 0.23),
          color: '',
        })),
      ),
      { geo: at(cyl(0.3, 0.3, 0.38, 16, '#d1e1df'), 0, 0.8, 0), color: '' },
      { geo: at(cone(0.32, 0.18, 16, '#587d89'), 0, 1.18, 0), color: '' },
      { geo: at(cyl(0.34, 0.34, 0.035, 16, '#8da9ac'), 0, 0.8, 0), color: '' },
    ]),
    tree: foliage(false),
    broadleaf: foliage(true),
    roadNS: street(false, false),
    roadEW: street(false, false).rotateY(Math.PI / 2),
    roadCross: street(true, false),
    roadPlain: box(1, 0.002, 1, '#596967'),
    railNS: street(false, true),
    railEW: street(false, true).rotateY(Math.PI / 2),
    railNE: railBend(),
    railNW: railBend().rotateY(Math.PI / 2),
    railSW: railBend().rotateY(Math.PI),
    railSE: railBend().rotateY(-Math.PI / 2),
    railCross: merge([
      { geo: street(false, true), color: '' },
      { geo: street(false, true).rotateY(Math.PI / 2), color: '' },
    ]),
    car: merge([
      { geo: box(0.66, 0.16, 0.38, '#ffffff'), color: '#ffffff' },
      {
        geo: at(box(0.3, 0.14, 0.32, '#222222'), 0.04, 0.2, 0),
        color: '#222222',
      },
      ...[-0.2, 0.2].flatMap((x) =>
        [-0.19, 0.19].map((z) => ({
          geo: at(
            colorize(
              new THREE.CylinderGeometry(0.065, 0.065, 0.04, 10).rotateX(
                Math.PI / 2,
              ),
              '#263330',
            ),
            x,
            0.065,
            z,
          ),
          color: '#263330',
        })),
      ),
      ...[-0.12, 0.12].map((z) => ({
        geo: at(box(0.012, 0.045, 0.055, '#f2e6b5'), 0.335, 0.09, z),
        color: '',
      })),
    ]),
    ship: merge([
      { geo: box(1.0, 0.22, 0.4, '#8a5a44'), color: '#8a5a44' },
      {
        geo: at(
          cone(0.3, 0.28, 4, '#8a5a44')
            .rotateX(Math.PI / 2)
            .rotateY(Math.PI / 4),
          0.55,
          0.12,
          0,
        ),
        color: '#8a5a44',
      },
      {
        geo: at(box(0.28, 0.24, 0.3, '#f0f0f0'), -0.2, 0.32, 0),
        color: '#f0f0f0',
      },
      {
        geo: at(cyl(0.02, 0.02, 0.5, 5, '#666666'), -0.05, 0.6, 0),
        color: '#666666',
      },
      {
        geo: at(cyl(0.05, 0.06, 0.18, 8, '#c0392b'), 0.1, 0.45, 0),
        color: '#c0392b',
      },
    ]),
    trainEngine: merge([
      { geo: box(0.34, 0.32, 0.34, '#e8e8e8'), color: '#e8e8e8' },
      {
        geo: at(box(0.46, 0.4, 0.34, '#c0392b'), -0.4, 0.32, 0),
        color: '#c0392b',
      },
      {
        geo: at(cyl(0.05, 0.06, 0.22, 8, '#333333'), -0.4, 0.68, 0.08),
        color: '#333333',
      },
      {
        geo: at(box(0.84, 0.1, 0.4, '#333333'), -0.22, 0.05, 0),
        color: '#333333',
      },
    ]),
    trainCar: merge([
      { geo: box(0.86, 0.34, 0.34, '#e8c15a'), color: '#e8c15a' },
      {
        geo: at(box(0.86, 0.1, 0.26, '#8a6d4b'), 0, 0.42, 0),
        color: '#8a6d4b',
      },
      { geo: at(box(0.9, 0.1, 0.4, '#333333'), 0, 0.05, 0), color: '#333333' },
    ]),
    person: merge([
      {
        geo: at(new THREE.CapsuleGeometry(0.13, 0.36, 4, 8), 0, 0.31, 0),
        color: '#3a7bd5',
      },
      {
        geo: at(new THREE.SphereGeometry(0.11, 8, 8), 0, 0.76, 0),
        color: '#e8b98a',
      },
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
