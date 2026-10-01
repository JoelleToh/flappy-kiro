// Collision detection — pure logic layer (no DOM, no globals, no build step).
//
// Given a ghost snapshot and the current pipe pairs plus the play-area bounds,
// these functions report whether the ghost has collided with a pipe, the
// ground, or the ceiling. Every function is pure: it only reads its inputs and
// returns a boolean, mutating nothing. This matches the deterministic
// logic-layer contract from the design document (see Properties 13–15).
//
// Box shapes used here (per design "Data Models"):
//   Ghost bounding box:  { left: x, top: y, right: x + width, bottom: y + height }
//   Top pipe box:        { left: x, top: ceiling, right: x + width, bottom: gapTop }
//   Bottom pipe box:     { left: x, top: gapBottom, right: x + width, bottom: ground }
//
// aabbIntersects operates on axis-aligned boxes expressed as { x, y, width, height }
// (top-left origin). The ghost already matches that shape; pipe rectangles are
// derived from the pipe-pair record { x, width, gapTop, gapBottom, scored }.

/**
 * Axis-aligned bounding box overlap test (Requirement 6.1).
 *
 * Returns true only when the two boxes overlap by at least 1 pixel on BOTH the
 * horizontal and vertical axes. Each box is `{ x, y, width, height }` with its
 * origin at the top-left corner. Edge-touching boxes (overlap of exactly 0px)
 * do not count as a collision; a strictly positive overlap of at least 1px is
 * required on each axis.
 *
 * @param {{x:number,y:number,width:number,height:number}} a
 * @param {{x:number,y:number,width:number,height:number}} b
 * @returns {boolean} True when the boxes overlap by >= 1px on both axes.
 */
export function aabbIntersects(a, b) {
  const aLeft = a.x;
  const aRight = a.x + a.width;
  const aTop = a.y;
  const aBottom = a.y + a.height;

  const bLeft = b.x;
  const bRight = b.x + b.width;
  const bTop = b.y;
  const bBottom = b.y + b.height;

  // Overlap on each axis, measured as the length of the shared interval.
  const xOverlap = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
  const yOverlap = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);

  // Require at least 1px of overlap on both axes (R6.1).
  return xOverlap >= 1 && yOverlap >= 1;
}

/**
 * Test whether the ghost's bounding box intersects either pipe of any pair
 * (Requirement 6.1).
 *
 * For each pipe pair the two solid rectangles are derived per the design:
 *   - top pipe:    from the ceiling down to `gapTop`
 *   - bottom pipe: from `gapBottom` down to the ground
 * The ghost collides if its box overlaps either rectangle by at least 1px on
 * both axes.
 *
 * @param {{x:number,y:number,width:number,height:number}} ghost
 * @param {Array<{x:number,width:number,gapTop:number,gapBottom:number}>} pipes
 * @param {{ceiling:number, ground:number}} bounds Play-area ceiling/ground y.
 * @returns {boolean} True when the ghost overlaps any pipe rectangle.
 */
export function hitsPipe(ghost, pipes, bounds) {
  const { ceiling, ground } = bounds;
  const ghostBox = { x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height };

  return pipes.some((pipe) => {
    // Top pipe: ceiling -> gapTop.
    const topBox = {
      x: pipe.x,
      y: ceiling,
      width: pipe.width,
      height: pipe.gapTop - ceiling,
    };
    // Bottom pipe: gapBottom -> ground.
    const bottomBox = {
      x: pipe.x,
      y: pipe.gapBottom,
      width: pipe.width,
      height: ground - pipe.gapBottom,
    };
    return aabbIntersects(ghostBox, topBox) || aabbIntersects(ghostBox, bottomBox);
  });
}

/**
 * Test whether the ghost has reached or crossed the ground (Requirement 6.2).
 *
 * Returns true when the ghost's bottom edge (`y + height`) is at or beyond the
 * top of the ground.
 *
 * @param {{y:number,height:number}} ghost
 * @param {number} ground The y coordinate of the top of the ground.
 * @returns {boolean} True when the ghost bottom edge >= ground.
 */
export function hitsGround(ghost, ground) {
  return ghost.y + ghost.height >= ground;
}

/**
 * Test whether the ghost has reached or crossed the ceiling (Requirement 6.3).
 *
 * Returns true when the ghost's top edge (`y`) is at or above the ceiling.
 *
 * @param {{y:number}} ghost
 * @param {number} ceiling The y coordinate of the ceiling.
 * @returns {boolean} True when the ghost top edge <= ceiling.
 */
export function hitsCeiling(ghost, ceiling) {
  return ghost.y <= ceiling;
}

/**
 * Combined collision check (Requirements 6.1, 6.2, 6.3).
 *
 * Returns true when the ghost collides with any pipe, reaches the ground, or
 * reaches the ceiling. `bounds` carries the play-area ground and ceiling.
 *
 * @param {{x:number,y:number,width:number,height:number}} ghost
 * @param {Array<{x:number,width:number,gapTop:number,gapBottom:number}>} pipes
 * @param {{ground:number, ceiling:number}} bounds
 * @returns {boolean} True when any collision condition holds.
 */
export function checkCollisions(ghost, pipes, bounds) {
  return (
    hitsCeiling(ghost, bounds.ceiling) ||
    hitsGround(ghost, bounds.ground) ||
    hitsPipe(ghost, pipes, bounds)
  );
}

export default { aabbIntersects, hitsPipe, hitsGround, hitsCeiling, checkCollisions };
