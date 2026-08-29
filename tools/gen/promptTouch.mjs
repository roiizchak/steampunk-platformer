/**
 * The prompt for the touch-control plate — Phase 12.
 *
 * One 1:1 2K image carrying all five button faces in a 3x2 grid on a flat chroma field, cut locally
 * by `buildTouchAtlas.mjs`. One generation, $0.15, charged to the touch-UI ceiling in
 * PRD § Global Constraints and not to the art ceiling.
 *
 * ## Why one plate and not five images
 *
 * Five separate generations cost five times as much and — more importantly — give five separately
 * drifting interpretations of "brass". The buttons sit next to each other on screen, so a mismatch
 * between them is the most visible failure available. One image, one lighting decision, one patina.
 *
 * ## The RENDERING and DO-NOT-INCLUDE blocks are lifted verbatim from the locked §4 template
 *
 * `anchorPrompt` established the pattern (`prompt.mjs:106-147`): the style blocks come from
 * STYLE.md's hashed §4 so a new asset cannot drift stylistically from the approved scene, and only
 * the subject and the framing are new. `tests/unit/style-lock.test.ts` is what makes that mean
 * something — a reworded block reds the suite.
 *
 * ## 🔴 The chroma gutter is DESCRIBED, never negated
 *
 * STYLE.md §6's lesson, and vault 4.2: *"do not negate it — remove the space it would occupy"*.
 * "No gap between the buttons" is a phrase about gaps; a model that reads it half-attentively draws
 * gaps. So the grid, the margin and the separation are named as things that are THERE — a flat green
 * field with five islands on it — and the DO-NOT-INCLUDE block names the concrete artefacts to
 * discard element by element.
 *
 * The gutter is not decoration. `buildTouchAtlas.mjs` splits the plate by known geometry and then
 * requires exactly one connected component per occupied cell, with no foreground pixel touching a
 * crop edge. A face that bleeds across a cell divider is refused rather than downscaled.
 *
 * ## 🔴 Take 1 drew SIX buttons in a 3 / 2 / 1 stack, and this is the one repair it gets
 *
 * `request_id 01a04e0b-ec39-7200-97bc-3afbd338ffeb`, $0.15. The prompt said *"a 3 by 2 grid of
 * equal square cells"*, *"five of the six cells hold one button"* and *"a sixth button"* under DO
 * NOT INCLUDE, and the model still laid three buttons across the top, two across the middle and a
 * sixth alone on a third row — a duplicate of the attack face.
 *
 * The failure is instructive rather than surprising: **"a 3 by 2 grid" is a label, not a
 * geometry.** The model was free to decide what a cell was, and it decided wrong. STYLE.md §6 is
 * exactly this lesson — *constrain the geometry rather than negating the thing you do not want* —
 * and the negation ("a sixth button") did nothing, as §6 predicts negations do.
 *
 * So the repair states **where each button centre is**, as a fraction of the image, and states the
 * count as a positive fact to be checked rather than as a prohibition. Five positions named leaves
 * no room for a sixth to go.
 *
 * ⚠️ Per the plan: ONE repair, then STOP and ask. Never a silent re-roll — a model that needs
 * three attempts is telling you the prompt is wrong, and paying it to guess is how a $5 ceiling
 * becomes a $20 one.
 */

import { templateBlock } from './prompt.mjs';

/**
 * The five faces, in READING order — the order `buildTouchAtlas.mjs` maps cells to keys by.
 *
 * 🔴 Mapping is by CELL POSITION, never by detection order. `detectFrames` projects opacity into
 * row and column bands (`sheets.mjs:69-167`), so "the fourth thing found" is a property of the
 * pixels, not of the layout — and a plate with one face slightly larger would silently rename two
 * buttons.
 */
export const TOUCH_PLATE_CELLS = Object.freeze([
  { key: 'touch-left', subject: 'a left-pointing solid triangle', row: 0, col: 0 },
  { key: 'touch-right', subject: 'a right-pointing solid triangle', row: 0, col: 1 },
  { key: 'touch-jump', subject: 'an upward-pointing solid triangle', row: 0, col: 2 },
  {
    key: 'touch-attack',
    subject: 'a crossed spanner and riveting hammer, forming an X',
    row: 1,
    col: 0,
  },
  { key: 'touch-pause', subject: 'two thick vertical bars, side by side', row: 1, col: 1 },
]);

/** The empty cell, asserted empty by the atlas builder rather than assumed. */
export const TOUCH_PLATE_EMPTY = Object.freeze({ row: 1, col: 2 });

export const TOUCH_PLATE_COLS = 3;
export const TOUCH_PLATE_ROWS = 2;

/** The key colour, matching every other keyed asset in this project. */
export const TOUCH_PLATE_CHROMA = 'pure saturated chroma green, RGB 0 255 0';

/**
 * Build the plate prompt from the locked template.
 *
 * @param {string} template STYLE.md's §4 prompt template, read through `styleTemplate`.
 * @returns {string} the full prompt text, ready to send unchanged.
 */
export function touchPlatePrompt(template) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');

  const faces = TOUCH_PLATE_CELLS.map(
    (cell, index) =>
      `Button ${index + 1}: ${cell.subject}, centred on the button face.`,
  ).join('\n');

  return [
    'A sheet of five separate round push-buttons for a video game touchscreen interface, arranged ' +
      'in two rows and laid out flat on a plain coloured backing sheet, viewed straight on from ' +
      'directly above.',
    '',
    'LAYOUT, STATED AS EXACT GEOMETRY. The image contains five buttons in total: three along the ' +
      'top and two along the bottom. Reading across, the top row holds buttons 1, 2 and 3 and the ' +
      'bottom row holds buttons 4 and 5. There is no third row and there is no button below or to ' +
      'the right of button 5 — that whole corner of the image is empty backing sheet.',
    '',
    'BUTTON CENTRES, measured from the top-left corner of the image as fractions of its width and ' +
      'height: button 1 at one sixth across and one quarter down; button 2 at one half across and ' +
      'one quarter down; button 3 at five sixths across and one quarter down; button 4 at one sixth ' +
      'across and three quarters down; button 5 at one half across and three quarters down. Every ' +
      'button is a circle whose diameter is one quarter of the width of the image, so each one is ' +
      'surrounded on all sides by a wide clear margin of backing sheet and no two of them come ' +
      'close to touching.',
    '',
    `BACKING SHEET: ${TOUCH_PLATE_CHROMA}, perfectly flat and evenly lit, filling every part of the ` +
      'image that is not a button — the margins, the space between the buttons, and the whole of ' +
      'the empty bottom-right corner where no button stands.',
    '',
    'EACH BUTTON: a circular Victorian brass control, cast and polished, with a raised riveted ' +
      'bezel around the rim, a slightly domed face, visible patina in the recesses and a warm amber ' +
      'highlight along the upper-left edge. Every button is the same size, the same brass and the ' +
      'same lighting as every other. Each carries one engraved glyph, deeply cut and filled with ' +
      'dark shadow so it reads at a glance:',
    faces,
    '',
    rendering,
    '',
    // The locked block ends in a full stop; this extends the same sentence rather than starting a
    // new one after it.
    `${forbid.replace(/\.$/, '')}, drop shadows cast onto the backing sheet, gradients or vignetting in the backing ` +
      'sheet, buttons overlapping or touching, a sixth button, a frame or border around the sheet, ' +
      'labels or numbers beside the buttons, a hand or finger.',
  ].join('\n');
}
