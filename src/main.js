// Bootstrap / entry point (orchestration layer).
//
// This module wires the whole game together and drives the fixed-timestep loop.
// It performs no game logic itself: it constructs the pure/I-O pieces, injects
// them into the Game controller, binds input, and then pumps requestAnimationFrame.
//
// Responsibilities (design "File Layout" + "Game Loop and Fixed Timestep"):
//   1. Grab the <canvas> and its 2D context; size the canvas from config.canvas.
//   2. Construct rng, audio (and load it), renderer, and the Game controller.
//   3. Bind input and route flap / restart intents into the controller.
//   4. Run a FIXED-TIMESTEP accumulator loop so per-frame physics (R2) stays
//      consistent across refresh rates, catching a draw error at the loop
//      boundary so a single bad frame never kills the loop.
//
// Requirements touched here: 1.1 (canvas sizing + border), 2.1/2.3 (per-frame
// physics cadence via FIXED_DT), 3.1-3.3 (input wiring to flap), 4.1 (pipe
// scroll via dt), 5.4 (score drawn each frame), 6.8 (game-over message drawn),
// 7.1 (restart control hit-testing via renderer bounds).

import { config } from "./constants.js";
import { createRng } from "./logic/rng.js";
import { AudioManager } from "./io/audio.js";
import { createRenderer } from "./io/renderer.js";
import { createInputManager } from "./io/input.js";
import { createTuningPanel } from "./io/tuning.js";
import { Game } from "./game.js";

// Logical simulation rate: one update() call == 1/60 s of game time. Physics in
// R2.1-R2.3 is expressed "per frame", and this fixed step is that frame.
const FIXED_DT = 1 / 60;

// Guard against the "spiral of death": if the tab was backgrounded (or the
// machine stalled), cap how much simulated time a single animation frame may
// catch up on, so we never run a huge burst of updates at once (design
// "Game Loop Robustness").
const MAX_FRAME_TIME = 0.25;

/**
 * Boot the game: locate the canvas, build everything, and start the loop.
 * Guarded so a missing canvas produces a clear console error rather than a
 * silent failure.
 */
function main() {
  const canvas = document.getElementById("game");
  if (!canvas || typeof canvas.getContext !== "function") {
    console.error("Flappy Kiro: could not find a <canvas id=\"game\"> to render into.");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Flappy Kiro: 2D canvas context is unavailable in this browser.");
    return;
  }

  // Size the drawing surface from the centralized config so the canvas's
  // intrinsic resolution matches what the renderer draws (R1.1).
  canvas.width = config.canvas.width;
  canvas.height = config.canvas.height;

  // --- Construct the pieces and inject them into the controller --------------
  const rng = createRng(); // time-seeded in production; tests seed explicitly
  const audio = new AudioManager();
  audio.load(); // preload sounds; failures degrade to silent (R3.5, R6.5)
  const renderer = createRenderer(ctx, config);
  const game = new Game({ renderer, audio, rng, config });

  // --- Bind input: route every intent into the controller --------------------
  // All flap sources (space / click / tap) call the same handler so the impulse
  // is identical (R3.1-R3.4). Restart is only honored by the controller in
  // Game_Over (R7.1/R7.4); the input manager hit-tests the renderer's reported
  // restart-control bounds.
  createInputManager({
    canvas,
    onFlap: () => game.handleFlap(),
    onRestart: () => game.handleRestart(),
    isGameOver: () => game.state.mode === "Game_Over",
    getRestartRect: () => renderer.getRestartControlBounds(),
  });

  // --- Dev-only live tuning panel --------------------------------------------
  // Build the toggleable lil-gui panel against the live `config` so sliders feed
  // the running game (design "Configuration and Tuning"). It is hidden until the
  // backtick (`) key is pressed and loads lil-gui from a CDN at runtime. The call
  // is fire-and-forget and already guarded internally to degrade to "no panel";
  // the extra try/catch here makes doubly sure a load failure never blocks boot
  // or the game loop (design "Tuning Panel Load Failure").
  try {
    createTuningPanel(config).catch(() => {
      /* internal guard already handled it; swallow to keep the game running */
    });
  } catch {
    /* never let the dev panel stop the game from starting */
  }

  // --- Fixed-timestep requestAnimationFrame loop ------------------------------
  // Accumulator pattern (design "Game Loop and Fixed Timestep"): accumulate real
  // elapsed time, step the simulation in fixed FIXED_DT chunks, then draw once
  // per animation frame.
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    // Always schedule the next frame first so a mid-frame throw cannot stop the
    // loop permanently.
    requestAnimationFrame(frame);

    try {
      // Real time since the previous frame, in seconds, clamped to avoid a
      // catch-up burst after a long pause.
      const elapsed = Math.min((now - last) / 1000, MAX_FRAME_TIME);
      last = now;
      accumulator += elapsed;

      // Advance the simulation in whole fixed steps. Each step is "one frame"
      // for gravity/velocity integration (R2) and pipe scroll (R4.1 uses dt).
      while (accumulator >= FIXED_DT) {
        game.update(FIXED_DT);
        accumulator -= FIXED_DT;
      }

      // Draw the current state once per animation frame (R1.x, R5.4, R6.8).
      game.render();
    } catch (err) {
      // A draw/update error is logged but never kills the loop — the next frame
      // is already scheduled above (design "Game Loop Robustness").
      console.error("Flappy Kiro: frame error (continuing)", err);
    }
  }

  requestAnimationFrame(frame);
}

// Start once the DOM is ready. With `type="module"` scripts are deferred, so the
// canvas element already exists, but this guard keeps main.js robust if the
// script is ever included differently.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main, { once: true });
} else {
  main();
}
