/**
 * **One level-select row, drawn as a button.**
 *
 * The menu was five lines of text with a `"> "` prefix on the selected one. The owner asked for
 * buttons with a lock icon on the locked ones, on desktop and touch alike. This is the applier:
 * the geometry decision already IS `touchMenuLayout`, so nothing here computes a position — it is
 * handed a `HitBox` and puts objects in it.
 *
 * **No Phaser value import**, so `npm run test:sim-isolated` can still reach this file; the scene
 * types come from `touchTypes.ts` as types only, exactly as `touchMarks.ts` does.
 *
 * ## 🔴 The plate is a FRAME, not a fill, and that is a contrast decision
 *
 * Reusing `touchMarks.drawPlate` verbatim would reopen the defect `LevelSelectScene`'s
 * `LOCKED_COLOUR` block was written to close. `PLATE_FILL 0x6b4b21` composited over the config's
 * `#12100e` ground, against which `LOCKED_COLOUR` `#8f8776` is measured:
 *
 * | plate `fillAlpha` | composite | `#8f8776` against it |
 * |---|---|---|
 * | 0.55 (the alpha when this was first written) | `rgb(67,48,24)` | **3.52:1** |
 * | **0.9 (`PLATE_ALPHA` today)** | `rgb(98,69,31)` | **2.47:1** |
 * | **0 (what ships here)** | the config ground | **5.33:1** |
 *
 * A 34 px row font at 11.8 CSS px needs 4.5:1, and the UI/UX gate bought 5.33:1. Both filled rows
 * are regressions and the current one is the worse of the two.
 *
 * 🔴 **The 3.52:1 row is HISTORY and was quoted as current.** It was computed at the resting alpha
 * of the day; item 3 then took `PLATE_ALPHA` to 0.9 and nothing recomputed it. The number is not
 * load-bearing — nothing here is filled — but a stale figure in the argument for a decision is how
 * a later session re-derives the decision wrongly. **`tests/unit/level-buttons.test.ts` now
 * DERIVES both rows from `PLATE_ALPHA` and `PLATE_FILL` rather than restating them**, so the table
 * above cannot drift from the constant again. Codex implementation review, finding 6.
 *
 * The play controls are translucent because 19.9 % of standing positions have a hazard, an enemy or
 * the goal behind one. **The menu has no world behind it**, so that justification does not carry.
 * `fillAlpha 0` means the ground under every label is still the config ground, and 5.33:1 keeps
 * holding by construction rather than by a constant copied out of `config.ts` to drift.
 *
 * ⚠️ `fillAlpha` is not `alpha`. A `Shape` carries them separately (`Shape.js:119`), and asserting
 * `alpha === 0` would be both wrong and destructive — it would erase the STROKE, which is the
 * entire visual. The gate asserts `fillAlpha === 0`, `alpha === 1` and a non-zero stroke.
 *
 * ## What "selected" reads as
 *
 * | state | keyline | width | vs the ground |
 * |---|---|---|---|
 * | unlocked | `UNLOCKED_STROKE` | 6 | 15.0:1 |
 * | locked | `LOCKED_STROKE` | 6 | 5.33:1 |
 * | **selected** | `SELECTED_STROKE` | **12** | 13.9:1 |
 *
 * Two non-text channels — hue AND width — so selection is not colour-alone, and the label's own
 * text is byte-identical between the two states. `paintLevelButton` never calls `setText`, and that
 * absence is what the gate asserts: it is what replaced the `"> "` prefix.
 */

import type { HitBox } from '../render/touchLayout';
import type { TouchFaceLike, TouchSceneLike } from './touchTypes';

/**
 * The padlock's texture key — **one definition, used by the draw path, the catalog assertion and
 * both fake-scene branches.**
 *
 * 🔴 The plan for this feature said `'lock'` in one section and `'ui-padlock'` in another. Written
 * literally, the paid asset loads and is never drawn, and every device silently takes the fallback.
 * Caught by the Codex plan review before a line existed.
 *
 * ⚠️ It must NOT start with `touch-`: `catalogTouchKeys()` in `tools/gen/buildTouchAtlas.mjs`
 * matches that prefix and cross-checks the produced set against the catalog, so a seventh
 * `touch-*` row makes `npm run assets:touch` throw before it writes anything.
 */
export const LOCK_TEXTURE_KEY = 'ui-padlock';

/** The pale keyline the touch plates already use — 15.0:1 against the config ground. */
export const UNLOCKED_STROKE = 0xf7e3b8;
/** `LOCKED_COLOUR` as a number. Same ink as the label, so the whole row reads as one state. */
export const LOCKED_STROKE = 0x8f8776;
/** `SELECTED_COLOUR` as a number. */
export const SELECTED_STROKE = 0xffd873;

export const UNLOCKED_COLOUR = '#d9cdb0';
export const LOCKED_COLOUR = '#8f8776';
export const SELECTED_COLOUR = '#ffd873';

/** The resting keyline width, matching `touchMarks.PLATE_STROKE_PX`. */
export const PLATE_STROKE_PX = 6;
/** Double, so selection survives a reader who cannot separate the two hues. */
export const SELECTED_STROKE_PX = 12;

/**
 * The plate is inset inside the row box while the hit `Zone` stays the FULL box.
 *
 * `touchMenuLayout`'s measured contracts — row height, separation, the 44 CSS px floor — are all
 * about the hit target, and none of them move. What changes is the drawn gap between neighbours,
 * from 32 to 44 game px.
 */
export const PLATE_INSET_PX = 6;

/** The lock icon sits in a square gutter one row-height wide at the left of the box. */
const LOCK_SIZE_FRAC = 0.42;

/** One drawn row. `text` keeps its field name so `phase-08-complete.spec.ts` reads it unchanged. */
export interface LevelButton {
  plate: TouchFaceLike;
  text: TouchFaceLike;
  /** The lock icon's pieces — empty when the level is unlocked. */
  lock: TouchFaceLike[];
  /** Whether `lock` is the generated `Image` (one piece) or the drawn fallback (three). */
  lockIsArt: boolean;
}

/** Put every piece of a button on a box. The ONE place this geometry is written. */
function place(button: LevelButton, box: HitBox): void {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  button.plate.setPosition(cx, cy);
  button.plate.setSize?.(box.w - PLATE_INSET_PX * 2, box.h - PLATE_INSET_PX * 2);
  button.text.setPosition(cx, cy);

  // The gutter is one row-height wide, so the icon's centre is ~300 game px clear of the centred
  // label at every shipped row width — no text metric is measured and none needs to be.
  const gx = box.x + box.h / 2;
  const size = box.h * LOCK_SIZE_FRAC;
  if (button.lockIsArt) {
    button.lock[0]?.setPosition(gx, cy);
    button.lock[0]?.setDisplaySize?.(size, size);
    return;
  }
  const [shackle, body, keyhole] = button.lock;
  shackle?.setPosition(gx, cy - size * 0.22);
  shackle?.setStrokeStyle?.(Math.max(2, size * 0.12), LOCKED_STROKE);
  body?.setPosition(gx, cy + size * 0.18);
  body?.setSize?.(size * 0.66, size * 0.52);
  keyhole?.setPosition(gx, cy + size * 0.14);
}

/** The lock icon: the generated padlock if it reached the texture manager, else a drawn one. */
function drawLock(scene: TouchSceneLike, box: HitBox): { lock: TouchFaceLike[]; art: boolean } {
  const size = box.h * LOCK_SIZE_FRAC;
  if (scene.textures.exists(LOCK_TEXTURE_KEY)) {
    // Mirrors `drawFace`'s greybox-or-sprite decision, and takes the same single-ink treatment
    // rather than `touchMarks`' two-ink pair — that pair exists because a play control sits over a
    // SCROLLING world, and this sits on the config ground.
    return { lock: [scene.add.image(0, 0, LOCK_TEXTURE_KEY).setOrigin(0.5)], art: true };
  }
  const shackle = scene.add.circle(0, 0, size * 0.26, 0x000000, 0).setOrigin(0.5);
  const body = scene.add.rectangle(0, 0, size * 0.66, size * 0.52, LOCKED_STROKE, 1).setOrigin(0.5);
  const keyhole = scene.add.circle(0, 0, size * 0.09, 0x12100e, 1).setOrigin(0.5);
  return { lock: [shackle, body, keyhole], art: false };
}

/**
 * Draw one row's button. Names every object after `box.id` so a spec can find it.
 *
 * ⚠️ **`setInteractive` is called on NOTHING here.** Criterion 12.7 is that desktop gains no new hit
 * targets — the rows are keyboard-driven there, exactly as they were. Taps come from
 * `attachTapRoutes`' zones, which exist only on a touch device.
 */
export function drawLevelButton(
  scene: TouchSceneLike,
  box: HitBox,
  label: string,
  unlocked: boolean,
  style: object,
): LevelButton {
  const plate = scene.add
    // 🔴 `0` is the FILL ALPHA. See this file's header: a filled brass plate drops the locked
    // label's contrast from 5.33:1 to 3.52:1, and the stroke set below is the entire visual.
    .rectangle(0, 0, box.w, box.h, 0x000000, 0)
    .setName(`${box.id}-plate`)
    .setOrigin(0.5);
  const text = scene.add.text(0, 0, label, style).setName(`${box.id}-label`).setOrigin(0.5);
  const { lock, art } = unlocked ? { lock: [], art: false } : drawLock(scene, box);
  for (const piece of lock) piece.setName(`${box.id}-lock`);

  const button: LevelButton = { plate, text, lock, lockIsArt: art };
  place(button, box);
  paintLevelButton(button, false, unlocked);
  return button;
}

/**
 * Repaint for a new selection or lock state.
 *
 * ⚠️ **Never calls `setText`.** The label is identical in both states; selection reads on the
 * keyline's hue and width. That absence is the assertion — it is what replaced the `"> "` prefix,
 * and a re-introduced prefix reds the gate.
 */
export function paintLevelButton(button: LevelButton, selected: boolean, unlocked: boolean): void {
  const stroke = selected ? SELECTED_STROKE : unlocked ? UNLOCKED_STROKE : LOCKED_STROKE;
  button.plate.setStrokeStyle?.(selected ? SELECTED_STROKE_PX : PLATE_STROKE_PX, stroke);
  button.text.setColor?.(selected ? SELECTED_COLOUR : unlocked ? UNLOCKED_COLOUR : LOCKED_COLOUR);
}

/**
 * Move a button onto a new box, after the view changed size.
 *
 * Draw and paint alone cannot do this — neither repositions a plate, a label and a lock icon — and
 * without it the live-size relayout in `LevelSelectScene` has nothing to call. Named by the Codex
 * plan review, round 2.
 */
export function resizeLevelButton(button: LevelButton, box: HitBox): void {
  place(button, box);
}
