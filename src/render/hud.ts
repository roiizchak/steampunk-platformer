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
 * ⚠️ **The view fills the screen since 2026-09-01, so the game size is no longer fixed** — but
 * this module was already written against the live size and needs no change: `hudLayout` takes
 * `gameW`/`gameH` and scales off HEIGHT, which the clamp pins at 1080. The note below described
 * FIT and is kept for the trap it names.
 * This project cannot currently hit that trap — the scale mode was `FIT`, so the game size is
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
 * 🔴 **Measured from the shipped file, and it must be re-measured if the HUD is re-generated.**
 *
 * ✅ **And a gate DOES catch a stale number now** — `tests/unit/hud-plate-matches-art.test.ts`
 * decodes the PNG and compares. This block used to end *"nothing can catch a stale number here,
 * because a wrong plate size draws a HUD that is merely slightly off"* (inventory 3.4), and that was
 * false: the authority for this number is a file in the repository, and `tools/gen/png.mjs` already
 * exported `readPng`. Nothing had to be built; the gate just had to be written.
 *
 * The first half stands. A wrong plate size does not throw and does not look broken in a
 * screenshot — it slides the icon, the counter and `hudFits`' whole bounding box by a few pixels.
 */
export const HUD_PLATE = { w: 413, h: 128 } as const;

/** Distance from the top-left corner of the screen to the plate, in DESIGN pixels. */
export const HUD_MARGIN = 24;

/**
 * The gear counter's colours, and **the contrast method that was never written down** — 2b.4.
 *
 * Item 2b.4 recorded **3.13:1 and 1.13:1**, both failing WCAG AA, across four levels never
 * re-measured — *and flagged that the sampling method itself had never been recorded*, so the
 * numbers might be optimistic. Two accessibility gate owners re-derived them and got the same
 * failing figures. **All of them measured the FILL against the background and ignored the stroke.**
 *
 * ## The method, written down
 *
 * 1. The counter is drawn **over the level**, not over the HUD plate — `hudLayout` puts `counter.x`
 *    beyond `plate.x + plate.w`. So the background is whatever the world draws there: the three
 *    parallax layers and the two tilesets. Nothing else can be behind it.
 * 2. Decode all five shipped PNGs and take the **brightest and darkest fully-opaque pixel** of each.
 *    Not an average, and not one sampled frame — the counter is over a scrolling scene, so a figure
 *    that holds at spawn and fails 40 m later has not passed.
 * 3. The glyph has **two** inks: a `#f7e3b8` fill inside a 6 px `#1a1410` stroke. A reader
 *    distinguishes the glyph from the background by whichever of the two contrasts with it, so the
 *    ratio that matters is **`max(fill:bg, stroke:bg)`**, not `fill:bg` alone.
 * 4. Compare against the bar the **effective size** earns at the smallest supported window.
 *
 * ## What it measured, 2026-08-23
 *
 * | background | brightest | `stroke:bg` | `fill:bg` |
 * |---|---|---|---|
 * | `far.png` | rgb(248,255,255) | **18.01:1** | 1.25:1 |
 * | `mid.png` | rgb(226,255,255) | **17.35:1** | 1.20:1 |
 * | `near.png` | rgb(214,251,255) | **16.59:1** | 1.15:1 |
 * | `industrial.png` | rgb(244,248,249) | **17.06:1** | 1.18:1 |
 * | `walkway.png` | rgb(251,228,118) | **14.30:1** | 1.01:1 |
 *
 * Against the *darkest* pixels the pair inverts: `fill:bg` reaches 15.95–16.63:1 while the stroke
 * disappears. **So the recorded 1.13:1 is real and is not the whole glyph** — at every background in
 * the game, one of the two inks is at 14:1 or better, and `fill:stroke` is **14.45:1**, so the glyph
 * is self-defining even where the background is not helping.
 *
 * The genuine worst case is a **mid-luminance** background where neither ink is favoured. Solving
 * `fill:L = stroke:L` gives L = 0.1689 and a ratio of **3.80:1** — the floor across every possible
 * background, not merely every shipped one.
 *
 * ## The bar it has to clear
 *
 * 44 design px × 0.44375 (852/1920) = **19.5 physical px**, `fontStyle: 'bold'`. WCAG's large-text
 * threshold is 18 pt (24 px) or **14 pt bold (≈18.7 px)**, so this is large text at the smallest
 * supported window and the bar is **3:1**. 3.80 > 3.0 — **it passes, with 27 % of headroom.**
 *
 * ⚠️ **A backing plate was pre-authorised if this failed. It did not fail, so none was added** —
 * the measurement decided it, not a preference.
 *
 * 🔴 **`COUNTER_STROKE` is load-bearing, not decoration.** Removing it or thinning it drops the
 * worst case to 1.01:1. `contrast-floor.test.ts` holds the whole relationship.
 */
export const COUNTER_FILL = '#f7e3b8';
export const COUNTER_STROKE = '#1a1410';
export const COUNTER_STROKE_PX = 6;

/**
 * Ticks of delay for the *n*th collect-flyer spawned in the same frame *(inventory 2b.5)*.
 *
 * Two gears collected on one frame produced two flyers with the same duration and the same
 * destination. Even from different start points the eased paths converge, and at the landing they
 * are one sprite drawn twice — the smear the UI/UX gate owner reported.
 *
 * ⚠️ **Index, never `Math.random`.** This is render-side, so the sim's ban does not formally reach
 * it — but a non-deterministic HUD makes a screenshot gate unreproducible, and the collected-gear
 * list is already ordered, so there is nothing to gain by reaching for randomness.
 *
 * **3 ticks (50 ms) is deliberately small.** Under the ~100 ms at which two events stop reading as
 * simultaneous, so a pair still feels like one pickup moment — while being enough that the two
 * arrivals at the counter are visibly separate rather than one doubled sprite. A stagger comparable
 * to the flight time would fix the smear and introduce a different defect.
 *
 * It lives here, engine-free, rather than inside `hudGearFlyers.ts`, because that module imports
 * Phaser as a **value** (through `gearLayer.ts`) and therefore cannot be imported by a unit test at
 * all. Putting the decision here is what makes it testable — `playerView.ts`'s pattern *(vault
 * 2.12)*, applied to the one number in this effect anybody would want to tune.
 */
export const FLYER_STAGGER_TICKS = 3;

/**
 * How long a collected gear takes to fly to the counter, as an INTEGER COUNT OF TICKS.
 *
 * 🔴 This was `const TWEEN_MS = 260`, and Codex's implementation review called it a blocker against
 * the project's own rule: *every duration is an integer count of 60 Hz ticks*. 260 ms is 15.6 ticks
 * — a float of seconds wearing a millisecond's clothes, in the one layer where the rule is easiest
 * to forget because Phaser's tween API genuinely takes milliseconds.
 *
 * 15 ticks is 250 ms exactly. The conversion goes through `ticksToMs`, the same function the rest of
 * the project uses, so the number that reaches Phaser is derived rather than authored.
 *
 * ⚠️ **Moved here from `hudGearFlyers.ts` on 2026-08-23**, with `flyerDelayTicks`, and for the same
 * reason: that module reaches `gearLayer.ts`, which imports Phaser as a **value**, so importing it
 * from a unit test throws `window is not defined` and the test file contributes **zero tests while
 * the run still exits 0**. Measured — a gate written against it reported `PASS (0) FAIL (0)`. A
 * constant a test cannot reach is a constant nothing can hold in relation to anything else.
 */
export const FLYER_TWEEN_TICKS = 15;

export function flyerDelayTicks(index: number): number {
  // Negative or fractional indices are not reachable from `fresh.entries()`, but returning a
  // negative delay would be a silent Phaser misconfiguration rather than a throw.
  return Math.max(0, Math.floor(index)) * FLYER_STAGGER_TICKS;
}

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
export const COUNTER_GAP = 24;

/**
 * Counter type size, in DESIGN pixels.
 *
 * 44 px of a 1080 px design height is 4.1 % — which at the smallest resolution this project
 * supports (852 × 480, a 0.44 scale factor) still lands at **19 physical pixels**, comfortably
 * above the ~11 px where digits stop being legible on a low-DPI screen. Criterion 6.5 measures
 * that by looking; this is the number it is looking at.
 */
const COUNTER_FONT_PX = 44;

import { DIGIT_INK_CENTRE_FRACTION } from './counterInk';

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

/**
 * The counter's ink placement lives in `counterInk.ts` — re-exported here because every caller and
 * every gate already reaches for it through `hud.ts`, and moving a file should not move an import.
 */
export { DIGIT_INK_CENTRE_FRACTION, measuredInkCentreFraction } from './counterInk';

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
export function hudLayout(
  gameW: number,
  gameH: number,
  slot: Rect,
  /**
   * How far the digits' ink centre sits below the glyph box's top, as a fraction of the font size.
   * See `measuredInkCentreFraction`.
   *
   * Optional so this module stays engine-free and every existing caller keeps working: only
   * `UIScene` has a browser to ask, and it is the only caller that passes one.
   */
  counterInkCentreFraction: number = DIGIT_INK_CENTRE_FRACTION,
): HudLayout {
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
      // 🔴 **`y` is the top of the GLYPH BOX, and the digits' ink is not centred in it.** Phaser
      // lays the box out on its test string's `ascent + descent` and puts the baseline at
      // `boxTop + ascent`; digits are shorter than that ascent and have no descender, so their ink
      // sits in the upper middle of the box. Centring the box leaves the count reading high against
      // the gear icon, which IS centred on its own bounds — inventory 3.8's second clause.
      //
      // So the box top is placed from the ink instead: subtract the measured distance from the box
      // top down to the ink's own centre. A FRACTION of `fontPx` rather than a literal, so the
      // correction survives a font-size change instead of becoming wrong at the next one.
      y: plate.y + plate.h / 2 - fontPx * counterInkCentreFraction,
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
