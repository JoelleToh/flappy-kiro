// Seedable pseudo-random number generator (pure logic — no DOM, no globals).
//
// Pipe generation (R4.4) needs randomized gap centers, but the property tests
// (design Property 10) must be able to reproduce the exact same sequence. A
// seedable generator makes that possible: production code seeds it from the
// clock, while tests seed it with a fixed value so runs are deterministic.
//
// The algorithm is mulberry32 — a tiny, fast 32-bit generator with good
// statistical quality for game use. Given the same seed it always yields the
// same sequence of values in [0, 1). The generator is injected into
// `PipeManager.generate(pipes, rng, config)` as an object exposing `next()`.

/**
 * Create a seedable mulberry32 RNG.
 *
 * @param {number} [seed] Integer seed. Defaults to a time-based seed so
 *   production runs vary; tests should pass a fixed integer for reproducibility.
 * @returns {{ next: () => number, seed: number }} An RNG whose `next()` returns
 *   a float in the half-open interval [0, 1). `seed` is the normalized seed used.
 */
export function createRng(seed = Date.now()) {
  // Normalize the seed into an unsigned 32-bit integer so behavior is identical
  // regardless of how the caller supplies it (floats, negatives, large values).
  let state = seed >>> 0;

  /**
   * Return the next pseudo-random value in [0, 1).
   * @returns {number}
   */
  function next() {
    // mulberry32: advance the 32-bit state, then scramble it into a float.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // Divide by 2^32 to map the 32-bit result into [0, 1).
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return { next, seed: state };
}

export default createRng;
