// Cloud background drift (pure logic — no DOM, no globals, no build step).
//
// Clouds are purely decorative background state (design "Clouds" section, R1.6):
// they drift slowly leftward and, once fully off the left edge, wrap around to
// respawn off the right edge so the sky scrolls endlessly. Clouds never interact
// with physics, collision, or scoring — they are only read by the renderer, which
// draws them behind the pipes and the ghost.
//
// Following the rest of the pure logic layer, `driftClouds` does not mutate its
// inputs: it returns a new array of new cloud objects, which keeps it trivially
// testable and side-effect free. `config` is injected (same convention as the
// other logic modules) so no canvas dimensions are hard-coded here.

import { config as defaultConfig } from "../constants.js";

// A cloud's drawn width is derived from its `scale`. We only need a reference
// base width to decide when a cloud is "fully off-screen" and where to respawn
// it; the renderer owns the actual sprite dimensions. Keeping this local avoids
// adding cloud-specific magic numbers to the shared config.
const CLOUD_BASE_WIDTH = 64;

/**
 * The drawn width of a cloud, in canvas pixels.
 * @param {{ scale?: number }} cloud
 * @returns {number}
 */
function cloudWidth(cloud) {
  const scale = typeof cloud.scale === "number" ? cloud.scale : 1;
  return CLOUD_BASE_WIDTH * scale;
}

/**
 * Advance every cloud by one frame of slow leftward drift (R1.6).
 *
 * Each cloud moves left by `cloud.speed * dt` canvas pixels. When a cloud has
 * drifted fully past the left edge (its right edge is at or beyond x = 0), it
 * wraps around: it respawns just off the right edge of the canvas so the
 * background scroll is seamless and endless.
 *
 * This is pure and decorative only — it returns a fresh array of fresh cloud
 * objects and never touches physics, collision, or scoring state.
 *
 * @param {Array<{ x: number, y: number, speed: number, scale?: number }>} clouds
 *   The current clouds. Each has an x/y position, a leftward drift `speed`
 *   (pixels per second), and an optional `scale`.
 * @param {number} dt Elapsed time for this frame, in seconds.
 * @param {typeof defaultConfig} [config] Injected config; defaults to the shared
 *   `constants.js` config. Only `canvas.width` is read, to place respawns.
 * @returns {Array<{ x: number, y: number, speed: number, scale?: number }>}
 *   A new array of new cloud objects after one frame of drift.
 */
export function driftClouds(clouds, dt, config = defaultConfig) {
  if (!Array.isArray(clouds)) return [];

  const canvasWidth = config.canvas.width;

  return clouds.map((cloud) => {
    // Move left: positive `speed` drifts toward x = 0 and beyond.
    const nextX = cloud.x - cloud.speed * dt;
    const width = cloudWidth(cloud);

    // Fully off the left edge once the right edge (x + width) has reached or
    // passed the left boundary (x = 0). Respawn just past the right edge so the
    // cloud re-enters the scene from the right.
    const fullyOffLeft = nextX + width <= 0;
    const wrappedX = fullyOffLeft ? canvasWidth : nextX;

    return { ...cloud, x: wrappedX };
  });
}

export default driftClouds;
