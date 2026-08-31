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
 * - **`sectors`** — an ANGULAR profile, the same two means in each of `ANGULAR_SECTORS` wedges.
 *   This is where the LIGHT DIRECTION lives, and it is plainly there in the adopted set: sectors 4
 *   and 5 read ~140 against ~100 at sectors 0-2. A radial profile integrates around the whole
 *   annulus and so cannot see a button lit from the opposite side; rotating a face's brass by half
 *   a turn leaves every scalar AND every band untouched. Found by Codex mid-round-18.
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

/** Wedges in the angular profile, from the centroid. */
const ANGULAR_SECTORS = 8;

/** A pixel under this share of its own face's `bodyLuma` is mark, not body. */
const MARK_LUMA_SHARE = 0.6;

/** A slice — annulus or wedge — with fewer non-mark pixels than this in ANY face is skipped. */
const MIN_SLICE_PX = 200;

/**
 * Per-band spread across the set.
 *
 * Measured on the adopted six, 2026-08-31: luminance at most **5.9** and warmth at most **10.1**
 * over the five comparable bands. These are **~2.5x** that.
 *
 * 🔴 **PROVISIONAL, AND CHOSEN AFTER SEEING THE MUTATION. Owner decision, 2026-08-31.**
 *
 * They were 25 and 40 — 4x — and at 4x the profile did not trip on the radial-inversion case, which
 * moves the worst band by 30 (warmth) and 23 (luminance). Changing them to 2.5x so that it does is
 * **post-data threshold selection**, which is the move CLAUDE.md § 5 forbids, and calling it "the
 * statistic almost ordered its mutation" was an exception invented on the spot to permit it. Codex
 * round 18, finding 5, and it was right.
 *
 * The owner approved these as **provisional**, on one condition: **the whole-plate redesign is the
 * held-out set.** It does not exist yet, so it cannot have influenced these numbers, and it is the
 * art these bounds were built for. If the new plate reds them honestly, that is a **finding to
 * bring to the owner** — never a licence to move the bound to admit it.
 *
 * ⚠️ Until that plate is measured, treat every family verdict as resting on a threshold whose only
 * validation is the set it was derived from.
 */
export const MAX_BAND_LUMA_SPREAD = 15;
export const MAX_BAND_WARMTH_SPREAD = 25;

/**
 * Per-sector spread across the set. Measured on the adopted six, 2026-08-31: luminance at most
 * **6.9** and warmth at most **10.9**, every sector comparable. Same ~2.5x as the bands.
 */
export const MAX_SECTOR_LUMA_SPREAD = 18;
export const MAX_SECTOR_WARMTH_SPREAD = 28;

/** Fewer comparable slices than this and the profile is not measuring the button at all. */
const MIN_COMPARABLE_SLICES = 3;

/**
 * The share of a slice's opaque area that must survive the mark threshold for that face to be
 * carrying body there.
 *
 * Measured on the adopted six: the outer bands run 0.49-0.99 and the inner ones 0.00-0.63, because
 * a boot covers more of the centre than a two-by-two grid does — which is legitimate and is why
 * only slices where the SET agrees there is body get compared.
 */
const MIN_RETAINED_SHARE = 0.45;

/**
 * The three family numbers for one cut face.
 *
 * @param {RgbaImage} face
 * @returns {{ roundness: number, bodyLuma: number, bodyWarmth: number, bands: { n: number, luma: number, warmth: number }[], sectors: { n: number, luma: number, warmth: number }[] }}
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
  const bands = Array.from({ length: RADIAL_BANDS }, () => ({ n: 0, total: 0, luma: 0, warmth: 0 }));
  const sectors = Array.from({ length: ANGULAR_SECTORS }, () => ({ n: 0, total: 0, luma: 0, warmth: 0 }));
  for (const p of opaque) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const bi = Math.min(RADIAL_BANDS - 1, Math.floor((Math.hypot(dx, dy) / maxR) * RADIAL_BANDS));
    let a0 = Math.atan2(dy, dx);
    if (a0 < 0) a0 += 2 * Math.PI;
    const si = Math.min(ANGULAR_SECTORS - 1, Math.floor((a0 / (2 * Math.PI)) * ANGULAR_SECTORS));
    // 🔴 `total` counts the slice's whole opaque area, mark included, and it is counted BEFORE
    // the mark is dropped. Without it a face could darken an annulus out of the comparison and
    // the gate would delete the very slice that disagreed. Codex round 18, finding 3.
    bands[bi].total += 1;
    sectors[si].total += 1;
    if (p.luma < markBelow) continue;
    const band = bands[bi];
    band.n += 1;
    band.luma += p.luma;
    band.warmth += p.warmth;

    const sector = sectors[si];
    sector.n += 1;
    sector.luma += p.luma;
    sector.warmth += p.warmth;
  }

  /** @param {{ n: number, total: number, luma: number, warmth: number }[]} raw */
  const mean = (raw) =>
    raw.map((b) => ({
      n: b.n,
      share: b.total > 0 ? b.n / b.total : NaN,
      luma: b.n > 0 ? b.luma / b.n : NaN,
      warmth: b.n > 0 ? b.warmth / b.n : NaN,
    }));

  return {
    roundness,
    bodyLuma,
    bodyWarmth: body.reduce((a, b) => a + b.warmth, 0) / body.length,
    bands: mean(bands),
    sectors: mean(sectors),
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
    /** @returns {[string, { roundness: number, bodyLuma: number, bodyWarmth: number, bands: { n: number, luma: number, warmth: number }[], sectors: { n: number, luma: number, warmth: number }[] }]} */
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

  // 🔴 The SPATIAL comparison, in two directions. Everything above is a scalar over an unordered
  // bag of pixels and is blind to where they are; these are not.
  //
  // **Both are needed and neither subsumes the other.** A radial profile integrates around the whole
  // annulus, so a face lit from the opposite side — the same brass rotated half a turn — leaves
  // every band identical. An angular profile integrates from centre to rim, so a patina moved from
  // the rim inward leaves every sector identical. Codex named the second hole in round 17 and the
  // first mid-round-18.
  //
  // A slice is compared only where every face has real non-mark area in it: a mark-dominated
  // annulus or wedge says nothing about the button.
  for (const [slices, count, bounds, where] of /** @type {['bands' | 'sectors', number, [number, number], string][]} */ ([
    ['bands', RADIAL_BANDS, [MAX_BAND_LUMA_SPREAD, MAX_BAND_WARMTH_SPREAD], 'radius band'],
    ['sectors', ANGULAR_SECTORS, [MAX_SECTOR_LUMA_SPREAD, MAX_SECTOR_WARMTH_SPREAD], 'angular sector'],
  ])) {
    let comparable = 0;
    for (let i = 0; i < count; i += 1) {
      const carries = (m) => m[slices][i].share >= MIN_RETAINED_SHARE && m[slices][i].n >= MIN_SLICE_PX;
      const withBody = measured.filter(([, m]) => carries(m));

      // 🔴 **Eligibility is decided by the OTHERS, and a lone depleted face is a FAILURE rather
      // than a reason to delete the slice.** It used to be "skip if ANY face is short", which
      // handed a drifted face the power to erase the evidence against it: darken one annulus past
      // the mark threshold and the disagreeing slice simply stopped being compared, while the
      // brightest-40 % scalars barely moved. Codex round 18, finding 3.
      if (withBody.length < measured.length - 1) continue;
      comparable += 1;

      for (const [key, m] of measured) {
        if (carries(m)) continue;
        bad.push(
          `${key} has almost no body at ${where} ${i} of ${count} — ${(m[slices][i].share * 100).toFixed(0)}% ` +
            `of that slice survives the mark threshold where every other face keeps at least ` +
            `${(MIN_RETAINED_SHARE * 100).toFixed(0)}%`,
        );
      }

      for (const [stat, bound, what] of /** @type {['luma' | 'warmth', number, string][]} */ ([
        ['luma', bounds[0], 'lighting'],
        ['warmth', bounds[1], 'patina'],
      ])) {
        const vals = withBody.map(([, m]) => m[slices][i][stat]);
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        if (hi - lo > bound) {
          const worst = withBody.map(([key, m]) => `${key} ${m[slices][i][stat].toFixed(1)}`).join(', ');
          bad.push(
            `${what} disagrees at ${where} ${i} of ${count}: spans ${(hi - lo).toFixed(1)}, over ${bound} — ${worst}`,
          );
        }
      }
    }
    if (comparable < MIN_COMPARABLE_SLICES) {
      bad.push(
        `only ${comparable} of ${count} ${where}s carry comparable body in every face, under ` +
          `${MIN_COMPARABLE_SLICES} — the marks cover so much of these buttons that their bezels ` +
          'cannot be compared at all',
      );
    }
  }

  return bad;
}
