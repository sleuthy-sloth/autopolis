/**
 * Deterministic randomness. No Math.random() anywhere in the simulation core —
 * reproducibility is a hard requirement for server-authoritative tick state.
 */

/** Mulberry32 — tiny, fast, seedable PRNG returning [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic 2D integer hash → [0, 1). Avalanche-mixed so adjacent cells
 * (x, y) and (x+1, y) produce decorrelated values. Used for per-tile jitter,
 * sprinkles, and any per-cell noise that must be stable across runs.
 */
export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
