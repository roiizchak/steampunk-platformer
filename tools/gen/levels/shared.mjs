// Numbers and rules the five Phase 8 layouts share. Geometry itself lives in `level-0N.mjs`.
//
// ## The dense look, in one place
//
// The owner's Phase 8 decision was "dense, fully painted, bigger", keeping the 96 px grid and the
// 16-tile industrial sheet. That is delivered as **structural mass**: deeper ground stacks, platforms
// and walls with real thickness (`rows` / `cols` on the layout entries), rather than one-tile lines.
//
// 🔴 It is not a stylistic preference. `levelBuilder.mjs`'s FILL_GID note has the full account, but the
// short version is that `GREYBOX_FILL_GID === SURFACE_GID === 1`, so free background decoration painted
// with gid 1 draws **a brass platform edge floating in the sky**, and a walkable top painted with any
// other gid **loses its cap entirely**. Structural mass has neither failure by construction: every
// painted cell is inside a collision rect, `applySurfaceTiles` caps the top row and bricks the rest, and
// that IS the look. Both directions are swept in `ground-tiles.test.ts`.
//
// The reference the owner pointed at (the stale pre-rescale `level-01.tmj`) was 16 % painted. These
// levels run 16–25 %, rising with the ramp, against Phase 7's 9.9 %.
//
// ## 🔴 The camera window, and why level-01's height is not free
//
// `phase-03-tilemap.spec.ts` needs the camera bottom-clamped on the ground AND lifted off the clamp by
// one jump, and says in as many words that a deeper map would make vertical follow unobservable "and
// this test would have to say so rather than quietly weaken". The climb required is
// `spawn.y - (heightPx - VIEW_H) - VIEW_H/2`, which reduces to `540 - groundDepth * TILE` — so the
// ground stack under level-01 may be **2 to 5 rows** and no more. `level-01-contract.test.ts` computes
// it and fails with the margin in the message. Levels 02–05 carry no camera pin and go deeper.
//
// ## The measured limits every layout is built inside
//
// From `level-traversal.test.ts`, all simulated rather than computed:
//
// - **Rise:** the measured apex is ~413 px, so 4 tiles (384 px) is the ceiling and 3 is comfortable.
// - **Hazard width:** 216 px clears standing, 240 needs a run-up, 252 is impassable — a 12 px window.
//   It was deliberately not taken. Hazards here are 1 or 2 tiles.
//   🔴 **Re-measured 2026-08-18 on the SHIPPED levels: 480 px crosses clean, 576 px does not.** Both
//   figures are real. The line above came from `level-traversal.test.ts` probing the RETIRED level
//   with that file's approach; the new one comes from `level-hazard-free.test.ts` running the shipped
//   layouts with a full run-up. Size a run against 480 and let that gate confirm it — and note that
//   **width is not the only thing that matters**: a run placed where a descent LANDS is unavoidable
//   at any width, because the player cannot react while airborne. Three shipped runs were exactly
//   that (level-02 col 54, level-04 cols 66-67, level-05 cols 64-65) and all three were moved.
// - **Ground gap:** 2–3 tiles. A gap has no height to clear, so it is a longer reach than a hazard of
//   the same width; 3 tiles (288 px) crosses with a run-up.

/** level-01's walking surface. Its ground stack is `heightTiles - this`, capped at 5 by the camera. */
export const GROUND_TOP_ROW_01 = 20;

/**
 * How far right of spawn must stay clean flat ground — no hazard, no pit, no raised solid.
 *
 * `phase-02-movement.spec.ts` holds ArrowRight for 90+ ticks and asserts x is non-decreasing at EVERY
 * sample; one knockback fails it. Only level-01 is bound by that spec, but every level keeps the run so
 * a player learns the controls before the level asks anything.
 */
export const CLEAN_RUN_TILES = 18;
