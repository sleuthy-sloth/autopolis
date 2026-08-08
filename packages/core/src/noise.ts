/**
 * Dependency-free value noise + fractal Brownian motion.
 * Deterministic: any (x, y, seed) triple always yields the same value.
 */
import { hash2 } from './rng';

const PERIOD = 256; // lattice wrap period — noise stays coherent across the grid

function lattice(x: number, y: number, seed: number): number {
  const xi = ((Math.floor(x) % PERIOD) + PERIOD) % PERIOD;
  const yi = ((Math.floor(y) % PERIOD) + PERIOD) % PERIOD;
  return hash2(xi, yi, seed);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t); // smoothstep
}

/** Single-octave value noise in [0, 1]. */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = smooth(fx);
  const sy = smooth(fy);

  const n00 = lattice(x0, y0, seed);
  const n10 = lattice(x0 + 1, y0, seed);
  const n01 = lattice(x0, y0 + 1, seed);
  const n11 = lattice(x0 + 1, y0 + 1, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

/** Fractal Brownian motion (summed octaves), normalized to [0, 1]. */
export function fbm2(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
