/**
 * The HAZARD tile's prompt — split out of `promptWorld.mjs` on 2026-08-28.
 *
 * Not a tidying: adding it took that file to 411 lines against the hard 400-line ceiling, which
 * currently permits exactly one offender and that slot is spent by `src/scenes/GameScene.ts`. The
 * same reason `promptWorld.mjs` itself was split out of `prompt.mjs` in Phase 6, recorded in its
 * header.
 *
 * It also belongs apart on its own merits: every other prompt in `promptWorld.mjs` produces a WHOLE
 * asset, and this one produces a single cell that is composited into an asset generated elsewhere.
 */

import { templateBlock } from './prompt.mjs';

/**
 * The HAZARD tile — the one tile the sheet got wrong, regenerated on its own.
 *
 * ## Why this is a separate generation and not a re-shot tileset
 *
 * The sheet is ONE generation of sixteen tiles. Re-shooting it to fix one of them re-rolls the
 * walkway, the brass cap, the brick and the masonry that the whole game is built on — and
 * `ground-tiles.test.ts` pins two of those against the shipped pixels. An isolated object composited
 * into cell 12 changes exactly the tile that is wrong and leaves the other fifteen byte-identical.
 *
 * ## Why the old one failed, in the project's own terms
 *
 * The owner played level 3, walked into the spikes, lost 20 hp and reported *"there is a hazard
 * [that] is not being seen"*. The tile it drew is a **cool silver picket** — and STYLE.md §5 rule 2
 * is *"background entirely cool blue-grey and desaturated; foreground warm copper/brass/amber,
 * saturated, high contrast"*. A cool desaturated object in the foreground is reading exactly as the
 * separation rules say it should: as background. It also shares a silhouette family with the
 * ornamental fence in the very next cell of the same sheet, which IS decoration.
 *
 * So this is not a new art direction — it is the existing one, applied to a tile that never got it.
 * **No STYLE.md amendment**, and the §2-§5 hash lock is untouched.
 *
 * ## The two things the prompt has to buy that the gear's did not
 *
 * **It must TILE.** Hazard runs are 2 to 5 tiles wide and are painted as adjacent cells, so the
 * spacing has to survive two copies butted together — hence the half-spacing margin clause. A base
 * rail running edge to edge does the same job for the bottom of the tile.
 *
 * **It must read at 96 px against BUSY art**, over the boiler-house backdrop, which is what the
 * silver picket lost against.
 */
export function spikesPrompt(template) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');
  return [
    'A single square tile of lethal floor spikes for a Victorian steampunk platformer, drawn as one ' +
      'isolated game object on a flat background. Seen straight on from the side, no perspective, ' +
      'no tilt.',
    '',
    'THE SPIKES: a row of FOUR tall upward-pointing iron spikes rising from a low horizontal base ' +
      'rail. Each spike is a narrow tapering blade, wide at the base and coming to a sharp point. ' +
      'The blades are TALL: the row fills most of the frame height and the base rail is no more ' +
      'than a fifth of it. The iron is hot RUST-ORANGE and dark ' +
      'oxidised copper, saturated and warm, with a bright amber-brass specular highlight down the ' +
      'left edge of every blade and a hard black outline around the whole shape. The base rail is ' +
      'riveted dark iron with a warm brass strip along its top edge. Dried dark stains at the ' +
      'points.',
    '',
    // The tiling clause. Runs are painted as adjacent cells, so the seam is the failure mode.
    'TILING: the row must continue seamlessly when two copies of this tile are placed side by side. ' +
      'The leftmost and rightmost spike each stand HALF of one spike spacing from their own edge, ' +
      'so butting two tiles together produces the same even spacing across the join. The base rail ' +
      'runs the full width and touches both the left and the right edge exactly.',
    '',
    // The silhouette clause, in the shape `gearPrompt` established.
    'CRITICAL SILHOUETTE: the spikes must read instantly as DANGER from their OUTLINE alone at ' +
      '96 pixels, against a busy cool blue-grey industrial background. Tall, sharp, widely ' +
      'separated points with open background showing between them. Warm and saturated against a ' +
      'cool scene. It must NOT read as a fence, a railing, a balustrade or decoration. Keep the ' +
      'surface detail — rivets, pitting, patina — and keep the SHAPE bare: no rounded finials, no ' +
      'scrollwork, no curled or twisted ironwork, no horizontal cross-rail above the base.',
    '',
    'BACKGROUND: one flat uniform chroma green field, RGB 0 255 0, edge to edge, with a clear ' +
      'margin of it above the points. The chroma green shows THROUGH the gaps between the spikes ' +
      'all the way down to the base rail. No panel, no plate, no backing, no scene, no shadow, no ' +
      'floor beneath the rail.',
    '',
    rendering,
    '',
    `${forbid}, a fence, a railing, a balustrade, a gate, ornamental scrollwork, finials, a ` +
      'horizontal cross-rail, a second row of spikes, a character, a creature, background scenery, ' +
      'drop shadow.',
  ].join('\n');
}
