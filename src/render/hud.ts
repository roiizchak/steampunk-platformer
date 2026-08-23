/**
 * Where the HUD goes, as plain data — the engine-free half of the parallel `UIScene`.
 *
 * `playerHud.ts` decides how WIDE the health fill is; this file decides where the whole assembly
 * sits and how big it is drawn. `UIScene` is the hand that applies both *(vault 2.12)*.
 *
 * ## Everything is derived from the live game size, and that is the point
 *
 * Vault 6.2, a blocker: **a second camera created at an explicit size never auto-resizes.** Phaser's
 * resize handler only resizes cameras whose dimensions equal the previous game size, so one
 * hardcoded at 1280 cropped a whole HUD plate off a phone and looked perfectly correct on the
 * desktop it was written on.
 *
 * This project cannot currently hit that trap — the scale mode is `FIT`, so the game size is
 * permanently 1920 × 1080 and the canvas is scaled by CSS instead. **Saying so plainly matters more
 * than pretending otherwise** *(vault 9.3)*: `hudLayout` takes the size as arguments and contains no
 * viewport literal, so the trap cannot open later, and `hudFits` is a real predicate that a
 * different scale mode would exercise for real. What is being verified today is the layout function,
 * not a resize Phaser performs.
 *
 * ## `hudFits` is one predicate with two consumers
 *
 * Imported by `tests/unit/hud-layout.test.ts` AND by `tests/e2e/phase-06-chrome.spec.ts`, which reads
 * the live scene tree. The `viewFits`/`tracksTarget` precedent from Phase 3, for the same reason:
 * two assertions that happen to agree on the happy path are not one gate.
 */

import { GAME_HEIGHT, MAX_LEVEL_GEARS } from '../game/constants';
import type { GearSim } from '../sim/pickups';

/**
 * The authored size of `hud-health.png`, in its own pixels.
 *
 * 🔴 **Measured from the shipped file, and it must be re-measured if the HUD is re-generated** —
 * the same warning `HUD_SLOT` carries in `playerHud.ts`, for the same reason: nothing can catch a
 * stale number here, because a wrong plate size draws a HUD that is merely slightly off.
 */
export const HUD_PLATE = { w: 413, h: 128 } as const;

/** Distance from the top-left corner of the screen to the plate, in DESIGN pixels. */
export const HUD_MARGIN = 24;

/**
 * The catalog key the generated gear sprite lands under. One string, three consumers.
 *
 * 🔴 It lived in `src/scenes/gearLayer.ts` until a unit test tried to import it — and importing
 * that file pulls in Phaser, which cannot load in the node test environment. The test file then
 * contributed **zero tests while the suite still reported PASS**: six assertions vanished and
 * nothing went red. That is the vault 3.1 failure shape exactly, bought for the price of one import
 * line.
 *
 * It lives in this engine-free module now, so the gate that proves the sprite branch ships can
 * actually reference it.
 */
export const GEAR_TEXTURE_KEY = 'gear';

/** Gap between the plate and the gear counter that follows it, in DESIGN pixels. */
const COUNTER_GAP = 24;

/**
 * Counter type size, in DESIGN pixels.
 *
 * 44 px of a 1080 px design height is 4.1 % — which at the smallest resolution this project
 * supports (852 × 480, a 0.44 scale factor) still lands at **19 physical pixels**, comfortably
 * above the ~11 px where digits stop being legible on a low-DPI screen. Criterion 6.5 measures
 * that by looking; this is the number it is looking at.
 */
const COUNTER_FONT_PX = 44;

/**
 * The controls banner's type size, in DESIGN pixels *(session inventory 2.5, fixed 2026-08-23)*.
 *
 * 🔴 **It was `'18px'`, hard-coded in `gameDev.ts`, which is ~8 physical pixels at 852 × 480** — a
 * third under the ~11 px floor the counter above is sized against, and confirmed illegible in a
 * playtest screenshot rather than inferred.
 *
 * That matters more than it sounds: the banner **ships**, and it is the only place the game tells
 * anyone the controls at all — `helpLine()`'s own comment says the mute keys and `ESC levels` are in
 * the shipped half deliberately, because *"a mute control the player cannot discover is a mute
 * control they do not have."* An illegible banner is those controls not existing.
 *
 * **28**, by the same arithmetic the counter uses: 28 × 0.444 = **12.4 physical px** at the smallest
 * supported size, over the floor with a little room. Not larger, because the line is ~110 characters
 * and ~150 in a DEV build — see `addHelpBanner`, which wraps rather than letting it run off the
 * edge, which is what any size above this would do.
 */
export const HELP_FONT_PX = 28;

/**
 * The gear icon beside the counter, square, in DESIGN pixels.
 *
 * **72, because that is exactly the size the gear sprite is authored at** — `GEAR_BOX.w` ×
 * `RENDER_SCALE`, the same size it draws at in the world. At `CAMERA_ZOOM` 1 that makes the icon
 * 1:1 with its own texture, which is the rule the whole art pipeline is built on: sprite art is
 * authored at the exact pixel size it is drawn at, and "readable at true sprite size" is a testable
 * claim rather than a range. An icon at 56 would have been the one place in the project that
 * resampled a sprite, and the counter is not worth breaking that for.
 */
const GEAR_ICON_PX = 72;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudLayout {
  /** Multiplier from design pixels to this game size. 1 at the design size of 1920 × 1080. */
  scale: number;
  /** The plate image, screen space. */
  plate: Rect;
  /** The health bar's interior, screen space — already offset by the plate and scaled. */
  slot: Rect;
  /** The gear icon beside the counter, screen space. */
  gearIcon: Rect;
  /** Left edge and baseline-ish origin of the counter text, screen space. */
  counter: { x: number; y: number; fontPx: number };
}

/**
 * The whole HUD's geometry for a given game size.
 *
 * Scaled off HEIGHT rather than width. The HUD is a horizontal strip anchored top-left, so a wider
 * game gives it more room and should not make it bigger; a shorter one must shrink it or it eats
 * the play area. Choosing one axis deliberately is the `[SCALE_RATIO]` lesson from the art
 * pipeline applied to layout.
 */
export function hudLayout(gameW: number, gameH: number, slot: Rect): HudLayout {
  if (!(gameW > 0) || !(gameH > 0) || !Number.isFinite(gameW) || !Number.isFinite(gameH)) {
    throw new Error(`hudLayout: game size must be finite and positive, got ${gameW} x ${gameH}`);
  }

  const scale = gameH / GAME_HEIGHT;
  const margin = HUD_MARGIN * scale;

  const plate: Rect = {
    x: margin,
    y: margin,
    w: HUD_PLATE.w * scale,
    h: HUD_PLATE.h * scale,
  };

  const iconSize = GEAR_ICON_PX * scale;
  const gearIcon: Rect = {
    x: plate.x + plate.w + COUNTER_GAP * scale,
    // Centred on the plate's own vertical middle, so the counter reads as part of the assembly
    // rather than as a label that happens to be nearby.
    y: plate.y + plate.h / 2 - iconSize / 2,
    w: iconSize,
    h: iconSize,
  };

  const fontPx = COUNTER_FONT_PX * scale;
  return {
    scale,
    plate,
    slot: {
      x: plate.x + slot.x * scale,
      y: plate.y + slot.y * scale,
      w: slot.w * scale,
      h: slot.h * scale,
    },
    gearIcon,
    counter: {
      x: gearIcon.x + iconSize + COUNTER_GAP * 0.5 * scale,
      y: plate.y + plate.h / 2 - fontPx / 2,
      fontPx,
    },
  };
}

/**
 * Is the whole HUD — plate, bar, icon and counter — inside the visible area?
 *
 * **Criterion 6.3, as a predicate.** `counterW` is the measured width of the rendered text, which
 * only the engine can supply, so it is a parameter rather than an estimate: a layout check that
 * guessed at the text width would be checking arithmetic instead of the thing on screen.
 */
export function hudFits(
  layout: HudLayout,
  gameW: number,
  gameH: number,
  counterW: number,
): boolean {
  const right = layout.counter.x + counterW;
  const bottom = Math.max(layout.plate.y + layout.plate.h, layout.counter.y + layout.counter.fontPx);
  return (
    layout.plate.x >= 0 &&
    layout.plate.y >= 0 &&
    right <= gameW &&
    bottom <= gameH &&
    // The bar has to be inside the plate, not merely inside the screen — a slot that has slid off
    // its own art is the defect a re-generated HUD produces, and it is on screen the whole time.
    layout.slot.x >= layout.plate.x &&
    layout.slot.y >= layout.plate.y &&
    layout.slot.x + layout.slot.w <= layout.plate.x + layout.plate.w &&
    layout.slot.y + layout.slot.h <= layout.plate.y + layout.plate.h
  );
}

/**
 * Every gear collected on or after `fromTick` — the half-open window `[fromTick, now)`.
 *
 * This is what drives the collect tween, and it is deliberately NOT the boolean event edge. A
 * render frame drains several ticks, so two gears can be collected between two frames; a boolean
 * says only "at least one", and carries no position. Reading the stamp instead gives the render
 * layer both, and survives a frame that drops events entirely.
 *
 * 🔴 **The bound is INCLUSIVE, and it was exclusive for an afternoon.** The caller stores
 * `world.tickCount` after each frame — which is the index of the NEXT tick to run, not the last one
 * that ran. A gear collected during that very tick is stamped with exactly that number, so a
 * strictly-greater test skipped it, and the first gear of every batch produced no tween at all. The
 * counter still incremented, which is why nothing else noticed: found by the e2e test Codex's plan
 * review (F3) insisted on, and by nothing else in the suite.
 */
export function gearsCollectedFrom(gears: readonly GearSim[], fromTick: number): GearSim[] {
  return gears.filter((gear) => gear.collectedTick !== null && gear.collectedTick >= fromTick);
}

/**
 * The counter's text. Zero-padded so its width never changes — see `UIScene` for why that matters.
 *
 * 🔴 **The width is DERIVED from `MAX_LEVEL_GEARS`, and was a hard-coded `3`** *(session inventory
 * 3.8, fixed 2026-08-23)*. The cap is **64**, so a third digit can never be reached: `000` was
 * padding to a width the game cannot produce, and `docs/handoff/phase-06-owed.md` recorded that it
 * *"reads as a placeholder"* — `level-01` ships **7** gears and drew `007`.
 *
 * Derived rather than re-typed as `2`: raise the cap past 99 and the counter widens with it, instead
 * of silently truncating the way a literal would. One number, one definition *(vault 5.3)*.
 */
export function counterText(collected: number): string {
  const width = String(MAX_LEVEL_GEARS).length;
  return String(Math.max(0, Math.trunc(collected))).padStart(width, '0');
}
