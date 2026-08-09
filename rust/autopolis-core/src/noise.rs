//! Dependency-free value noise + fractal Brownian motion.
//! Deterministic: any (x, y, seed) triple always yields the same value.
//!
//! Port of noise.ts. All math is f64 (JS numbers), mirroring the TS
//! reference exactly; callers cast to f32 only when storing into the grid.

use crate::rng::hash2;

const PERIOD: i64 = 256; // lattice wrap period — noise stays coherent across the grid

fn lattice(x: f64, y: f64, seed: i32) -> f64 {
    let xi = ((x.floor() as i64 % PERIOD) + PERIOD) % PERIOD;
    let yi = ((y.floor() as i64 % PERIOD) + PERIOD) % PERIOD;
    hash2(xi as i32, yi as i32, seed)
}

fn smooth(t: f64) -> f64 {
    t * t * (3.0 - 2.0 * t) // smoothstep
}

/// Single-octave value noise in [0, 1].
pub fn value_noise(x: f64, y: f64, seed: i32) -> f64 {
    let x0 = x.floor();
    let y0 = y.floor();
    let fx = x - x0;
    let fy = y - y0;
    let sx = smooth(fx);
    let sy = smooth(fy);

    let n00 = lattice(x0, y0, seed);
    let n10 = lattice(x0 + 1.0, y0, seed);
    let n01 = lattice(x0, y0 + 1.0, seed);
    let n11 = lattice(x0 + 1.0, y0 + 1.0, seed);

    let nx0 = n00 + (n10 - n00) * sx;
    let nx1 = n01 + (n11 - n01) * sx;
    nx0 + (nx1 - nx0) * sy
}

/// Fractal Brownian motion (summed octaves), normalized to [0, 1].
pub fn fbm2(x: f64, y: f64, seed: i32, octaves: usize) -> f64 {
    let mut amp = 1.0f64;
    let mut freq = 1.0f64;
    let mut sum = 0.0f64;
    let mut norm = 0.0f64;
    for i in 0..octaves {
        sum += amp * value_noise(x * freq, y * freq, seed.wrapping_add((i as i32) * 101));
        norm += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    sum / norm
}
