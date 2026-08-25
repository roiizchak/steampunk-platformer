/**
 * **Item 5.20 — the HUD elements do not crowd each other.**
 *
 * Split out of `hud-layout.test.ts` on 2026-08-25 under the 400-line rule (that file reached 424
 * when this block and its homogeneity tripwire landed). A flat sibling, per the project precedent.
 *
 * ⚠️ **`COUNTER_GAP` stays private, and asserting against it was the option deliberately refused.**
 * An assertion derived from the same implementation constant the code uses proves the constant
 * equals itself. What is asserted here is independent geometry on `hudLayout()`'s OUTPUT.
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/render/hud';
import { hudLayout } from '../../src/render/hud';
import { HUD_SLOT } from '../../src/render/playerHud';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';

/** The supported sizes, kept in step with `hud-layout.test.ts`. */
const SIZES: [string, number, number][] = [
  ['design 1920x1080', 1920, 1080],
  ['desktop 1280x720', 1280, 720],
  ['phone 852x480', 852, 480],
];
/**
 * # Inter-element spacing — item 5.20, and the hole `hud.ts` documents about itself
 *
 * `hudFits` checks two things: everything is on SCREEN, and the bar is inside its own PLATE. Nothing
 * checks the space *between* elements. `src/render/hud.ts:61` says so in as many words — *"no gate
 * checks spacing between HUD elements (item 5.20)"* — and the constant that produces that spacing,
 * `COUNTER_GAP`, has **zero test references repo-wide**.
 *
 * ## 🔴 `COUNTER_GAP` stays PRIVATE, on purpose
 *
 * The obvious fix is to export it and assert `gap === COUNTER_GAP * scale`. That proves nothing: an
 * assertion derived from the same implementation constant moves whenever the constant moves, so it
 * can never disagree with the code. It is the shape of a gate with the substance of a restatement.
 * Named by the Codex plan review; `src/` is untouched by this file.
 *
 * So the claims below are **independent and geometric**:
 *
 * 1. **Nothing overlaps anything.** A rectangle intersection test, no tolerance, no constant.
 * 2. **A readable gap survives.** `MIN_ELEMENT_GAP_PX` is a *refusal* bound in the sense
 *    `MAX_LEVEL_CREATE_MS` is — chosen to say what is unacceptable, not fitted to what is measured.
 *    The shipped design gaps are 24 and 12 design px; 8 sits below both with real headroom, so this
 *    forbids "touching, overlapping, or crowded" without forbidding a future tightening.
 * 3. **The assembly holds together vertically.** The icon and the counter's ink both sit within the
 *    plate's vertical span — a containment claim, not a copy of the centring formula.
 *
 * All three run at every supported size — ⚠️ **and today that buys nothing, which is stated here
 * rather than implied.** `hudLayout` is homogeneous of degree 1: every rect it returns is a fixed
 * design constant times `scale = gameH / GAME_HEIGHT`, `gameW` is never read, and the gap floor
 * below is itself `MIN_ELEMENT_GAP_PX * scale`. So the three size cases are **algebraically the same
 * assertion**, and the first draft of this block claimed they covered *"the scaling, not one
 * viewport"* when the scaling is exactly what divides out. Named by the 8.7 adversarial brief.
 *
 * They are kept, and a fourth test now pins the homogeneity that makes them redundant. The moment
 * the layout stops being a pure multiple of `scale` — a minimum font size, a breakpoint, a clamp —
 * that test goes red and the size cases become load-bearing on the same commit. Redundant coverage
 * with a tripwire attached is cheaper than deleting it and rediscovering why it was there.
 *
 * ⚠️ The counter's WIDTH is not asserted here and cannot be: only the engine can measure rendered
 * text, which is why `hudFits` takes `counterW` as a parameter. Its width extends rightward, away
 * from every other element, so the inter-element claim is about its ORIGIN — and its right edge is
 * already `hudFits`'s job.
 */
describe('the HUD elements do not crowd each other, at any supported size (item 5.20)', () => {
  /** Scaled with the layout: at 852x480 every gap is 44 % of its design size. */
  const MIN_ELEMENT_GAP_PX = 8;

  const overlaps = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it.each(SIZES)('%s: the plate, the icon and the counter stay clear of each other', (_label, w, h) => {
    const layout = hudLayout(w, h, HUD_SLOT);
    const floor = MIN_ELEMENT_GAP_PX * layout.scale;
    const { plate, gearIcon, counter } = layout;
    // The counter's ink box, using only what the layout knows: it starts at the origin and is one
    // font-height tall. Width is deliberately absent — see the block comment.
    const counterInk: Rect = { x: counter.x, y: counter.y, w: 0, h: counter.fontPx };

    // 1. No overlap. It is `counterInk` that is given a hair of width here — its own `w` is 0,
    //    because only the engine can measure rendered text, and a zero-width rect intersects
    //    nothing, which would make the claim vacuously true. `gearIcon` carries a real width from
    //    the layout and needs no such help. (This comment named the wrong object until 2026-08-25.)
    expect(overlaps(plate, gearIcon), 'the gear icon is drawn ON TOP of the health plate').toBe(false);
    expect(
      overlaps(plate, { ...counterInk, w: 1 }),
      'the gear counter is drawn ON TOP of the health plate',
    ).toBe(false);

    // 2. A readable gap, in both horizontal seams.
    const plateToIcon = gearIcon.x - (plate.x + plate.w);
    const iconToCounter = counter.x - (gearIcon.x + gearIcon.w);
    expect(
      plateToIcon,
      `only ${plateToIcon.toFixed(1)} px between the plate and the gear icon at ${w}x${h}`,
    ).toBeGreaterThanOrEqual(floor);
    expect(
      iconToCounter,
      `only ${iconToCounter.toFixed(1)} px between the gear icon and the counter at ${w}x${h}`,
    ).toBeGreaterThanOrEqual(floor);

    // 3. The assembly reads as one row: both companions sit within the plate's vertical span.
    for (const [name, box] of [
      ['gear icon', gearIcon],
      ['counter', counterInk],
    ] as const) {
      expect(box.y, `the ${name} rides above the plate at ${w}x${h}`).toBeGreaterThanOrEqual(plate.y);
      expect(
        box.y + box.h,
        `the ${name} hangs below the plate at ${w}x${h}`,
      ).toBeLessThanOrEqual(plate.y + plate.h);
    }
  });

  it('the check can go RED: an icon slid left lands on the plate (vault C2)', () => {
    // Driven through the same predicate over a moved rect, so the proof cannot rot into "it fired on
    // something" and needs no fixture file someone later tidies away.
    const { plate, gearIcon } = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);
    const slid: Rect = { ...gearIcon, x: plate.x + plate.w - gearIcon.w / 2 };
    expect(overlaps(plate, slid), 'the overlap predicate cannot detect an overlap').toBe(true);
    expect(slid.x - (plate.x + plate.w), 'a negative gap was not negative').toBeLessThan(0);
  });
  it('hudLayout is HOMOGENEOUS of degree 1 — the property that makes the sizes above redundant', () => {
    // 🔴 This is the test that gives the three size cases their meaning. While it is green they are
    // one assertion written three times; when it goes red they are three different ones, and the
    // reader finds out on the commit that changed the layout rather than in a later review.
    const base = hudLayout(1920, 1080, HUD_SLOT);
    const half = hudLayout(960, 540, HUD_SLOT);
    const ratio = half.scale / base.scale;
    expect(ratio, 'scale did not halve with the height').toBeCloseTo(0.5, 10);

    const flat = (l: typeof base): number[] => [
      l.plate.x, l.plate.y, l.plate.w, l.plate.h,
      l.gearIcon.x, l.gearIcon.y, l.gearIcon.w, l.gearIcon.h,
      l.counter.x, l.counter.y, l.counter.fontPx,
      l.slot.x, l.slot.y, l.slot.w, l.slot.h,
    ];
    const scaled = flat(base).map((v) => v * ratio);
    const got = flat(half);
    // Per element rather than a whole-array compare, so the message names WHICH value stopped
    // scaling. `toBeCloseTo(_, 9)` is float tolerance only — a real breakpoint or clamp moves a
    // value by design pixels, not by 1e-9.
    for (const [i, want] of scaled.entries()) {
      expect(
        got[i],
        `layout value ${i} is NOT a pure multiple of scale (${got[i]} vs ${want}) — the size cases ` +
          'above just became load-bearing, and this test needs replacing by whatever the new ' +
          'non-linearity actually requires',
      ).toBeCloseTo(want, 9);
    }

    // And `gameW` really is unread: the same height at a different width is the same layout.
    expect(flat(hudLayout(1280, 1080, HUD_SLOT)), "gameW changed the layout").toEqual(flat(base));
  });
});
