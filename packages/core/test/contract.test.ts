/**
 * SHARED SIMULATION CONTRACT — deterministic fixtures for TS ↔ Rust parity.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FIXTURE FORMAT (read this before touching the data — the Rust side depends
 * on every field below):
 *
 * The canonical fixture lives in `./contract.fixture.json`; the Rust test
 * consumes an identical copy at `rust/autopolis-core/tests/fixtures/
 * contract.json` (see `contract.rs`). Both are generated from THIS test file.
 *
 * Top-level shape:
 *   format          "autopolis-contract/v1" — bump on breaking changes
 *   hashAlgorithm   prose spec of the grid hash (see fnv1a32 below)
 *   world           { width, height } of every "case" grid (64×64)
 *   terrain         prose: DEFAULT_TERRAIN, biome DERIVED from seed (never
 *                   forced) — so the biome roll is part of the contract
 *   development     prose: CityDevelopment(seed).step(grid, tick) for
 *                   tick ∈ 1..=T on the terrain world
 *   cases[]         { seed, ticks, biome, hash, counts } — the core parity
 *                   matrix. `hash` is the fnv1a32 hash over the FULL grid
 *                   (types + elevations); `counts` maps tile code "0".."12"
 *                   → tile count (zero entries included for a stable shape).
 *   snapshots[]     { width, height, seed, ticks, biome, types, elevations }
 *                   — full 16×16 worlds at selected ticks. `types` is the
 *                   row-major (y * width + x) tile-code array; it is exactly
 *                   the WorldSnapshot.tiles matrix flattened (see
 *                   packages/core/src/snapshot.ts). `elevations` are the raw
 *                   f32 values as JS numbers.
 *
 * GRID HASH (fnv1a32) — must be reproduced bit-for-bit by the Rust port:
 *   h = 0x811c9dc5
 *   for each type code in row-major order:  h ^= code; h = (h * 0x01000193) >>> 0
 *   then for each elevation in row-major order: take its f32 bit pattern,
 *   feed the 4 bytes LITTLE-ENDIAN (b0 = least significant byte) through the
 *   same h ^= byte; h = (h * 0x01000193) >>> 0 step
 *   report h as an 8-char lowercase hex string.
 * (Rust: elevations = f32::to_bits().to_le_bytes().)
 *
 * REGENERATION: `GEN_CONTRACT=1 vitest run test/contract.test.ts` rewrites
 * both fixture copies. Commit the updated files together.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CityDevelopment, SpatialGrid, generateTerrain, gridToSnapshot } from '../src';
import contractFixtureJson from './contract.fixture.json';

export interface ContractCase {
  seed: number;
  ticks: number;
  biome: string;
  hash: string;
  counts: Record<string, number>;
}

export interface ContractSnapshot {
  width: number;
  height: number;
  seed: number;
  ticks: number;
  biome: string;
  types: number[];
  elevations: number[];
}

export interface ContractFixture {
  format: string;
  generatedBy: string;
  hashAlgorithm: string;
  world: { width: number; height: number };
  terrain: string;
  development: string;
  cases: ContractCase[];
  snapshots: ContractSnapshot[];
}

/** The pinned, deterministic fixture — exported for tooling and docs. */
export const contractFixture = contractFixtureJson as ContractFixture;

/**
 * FNV-1a 32-bit over the full grid: row-major type codes, then row-major
 * elevations as little-endian f32 bit patterns. See the header of this file.
 */
export function fnv1a32(types: Uint8Array, elevations: Float32Array): string {
  const dv = new DataView(new ArrayBuffer(4));
  let h = 0x811c9dc5;
  const step = (b: number): void => {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (let i = 0; i < types.length; i++) step(types[i]);
  for (let i = 0; i < elevations.length; i++) {
    dv.setFloat32(0, elevations[i], true);
    step(dv.getUint8(0));
    step(dv.getUint8(1));
    step(dv.getUint8(2));
    step(dv.getUint8(3));
  }
  return h.toString(16).padStart(8, '0');
}

/** Exactly the pipeline the fixture documents: terrain (derived biome) + ticks. */
export function runContractWorld(seed: number, ticks: number, width: number, height: number): SpatialGrid {
  const g = new SpatialGrid(width, height);
  generateTerrain(g, { seed }); // biome derived from seed — part of the contract
  const dev = new CityDevelopment(seed);
  for (let t = 1; t <= ticks; t++) dev.step(g, t);
  return g;
}

function fixtureDir(): string {
  return path.dirname(new URL(import.meta.url).pathname);
}

const rustFixturePath = path.join(
  fixtureDir(),
  '..',
  '..',
  '..',
  'rust',
  'autopolis-core',
  'tests',
  'fixtures',
  'contract.json',
);

describe('contract fixture — the pinned cross-language reference', () => {
  it('every grid case reproduces its pinned hash, biome, and tile counts', () => {
    expect(contractFixture.format).toBe('autopolis-contract/v1');
    expect(contractFixture.cases.length).toBeGreaterThanOrEqual(9);
    for (const c of contractFixture.cases) {
      const g = runContractWorld(c.seed, c.ticks, contractFixture.world.width, contractFixture.world.height);
      expect(g.biome, `biome for seed ${c.seed} tick ${c.ticks}`).toBe(c.biome);
      const hash = fnv1a32(g.types, g.elevations);
      expect(hash, `hash for seed ${c.seed} tick ${c.ticks}`).toBe(c.hash);
      const got: Record<string, number> = {};
      for (let code = 0; code <= 12; code++) got[String(code)] = g.countTypes()[code] ?? 0;
      expect(got, `counts for seed ${c.seed} tick ${c.ticks}`).toEqual(c.counts);
    }
  });

  it('deterministic: a second run of the same seed + ticks is byte-identical', () => {
    const a = runContractWorld(1337, 300, 64, 64);
    const b = runContractWorld(1337, 300, 64, 64);
    expect(a.equals(b)).toBe(true);
    expect(fnv1a32(a.types, a.elevations)).toBe(fnv1a32(b.types, b.elevations));
  });

  it('different seeds diverge (the contract matrix is not degenerate)', () => {
    const hashes = new Set(contractFixture.cases.map((c) => `${c.seed}/${c.hash}`));
    expect(contractFixture.cases.filter((c) => c.seed === 1)[0].hash).not.toBe(
      contractFixture.cases.filter((c) => c.seed === 4242)[0].hash,
    );
    expect(hashes.size).toBeGreaterThan(3);
  });

  it('snapshot worlds reproduce their pinned matrix + elevations AND match the WorldSnapshot contract', () => {
    expect(contractFixture.snapshots.length).toBeGreaterThanOrEqual(4);
    for (const s of contractFixture.snapshots) {
      const g = runContractWorld(s.seed, s.ticks, s.width, s.height);
      expect(g.biome, `snapshot biome seed ${s.seed} tick ${s.ticks}`).toBe(s.biome);
      expect(Array.from(g.types), `snapshot types seed ${s.seed} tick ${s.ticks}`).toEqual(s.types);
      const elev = Array.from(g.elevations);
      for (let i = 0; i < s.elevations.length; i++) {
        expect(Math.abs(elev[i] - s.elevations[i])).toBeLessThan(1e-6);
      }
      // The WorldSnapshot's tiles matrix flattened is exactly the types array.
      const snap = gridToSnapshot(g, s.ticks);
      expect(snap.tick).toBe(s.ticks);
      expect(snap.seed).toBe(s.seed);
      expect(snap.width).toBe(s.width);
      expect(snap.height).toBe(s.height);
      expect(snap.tiles.flat()).toEqual(s.types);
    }
  });
});

describe('contract fixture maintenance', () => {
  it.skipIf(!process.env.GEN_CONTRACT)(
    'GEN_CONTRACT=1 rewrites the TS fixture + the Rust golden file',
    () => {
      const json = JSON.stringify(makeFixture(), null, 2);
      fs.writeFileSync(path.join(fixtureDir(), 'contract.fixture.json'), json);
      fs.writeFileSync(rustFixturePath, json);
      expect(fs.existsSync(rustFixturePath)).toBe(true);
    },
  );
});

/**
 * Rebuilds the fixture object from the current implementation. Used by the
 * GEN_CONTRACT regeneration path above. Keep this in sync with the extracted
 * `runContractWorld` / `fnv1a32` helpers so regen always matches the tests.
 */
function makeFixture(): ContractFixture {
  const cases: ContractCase[] = [];
  for (const seed of [1, 1337, 4242]) {
    for (const ticks of [1, 60, 300]) {
      const g = runContractWorld(seed, ticks, 64, 64);
      const counts: Record<string, number> = {};
      for (let code = 0; code <= 12; code++) counts[String(code)] = g.countTypes()[code] ?? 0;
      cases.push({ seed, ticks, biome: g.biome, hash: fnv1a32(g.types, g.elevations), counts });
    }
  }
  const snapshots: ContractSnapshot[] = [];
  for (const seed of [7, 1337]) {
    for (const ticks of [1, 120]) {
      const g = runContractWorld(seed, ticks, 16, 16);
      snapshots.push({
        width: 16,
        height: 16,
        seed,
        ticks,
        biome: g.biome,
        types: Array.from(g.types),
        elevations: Array.from(g.elevations),
      });
    }
  }
  return {
    format: 'autopolis-contract/v1',
    generatedBy: 'packages/core/test/contract.test.ts',
    hashAlgorithm:
      'FNV-1a 32-bit: init 0x811c9dc5; bytes = row-major tile type codes (1 byte each), then row-major elevations as 4 little-endian f32-bits each; per byte: h ^= b; h = (h * 0x01000193) >>> 0; hex lowercase, 8 chars',
    world: { width: 64, height: 64 },
    terrain: 'DEFAULT_TERRAIN with biome derived from seed (no forced biome)',
    development: 'CityDevelopment(seed).step(grid, tick) for tick in 1..=T on the terrain world',
    cases,
    snapshots,
  };
}