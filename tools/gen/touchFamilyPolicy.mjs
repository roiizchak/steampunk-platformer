/**
 * **The numbers the family gate judges by, and the reasoning each one came from.**
 *
 * Split out of `touchFamily.mjs` when that file crossed the 400-line rule. They are re-exported from
 * there, so every importer is unaffected and there is still one name per bound.
 *
 * ⚠️ **These are owner-approved policy.** The cell and core bounds are `2.5x` the worst deviation
 * measured within the adopted six, a multiple the owner approved on 2026-08-31 as **provisional**,
 * with the whole-plate redesign as the held-out set. `tests/unit/touch-family-policy.test.ts` pins
 * every one of them and its derivation: **a red there is an approval checkpoint, never something to
 * clear by editing the pin.**
 */

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
 * How far a cell's OCCUPANCY may sit from the other five, as a share of theirs.
 *
 * 🔴 `MIN_CELL_PX` is a catastrophe guard and nothing more: the adopted minimum is 483, so a face
 * could lose four fifths of a cell's interior while keeping its edge, its 100 pixels and its colour
 * means, and neither the count nor the roundness would notice. Codex round 20, finding 6. This is
 * the relative check — measured worst within the adopted six: **8.5 %**, so 2.5x is 21 %.
 */
export const MAX_CELL_OCCUPANCY_DEVIATION = 0.21;

/**
 * How far the CORE's brass may sit from the other five, in luminance and in `R - B`.
 *
 * 🔴 The polar grid starts at `OUTER_R0`, and `OUTER_R0` is a geometric line rather than a semantic
 * one: a patina or bezel drift confined to the middle of a face is invisible to all 24 cells, and
 * the whole-face scalars dilute it against a much larger outer area. Codex round 20, finding 2.
 *
 * The mark lives in the core too, and six buttons must draw six different marks — so what is
 * compared is the brightest `BODY_SHARE` of the core, the brass between and around the glyph.
 * Measured worst within the adopted six: **17.2** luminance and **14.9** warmth, so 2.5x is 43 and
 * 37. Fixed at the approved multiple **before** any mutation was run against them.
 */
export const MAX_CORE_LUMA_DEVIATION = 43;
export const MAX_CORE_WARMTH_DEVIATION = 37;

/**
 * How far a cell's GRAIN may sit from the other five — mean luminance step between adjacent pixels.
 *
 * 🔴 A cell that keeps only `n`, a mean and a mean is exactly blind to rearrangement WITHIN itself:
 * permute complete pixels inside one cell and every aggregate is preserved to the last decimal —
 * and so is the standard deviation, which is why this is not one. Codex round 20, finding 3.
 *
 * Grain is a **neighbour** statistic, so it is not a function of the cell's histogram at all: a
 * smooth ramp of brass reads a small step between touching pixels, and the same pixels shuffled read
 * a large one. Measured worst within the adopted six: **3.8**, so 2.5x is 9.5.
 */
export const MAX_CELL_TEXTURE_DEVIATION = 9.5;

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
