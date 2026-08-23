/**
 * The adjacent-frame distinctness gate, and the repeats this project has decided to live with.
 *
 * Its own module for the reason `edgeExceptions.mjs` is: a table of accepted exceptions and the gate
 * that consults it belong together, and `gates.mjs` is at its size ceiling.
 *
 * *(Session inventory 3.11.)*
 */

import { FAIL, INDETERMINATE, PASS, frameDifference, verdict } from './gates.mjs';

/**
 * The floor for ADJACENT frames, distinct from `MOTION_FLOOR`.
 *
 * Lower than `MOTION_FLOOR` on purpose: that asks *"does this clip move at all"* against frame 0,
 * where a cycle's peak is large. This asks *"is this frame a duplicate of the one before it"*.
 *
 * **A FREEZE floor, not a distinctness target** — see `gateAdjacentDistinct` and
 * `ACCEPTED_POSE_REPEATS` for the repeats that are deliberately below it.
 */
export const ADJACENT_FLOOR = 0.0004;

/**
 * Every frame differs from the one BEFORE it — the blind spot `gateMotionFloor` names in its own
 * neighbour's docstring *(session inventory 3.11)*.
 *
 * `motion.mjs` records the defect against `run`: *"the clip carries roughly 13 genuinely distinct
 * poses per cycle, so 15 sampled frames necessarily repeats some — the same mild defect already
 * measured on the walk sheet (pairs 1-2, 4-5, 14-15, 18-19). `gateMotionFloor` cannot catch it: it
 * compares every frame to frame 0 and keeps the maximum, never adjacent pairs."*
 *
 * The known repeats are a **recorded, paid-for trade** — 15 frames at 2 ticks/frame is the only run
 * speed between two the user had already rejected, and fixing it *"needs a longer or higher-frame-rate
 * clip, i.e. money."* Failing them every build would demand a purchase nobody agreed to, so they are
 * declared in `ACCEPTED_POSE_REPEATS` and the measured minimum is printed either way.
 */
/**
 * Pose repeats that are **known, measured and accepted** — declared, never silently tolerated.
 *
 * Same shape and same reasoning as `ACCEPTED_EDGE_BLEED`: an exception the project has decided to
 * live with must be written down with its number, so that a NEW one fails the build instead of
 * joining an invisible pile.
 *
 * Both entries are the `run` retune's recorded cost. `motion.mjs` states it in advance — *"the clip
 * carries roughly 13 genuinely distinct poses per cycle, so 15 sampled frames necessarily repeats
 * some — the same mild defect already measured on the walk sheet (pairs 1-2, 4-5, 14-15, 18-19)"* —
 * and names the price of fixing it: *"a longer or higher-frame-rate clip, i.e. money."*
 *
 * ⚠️ The gate found `walk` **18-19** on its first run, which is one of the four pairs that paragraph
 * had already listed by hand. The prediction was right and nothing had been checking it since.
 *
 * `measured` is the value on the day it was accepted. A pair that gets WORSE than its recorded value
 * still fails — an accepted repeat is not a blank cheque for that pair.
 */
export const ACCEPTED_POSE_REPEATS = Object.freeze({
  'brass-courier/walk': Object.freeze({ pair: '18-19', measured: 0.00011 }),
  'brass-courier/run': Object.freeze({ pair: '9-10', measured: 0.00006 }),
});

export function gateAdjacentDistinct(frames, floor = ADJACENT_FLOOR, accepted = null) {
  if (frames.length < 2) {
    return verdict(INDETERMINATE, null, 'fewer than two frames — no adjacent pair to compare');
  }
  let worst = Number.POSITIVE_INFINITY;
  let worstPair = '';
  for (let i = 1; i < frames.length; i += 1) {
    const step = frameDifference(frames[i - 1], frames[i]);
    if (step < worst) {
      worst = step;
      worstPair = `${i - 1}-${i}`;
    }
  }
  if (worst >= floor) {
    return verdict(PASS, worst, `closest adjacent pair ${worstPair} differs by ${worst.toFixed(5)} >= ${floor}`);
  }
  // A declared repeat passes only for the pair it names, and only if it has not got worse. Both
  // halves matter: without the pair check an accepted entry would excuse a repeat somewhere else in
  // the same sheet, and without the value check it would excuse that pair degrading to a freeze.
  if (accepted && accepted.pair === worstPair && worst >= accepted.measured * 0.5) {
    return verdict(
      PASS,
      worst,
      `frames ${worstPair} differ by only ${worst.toFixed(5)} — ACCEPTED repeat, see ` +
        'ACCEPTED_POSE_REPEATS (the run retune bought this deliberately)',
    );
  }
  return verdict(
    FAIL,
    worst,
    `frames ${worstPair} differ by only ${worst.toFixed(5)} < ${floor} — the sheet repeats a pose`,
  );
}

