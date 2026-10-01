// Pipe manager (pure logic — no DOM, no globals, no build step).
//
// Owns the behavior of the active list of pipe pairs: scrolling them leftward,
// culling the ones that have left the screen, deciding when the next pair is
// due, and generating a new pair with a randomized (but in-bounds) gap center.
//
// Every function is pure: it takes an immutable snapshot of the pipe list (plus
// the injected config / rng) and returns a NEW array of NEW pipe-pair objects.
// Nothing is mutated in place, which keeps the module trivially testable and
// matches the deterministic-logic-layer contract from the design document.
//
// Pipe-pair data shape (from design "Data Models > PipePair"):
//   {
//     x: number,         // left edge, scrolls right-to-left (R4.1)
//     width: number,     // pipe width
//     gapTop: number,    // y of gap top; >= ceiling + edgeMargin (R4.4)
//     gapBottom: number, // gapTop + gapHeight; <= ground - edgeMargin (R4.4, R4.5)
//     scored: boolean,   // true once the pair has been counted (R5.3)
//   }

/**
 * Move every pipe pair left by `speedPxPerSec * dt` (Requirement 4.1).
 *
 * Expressing speed in pixels-per-second and multiplying by the frame delta
 * keeps horizontal motion frame-rate independent. Returns a new array of new
 * pipe-pair objects; the input is never mutated.
 *
 * @param {Array<{x:number,width:number,gapTop:number,gapBottom:number,scored:boolean}>} pipes
 * @param {number} speedPxPerSec Horizontal speed in pixels per second.
 * @param {number} dt Elapsed time for this logical frame, in seconds.
 * @returns {Array<object>} New pipe list with each pair shifted left.
 */
export function scroll(pipes, speedPxPerSec, dt) {
  const delta = speedPxPerSec * dt;
  return pipes.map((pipe) => ({ ...pipe, x: pipe.x - delta }));
}

/**
 * Drop every pipe pair that has moved fully past the left edge (Requirement 4.3).
 *
 * A pair is removed once its right edge (`x + width`) is at or beyond the
 * canvas left boundary; pairs whose right edge is still inside the canvas are
 * retained. Returns a new array.
 *
 * @param {Array<{x:number,width:number}>} pipes
 * @param {number} canvasLeft The x coordinate of the canvas left boundary.
 * @returns {Array<object>} New pipe list with off-screen pairs removed.
 */
export function cull(pipes, canvasLeft) {
  return pipes.filter((pipe) => pipe.x + pipe.width > canvasLeft);
}

/**
 * Decide whether a new pipe pair is due (Requirement 4.2).
 *
 * A new pair is needed when there are no pipes yet, or when the most recently
 * generated (rightmost) pair has scrolled far enough left that the next pair,
 * placed at the configured spacing to its right, would still appear at or
 * before the canvas right edge. This keeps a steady stream of obstacles
 * entering from the right at the fixed spacing.
 *
 * @param {Array<{x:number}>} pipes
 * @param {number} spacing Fixed horizontal distance between consecutive pairs.
 * @param {number} canvasRight The x coordinate of the canvas right boundary.
 * @returns {boolean} True when a new pair should be generated this frame.
 */
export function needsNewPipe(pipes, spacing, canvasRight) {
  if (pipes.length === 0) return true;
  const rightmostX = pipes.reduce((max, pipe) => (pipe.x > max ? pipe.x : max), pipes[0].x);
  return rightmostX + spacing <= canvasRight;
}

/**
 * Append a new pipe pair at the fixed spacing with a randomized gap center
 * (Requirements 4.2, 4.4, 4.5, 1.5).
 *
 * Horizontal placement: the new pair's left edge sits exactly `config.pipes.spacing`
 * to the right of the most recently generated (rightmost) pair. When the list is
 * empty the pair is seeded at the canvas right edge so it scrolls in from off-screen.
 *
 * Vertical placement: the gap height is the fixed `config.pipes.gapHeight`. The gap
 * center is randomized via `rng.next()` within a band that guarantees the gap top is
 * at least `config.pipes.edgeMargin` below the ceiling and the gap bottom is at least
 * `config.pipes.edgeMargin` above the ground.
 *
 * @param {Array<{x:number}>} pipes Current pipe list (not mutated).
 * @param {{ next: () => number }} rng Injected RNG returning a float in [0, 1).
 * @param {object} config Centralized config (see src/constants.js).
 * @returns {Array<object>} New pipe list with the generated pair appended.
 */
export function generate(pipes, rng, config) {
  const { spacing, gapHeight, width, edgeMargin } = config.pipes;
  const ceilingY = config.ceiling.y;
  const groundY = config.ground.y;

  // Horizontal position: spacing to the right of the current rightmost pair,
  // or seeded at the canvas right edge when there are no pipes yet.
  let x;
  if (pipes.length === 0) {
    x = config.canvas.width;
  } else {
    const rightmostX = pipes.reduce((max, pipe) => (pipe.x > max ? pipe.x : max), pipes[0].x);
    x = rightmostX + spacing;
  }

  // Vertical gap: the gap top may range from (ceiling + edgeMargin) at the
  // highest to (ground - edgeMargin - gapHeight) at the lowest. Interpolate a
  // randomized position within that band using the injected RNG.
  const minGapTop = ceilingY + edgeMargin;
  const maxGapTop = groundY - edgeMargin - gapHeight;
  const span = Math.max(0, maxGapTop - minGapTop);
  const gapTop = minGapTop + rng.next() * span;
  const gapBottom = gapTop + gapHeight;

  const newPair = { x, width, gapTop, gapBottom, scored: false };
  return [...pipes, newPair];
}

export default { scroll, cull, needsNewPipe, generate };
