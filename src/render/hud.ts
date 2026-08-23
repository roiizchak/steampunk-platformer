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
 * Where the controls banner sits: one clear margin below the HUD plate, in DESIGN space.
 *
 * ⚠️ **This is here so there is ONE definition, not two that agree** *(vault 5.3)*. `gameDev.ts`
 * computed `HUD_MARGIN + HUD_PLATE.h + HUD_MARGIN * 2` by hand — a second derivation of the plate's
 * bottom edge, in a different module from the one that owns HUD geometry.
 *
 * The S.7 gate owner found it and named the inconsistency rather than the arithmetic: this same
 * session routed the banner's **font size** through a shared constant (`HELP_FONT_PX`) while leaving
 * its **position** as a hand-summed copy. Both numbers describe the same object; only one of them
 * had one owner. It is numerically correct today and would drift silently the day `hudLayout`'s
 * margin or gap formula changes — and no gate checks spacing between HUD elements *(item 5.20)*.
 *
 * `HUD_MARGIN * 3` rather than `* 2` because the plate itself starts one margin down: the gap
 * *below* the plate is `HUD_MARGIN * 2`, deliberately double, so the banner reads as a separate
 * element instead of part of the plate.
 */
export const HELP_BANNER_Y = HUD_MARGIN * 3 + HUD_PLATE.h;

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
 * How far down to nudge a digit string so its ink centres, as a fraction of the font size.
 *
 * A typical font's descent is ~20–22% of its em box, and digits use none of it — so a glyph box
 * centred on `ascent + descent` puts the ink about **half the descent** too high. Half of ~0.21 is
 * ~0.105, which at the shipped 44 px is **4.6 design px** — the top of the 2–4 px range item 3.8
 * reported, measured at 1920 × 1080 where the report was made.
 *
 * ⚠️ **A fraction, not a literal.** The correction has to move with `COUNTER_FONT_PX`; a hardcoded
 * 4 px would be silently wrong the next time the font changes, which is the shape of half this
 * session's Tier 4.
 *
 * ⚠️ **This is a by-eye number and the by-eye read is still owed** *(S.9)*. The browser is the only
 * thing that knows the real metrics of the fallback font it picks, and at 852 × 480 the whole
 * correction is under 2 physical px — possibly imperceptible even though it is real at the design
 * resolution. Recorded rather than presented as measured.
 */
const DIGIT_DESCENT_FRACTION = 0.105;

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
      // 🔴 The descender correction — inventory 3.8's second clause, and the one that was silently
      // left out when 3.8's padding half was fixed. Phaser `Text` lays out on the font's full
      // ascent + descent box, so `y = middle - fontPx / 2` centres THAT box. Digits have no
      // descenders, so the ink sits in the upper part of it and reads **2–4 px high** against the
      // gear icon beside it, which is centred on its own bounds.
      //
      // `DIGIT_DESCENT_FRACTION` is scaled with the font rather than added as a literal, so the
      // correction survives a font-size change instead of becoming wrong at the next one.
      y: plate.y + plate.h / 2 - fontPx / 2 + fontPx * DIGIT_DESCENT_FRACTION,
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
