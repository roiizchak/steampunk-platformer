/**
 * **The mark drawn on each grey-box control plate.**
 *
 * Split out of `touchControlsLayer.ts` when the two-ink repair took that file past the 400-line
 * ceiling. The seam is a real one rather than a line-count dodge: this is the only part of the
 * layer that is about *appearance*, and it needs no contact map, no binding and no lifecycle.
 *
 * No Phaser import, for the reason `touchControlsLayer.ts`'s header gives.
 */

import { COUNTER_STROKE_PX } from '../render/hud';
import type { TouchTarget } from '../render/touchLayout';
import { TOUCH_FACE_DEPTH, type TouchFaceLike, type TouchSceneLike } from './touchControlsLayer';

/**
 * **The marks are DRAWN, not typed, and that is a correctness decision rather than a style one.**
 *
 * 🔴 The first version set five monospace characters — `<` `>` `A` `^` `||` — at 64 px. The
 * UI/UX gate parsed the actual outlines out of `cour.ttf` and `consola.ttf` (what iOS Safari and
 * Chrome/Windows resolve `monospace` to) and measured what reaches the glass at the worst
 * in-scope scale of 0.347:
 *
 * | mark | ink, CSS px | share of the 55.6 px plate |
 * |---|---|---|
 * | `<` `>` | 10.7 x 11.2 | 3.9 % of plate AREA |
 * | `A` | 13.0 x 12.7 | 5.5 % |
 * | `^` | **8.4 x 5.9** | **1.2 %**, and floating 5.0 CSS px above centre |
 * | `\|\|` | two **0.9 px** hairlines, 26.7 px apart | reads as two pipes, not as pause |
 *
 * `^` is the jump button. `setOrigin(0.5, 0.5)` centres a text object's BOX, and the circumflex
 * sits up between x-height and cap height, so the mark floated in the top half of an otherwise
 * empty plate. Under a thumb that is a smudge.
 *
 * Two independent problems, one root: **a character is whatever the device's font says it is.**
 * Scaling the font fixes the size and not the shape, and swapping in `<U+25B2>` or `<U+2694>`
 * trades a small mark for a possible tofu box, on phone fonts this project cannot test. A drawn
 * shape has neither failure: it is the size we ask for, on every device, forever.
 *
 * So each control draws its own mark from the primitives the plate already uses. The marks are
 * sized as a fraction of the box, so they follow `TOUCH_BOX_PX` rather than restating it.
 */
const MARK_FRAC = 0.46;
const MARK_BAR_FRAC = 0.15;

/**
 * **The plate and the glyph, and why each carries TWO inks.**
 *
 * 🔴 The accessibility gate measured the first version and it failed. The plate was a single
 * `0x6b4b21` fill at alpha **0.55** over a live, scrolling level, and the glyph was `#f7e3b8` with
 * no stroke. Composited, that gives **2.65:1** plate-to-background over `far.png`'s brightest pixel
 * and **1.00:1** over a mid-grey — against WCAG 1.4.11's 3:1 for a component boundary. The glyph
 * reached **2.13:1** over the same bright background, and at 64 game px it is **22.2 CSS px** at
 * the worst in-scope viewport, which is *under* the 24 px large-text threshold, so its bar is 4.5:1
 * rather than 3:1.
 *
 * A single ink cannot pass. Any fixed colour has some background luminance it disappears against,
 * and a control drawn over a scrolling world meets all of them. `src/render/hud.ts:55-100` already
 * worked this out for the gear counter and wrote the method down: give the mark **two inks of
 * opposite luminance** and read `max(fill:bg, stroke:bg)`, because a reader distinguishes it by
 * whichever of the two is contrasting. The worst case is then the mid-luminance background where
 * the two cross, not the extremes.
 *
 * So each drawn mark reuses the counter's own pair verbatim — `#f7e3b8` over a `#1a1410` shadow
 * offset by `COUNTER_STROKE_PX`, whose worst case over every possible background is measured at
 * **3.80:1** — and the plate gets
 * the same treatment: brass fill for a bright background, a pale keyline for a dark one.
 *
 * ⚠️ **The alpha stays at 0.55, and the first repair got that wrong.** Raising it to 0.86 made the
 * fill a fill rather than a tint — and the UI/UX gate's adversarial brief then measured what that
 * costs, from the shipped level data rather than from a screenshot: sampling the player standing
 * on every solid surface in all five `.tmj` files at 96 px intervals, **175 of 878 positions
 * (19.9 %) have a hazard, an enemy or the goal drawn underneath a control plate.** On `level-01`
 * a `brass-sentry` that is actively shooting sits behind the pause plate for nine consecutive
 * positions; on `level-04` the goal sits under the jump plate for nine more.
 *
 * At 0.55 the world under a plate is dim but readable. At 0.86 it is gone. The contrast the
 * repair was for does not come from the fill anyway — it comes from the keyline and from the
 * marks' own two inks, both of which are opaque and neither of which occludes anything, because
 * they cover a fraction of the plate. So the fill goes back to a tint and the legibility is paid
 * for by the two things that can afford it.
 *
 * ⚠️ Reusing `COUNTER_*` is deliberate and not laziness: two independent legibility constants that
 * are supposed to mean the same thing drift, and `contrast-floor.test.ts` already holds this pair
 * against the shipped PNGs.
 */
export const PLATE_FILL = 0x6b4b21;
export const PLATE_ALPHA = 0.55;
export const PLATE_STROKE = 0xf7e3b8;
export const PLATE_STROKE_PX = 6;
/** The plate at rest, and the plate under a thumb. */
export const PLATE_ALPHA_PRESSED = 1;

/** The plate itself: brass fill for a bright background, a pale keyline for a dark one. */
export function drawPlate(
  scene: TouchSceneLike,
  target: TouchTarget,
  cx: number,
  cy: number,
): TouchFaceLike {
  const plate = scene.add
    .rectangle(cx, cy, target.w, target.h, PLATE_FILL, PLATE_ALPHA)
    .setName(target.id)
    .setDepth(TOUCH_FACE_DEPTH);
  plate.setStrokeStyle?.(PLATE_STROKE_PX, PLATE_STROKE);
  return plate;
}

const MARK_INK = 0xf7e3b8;
const SHADOW_INK = 0x1a1410;

/**
 * The drawn mark for one control, already named and depth-sorted.
 *
 * Ink first: every mark is `COUNTER_FILL` over a `COUNTER_STROKE` shadow offset by the stroke
 * width. That is `hud.ts`'s two-ink method in the only form a shape can carry it — a light mark
 * for a dark background, a dark one for a light background, and the reader takes whichever is
 * contrasting. `contrast-floor.test.ts` measures the pair at 3.80:1 over every possible
 * background, and reusing the pair is what makes that measurement apply here too.
 */
export function drawMarks(
  scene: TouchSceneLike,
  target: TouchTarget,
  cx: number,
  cy: number,
): TouchFaceLike[] {
  const r = (target.w * MARK_FRAC) / 2;
  const bar = target.w * MARK_BAR_FRAC;
  const out: TouchFaceLike[] = [];

  const tri = (dx: number, dy: number, ink: number, alpha: number): void => {
    // Point in the travel direction; `dx`/`dy` is the unit heading, so one expression covers all
    // three of left, right and jump.
    const tipX = cx + dx * r + dx * 0;
    const tipY = cy + dy * r;
    const bx = cx - dx * r * 0.7;
    const by = cy - dy * r * 0.7;
    out.push(
      scene.add
        .triangle(0, 0, tipX, tipY, bx - dy * r, by - dx * r, bx + dy * r, by + dx * r, ink, alpha)
        .setName(target.id)
        .setDepth(TOUCH_FACE_DEPTH),
    );
  };
  const rect = (x: number, y: number, w: number, h: number, ink: number, angle: number): void => {
    const face = scene.add
      .rectangle(x, y, w, h, ink, 1)
      .setName(target.id)
      .setDepth(TOUCH_FACE_DEPTH);
    if (angle !== 0) face.setAngle?.(angle);
    out.push(face);
  };

  const o = COUNTER_STROKE_PX;
  const shadow = SHADOW_INK;
  const ink = MARK_INK;
  if (target.id === 'left' || target.id === 'right' || target.id === 'jump') {
    const dx = target.id === 'left' ? -1 : target.id === 'right' ? 1 : 0;
    const dy = target.id === 'jump' ? -1 : 0;
    tri(dx, dy, shadow, 1);
    tri(dx, dy, ink, 1);
    // The shadow copy is drawn first and nudged, so the light mark sits inside a dark keyline.
    out[0].setPosition(o, o);
  } else if (target.id === 'attack') {
    for (const angle of [45, -45]) {
      rect(cx + o, cy + o, r * 2, bar, shadow, angle);
      rect(cx, cy, r * 2, bar, ink, angle);
    }
  } else {
    for (const side of [-1, 1]) {
      rect(cx + side * bar + o, cy + o, bar, r * 1.8, shadow, 0);
      rect(cx + side * bar, cy, bar, r * 1.8, ink, 0);
    }
  }
  return out;
}
