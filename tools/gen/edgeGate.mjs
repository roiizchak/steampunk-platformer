/**
 * **G6 — edge bleed.** The gate no criterion owned until every clip in this phase came back cropped.
 *
 * ## The defect, and why nothing caught it
 *
 * Every generated animation clip in Phase 5 shipped with the subject sheared off at the left and/or
 * right edge of the frame — `brass-sentry-fire`'s muzzle and far leg are cut off in all six sampled
 * frames of all three of its clips. The prompt already forbids this in words (`motion.mjs`'s
 * `HOLD_CAMERA` says the subject "is never cropped by any edge", and the forbid tail lists "cropped
 * limbs"), and the model ignored both. **Words are not a gate.** No existing measurement in
 * `gates.mjs` looks at frame edges at all — `gateReachBand` measures how far MOVED pixels reach, not
 * whether the whole figure sits clear of the canvas, and nothing else is even adjacent.
 *
 * ## What is measured, and by whom
 *
 * The **chroma-keyed subject mask** — the set of pixels that are NOT background, exactly as
 * `chroma.mjs`'s `keyOut` already decides it (vault **5.3**: two definitions of one concept is where
 * the bug lives). This module makes no separate background/foreground call of its own; `frame` is
 * expected to already be the output of `keyOut` (or an equivalent RGBA image where alpha means
 * subject membership), the same convention `gateMotionFloor`, `gateLoopWrap` and `gateSeam` already
 * use for their `RgbaImage` inputs.
 *
 * FAILs when the subject mask's bounding box touches column 0, column `width - 1`, row 0, or
 * row `height - 1` of `frame` — or comes closer than `marginPx`. The caller decides what `frame`
 * spans: `build-clips.mjs` passes the ORIGINAL, un-padded video frame region (undoing its own
 * `GUTTER` pad), because that is the canvas Seedance actually rendered into and the one whose edge
 * the model cropped against. Passing a tightly-cropped image here would make every subject touch
 * every edge by construction, which is not a measurement.
 *
 * ## What this gate CANNOT see — stated once, deliberately
 *
 * **G6 catches a subject bounding box reaching an edge. It cannot tell that the model omitted a
 * muzzle or a limb while leaving green margin.** A figure that is missing a hand but drawn fully
 * inside the frame, with chroma to spare on every side, passes this gate cleanly. That is a
 * different defect — an anatomical omission, not a framing one — and this gate does not claim to
 * see it, the same way `BLIND_SPOTS` in `gates.mjs` names what its own metrics cannot reach.
 */

import { FAIL, PASS } from './gates.mjs';

/**
 * Alpha at or above this counts as subject: **255, fully opaque, and not a tuning knob.**
 *
 * `chroma.mjs`'s `keyOut` is a SOFT key (see that module's own header). A pixel between `CHROMA.LOW`
 * and `CHROMA.HIGH` is spill-suppressed BACKGROUND — despilled and given a small non-zero alpha on
 * purpose, so a faint green-tinted rim survives instead of a hard cutout edge — not a faint or
 * partially-drawn piece of the figure. `keyOut` only ever leaves a pixel's alpha genuinely UNTOUCHED
 * when its key-distance clears `CHROMA.HIGH` outright (`chroma.mjs:221-223`); every pixel the ramp
 * band touches comes out strictly below its original alpha. Because every frame this gate measures
 * started out fully opaque (raw video/PNG, no pre-existing transparency), "untouched by the ramp"
 * and "alpha == 255" are the same condition for this pipeline. That is the whole test this module
 * needs to make: not "how faint is this pixel" but "did the key decide this pixel is background".
 *
 * The old value, 8, measured that faint band instead of the subject, and it was a false positive:
 * the shipped, clean Phase 4 `idle` clip has a **pure chroma-green run of 90+ px at its right edge**,
 * yet a slight luminance gradient inside that green kept a few of those columns' key-distance just
 * under `CHROMA.HIGH`, so at `minAlpha` 8 it read as a subject touching the edge (measured margins:
 * left 30px, right 0px). Raising the floor to the ramp's ceiling made the same clip clear every edge
 * by 13px+ (worst side; left 30, right 41, top 13, bottom 6 — see
 * `tests/fixtures/edges/idle-clean-frame.png`), while the real cropped `brass-sentry-fire` defect
 * stayed at 0px on both left and right at EVERY threshold from 8 up to 255 (see
 * `tests/fixtures/edges/brass-sentry-fire-frame.png`). That is a categorical gap between the two
 * clips' margins, not a knife-edge — 255 sits on the safe side of it by construction, not by trial.
 */
const DEFAULT_MIN_ALPHA = 255;

/**
 * How close the subject may come to the canvas edge before it reads as cropped rather than merely
 * close, in px. **3, not 0 and not something large.** Zero would only catch a subject that touches
 * the very last row of pixels, which is a stricter claim than "cropped" needs — a model that sheared
 * a muzzle one pixel short of the edge is not meaningfully different from one that sheared it exactly
 * on the edge. Large would start failing legitimately tight compositions; `trimHalo` elsewhere in
 * this pipeline treats 1-2px as the width of ordinary anti-aliasing, so 3px clears that band with one
 * pixel to spare rather than guessing at a much wider number nothing has measured.
 */
export const DEFAULT_MARGIN_PX = 3;

function verdict(status, value, reason) {
  return { status, value, reason };
}

/** Opaque bounding box of the subject mask, or `null` if nothing survived keying. */
function subjectBounds(frame, minAlpha) {
  const { width, height, data } = frame;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] >= minAlpha) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/**
 * Measure how close a chroma-keyed frame's subject comes to its own edges.
 *
 * `frame` is an already-keyed RGBA image (`chroma.mjs`'s `keyOut` output, or equivalent) — see the
 * header for why this module never keys a second time. Returns a gate verdict whose `value` carries
 * the measured margin on every side, in px, so a caller can see how close a PASS actually was.
 */
export function gateEdgeBleed(frame, options = {}) {
  const minAlpha = options.minAlpha ?? DEFAULT_MIN_ALPHA;
  const marginPx = options.marginPx ?? DEFAULT_MARGIN_PX;

  const bounds = subjectBounds(frame, minAlpha);
  if (bounds === null) {
    return verdict(FAIL, null, 'no subject mask survived keying — there is nothing to measure');
  }

  const margins = {
    left: bounds.minX,
    right: frame.width - 1 - bounds.maxX,
    top: bounds.minY,
    bottom: frame.height - 1 - bounds.maxY,
  };
  const value = { width: frame.width, height: frame.height, bounds, margins, marginPx };

  // Closer than the margin, NOT only touching — a boundary equal to marginPx is the pass side,
  // asserted deliberately both ways in the unit suite.
  const failedEdges = Object.entries(margins)
    .filter(([, distance]) => distance < marginPx)
    .map(([edge]) => edge);

  if (failedEdges.length > 0) {
    return verdict(
      FAIL,
      value,
      `subject mask comes within ${marginPx}px of the frame on the ${failedEdges.join(', ')} ` +
        `edge(s) (margins: left ${margins.left}px, right ${margins.right}px, top ${margins.top}px, ` +
        `bottom ${margins.bottom}px) — this reads as cropped, not merely close`,
    );
  }

  const closest = Math.min(margins.left, margins.right, margins.top, margins.bottom);
  return verdict(
    PASS,
    value,
    `subject mask clears every edge by at least ${marginPx}px (closest margin ${closest}px)`,
  );
}
