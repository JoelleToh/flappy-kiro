# Implementation Plan: Flappy Kiro

## Overview

This plan builds Flappy Kiro bottom-up: first the deterministic pure logic layer (`src/logic/*`) with its fast-check property tests, then the configuration source of truth, then the I/O layer (renderer, audio, input) with mock/unit tests, then the orchestration layer (`game.js` state machine) with its transition property tests, then wiring everything into a playable `index.html`, and finally the dev-only lil-gui tuning panel.

Each task builds on the previous and ends with integration so no code is left orphaned. All code is vanilla JavaScript (ES modules), no build step. Property tests use fast-check (min 100 iterations each) tagged `// Feature: flappy-kiro, Property N: ...`.

## Tasks

- [x] 1. Set up project structure, config, and test harness
  - Create directory layout: `src/`, `src/logic/`, `src/io/`, `test/`
  - Create `src/constants.js` exporting the single grouped `config` object (canvas, ground, ceiling, ghost, physics, pipes, score) with default values inside the required ranges
  - Add `package.json` with fast-check as a dev dependency and a test script using the Node built-in test runner (`node --test`); ES module config (`"type": "module"`)
  - _Requirements: 1.1, 1.5, 2.1, 2.2, 4.1, 4.2, 4.5, 5.6_

  - [ ]* 1.1 Write unit tests asserting config values fall within required ranges
    - Assert canvas width 288–512, height 480–768, border 1–4, gap height 100–200, gravity 0.1–1.0, terminalVelocity 5–20, pipe speed 100–300, spacing 200–400, score max 999999
    - _Requirements: 1.1, 1.5, 2.1, 2.2, 4.1, 4.2, 4.5, 5.6_

- [x] 2. Implement seedable RNG and ghost physics (pure)
  - [x] 2.1 Implement `src/logic/rng.js`
    - Implement a seedable mulberry32-style generator exposing `next() -> [0,1)`, injectable so pipe generation is reproducible in tests
    - _Requirements: 4.4_

  - [x] 2.2 Implement `src/logic/physics.js`
    - Implement `applyGravity(ghost, config)` (v += gravity, clamp to terminalVelocity), `integrate(ghost)` (y += vy), `flap(ghost, config)` (vy = -flapImpulse), `clampCeiling(ghost)` (pin top to ceiling, vy = 0), and `startPosition(config)` (vertical center, vy = 0); all pure, returning new ghost snapshots
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.4_

  - [ ]* 2.3 Write property test for gravity integration
    - **Property 1: Gravity integration increments velocity and respects terminal cap**
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 2.4 Write property test for position integration
    - **Property 2: Position integration adds velocity**
    - **Validates: Requirements 2.3**

  - [ ]* 2.5 Write property test for ceiling clamp
    - **Property 3: Ceiling clamp pins position and zeroes velocity**
    - **Validates: Requirements 2.5**

  - [ ]* 2.6 Write property test for flap impulse
    - **Property 4: Flap applies a fixed upward impulse independent of input source**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [ ]* 2.7 Write unit test for `startPosition`
    - Assert ghost is at vertical center with zero velocity
    - _Requirements: 2.4_

- [x] 3. Implement pipe manager (pure)
  - [x] 3.1 Implement `src/logic/pipes.js`
    - Implement `scroll(pipes, speedPxPerSec, dt)` (x -= speed*dt), `cull(pipes, canvasLeft)` (drop pairs fully past left edge), `needsNewPipe(pipes, spacing, canvasRight)`, and `generate(pipes, rng, config)` (append pair at fixed spacing with randomized gap center respecting edge margin and fixed gap height)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 1.5_

  - [ ]* 3.2 Write property test for pipe scrolling
    - **Property 7: Pipes scroll leftward at the configured speed**
    - **Validates: Requirements 4.1**

  - [ ]* 3.3 Write property test for pipe spacing on generation
    - **Property 8: New pipes are generated at fixed spacing**
    - **Validates: Requirements 4.2**

  - [ ]* 3.4 Write property test for pipe culling
    - **Property 9: Pipes fully past the left edge are culled, others retained**
    - **Validates: Requirements 4.3**

  - [ ]* 3.5 Write property test for generated gap bounds and height
    - **Property 10: Generated gap is within bounds and has the fixed gap height**
    - **Validates: Requirements 4.4, 4.5, 1.5**

- [x] 4. Implement scoring and collision (pure)
  - [x] 4.1 Implement `src/logic/scoring.js`
    - Implement `updateScore(score, ghost, pipes)` returning `{ score, pipes }`; increment by one for each unscored pair the ghost has passed, mark pairs `scored`, cap at `config.score.max` (999999)
    - _Requirements: 5.2, 5.3, 5.6, 1.7_

  - [ ]* 4.2 Write property test for scoring exactly once per pair
    - **Property 11: Each pipe pair is scored exactly once after being passed**
    - **Validates: Requirements 5.2, 5.3, 1.7**

  - [ ]* 4.3 Write property test for score cap
    - **Property 12: Score never exceeds the maximum cap**
    - **Validates: Requirements 5.6**

  - [x] 4.4 Implement `src/logic/collision.js`
    - Implement `aabbIntersects(a, b)` (>= 1px overlap on both axes), `hitsPipe(ghost, pipes)`, `hitsGround(ghost, ground)`, `hitsCeiling(ghost, ceiling)`, `checkCollisions(ghost, pipes, bounds)`
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 4.5 Write property test for AABB overlap
    - **Property 13: Axis-aligned bounding boxes detect at least one pixel of overlap**
    - **Validates: Requirements 6.1**

  - [ ]* 4.6 Write property test for ground contact
    - **Property 14: Ground contact is detected**
    - **Validates: Requirements 6.2**

  - [ ]* 4.7 Write property test for ceiling contact
    - **Property 15: Ceiling contact is detected**
    - **Validates: Requirements 6.3**

- [x] 5. Implement cloud background drift (pure)
  - [x] 5.1 Implement `src/logic/clouds.js`
    - Implement `driftClouds(clouds, dt)` moving clouds slowly leftward with wrap/respawn off-screen; decorative state only, no physics/collision interaction
    - _Requirements: 1.6_

  - [ ]* 5.2 Write unit test for cloud drift
    - Assert clouds move left over time and respawn/wrap when fully off-screen
    - _Requirements: 1.6_

- [x] 6. Checkpoint - pure logic layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement audio manager (I/O)
  - [x] 7.1 Implement `src/io/audio.js`
    - Implement `AudioManager` with `load()` (preload `assets/jump.wav`, `assets/game_over.wav`, tolerate failures with per-sound `loaded` flag), `playJump()`, and `playGameOver()`; guard `play()` in try/catch so failures are silent no-ops
    - _Requirements: 3.5, 6.5_

  - [ ]* 7.2 Write mock-based unit tests for audio manager
    - Assert `playJump`/`playGameOver` no-op when a sound failed to load and never throw
    - _Requirements: 3.5, 6.5_

- [x] 8. Implement input manager (I/O)
  - [x] 8.1 Implement `src/io/input.js`
    - Bind keyboard (Space with leading-edge `spaceHeld` tracking), mouse (`click`/`mousedown` on canvas, restart-control hit test in Game_Over), and touch (`touchstart` with `preventDefault`) events; route all to flap/restart intents. Extract the edge-trigger logic as a pure helper for property testing
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 7.1_

  - [ ]* 8.2 Write property test for spacebar edge-trigger helper
    - **Property 6: Held spacebar yields at most one flap per press**
    - **Validates: Requirements 3.7**

  - [ ]* 8.3 Write mock-based unit tests for input routing
    - Assert a click within restart-control bounds in Game_Over yields a restart intent; a click elsewhere or in other states yields a flap intent; touch yields a single flap
    - _Requirements: 7.1, 3.2, 3.3_

- [x] 9. Implement renderer (I/O)
  - [x] 9.1 Implement `src/io/renderer.js`
    - Draw one frame back-to-front: sky-blue background → clouds → pipes (green) → ghost sprite (or equal-size placeholder when `spriteLoaded` is false) → HUD score (and game-over message + restart control in Game_Over) → canvas border; load `assets/ghosty.png` with `onload`/`onerror` setting `spriteLoaded`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 5.4, 6.8, 7.1_

  - [ ]* 9.2 Write mock-based unit tests for renderer draw order and sprite fallback
    - Using a fake 2D context, assert draw order (clouds before pipes and ghost), that score is drawn, that game-over message and restart control are drawn in Game_Over, and that a placeholder of equal dimensions is drawn without throwing when `spriteLoaded` is false
    - _Requirements: 1.2, 1.4, 1.6, 1.7, 5.4, 6.8, 7.1_

- [x] 10. Checkpoint - I/O layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement game controller and state machine (orchestration)
  - [x] 11.1 Implement `src/game.js`
    - Implement `Game` owning `GameState` with `update(dt)` dispatching on mode (Playing runs gravity → integrate → clampCeiling → scroll/generate/cull → score → collision → maybe Game_Over; Ready/Game_Over drift clouds only and keep Game_Over frozen), `render()`, `handleFlap()` (Ready→Playing+first flap, Playing flap+jump sound, Game_Over ignored), and `handleRestart()` (reset only from Game_Over); trigger game-over sound exactly once on the Playing→Game_Over transition via `gameOverSoundPlayed` guard
    - _Requirements: 3.6, 3.8, 5.1, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.2, 7.3, 7.4, 2.4_

  - [ ]* 11.2 Write property test for flap-in-Ready transition
    - **Property 5: Flap in Ready transitions to Playing with the first flap applied**
    - **Validates: Requirements 3.6**

  - [ ]* 11.3 Write property test for collision transition to Game_Over
    - **Property 16: Any collision while Playing transitions to Game_Over**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 11.4 Write property test for Game_Over sound playing once (with mock audio)
    - **Property 17: Game_Over sound plays exactly once per transition**
    - **Validates: Requirements 6.5**

  - [ ]* 11.5 Write property test for frozen idempotent Game_Over
    - **Property 18: Game_Over is a frozen, idempotent state**
    - **Validates: Requirements 5.5, 6.4, 6.6, 6.7, 3.8**

  - [ ]* 11.6 Write property test for restart from Game_Over
    - **Property 19: Restart from Game_Over resets to a clean Ready state**
    - **Validates: Requirements 7.2, 7.3, 5.1**

  - [ ]* 11.7 Write property test for restart ignored outside Game_Over
    - **Property 20: Restart outside Game_Over is ignored**
    - **Validates: Requirements 7.4**

  - [ ]* 11.8 Write mock-based integration tests for sound triggers
    - Assert flap in Playing calls `playJump` once; a single Playing→Game_Over transition calls `playGameOver` exactly once across repeated updates
    - _Requirements: 3.5, 6.5_

- [x] 12. Wire everything into a playable game
  - [x] 12.1 Implement `src/main.js` and `index.html`
    - `index.html`: canvas element (sized per config, bordered per R1.1) and `<script type="module" src="src/main.js">`
    - `src/main.js`: construct renderer/audio/input/rng/config, construct `Game`, wire input intents to `handleFlap`/`handleRestart`, and start the fixed-timestep `requestAnimationFrame` loop (FIXED_DT = 1/60, accumulator, elapsed clamped to 0.25s, render once per frame, render wrapped in try/catch at the loop boundary)
    - _Requirements: 1.1, 2.1, 2.3, 3.1, 3.2, 3.3, 4.1, 5.4, 6.8, 7.1_

- [x] 13. Implement the dev-only live tuning panel (I/O)
  - [x] 13.1 Implement `src/io/tuning.js` and wire into `main.js`
    - Build a lil-gui panel (imported via CDN ES module) exposing range-clamped sliders for gravity, terminalVelocity, flapImpulse, pipe speedPxPerSec, spacing, gapHeight, pipe width, with min/max bounds from the design's tuning table; read initial values from and write live changes back into `config`; toggle with backtick, hidden by default; guard construction so a load failure degrades gracefully to no panel without blocking the loop
    - _Requirements: 1.1, 1.5, 2.1, 2.2, 4.1, 4.2, 4.5_

- [x] 14. Final checkpoint - full game
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP, but they encode the design's 20 correctness properties and should be implemented to guarantee spec compliance.
- Each task references specific requirements and/or design properties for traceability.
- Property tests use fast-check with a minimum of 100 iterations each, tagged `// Feature: flappy-kiro, Property N: ...`, and target only the pure logic layer plus the controller's pure state-transition routing (with mocks for audio).
- The pure logic layer (`src/logic/*`) is built and property-tested first so the deterministic core is validated before any browser-dependent code exists.
- Manual smoke verification (opening `index.html`) covers display-timing criteria (R1.7, R5.4, R6.8) that are impractical to assert in automated tests.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1", "5.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.5", "2.6", "2.7", "3.2", "3.3", "3.4", "3.5", "4.1", "4.4", "5.2", "7.1", "8.1", "9.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.5", "4.6", "4.7", "7.2", "8.2", "8.3", "9.2", "11.1"] },
    { "id": 4, "tasks": ["11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "12.1"] },
    { "id": 5, "tasks": ["13.1"] }
  ]
}
```
