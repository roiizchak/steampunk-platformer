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
 *
 * ⚠️ **The MARK is not compared, on purpose.** Six buttons that say six different things must draw
 * six different glyphs; 12.17's distinctness gate exists to require exactly that. This asks whether
 * they are the same BUTTON, not whether they carry the same picture.
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

/**
 * The three family numbers for one cut face.
 *
 * @param {RgbaImage} face
 * @returns {{ roundness: number, bodyLuma: number, bodyWarmth: number }}
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

  /** @type {{ luma: number, warmth: number }[]} */
  const opaque = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < BODY_ALPHA) continue;
      opaque.push({
        luma: 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2],
        warmth: d[i] - d[i + 2],
      });
    }
  }
  if (opaque.length === 0) throw new Error('the face has no fully opaque pixel — there is no body to measure');
  opaque.sort((a, b) => a.luma - b.luma);
  const body = opaque.slice(Math.floor(opaque.length * (1 - BODY_SHARE)));
  return {
    roundness,
    bodyLuma: body.reduce((a, b) => a + b.luma, 0) / body.length,
    bodyWarmth: body.reduce((a, b) => a + b.warmth, 0) / body.length,
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
    /** @returns {[string, { roundness: number, bodyLuma: number, bodyWarmth: number }]} */
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
  return bad;
}
