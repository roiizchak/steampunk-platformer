/**
 * Choosing WHICH source frames of a clip become the sheet.
 *
 * Pure: it takes a matrix of frame-to-frame differences and returns indices. No ffmpeg, no I/O, no
 * images — which is what lets `tests/unit/clip-sampler.test.ts` run it on a synthetic periodic
 * signal where the right answer is known by construction *(vault 4.21)*.
 *
 * ## Why this is not "sample N frames evenly across the clip"
 *
 * `simTicks` is the duration of ONE locomotion cycle — `round(stride / speed)` *(vault 4.22)*. A
 * sheet holding two strides therefore halves the derived fps and puts the foot-slide the derivation
 * exists to prevent straight back on the screen. So the sheet must hold exactly one cycle, and the
 * question is how long one cycle IS.
 *
 * **The prompt cannot answer that.** The motion briefs ask for exactly two cycles per four-second
 * clip, which is the count a sibling project measured as reliable — and measured on these clips, the
 * model delivered **4.0 for walk, 6.1 for run and 2.6 for idle**. Asking again is a coin flip on a
 * model STYLE.md §3 records as not seed-deterministic. The clip is in hand; the cycle length is a property of it,
 * and properties of a file get measured *(vault 4.11)*.
 *
 * ## Why not autocorrelation
 *
 * Tried first, and it does not work here. Autocorrelating each frame's silhouette difference against
 * frame 0 returned `r = 0.27-0.30` on all three clips and called the idle **12 cycles** — the signal
 * is dominated by the monotone rise away from frame 0, which correlates at almost any lag. A weak
 * correlation peak reported as a period is exactly vault **4.18**'s warning: a metric that cannot
 * call the answer must say so rather than guess one.
 *
 * ## What this does instead — ask the gate's own question
 *
 * A cycle is, by definition, the shortest window after which the pose repeats. That is the same
 * question `gateLoopWrap` asks of a finished sheet: *is the wrap bigger than a step the clip already
 * contains?* So the search optimises the criterion that will judge the result:
 *
 *   the SHORTEST window whose wrap, after sampling N frames from it, is no larger than
 *   `slack x` its own median step.
 *
 * A window shorter than one cycle has its endpoints out of phase, so the wrap is many steps wide and
 * the ratio blows past `slack`. A window of exactly one cycle closes. Two cycles closes too — hence
 * *shortest*, taken by scanning length ascending and stopping at the first that passes.
 */

/**
 * The wrap budget, as a multiple of the window's own median step.
 *
 * Deliberately the same 1.5 `gateLoopWrap` uses, and for the same reason: a wrap no larger than a
 * step the clip already contains cannot read as a snap, because the viewer has already seen a jump
 * that size and read it as motion. Choosing the window on a looser rule than the gate that judges it
 * would mean building sheets the gate then rejects.
 */
export const WRAP_SLACK = 1.5;

/**
 * A window whose median step is below this is frozen, not closed.
 *
 * Without it the search has a degenerate answer: a window over which nothing moves has a wrap of
 * roughly zero and a median step of roughly zero, and passes the ratio test on noise. Expressed as a
 * fraction of the silhouette because `diff` is, so it does not depend on working resolution.
 */
export const MIN_MEDIAN_STEP = 0.002;

/**
 * How small the wrap must be against the window's furthest excursion from its own first frame.
 *
 * **`wrap <= slack x medianStep` alone is not enough, and the first run of this sampler proved it.**
 * It chose a 12-frame window — the shortest length the search allows — for both walk and run, and
 * reported 8.1 cycles in a clip whose feet plainly showed 4 and 6. At a short window the samples are
 * adjacent source frames, so the median step is tiny and noisy, and with 85 candidate starts to
 * choose from one of them always scores well by luck. Shortest-that-passes then locks onto it.
 *
 * The missing question is the one that actually defines a cycle: did the pose travel away from where
 * it started and come BACK? A half-cycle window is monotone, so its furthest point from frame 1 IS
 * its last frame and `wrap / excursion` sits at ~1. A whole cycle turns around in the middle, so its
 * excursion is large while its wrap stays small. That ratio cannot be faked by a small window.
 *
 * **0.12 is read off the clips, not chosen.** Sweeping every window length over the three cyclic
 * clips and taking the best start at each length produces two clearly separated populations:
 *
 * ```
 *   real closures      walk L=24 -> 0.025   run L=16 -> 0.045   idle L=37 -> 0.106
 *   best-of-85 noise   walk L=12 -> 0.319   run L=12 -> 0.489   idle L=12 -> 0.522
 * ```
 *
 * Nothing at all falls between 0.11 and 0.15. The threshold sits in that gap, and the cycle counts
 * it recovers — 4.0, 6.1 and 2.6 per clip — agree with the foot-spread measured independently off
 * the same clips. At 0.4 the noise population passed and the sampler chose the minimum length every
 * time; that is the whole bug this constant fixes.
 */
export const MAX_WRAP_OVER_EXCURSION = 0.12;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The `frames` source-frame indices sampled evenly from `[start, start + length]`.
 *
 * Rounded to integers, because a source frame is a source frame — there is no interpolation step
 * anywhere in this pipeline and inventing one would blend two drawn poses into a pose the model
 * never produced.
 */
export function windowIndices(start, length, frames) {
  return Array.from({ length: frames }, (_, t) => start + Math.round((t * length) / frames));
}

/**
 * Score one candidate window. Returns `null` when it is frozen rather than closed.
 *
 * `diff(i, j)` must return the fraction of the silhouette that differs between source frames `i`
 * and `j` — symmetric, zero on the diagonal.
 */
export function scoreWindow(diff, indices) {
  const steps = indices.slice(0, -1).map((k, t) => diff(k, indices[t + 1]));
  const step = median(steps);
  if (!(step >= MIN_MEDIAN_STEP)) return null;
  const wrap = diff(indices[indices.length - 1], indices[0]);
  // How far the pose ever got from where it started. For a whole cycle this peaks in the middle of
  // the window; for a monotone half-cycle it peaks at the end, which is the wrap itself.
  const excursion = Math.max(...indices.map((k) => diff(indices[0], k)));
  return { step, wrap, excursion, ratio: wrap / step, returned: wrap / (excursion || 1) };
}

/**
 * How far the pose must have left frame 0 before a one-shot animation is considered to have started.
 *
 * **Every clip opens on the anchor pose, because the anchor is the start image.** So a jump clip
 * spends its first stretch with the courier standing still, and sampling six frames evenly across
 * the whole thing spends one or two of them on a standing figure — inside an 18-tick animation that
 * is a third of it. Measured on these clips the onset is around source frame 20 of 97.
 *
 * Expressed as a fraction of the clip's own furthest departure rather than an absolute difference,
 * so it does not care whether the motion is large (a jump) or small, and does not need retuning per
 * animation.
 */
export const ONSET_FRACTION = 0.25;

/**
 * Where a ONE-SHOT animation actually begins, in source frames.
 *
 * Returns 0 when the clip is already moving at frame 0 — which is the correct answer, not a
 * fallback.
 */
export function motionOnset(diff, sourceFrames, fraction = ONSET_FRACTION) {
  const from0 = Array.from({ length: sourceFrames }, (_, t) => diff(0, t));
  const peak = Math.max(...from0);
  if (!(peak > 0)) return 0;
  const threshold = peak * fraction;
  const at = from0.findIndex((d) => d >= threshold);
  return at < 0 ? 0 : at;
}

/**
 * The shortest window that closes, scanning length ascending.
 *
 * `start` is searched too: a clip does not necessarily begin at a clean phase, and starting mid-step
 * costs nothing to try. For each length the best-scoring start wins; the first length whose best
 * start passes the wrap budget is the answer, which is what makes this find ONE cycle rather than
 * two.
 *
 * Returns `null` when no window closes — an honest INDETERMINATE *(vault 4.18)* rather than a
 * fallback to even sampling, because even sampling is precisely the thing that ships two strides in
 * a one-stride sheet.
 */
export function chooseCycleWindow(diff, { sourceFrames, frames, slack = WRAP_SLACK }) {
  if (frames < 3) throw new Error('sampler: a cycle window needs at least 3 sampled frames');
  const closes = (s) => s.ratio <= slack && s.returned <= MAX_WRAP_OVER_EXCURSION;
  for (let length = frames; length <= sourceFrames - 1; length += 1) {
    let best = null;
    for (let start = 0; start + length <= sourceFrames - 1; start += 1) {
      const indices = windowIndices(start, length, frames);
      const score = scoreWindow(diff, indices);
      if (!score || !closes(score)) continue;
      // Among the starts that genuinely close at this length, prefer the one that closes tightest.
      if (!best || score.returned < best.returned) best = { ...score, start, length, indices };
    }
    if (best) return best;
  }
  return null;
}
