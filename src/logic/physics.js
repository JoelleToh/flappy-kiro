// Ghost physics — pure logic layer (no DOM, no globals, no build step).
//
// Every function takes a ghost snapshot and returns a NEW ghost snapshot;
// none mutate their input. This immutable style keeps the simulation
// deterministic and trivially testable (see design.md Properties 1-4).
//
// Ghost shape (per design.md Data Models):
//   { x, y, vy, width, height }
//     x, y   : top-left corner of the ghost bounding box (px)
//     vy     : vertical velocity (px/frame); positive is downward
//     width  : bounding box width (px)
//     height : bounding box height (px)
//
// Config is injected (from src/constants.js) so tests can supply their own.

/**
 * Apply one frame of gravity, capping downward velocity at terminal velocity.
 * vy += config.physics.gravity, then clamp so vy <= config.physics.terminalVelocity.
 * (Requirements 2.1, 2.2 — design Property 1)
 *
 * @param {{x:number,y:number,vy:number,width:number,height:number}} ghost
 * @param {{physics:{gravity:number,terminalVelocity:number}}} config
 * @returns {{x:number,y:number,vy:number,width:number,height:number}} new ghost
 */
export function applyGravity(ghost, config) {
  const vy = Math.min(ghost.vy + config.physics.gravity, config.physics.terminalVelocity);
  return { ...ghost, vy };
}

/**
 * Integrate position by one frame: y += vy.
 * (Requirement 2.3 — design Property 2)
 *
 * @param {{x:number,y:number,vy:number,width:number,height:number}} ghost
 * @returns {{x:number,y:number,vy:number,width:number,height:number}} new ghost
 */
export function integrate(ghost) {
  return { ...ghost, y: ghost.y + ghost.vy };
}

/**
 * Apply a flap: set vertical velocity to the fixed upward impulse.
 * vy = -config.physics.flapImpulse (upward is negative).
 * The magnitude is identical regardless of input source (spacebar/mouse/touch).
 * (Requirements 3.1, 3.4 — design Property 4)
 *
 * @param {{x:number,y:number,vy:number,width:number,height:number}} ghost
 * @param {{physics:{flapImpulse:number}}} config
 * @returns {{x:number,y:number,vy:number,width:number,height:number}} new ghost
 */
export function flap(ghost, config) {
  return { ...ghost, vy: -config.physics.flapImpulse };
}

/**
 * Clamp the ghost to the ceiling. If the ghost's top edge (y) is at or above
 * the ceiling (y === 0, the top boundary of the canvas), pin the top edge to
 * the ceiling and zero the vertical velocity. Otherwise return the ghost
 * unchanged (as a new snapshot).
 * (Requirement 2.5 — design Property 3)
 *
 * @param {{x:number,y:number,vy:number,width:number,height:number}} ghost
 * @returns {{x:number,y:number,vy:number,width:number,height:number}} new ghost
 */
export function clampCeiling(ghost) {
  const CEILING = 0;
  if (ghost.y <= CEILING) {
    return { ...ghost, y: CEILING, vy: 0 };
  }
  return { ...ghost };
}

/**
 * Produce a ghost at the fixed starting position: the vertical center of the
 * canvas with zero vertical velocity. The ghost is horizontally fixed at a
 * stable left margin and sized from config.
 * (Requirement 2.4)
 *
 * @param {{canvas:{width:number,height:number},ghost:{width:number,height:number}}} config
 * @returns {{x:number,y:number,vy:number,width:number,height:number}} new ghost
 */
export function startPosition(config) {
  const { width: ghostWidth, height: ghostHeight } = config.ghost;
  const { width: canvasWidth, height: canvasHeight } = config.canvas;
  return {
    // Fixed horizontal position: roughly one-third from the left edge.
    x: Math.round(canvasWidth / 3 - ghostWidth / 2),
    // Vertical center: center the bounding box on the canvas midline.
    y: (canvasHeight - ghostHeight) / 2,
    vy: 0,
    width: ghostWidth,
    height: ghostHeight,
  };
}
