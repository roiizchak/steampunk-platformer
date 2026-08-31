/**
 * **Six buttons, or one family of six buttons?**
 *
 * 🔴 Every cell of a plate is keyed, bounded, cropped and rescaled on its own
 * (`touchPlateCut.mjs`), and every downstream gate measures a face against itself: alpha band, ink
 * reproduction, mark distinctness, per-stroke contrast. **Not one of them compares two faces.** So a
 * sheet whose six buttons carry visibly different bezels, brass or patina passes the entire pipeline
 * — and a single-cell re-shoot passes it more easily still, because the model is asked in prose to
 * keep the family and prose is not an invariant. Codex round 15, finding 6.
 *
 * Owner decision, 2026-08-31: **build this before adopting the whole-plate redesign**, not after.
 *
 * ## What is measured
 *
 * - **`roundness`** — the standard deviation of the silhouette's edge radius about its centroid,
 *   over the mean of that radius. A disc scores ~0.01 and a rounded square ~0.05. Scale-free, which
 *   matters because `cutFace` crops to the figure's own bounds. **Coverage and mean radius are NOT
 *   used**: crop-to-bounds forces both to ~0.78 and ~79.5 px whatever the model drew, so they
 *   measure the cutter, not the art.
 * - **`bodyLuma`** / **`bodyWarmth`** — mean luminance and mean `R - B` over the brightest 40 % of
 *   opaque pixels. Brass is warm; steel, pewter and a desaturated re-interpretation are not.
 * - **`cells`** — a JOINT polar grid, `OUTER_RINGS` x `OUTER_SECTORS`, over the outer
 *   `1 - OUTER_R0` of the radius, over **every** opaque pixel in it.
 *
 * ## Three earlier versions of the spatial half were each defeated, and how
 *
 * 🔴 **Scalars alone are spatially blind.** Permute a face's brass and `bodyLuma` and `bodyWarmth`
 * are unchanged to the last decimal, so a button lit from below or with its patina moved passed.
 * *(Codex round 17, finding 3.)*
 *
 * 🔴 **A radial profile is angularly blind.** Rotating a face half a turn maps every annulus to
 * itself, so every band mean is identical while the light plainly comes from the other side.
 * *(Codex round 18, finding 2.)*
 *
 * 🔴 **Radial and angular profiles side by side are still only two MARGINALS.** Swap inner-left with
 * inner-right and outer-right with outer-left and both one-dimensional summaries are preserved
 * exactly while the lighting is visibly rearranged. *(Codex round 19, finding 3.)* Hence a **joint**
 * grid: a cell is one radius band AND one angular wedge, and no rearrangement between cells survives
 * it.
 *
 * ## Two things this version deliberately does NOT have, and why
 *
 * ⚠️ **No mark threshold.** Earlier versions dropped dark pixels as "mark" using a per-face
 * luminance cut, which handed a drifted face the power to erase the evidence against it: darken an
 * annulus past the threshold and the disagreeing slice stopped being compared, while the
 * brightest-40 % scalars barely moved *(Codex round 18, finding 3)*. The grid is confined to the
 * **outer** part of the radius instead, where the buttons carry bezel rather than glyph, and every
 * opaque pixel there counts. Darkening any of them now moves its cell's mean directly.
 *
 * ⚠️ **No eligibility rule.** Deciding which slices to compare from how many faces survived their
 * own threshold meant two depleted faces could still erase a slice, and one legitimately larger mark
 * was condemned as damage *(Codex round 19, finding 2)*. The region is FIXED GEOMETRY, so no face
 * can vote a cell out of the comparison, and there is nothing to be eligible for.
 *
 * ⚠️ **The MARK is not compared**, which the outer region achieves by construction rather than by
 * classification. Six buttons that say six different things must draw six different glyphs; 12.17
 * requires exactly that. This asks whether they are the same BUTTON.
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

/** Where the compared region starts, as a share of the face's own maximum radius. */
export const OUTER_R0 = 0.5;

/** The joint polar grid over that region. 24 cells, none under 480 px on the adopted set. */
export const OUTER_RINGS = 3;
export const OUTER_SECTORS = 8;

/**
 * A cell holding fewer opaque pixels than this in any face is a failure, not a skip.
 *
 * The adopted set's smallest cell holds **483**. This is a floor on the button FILLING its own
 * outer region, which is a family property in its own right — and it can never be used to drop a
 * cell from the comparison, because the region is fixed geometry.
 */
export const MIN_CELL_PX = 100;

/**
 * **How far one face may sit from the other five, per cell.** Owner decision, 2026-08-31.
 *
 * The question is an OUTLIER question — *is one of these six not from this family?* — so the
 * statistic is each face's deviation from the **median of the other five**, not the spread of all
 * six. A spread includes the suspect's own contribution and so is dragged toward admitting it.
 *
 * Measured on the adopted six: the worst within-family deviation is **17.5** (luminance) and
 * **16.0** (warmth), at `touch-attack`, cell 6.
 *
 * 🔴 **These bounds were fixed at 2.5x those figures BEFORE any mutation was run against this
 * statistic**, and they are 44 and 40 for that reason alone. The multiple is the one the owner
 * approved on 2026-08-31 for the statistic this replaces; the previous version's 15/25 was chosen
 * *after* seeing that 25/40 failed to red its mutation, which is post-data threshold selection and
 * is what CLAUDE.md § 5 forbids *(Codex round 18, finding 5)*. **Whether the mutations red at 44/40
 * is an outcome to report, never a reason to move these.**
 *
 * They remain **PROVISIONAL**, on the owner's condition: **the whole-plate redesign is the held-out
 * set.** It does not exist yet, so it cannot have influenced these numbers, and it is the art they
 * were built for. If the new plate reds them honestly, that is a finding to bring to the owner.
 *
 * ⚠️ `tests/unit/touch-family-policy.test.ts` pins these exact values. A red there is an approval
 * checkpoint, never something to clear by editing the pin.
 */
export const MAX_CELL_LUMA_DEVIATION = 44;
export const MAX_CELL_WARMTH_DEVIATION = 40;

/** Opaque means opaque: a halo pixel is neither body nor background. */
const BODY_ALPHA = 250;

/** The silhouette's own edge is read at half alpha, which is where `trimHalo` leaves it. */
const EDGE_ALPHA = 128;

/** Rays cast to trace the edge. 360 is one per degree — enough for a 160 px disc, and cheap. */
const RAYS = 360;

/** The share of opaque pixels, brightest first, taken as the plate BODY rather than the mark. */
const BODY_SHARE = 0.4;

/**
 * The family numbers for one cut face.
 *
 * @param {RgbaImage} face
 * @returns {{ roundness: number, bodyLuma: number, bodyWarmth: number, cells: { n: number, luma: number, warmth: number }[] }}
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

  let maxR = 0;
  for (const p of opaque) {
    const r = Math.hypot(p.x - cx, p.y - cy);
    if (r > maxR) maxR = r;
  }

  const raw = Array.from({ length: OUTER_RINGS * OUTER_SECTORS }, () => ({ n: 0, luma: 0, warmth: 0 }));
  for (const p of opaque) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const r = Math.hypot(dx, dy) / maxR;
    if (r < OUTER_R0) continue;
    const ring = Math.min(OUTER_RINGS - 1, Math.floor(((r - OUTER_R0) / (1 - OUTER_R0)) * OUTER_RINGS));
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += 2 * Math.PI;
    const sector = Math.min(OUTER_SECTORS - 1, Math.floor((angle / (2 * Math.PI)) * OUTER_SECTORS));
    const cell = raw[ring * OUTER_SECTORS + sector];
    cell.n += 1;
    cell.luma += p.luma;
    cell.warmth += p.warmth;
  }

  return {
    roundness,
    bodyLuma: body.reduce((a, b) => a + b.luma, 0) / body.length,
    bodyWarmth: body.reduce((a, b) => a + b.warmth, 0) / body.length,
    cells: raw.map((c) => ({
      n: c.n,
      luma: c.n > 0 ? c.luma / c.n : NaN,
      warmth: c.n > 0 ? c.warmth / c.n : NaN,
    })),
  };
}

/** The median of a list, which is what a face is compared against. */
function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[mid - 1] + s[mid]) / 2;
}

/** Where a cell index sits, for an error message someone has to act on. */
function cellName(i) {
  return `ring ${Math.floor(i / OUTER_SECTORS)} sector ${i % OUTER_SECTORS}`;
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
    /** @returns {[string, ReturnType<typeof faceFamily>]} */
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

  // 🔴 The JOINT polar grid, over fixed geometry, with every opaque pixel counted. Each face is
  // measured against the CONSENSUS of the others, cell by cell, which is the outlier question this
  // gate actually asks. Nothing here can be voted out of the comparison by the face under suspicion.
  if (measured.length >= 3) {
    for (let i = 0; i < OUTER_RINGS * OUTER_SECTORS; i += 1) {
      for (const [key, m] of measured) {
        if (m.cells[i].n < MIN_CELL_PX) {
          bad.push(
            `${key} puts only ${m.cells[i].n} px in ${cellName(i)} of its own bezel, under ` +
              `${MIN_CELL_PX} — it does not fill the shape the others do`,
          );
          continue;
        }
        for (const [stat, bound, what] of /** @type {['luma' | 'warmth', number, string][]} */ ([
          ['luma', MAX_CELL_LUMA_DEVIATION, 'lighting'],
          ['warmth', MAX_CELL_WARMTH_DEVIATION, 'patina'],
        ])) {
          const others = measured.filter(([o]) => o !== key).map(([, om]) => om.cells[i][stat]);
          if (others.some((v) => Number.isNaN(v))) continue;
          const consensus = median(others);
          const deviation = Math.abs(m.cells[i][stat] - consensus);
          if (deviation > bound) {
            bad.push(
              `${what} at ${cellName(i)}: ${key} reads ${m.cells[i][stat].toFixed(1)} against the ` +
                `other faces' ${consensus.toFixed(1)} — off by ${deviation.toFixed(1)}, over ${bound}`,
            );
          }
        }
      }
    }
  }

  return bad;
}
