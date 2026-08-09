//! Deterministic randomness. No `rand` crate anywhere — reproducibility is a
//! hard requirement for server-authoritative tick state.
//!
//! All 32-bit arithmetic uses wrapping semantics to mirror JavaScript's
//! `Math.imul` / `| 0` / `>>> 0` behaviour bit-for-bit.

/// Mulberry32 — tiny, fast, seedable PRNG returning [0, 1).
///
/// Port of `mulberry32` in rng.ts. The returned closure is stateful; call it
/// repeatedly to draw successive values.
pub fn mulberry32(seed: u32) -> impl FnMut() -> f64 {
    let mut a = seed;
    move || {
        // `a |= 0` is a no-op on u32 (JS int32 wrap is implicit in u32).
        a = a.wrapping_add(0x6d2b79f5);
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
}

/// Deterministic 2D integer hash → [0, 1). Avalanche-mixed so adjacent cells
/// (x, y) and (x+1, y) produce decorrelated values.
///
/// Port of `hash2` in rng.ts: the exact `Math.imul` chain with wrapping
/// 32-bit multiply (the JS `^` operators are bitwise on two's-complement
/// int32, which is identical to u32 XOR on the same bit patterns).
pub fn hash2(x: i32, y: i32, seed: i32) -> f64 {
    let mut h: u32 = (seed as u32)
        ^ (x as u32).wrapping_mul(0x27d4eb2d)
        ^ (y as u32).wrapping_mul(0x165667b1);
    h = (h ^ (h >> 15)).wrapping_mul(0x85ebca6b);
    h ^= h >> 13;
    h = (h ^ (h >> 16)).wrapping_mul(0xc2b2ae35);
    h ^= h >> 16;
    (h as f64) / 4294967296.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mulberry32_matches_ts_reference() {
        // First 8 outputs of mulberry32(1337) from the TS reference (rng.ts).
        let expected = [
            0.1844118325971067,
            0.18998925131745636,
            0.8104719922412187,
            0.6437488221563399,
            0.430774615611881,
            0.381045897025615,
            0.5265626488253474,
            0.5485863720532507,
        ];
        let mut m = mulberry32(1337);
        for e in expected {
            let got = m();
            assert!((got - e).abs() < 1e-15, "got {got}, expected {e}");
        }
    }

    #[test]
    fn hash2_matches_ts_reference() {
        // Values from the TS reference: hash2(3,7,1337) etc.
        let cases = [
            ((3i32, 7i32, 1337i32), 0.24246703507378697),
            ((12, 42, 1337), 0.37611370207741857),
            ((0, 0, 1), 0.9764366645831615),
            ((31, 31, 1337), 0.8797504610847682),
        ];
        for ((x, y, s), e) in cases {
            let got = hash2(x, y, s);
            assert!((got - e).abs() < 1e-15, "hash2({x},{y},{s}) got {got}, expected {e}");
        }
    }
}
