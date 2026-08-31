/**
 * **Six buttons, or one family of six buttons?**
 *
 * 🔴 Every cell of a plate is keyed, bounded, cropped and rescaled on its own
 * (`touchPlateCut.mjs`), and every downstream gate measures a face against itself: alpha band, ink
 * reproduction, mark distinctness, per-stroke contrast. **Not one of them compares two faces.** So a
 * sheet whose six buttons carry visibly different bezels, brass or patina passes the entire pipeline
 * — and a single-cell re-shoot passes it even more easily, because the model is asked in prose to
 * keep the family and prose is not an invariant. Codex round 15, finding 6.
 *
 * Owner decision, 2026-08-31: **build this before adopting the whole-plate redesign**, not after.
 * A redesign is exactly when a family invariant pays, and it is a precondition of the spend.
 *
 * ## What is measured, and what deliberately is not
 *
 * Three statistics, all read off the CUT face — post-key, post-crop, post-downscale — because that
 * is what ships:
 *
 * - **`roundness`** — the standard deviation of the silhouette's edge radius about its centroid,
 *   over the mean of that radius. A plate is a disc; a disc scores ~0.01 and a rounded square ~0.05.
 *   This is the bezel's SHAPE, and it is scale-free, which matters because `cutFace` crops to the
 *   figure's own bounds. **Coverage and mean radius are NOT used**: the crop-to-bounds forces both
 *   to about 0.78 and 79.5 px whatever the model drew, so they measure the cutter, not the art.
 * - **`bodyLuma`** — the mean luminance of the brightest 40 % of opaque pixels, which is the plate
 *   body rather than the mark cut into it.
 * - **`bodyWarmth`** — mean `R - B` over those same pixels. Brass is warm; steel, pewter and a
 *   desaturated re-interpretation are not, and this separates them at a glance where luminance
 *   cannot.
 * - **`bands`** — a RADIAL profile: mean luminance and mean warmth in each of `RADIAL_BANDS`
 *   annuli from the centroid, over non-mark pixels only.
 *
 * 🔴 **The three scalars alone are spatially blind, and that was a real hole.** Permute a face's
 * brass pixels and `bodyLuma` and `bodyWarmth` are unchanged to the last decimal, so a button lit
 * from below, a patina moved from the rim to the centre, or an entirely different inner bezel
 * inside the same circular outline all passed. Codex round 17, finding 3. The radial profile is
 * what makes the comparison positional: it is exactly where lighting, patina and bezel structure
 * live.
 *
 * ⚠️ **The MARK is excluded, and by a THRESHOLD rather than a semantic mask.** Six buttons that say
 * six different things must draw six different glyphs — 12.17 requires exactly that — so comparing
 * them would reject every correct set. A pixel counts as mark when its luminance falls below
 * `MARK_LUMA_SHARE` of its own face's `bodyLuma`; on the adopted set that is ~78 against a body of
 * ~130 and a mark of ~30, which separates cleanly. It is not a claim about meaning, and a band
 * where any face has fewer than `MIN_BAND_PX` non-mark pixels is skipped rather than compared,
 * because a mark-dominated annulus has nothing to say about the button.
 *
 * ## The bounds are a policy, fixed before the redesign exists
 *
 * Measured on the six adopted faces on 2026-08-31, before any new plate was generated:
 * `roundness` 0.0094-0.0110, `bodyLuma` 128.54-133.33, `bodyWarmth` 113.40-118.96. The spreads
 * below are four to twelve times those, so they reject a button from a different family and not the
 * ordinary variation a single sheet already carries. Fixing them now is what stops a new plate's own
 * numbers from choosing the bound that admits it.
 */

/** @typedef {import('./png.d.mts').RgbaImage} RgbaImage */

/** A silhouette this far from a disc is not this plate's bezel. Absolute, per face. */
export const MAX_FACE_ROUNDNESS = 0.06;

/** Below this `R - B` the body is not brass at all, whatever the other five look like. */
export const MIN_FACE_WARMTH = 40;

/** Spread across the set: max minus min. Roughly 12x, 4x and 4.5x the adopted set's own. */
export const MAX_ROUNDNESS_SPREAD = 0.02;
export const MAX_BODY_LUMA_SPREAD = 20;
export const MAX_WARMTH_SPREAD = 25;

/** Opaque means opaque: a halo pixel is neither body nor background. */
const BODY_ALPHA = 250;

/** The silhouette's own edge is read at half alpha, which is where `trimHalo` leaves it. */
const EDGE_ALPHA = 128;

/** Rays cast to trace the edge. 360 is one per degree — enough for a 160 px disc, and cheap. */
const RAYS = 360;

/** The share of opaque pixels, brightest first, taken as the plate BODY rather than the mark. */
const BODY_SHARE = 0.4;

/** Annuli in the radial profile, from the centroid out to the farthest opaque pixel. */
const RADIAL_BANDS = 8;

/** A pixel under this share of its own face's `bodyLuma` is mark, not body. */
const MARK_LUMA_SHARE = 0.6;

/** A band with fewer non-mark pixels than this in ANY face is skipped, not compared. */
const MIN_BAND_PX = 200;

/**
 * Per-band spread across the set.
 *
 * Measured on the adopted six, 2026-08-31: luminance at most **5.9** and warmth at most **10.1**
 * over the five comparable bands. These are **~2.5x** that.
 *
 * 🔴 **They were 25 and 40 — 4x — and at 4x the profile could not order its own mutation.** The
 * radial-inversion case moves the worst band by 30 (warmth) and 23 (luminance), so a 40 / 25 band
 * admitted a button lit from the wrong side and the spatial statistic was decoration. Tightening a
 * bound so it can detect the defect it names is the opposite of the failure the perf gates record:
 * there a bound was widened until a clean run passed; here the clean set keeps a 2.5x margin and
 * the mutation reds. *(vault: a statistic that does not order its own mutation cannot be fixed by
 * moving the bound — but one that ALMOST orders it can, and this is which case that was.)*
 *
 * ⚠️ If the whole-plate redesign reds these honestly, that is a finding to report, not a licence to
 * move them.
 */
export const MAX_BAND_LUMA_SPREAD = 15;
export const MAX_BAND_WARMTH_SPREAD = 25;

/** Fewer comparable bands than this and the profile is not measuring the button at all. */
const MIN_COMPARABLE_BANDS = 3;

/**
 * The three family numbers for one cut face.
 *
 * @param {RgbaImage} face
 * @returns {{ roundness: number, bodyLuma: number, bodyWarmth: number, bands: { n: number, luma: number, warmth: number }[] }}
 */
export function faceFamily(face) {
  const { width: w, height: h, data: d } = face;

  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (d[(y * w + x) * 4 + 3] < EDGE_ALPHA) continue;
      n += 1;
      sx += x;
      sy += y;
    }
  }
  if (n === 0) throw new Error('the face is entirely transparent — there is no silhouette to measure');
  const cx = sx / n;
  const cy = sy / n;

  const radii = [];
  for (let i = 0; i < RAYS; i += 1) {
    const t = (i * 2 * Math.PI) / RAYS;
    let far = 0;
    for (let r = 1; r < w; r += 0.5) {
      const x = Math.round(cx + Math.cos(t) * r);
      const y = Math.round(cy + Math.sin(t) * r);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (d[(y * w + x) * 4 + 3] >= EDGE_ALPHA) far = r;
    }
    radii.push(far);
  }
  const meanR = radii.reduce((a, b) => a + b, 0) / RAYS;
  const varR = radii.reduce((a, b) => a + (b - meanR) ** 2, 0) / RAYS;
  const roundness = Math.sqrt(varR) / meanR;

  /** @type {{ x: number, y: number, luma: number, warmth: number }[]} */
  const opaque = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < BODY_ALPHA) continue;
      opaque.push({
        x,
        y,
        luma: 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2],
        warmth: d[i] - d[i + 2],
      });
    }
  }
  if (opaque.length === 0) throw new Error('the face has no fully opaque pixel — there is no body to measure');
  const byLuma = [...opaque].sort((a, b) => a.luma - b.luma);
  const body = byLuma.slice(Math.floor(byLuma.length * (1 - BODY_SHARE)));
  const bodyLuma = body.reduce((a, b) => a + b.luma, 0) / body.length;

  // The radial profile, over non-mark pixels. `maxR` normalises it, so a face framed a few pixels
  // larger by the crop is compared band for band rather than pixel for pixel.
  const markBelow = bodyLuma * MARK_LUMA_SHARE;
  let maxR = 0;
  for (const p of opaque) {
    const r = Math.hypot(p.x - cx, p.y - cy);
    if (r > maxR) maxR = r;
  }
  const bands = Array.from({ length: RADIAL_BANDS }, () => ({ n: 0, luma: 0, warmth: 0 }));
  for (const p of opaque) {
    if (p.luma < markBelow) continue;
    const b = Math.min(RADIAL_BANDS - 1, Math.floor((Math.hypot(p.x - cx, p.y - cy) / maxR) * RADIAL_BANDS));
    const band = bands[b];
    band.n += 1;
    band.luma += p.luma;
    band.warmth += p.warmth;
  }

  return {
    roundness,
    bodyLuma,
    bodyWarmth: body.reduce((a, b) => a + b.warmth, 0) / body.length,
    bands: bands.map((b) => ({
      n: b.n,
      luma: b.n > 0 ? b.luma / b.n : NaN,
      warmth: b.n > 0 ? b.warmth / b.n : NaN,
    })),
  };
}

/**
 * Every reason this set is not one family, as sentences. Empty means it is.
 *
 * Pure and total: it returns the failures rather than throwing, so a test can assert the exact
 * sentence and a build can decide what to do with them.
 *
 * @param {Map<string, RgbaImage>} faces
 * @returns {string[]}
 */
export function familyFailures(faces) {
  /** @type {string[]} */
  const bad = [];
  const measured = [...faces].map(
    /** @returns {[string, { roundness: number, bodyLuma: number, bodyWarmth: number, bands: { n: number, luma: number, warmth: number }[] }]} */
    ([key, face]) => [key, faceFamily(face)],
  );

  for (const [key, m] of measured) {
    if (m.roundness > MAX_FACE_ROUNDNESS) {
      bad.push(`${key}: the bezel is ${m.roundness.toFixed(4)} from round, over ${MAX_FACE_ROUNDNESS}`);
    }
    if (m.bodyWarmth < MIN_FACE_WARMTH) {
      bad.push(`${key}: the body reads R-B ${m.bodyWarmth.toFixed(1)}, under ${MIN_FACE_WARMTH} — that is not brass`);
    }
  }

  /** @type {['roundness' | 'bodyLuma' | 'bodyWarmth', number, string][]} */
  const spreads = [
    ['roundness', MAX_ROUNDNESS_SPREAD, 'bezel shape'],
    ['bodyLuma', MAX_BODY_LUMA_SPREAD, 'body luminance'],
    ['bodyWarmth', MAX_WARMTH_SPREAD, 'body warmth'],
  ];
  for (const [stat, bound, what] of spreads) {
    const vals = measured.map(([, m]) => m[stat]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (hi - lo > bound) {
      const places = stat === 'roundness' ? 4 : 1;
      const worst = measured.map(([key, m]) => `${key} ${m[stat].toFixed(places)}`).join(', ');
      bad.push(`${what} spans ${(hi - lo).toFixed(places)}, over ${bound} — ${worst}`);
    }
  }

  // 🔴 The SPATIAL comparison. Everything above is a scalar over an unordered bag of pixels and is
  // blind to where they are; this is not. A band is compared only where every face has real
  // non-mark area in it — a mark-dominated annulus says nothing about the button.
  let comparable = 0;
  for (let b = 0; b < RADIAL_BANDS; b += 1) {
    if (measured.some(([, m]) => m.bands[b].n < MIN_BAND_PX)) continue;
    comparable += 1;
    for (const [stat, bound, what] of /** @type {['luma' | 'warmth', number, string][]} */ ([
      ['luma', MAX_BAND_LUMA_SPREAD, 'lighting'],
      ['warmth', MAX_BAND_WARMTH_SPREAD, 'patina'],
    ])) {
      const vals = measured.map(([, m]) => m.bands[b][stat]);
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      if (hi - lo > bound) {
        const worst = measured.map(([key, m]) => `${key} ${m.bands[b][stat].toFixed(1)}`).join(', ');
        bad.push(
          `${what} disagrees at radius band ${b} of ${RADIAL_BANDS}: spans ${(hi - lo).toFixed(1)}, over ${bound} — ${worst}`,
        );
      }
    }
  }
  if (comparable < MIN_COMPARABLE_BANDS) {
    bad.push(
      `only ${comparable} of ${RADIAL_BANDS} radius bands carry comparable body in every face, ` +
        `under ${MIN_COMPARABLE_BANDS} — the marks cover so much of these buttons that their ` +
        'bezels cannot be compared at all',
    );
  }

  return bad;
}
