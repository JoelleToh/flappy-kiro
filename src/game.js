// Game controller + state machine (orchestration layer).
//
// `Game` owns the single authoritative `GameState` and drives one logical frame
// at a time via `update(dt)`. It computes nothing itself: it delegates physics,
// pipes, scoring, collision, and cloud drift to the pure logic modules and
// applies their results, then hands the current state to the injected renderer.
// Side effects (drawing, audio) go through injected I/O objects so the whole
// controller — including its state-transition routing — stays deterministic and
// testable with mock renderer/audio objects (design "Testing Strategy").
//
// Dependencies are injected via the constructor (design "Game Controller"):
//   { renderer, audio, rng, config }
//     renderer : object with render(state) and getRestartControlBounds()
//     audio    : object with playJump() and playGameOver()
//     rng      : seedable RNG with next() -> [0,1), injected into pipe generation
//     config   : centralized gameplay config (src/constants.js)
//
// State machine (design "State Machine"):
//   Ready     -- flap input --------------------> Playing   (R3.6, first flap applied)
//   Playing   -- collision/ground/ceiling ------> Game_Over (R6.1-6.3)
//   Game_Over -- restart activated -------------> Ready     (R7.2, R7.3)
//   Game_Over -- flap input --------------------> ignored   (R3.8)
//   Ready/Playing -- restart activated ---------> ignored   (R7.4)
//
// Per-state update rules:
//   Ready     : clouds drift only; ghost held at start position, zero velocity (R2.4).
//   Playing   : gravity -> integrate -> clampCeiling -> scroll -> maybe generate
//               -> cull -> score -> collision -> maybe Game_Over; clouds drift.
//   Game_Over : clouds drift only; everything else frozen (R6.6, R6.7, R5.5).

import { startPosition, applyGravity, integrate, flap, clampCeiling } from "./logic/physics.js";
import { scroll, cull, needsNewPipe, generate } from "./logic/pipes.js";
import { updateScore } from "./logic/scoring.js";
import { checkCollisions } from "./logic/collision.js";
import { driftClouds } from "./logic/clouds.js";
import { config as defaultConfig } from "./constants.js";

/**
 * The three game modes (design "State Machine").
 */
export const Mode = Object.freeze({
  READY: "Ready",
  PLAYING: "Playing",
  GAME_OVER: "Game_Over",
});

export class Game {
  /**
   * @param {object} deps Injected dependencies.
   * @param {{ render: (state:object) => void, getRestartControlBounds?: () => object }} deps.renderer
   *   Side-effecting renderer; `render(state)` draws the current state.
   * @param {{ playJump: () => void, playGameOver: () => void }} deps.audio
   *   Side-effecting audio manager; both methods are safe no-ops on failure.
   * @param {{ next: () => number }} deps.rng
   *   Seedable RNG injected into pipe generation for deterministic tests.
   * @param {object} [deps.config] Centralized gameplay config; defaults to constants.js.
   */
  constructor({ renderer, audio, rng, config = defaultConfig } = {}) {
    this.renderer = renderer;
    this.audio = audio;
    this.rng = rng;
    this.config = config;

    // The single authoritative GameState (design "Data Models > GameState").
    this.state = this._createReadyState();
  }

  /**
   * Build a fresh Ready state: ghost at the vertical center with zero velocity
   * (R2.4), no pipes, a cloud field, score zero, and the game-over sound guard
   * cleared. Used both at construction and on restart (R7.2, R7.3, R5.1).
   * @private
   * @returns {object} A clean Ready GameState.
   */
  _createReadyState() {
    return {
      mode: Mode.READY,
      ghost: startPosition(this.config),
      pipes: [],
      clouds: this._createClouds(),
      score: 0,
      gameOverSoundPlayed: false,
    };
  }

  /**
   * Seed a small decorative cloud field spread across the sky. Clouds are purely
   * background state (R1.6); their exact layout does not affect gameplay.
   * @private
   * @returns {Array<{x:number,y:number,speed:number,scale:number}>}
   */
  _createClouds() {
    const { width, height } = this.config.canvas;
    return [
      { x: width * 0.15, y: height * 0.15, speed: 12, scale: 1.0 },
      { x: width * 0.55, y: height * 0.3, speed: 18, scale: 0.75 },
      { x: width * 0.85, y: height * 0.1, speed: 15, scale: 1.25 },
    ];
  }

  /**
   * Advance the simulation by one logical frame, dispatching on the current mode
   * (design "Game Controller"). `dt` is the frame delta in seconds.
   *
   * @param {number} dt Elapsed time for this logical frame, in seconds.
   */
  update(dt) {
    switch (this.state.mode) {
      case Mode.PLAYING:
        this._updatePlaying(dt);
        break;
      case Mode.READY:
      case Mode.GAME_OVER:
      default:
        // Ready and Game_Over advance only the decorative clouds; everything
        // else is frozen (R6.6, R6.7, R5.5). Game_Over effects are not
        // re-triggered because no state transition happens here (R6.4, R3.8).
        this.state = { ...this.state, clouds: driftClouds(this.state.clouds, dt, this.config) };
        break;
    }
  }

  /**
   * One Playing frame: gravity -> integrate -> clampCeiling -> scroll pipes ->
   * maybe generate -> cull -> score -> collision. On collision, transition to
   * Game_Over and play the game-over sound exactly once (R6.1-6.7, R5.2-5.6).
   * @private
   * @param {number} dt Frame delta in seconds.
   */
  _updatePlaying(dt) {
    const { config } = this;

    // --- Ghost physics (R2.1-R2.3, R2.5) ---
    let ghost = applyGravity(this.state.ghost, config);
    ghost = integrate(ghost);
    ghost = clampCeiling(ghost);

    // --- Pipes: scroll (R4.1), generate at spacing (R4.2/R4.4/R4.5), cull (R4.3) ---
    let pipes = scroll(this.state.pipes, config.pipes.speedPxPerSec, dt);
    if (needsNewPipe(pipes, config.pipes.spacing, config.canvas.width)) {
      pipes = generate(pipes, this.rng, config);
    }
    pipes = cull(pipes, 0); // canvas left boundary is x = 0

    // --- Scoring (R5.2, R5.3, R5.6): count newly passed pairs, mark them scored ---
    const scored = updateScore(this.state.score, ghost, pipes);

    // --- Collision (R6.1-R6.3): ghost vs pipes/ground/ceiling ---
    const bounds = { ground: config.ground.y, ceiling: config.ceiling.y };
    const collided = checkCollisions(ghost, scored.pipes, bounds);

    // Clouds drift during play as well.
    const clouds = driftClouds(this.state.clouds, dt, config);

    if (collided) {
      // Transition Playing -> Game_Over (R6.1-6.3). Freeze the ghost and pipes
      // in place (R6.6, R6.7) and retain the final score (R5.5).
      //
      // The game-over sound plays exactly once (R6.5): this branch is only
      // reached while mode === Playing (the dispatch in update() routes other
      // modes elsewhere), so it fires on the single Playing -> Game_Over
      // transition and never again. The `gameOverSoundPlayed` guard records
      // that it has fired, so even if some caller funnels a Game_Over state
      // back through here it would not replay.
      const playSound = !this.state.gameOverSoundPlayed;
      this.state = {
        ...this.state,
        mode: Mode.GAME_OVER,
        ghost,
        pipes: scored.pipes,
        clouds,
        score: scored.score,
        gameOverSoundPlayed: true,
      };
      if (playSound) {
        this.audio?.playGameOver();
      }
      return;
    }

    // No collision: stay Playing with the advanced snapshot.
    this.state = {
      ...this.state,
      ghost,
      pipes: scored.pipes,
      clouds,
      score: scored.score,
    };
  }

  /**
   * Draw the current state via the injected renderer (design "Game Controller").
   */
  render() {
    this.renderer?.render(this.state);
  }

  /**
   * Route a flap intent per the current state (R3.6, R3.8, R3.5).
   *   Ready     -> transition to Playing and apply the first flap.
   *   Playing   -> apply a flap and play the jump sound.
   *   Game_Over -> ignored; the ghost's velocity does not change (R3.8).
   */
  handleFlap() {
    switch (this.state.mode) {
      case Mode.READY:
        // First flap also starts the game (R3.6).
        this.state = {
          ...this.state,
          mode: Mode.PLAYING,
          ghost: flap(this.state.ghost, this.config),
        };
        break;
      case Mode.PLAYING:
        this.state = { ...this.state, ghost: flap(this.state.ghost, this.config) };
        this.audio?.playJump(); // R3.5
        break;
      case Mode.GAME_OVER:
      default:
        // Flap ignored in Game_Over (R3.8): no state change.
        break;
    }
  }

  /**
   * Route a restart intent (R7.2, R7.3, R7.4).
   *   Game_Over -> reset to a clean Ready state (score 0, ghost at start, no
   *                pipes, mode Ready, sound guard cleared).
   *   Ready/Playing -> ignored; state, score, ghost, and pipes are preserved.
   */
  handleRestart() {
    if (this.state.mode !== Mode.GAME_OVER) {
      // Restart outside Game_Over is ignored (R7.4).
      return;
    }
    // Reset to a clean Ready state (R7.2, R7.3, R5.1). Preserve the drifting
    // cloud field so the background stays continuous across sessions.
    const clouds = this.state.clouds;
    this.state = this._createReadyState();
    this.state.clouds = clouds;
  }
}

export default Game;
