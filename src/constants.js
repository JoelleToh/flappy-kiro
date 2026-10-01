// Centralized configuration — the single source of truth for all tunable values.
// Every module (pure logic and I/O) imports its values from this object; no magic
// numbers are scattered through the code. The pure logic modules receive `config`
// as an injected parameter so tests can supply their own config without touching globals.
//
// All default values sit inside the ranges the requirements allow:
//   canvas.width 288–512 (R1.1), canvas.height 480–768 (R1.1), border 1–4 (R1.1),
//   gap height 100–200 (R1.5/R4.5), gravity 0.1–1.0 (R2.1), terminalVelocity 5–20 (R2.2),
//   pipe speedPxPerSec 100–300 (R4.1), spacing 200–400 (R4.2), edgeMargin >= 50 (R4.4),
//   score.max 999999 (R5.6).
export const config = {
  canvas: { width: 512, height: 640, border: 2 },
  ground: { y: 640 },
  ceiling: { y: 0 },
  ghost: { width: 34, height: 34 },
  physics: { gravity: 0.5, terminalVelocity: 10, flapImpulse: 8 },
  pipes: { speedPxPerSec: 180, spacing: 300, gapHeight: 150, width: 60, edgeMargin: 50 },
  score: { max: 999999 },
};

export default config;
