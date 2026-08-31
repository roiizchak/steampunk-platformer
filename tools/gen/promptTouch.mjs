/**
 * The prompt for the touch-control plate — Phase 12.
 *
 * One 1:1 2K image carrying all six button faces in a 3x2 grid on a flat chroma field, cut locally
 * by `buildTouchAtlas.mjs`. $0.15 a take; **three takes were bought and take 3 is adopted**,
 * $0.45 in all, charged to the touch-UI ceiling in
 * PRD § Global Constraints and not to the art ceiling.
 *
 * ## Why one plate and not six images
 *
 * Six separate generations cost six times as much and — more importantly — give six separately
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
 * field with six islands on it — and the DO-NOT-INCLUDE block names the concrete artefacts to
 * discard element by element.
 *
 * The gutter is not decoration. `buildTouchAtlas.mjs` splits the plate by known geometry and then
 * requires exactly one connected component per occupied cell, with no foreground pixel touching a
 * crop edge. A face that bleeds across a cell divider is refused rather than downscaled.
 *
 * ## 🔴 Take 1 drew SIX buttons in a 3 / 2 / 1 stack, and this is the one repair it gets
 *
 * `request_id 01a04e0b-ec39-7200-97bc-3afbd338ffeb`, $0.15. The prompt said *"a 3 by 2 grid of
 * equal square cells"*, *"each of the six cells holds one button"* and *"a seventh button"* under DO
 * NOT INCLUDE, and the model still laid three buttons across the top, two across the middle and a
 * sixth alone on a third row — a duplicate of the attack face.
 *
 * The failure is instructive rather than surprising: **"a 3 by 2 grid" is a label, not a
 * geometry.** The model was free to decide what a cell was, and it decided wrong. STYLE.md §6 is
 * exactly this lesson — *constrain the geometry rather than negating the thing you do not want* —
 * and the negation ("a sixth button") did nothing, as §6 predicts negations do.
 *
 * So the repair states **where each button centre is**, as a fraction of the image, and states the
 * count as a positive fact to be checked rather than as a prohibition. Six positions named leaves
 * no room for a sixth to go.
 *
 * ⚠️ Per the plan: ONE repair, then STOP and ask. Never a silent re-roll — a model that needs
 * three attempts is telling you the prompt is wrong, and paying it to guess is how a $5 ceiling
 * becomes a $20 one.
 */

import { templateBlock } from './prompt.mjs';

/**
 * The six faces, in READING order — the order `buildTouchAtlas.mjs` maps cells to keys by.
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
    // Re-shot 2026-08-31, take 8. Take 5 drew the wrench in three pieces, and the smallest — a
    // 14-output-pixel fragment — measured **2.740:1 at 47 CSS px** while reading 3.318:1 at both 44
    // and 48. `resize.mjs`'s box filter is `Math.floor`-partitioned and so is NOT monotonic in
    // output size, which is why one size proved nothing about its neighbours. One closed shape has
    // no fragment to fall through.
    subject:
      'a single adjustable spanner seen from the side, its open jaws pointing to the upper right, ' +
      'drawn as ONE closed unbroken silhouette of a single flat tone, every part of it joined to ' +
      'every other part, with no separate small pieces and no notches cutting it apart',
    row: 1,
    col: 0,
  },
  {
    // Re-shot 2026-08-31, take 6. The cogwheel was the universal glyph for SETTINGS and said nothing
    // about pausing at any size — found independently by both `ui-ux-tester` briefs — and its thin
    // teeth were also the only strokes in the set that missed 3:1 at the 44 CSS px floor where a
    // control is still live (2.905:1, strokes 1 and 4). Two heavy upright bars answer both: the
    // conventional pause mark, and the heaviest shape in the set.
    key: 'touch-pause',
    // Re-shot again 2026-08-31, take 9, and this one is a HONESTY fix rather than a legibility one.
    // The upright bars were the universal pause mark, and `touchControlsLayer.ts:381` routes this
    // control to `openLevelSelect()` — a hard scene teardown that abandons the run with no
    // confirmation and no checkpoint. Both round-2 `ui-ux-tester` briefs said the same thing
    // independently: the cogwheel was vaguely wrong, the bars are confidently wrong. A grid of
    // squares says *the level menu*, which is where the button actually goes.
    subject:
      'four equal squares arranged in a two-by-two grid with an even gap between them, drawn as ' +
      'four solid silhouettes of a single flat tone',
    row: 1,
    col: 1,
  },
  {
    // Re-shot 2026-08-31, take 7. Two stacked horizontal bars read as an "equals" or a list glyph
    // and evoked nothing about locomotion — both `ui-ux-tester` briefs, independently. A boot is
    // the conventional pictograph for travelling on foot and is one closed shape, which is what
    // survives a downscale to 44 CSS px.
    key: 'touch-walk',
    subject:
      'a single tall laced work boot seen from the side, its toe pointing to the right, drawn as ' +
      'one solid silhouette of a single flat tone',
    row: 1,
    col: 2,
  },
]);

/**
 * ✅ **There is no empty cell any more, and that is the repair.**
 *
 * Both takes failed the same way: the model added a button to fill the sheet — six in take 1, seven
 * in take 2 — and no amount of naming the empty corner stopped it, because *'do not draw a sixth'*
 * is a negation and STYLE.md §6 says negations do the opposite. The layout with nothing to fill is
 * the repair that addresses the cause instead of the symptom, and it is available now for a reason
 * that has nothing to do with the prompt: **the game grew a sixth control.** The owner asked for a
 * walk/run toggle, so the grid holds six real faces and the model has no free space to invent into.
 *
 * The other two changes are the owner's as well: the attack face is the courier's own **wrench**
 * rather than crossed tools, and pause was a **gear** rather than two bars.
 *
 * ⚠️ **Three of those subjects have since been replaced and this paragraph describes the PLATE**,
 * which is still the source of `touch-left`, `touch-right` and `touch-jump`. `touch-attack`,
 * `touch-pause` and `touch-walk` come from single-cell edits recorded in
 * `touchAtlasCli.mjs`'s `TOUCH_CELL_SOURCES`; the pause gear in particular was replaced twice.
 */
export const TOUCH_PLATE_EMPTY = null;

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
    'A sheet of six separate round push-buttons for a video game touchscreen interface, arranged ' +
      'in two rows of three and laid out flat on a plain coloured backing sheet, viewed straight ' +
      'on from directly above.',
    '',
    'LAYOUT, STATED AS EXACT GEOMETRY. The image contains six buttons in total: three along the ' +
      'top and three along the bottom, in two tidy rows of equal length. Reading across, the top ' +
      'row holds buttons 1, 2 and 3 and the bottom row holds buttons 4, 5 and 6. Every part of ' +
      'the image outside those six circles is backing sheet.',
    '',
    'BUTTON CENTRES, measured from the top-left corner of the image as fractions of its width and ' +
      'height: buttons 1, 2 and 3 sit one quarter of the way down, at one sixth, one half and ' +
      'five sixths across; buttons 4, 5 and 6 sit three quarters of the way down, at one sixth, ' +
      'one half and five sixths across. Every button is a circle whose diameter is one quarter of ' +
      'the width of the image, so each one is surrounded on all sides by a wide clear margin of ' +
      'backing sheet and no two of them come close to touching.',
    '',
    `BACKING SHEET: ${TOUCH_PLATE_CHROMA}, perfectly flat and evenly lit, filling every part of the ` +
      'image that is not a button — the margins and the space between the buttons.',
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
    `${forbid.replace(/[.]$/, '')}, drop shadows cast onto the backing sheet, gradients or vignetting in the backing ` +
      'sheet, buttons overlapping or touching, a seventh button, a third row, a frame or border ' +
      'around the sheet, labels or numbers beside the buttons, a hand or finger.',
  ].join('\n');
}

/**
 * The GLYPH clause for a single-button re-shoot, and the one sentence it does not inherit.
 *
 * The plate prompt asks for a glyph "deeply cut and filled with dark shadow". That sentence is
 * where the round-13 shortfall comes from: separating `attack`'s mark by its pre-halo seeds isolates
 * four small fragments of the wrench's SHADING from its two real strokes, and the smallest — an
 * 11-pixel seed — measures 2.86:1 at 48 CSS px against 12.14's 3:1. No parameter reaches it
 * (`KEYLINE_PX` 4 leaves it at 2.86; `BOLD_PX` 3 and 4 make it 1.93 and 1.37), because at that size
 * it is about three output pixels of mostly dark.
 *
 * So the interior shading is not asked for. STYLE.md section 6 forbids negating it — "no internal
 * shading" is a phrase about shading, and a model that reads it half-attentively draws shading — so
 * the clause states positively what IS there: one continuous inlay, one tone, one even depth, one
 * unbroken outline. Owner decision 2026-08-31, taken over accepting the 2.86:1 fragment.
 */
const FLAT_GLYPH =
  'The button carries one engraved glyph, cut as a single continuous inlay of one flat uniform ' +
  'tone at one even depth across its whole area, with one unbroken outline, so that it reads as a ' +
  'solid shape at a glance. The whole area inside that outline is filled with the same dark tone ' +
  'as the outline itself, so the glyph is one solid dark silhouette and the brass of the button ' +
  'face shows only around it:';

/**
 * The prompt for ONE button, on its own 1:1 chroma field.
 *
 * Used with `fal-ai/nano-banana-pro/edit` and a raw plate cell as the reference, so the brass, the
 * lighting and the patina come from the adopted plate rather than from a second interpretation of
 * the word "brass" — `FAL-MODELS.md` section 2, vault 4.1: change the reference, not the wording.
 * The plate prompt's own header says why that matters: six separately generated buttons sit next to
 * each other on screen, where a mismatch is the most visible failure available.
 *
 * Geometry is stated as a positive fact for the same reason take 1 needed repairing: "a 3 by 2
 * grid" is a label, not a geometry, and the model was free to decide what a cell was.
 *
 * @param {string} template STYLE.md's section 4 prompt template, read through `styleTemplate`.
 * @param {{ key: string, subject: string }} cell the control being re-shot.
 * @returns {string} the full prompt text, ready to send unchanged.
 */
export function touchButtonPrompt(template, cell) {
  const rendering = templateBlock(template, 'RENDERING');
  const forbid = templateBlock(template, 'DO NOT INCLUDE');

  return [
    'A single round push-button for a video game touchscreen interface, laid out flat on a plain ' +
      'coloured backing sheet, viewed straight on from directly above.',
    '',
    'LAYOUT, STATED AS EXACT GEOMETRY. The image contains one button and nothing else. Its centre ' +
      'is the centre of the image, and it is a circle whose diameter is one half of the width of ' +
      'the image, so it is surrounded on all sides by a wide clear margin of backing sheet. Every ' +
      'part of the image outside that one circle is backing sheet.',
    '',
    `BACKING SHEET: ${TOUCH_PLATE_CHROMA}, perfectly flat and evenly lit, filling every part of the ` +
      'image that is not the button.',
    '',
    'THE BUTTON: a circular Victorian brass control, cast and polished, with a raised riveted ' +
      'bezel around the rim, a slightly domed face, visible patina in the recesses and a warm amber ' +
      'highlight along the upper-left edge. Keep the brass, the bezel, the patina and the lighting ' +
      'exactly as they are in the reference image; change only the engraved glyph.',
    '',
    FLAT_GLYPH,
    `${cell.subject}, centred on the button face.`,
    '',
    rendering,
    '',
    `${forbid.replace(/[.]$/, '')}, drop shadows cast onto the backing sheet, gradients or vignetting in the backing ` +
      'sheet, a second button, a grid or sheet of buttons, a frame or border around the image, ' +
      'labels or numbers beside the button, a hand or finger.',
  ].join('\n');
}
