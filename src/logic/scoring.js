// Scoring (pure logic — no DOM, no globals, no build step).
//
// Awards one point for each pipe pair the ghost has fully passed, counting each
// pair at most once per session by marking passed pairs `scored: true`. The
// running score is capped at the configured maximum (R5.6).
//
// Every function is pure: it takes immutable snapshots (score, ghost, pipe list)
// and returns NEW values (a new score and a NEW array of NEW pipe-pair objects).
// Nothing is mutated in place, matching the deterministic-logic-layer contract
// from the design document.
//
// Pipe-pair data shape (from design "Data Models > PipePair"):
//   {
//     x: number,         // left edge, scrolls right-to-left (R4.1)
//     width: number,     // pipe width
//     gapTop: number,    // y of gap top
//     gapBottom: number, // gapTop + gapHeight
//     scored: boolean,   // true once the pair has been counted (R5.3)
//   }

import config from "../constants.js";

/**
 * Update the score for pipe pairs the ghost has fully passed
 * (Requirements 5.2, 5.3, 5.6, 1.7).
 *
 * A pipe pair is considered "passed" once the ghost's horizontal position is
 * beyond the pair's right edge, i.e. `ghost.x > pipe.x + pipe.width`. For each
 * pair that is passed and not yet marked `scored`, the score increases by one
 * and that pair is marked `scored: true` in a NEW pipes array so it can never
 * be counted again (R5.3). The running score is clamped so it never exceeds
 * `config.score.max` (999999, R5.6) and is always a non-negative integer.
 *
 * Inputs are never mutated: the returned `pipes` is a new array of new
 * pipe-pair objects.
 *
 * @param {number} score Current non-negative integer score.
 * @param {{x:number}} ghost Ghost snapshot; only its horizontal position matters here.
 * @param {Array<{x:number,width:number,scored:boolean}>} pipes Current pipe list (not mutated).
 * @returns {{ score: number, pipes: Array<object> }} New score and new pipe list.
 */
export function updateScore(score, ghost, pipes) {
  const maxScore = config.score.max;
  let newScore = score;

  const newPipes = pipes.map((pipe) => {
    const passed = ghost.x > pipe.x + pipe.width;
    if (passed && !pipe.scored) {
      if (newScore < maxScore) {
        newScore += 1;
      }
      return { ...pipe, scored: true };
    }
    return { ...pipe };
  });

  // Guard against any out-of-range starting value: keep the score a
  // non-negative integer within [0, maxScore] (R5.6).
  if (newScore > maxScore) newScore = maxScore;

  return { score: newScore, pipes: newPipes };
}

export default { updateScore };
