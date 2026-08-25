/**
 * HUD layout — the engine-free half of criterion 6.3.
 *
 * ## What this can and cannot prove
 *
 * The scale mode is `FIT`, so Phaser's game size is permanently 1920 × 1080 and its cameras never
 * resize. **These tests therefore bound the layout FUNCTION, not a resize the engine performs** —
 * saying so is the point *(vault 9.3)*. What they do buy is real: every number comes from the
 * arguments, so vault 6.2's "a second camera created at an explicit size never auto-resizes" cannot
 * open here later, and the e2e spec drives a genuine `scale.resize()` against the same predicate.
 *
 * `hudFits` is imported by this file AND by `tests/e2e/phase-06-chrome.spec.ts`. One definition, two
 * consumers — the `viewFits`/`tracksTarget` precedent from Phase 3.
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/render/hud';
import { HELP_FONT_PX, HUD_MARGIN, HUD_PLATE, counterText, gearsCollectedFrom, hudFits, hudLayout } from '../../src/render/hud';
import { HUD_SLOT } from '../../src/render/playerHud';
import { GAME_HEIGHT, GAME_WIDTH, MAX_LEVEL_GEARS } from '../../src/game/constants';
import type { GearSim } from '../../src/sim';

/** The three sizes this project supports, per the Phase 6 decision. */
const SIZES: [string, number, number][] = [
  ['design 1920x1080', GAME_WIDTH, GAME_HEIGHT],
  ['desktop 1280x720', 1280, 720],
  ['phone 852x480', 852, 480],
];

/** A generous over-estimate of the counter's rendered width, so `hudFits` is not trivially true. */
const counterWidthAt = (fontPx: number): number => fontPx * 3;

describe('hudLayout is derived from the live game size', () => {
  it('is exactly 1:1 at the design size', () => {
    const layout = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);
    expect(layout.scale).toBe(1);
    expect(layout.plate.x).toBe(HUD_MARGIN);
    expect(layout.plate.y).toBe(HUD_MARGIN);
    expect(layout.plate.w).toBe(HUD_PLATE.w);
    expect(layout.plate.h).toBe(HUD_PLATE.h);
  });

  it.each(SIZES)('%s: the whole HUD fits on screen', (_name, w, h) => {
    const layout = hudLayout(w, h, HUD_SLOT);
    expect(hudFits(layout, w, h, counterWidthAt(layout.counter.fontPx))).toBe(true);
  });

  it.each(SIZES)('%s: the bar slot sits inside the plate', (_name, w, h) => {
    const layout = hudLayout(w, h, HUD_SLOT);
    expect(layout.slot.x).toBeGreaterThanOrEqual(layout.plate.x);
    expect(layout.slot.y).toBeGreaterThanOrEqual(layout.plate.y);
    expect(layout.slot.x + layout.slot.w).toBeLessThanOrEqual(layout.plate.x + layout.plate.w);
    expect(layout.slot.y + layout.slot.h).toBeLessThanOrEqual(layout.plate.y + layout.plate.h);
  });

  it('scales off HEIGHT, so a wider window does not inflate the HUD', () => {
    const wide = hudLayout(3840, GAME_HEIGHT, HUD_SLOT);
    const design = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);
    expect(wide.plate.w).toBe(design.plate.w);
    expect(wide.counter.fontPx).toBe(design.counter.fontPx);
  });

  it('shrinks with height, and everything shrinks together', () => {
    const half = hudLayout(960, GAME_HEIGHT / 2, HUD_SLOT);
    expect(half.scale).toBe(0.5);
    expect(half.plate.w).toBe(HUD_PLATE.w / 2);
    expect(half.counter.fontPx).toBe(hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT).counter.fontPx / 2);
  });

  it('the counter stays legible at the smallest supported size', () => {
    // Criterion 6.5's number, stated where it can fail. 852 x 480 is a 0.444 scale; anything under
    // ~11 physical px stops being readable digits on a low-DPI screen.
    const layout = hudLayout(852, 480, HUD_SLOT);
    expect(layout.counter.fontPx).toBeGreaterThanOrEqual(11);
  });

  it('the CONTROLS BANNER stays legible at the smallest supported size too', () => {
    // 🔴 Session inventory 2.5. `addHelpBanner` hard-coded `'18px'`, which is 18 x 0.444 = **8
    // physical px** at 852 x 480 — a third under the same floor the counter above is measured
    // against, and confirmed illegible in a playtest screenshot rather than inferred.
    //
    // The banner SHIPS: `helpLine()` deliberately keeps the mute keys and `ESC levels` in the
    // shipped half, because "a mute control the player cannot discover is a mute control they do
    // not have". An illegible banner is those controls not existing.
    //
    // Asserted against the same 0.444 scale `hudLayout` derives, so the two cannot drift apart.
    const scale = hudLayout(852, 480, HUD_SLOT).scale;
    expect(
      HELP_FONT_PX * scale,
      'the controls banner is under the legibility floor',
    ).toBeGreaterThanOrEqual(11);
    // And it must not have been "fixed" by growing past what one wrapped banner can show: above
    // ~40 design px the DEV line needs three rows and starts eating the play area.
    expect(HELP_FONT_PX).toBeLessThanOrEqual(40);
  });

  it('refuses a nonsense game size instead of laying out into it', () => {
    expect(() => hudLayout(0, 1080, HUD_SLOT)).toThrow(/game size/);
    expect(() => hudLayout(1920, Number.NaN, HUD_SLOT)).toThrow(/game size/);
    expect(() => hudLayout(-1920, 1080, HUD_SLOT)).toThrow(/game size/);
  });
});

describe('hudFits can actually fail', () => {
  // vault C2: a predicate that cannot go red is decoration.
  it('rejects a HUD pushed off the right edge by a long counter', () => {
    const layout = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);
    expect(hudFits(layout, GAME_WIDTH, GAME_HEIGHT, GAME_WIDTH)).toBe(false);
  });

  it('rejects a HUD taller than the screen', () => {
    const layout = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);
    expect(hudFits(layout, GAME_WIDTH, 40, counterWidthAt(layout.counter.fontPx))).toBe(false);
  });

  it('rejects a bar slot that has slid off its own plate', () => {
    // The defect a re-generated HUD produces: the art moves, `HUD_SLOT` does not, and the fill is
    // drawn outside the bezel while sitting comfortably on screen the whole time.
    const strayed = hudLayout(GAME_WIDTH, GAME_HEIGHT, { ...HUD_SLOT, x: HUD_PLATE.w + 40 });
    expect(hudFits(strayed, GAME_WIDTH, GAME_HEIGHT, 120)).toBe(false);
  });
});

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
 * All three run at **every supported size**, because the thing that can break is the scaling, not
 * one viewport.
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

    // 1. No overlap. `gearIcon` is given a hair of width in the counter test so a zero-width rect
    //    cannot make the intersection vacuously false.
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
});

describe('gearsCollectedFrom drives the tween', () => {
  const gear = (collectedTick: number | null): GearSim => ({
    x: 0,
    y: 0,
    collected: collectedTick !== null,
    collectedTick,
  });

  it('REPRODUCTION: the bound is INCLUSIVE — a gear stamped with the bound is returned', () => {
    // 🔴 This was `> fromTick`, and the first gear of every batch produced no tween because of it.
    // The caller stores `world.tickCount` after each frame, which is the index of the NEXT tick to
    // run; a gear collected during that tick carries exactly that number. The counter still
    // incremented, so only the e2e tween assertion could see it — the one Codex's plan review
    // (F3) insisted on, and the only reason it was found at all.
    const gears = [gear(null), gear(5), gear(9), gear(12)];
    expect(gearsCollectedFrom(gears, 9)).toHaveLength(2);
    expect(gearsCollectedFrom(gears, 12)).toHaveLength(1);
  });

  it('excludes gears collected before the bound, so a tween is never replayed', () => {
    const gears = [gear(null), gear(5), gear(9), gear(12)];
    expect(gearsCollectedFrom(gears, 4)).toHaveLength(3);
    expect(gearsCollectedFrom(gears, 13)).toHaveLength(0);
  });

  it('returns SEVERAL when several were collected in one batch — the reason it exists', () => {
    // A boolean event says "at least one" and carries no position. Two gears taken between two
    // render frames must produce two flying gears, not one.
    const gears = [gear(7), gear(7), gear(7)];
    expect(gearsCollectedFrom(gears, 6)).toHaveLength(3);
  });

  it('ignores uncollected gears entirely', () => {
    expect(gearsCollectedFrom([gear(null), gear(null)], 0)).toHaveLength(0);
  });
});

describe('counterText gives tabular figures a fixed width', () => {
  it('pads to the width MAX_LEVEL_GEARS needs, so the string length never changes', () => {
    // 🔴 RE-TAKEN 2026-08-23 (inventory 3.8). This asserted a hard-coded three digits, which is a
    // width the game cannot reach: MAX_LEVEL_GEARS is 64. `level-01` ships 7 gears and drew `007`,
    // recorded in phase-06-owed.md as reading like a placeholder.
    //
    // Derived from the cap on both sides, so raising the cap past 99 widens the counter and this
    // test together rather than leaving one to be found by eye.
    const width = String(MAX_LEVEL_GEARS).length;
    expect(width, 'the cap changed — check the counter still fits its slot').toBe(2);

    expect(counterText(0)).toBe('00');
    expect(counterText(9)).toBe('09');
    expect(counterText(10)).toBe('10');
    expect(counterText(MAX_LEVEL_GEARS)).toBe('64');
    for (const n of [0, 1, 9, 10, 64]) {
      expect(counterText(n)).toHaveLength(width);
    }
  });

  it('does not truncate past its pad width — a wrong count beats a lying one', () => {
    // Above the cap is unreachable from shipped data (`describeGearProblem` refuses it), but a
    // truncating counter would lie rather than look wrong, so the overflow behaviour is pinned.
    expect(counterText(1234)).toBe('1234');
  });

  it('clamps nonsense rather than rendering it', () => {
    expect(counterText(-5)).toBe('00');
    expect(counterText(3.7)).toBe('03');
  });
});

/**
 * # The banner's font size reaches the banner (S.3 gate owner, brief 1)
 *
 * The code-review gate owner found item 2.5's fix had **no draw-path gate**: every assertion above
 * is about the constant, and the session log's watched-red was *"`HELP_FONT_PX` back to 18"* — which
 * mutates the constant, not the consumer.
 *
 * So reverting `gameDev.ts`'s `fontSize` to a hardcoded `'18px'` restored the shipped defect — an
 * ~8 physical-pixel banner at the supported minimum — **with the whole suite green**. CLAUDE.md §2:
 * *"every module here owes a draw-path gate."* This is that gate.
 *
 * Source text rather than behaviour, because `gameDev.ts` imports Phaser as a **value** and cannot
 * be imported here. The weaker of the two shapes CLAUDE.md allows, and the only one reachable.
 */
describe('HELP_FONT_PX has a consumer (CLAUDE.md §2 draw-path gate)', () => {
  // ⚠️ vitest caches `?raw` glob results — touch this file too when re-running after an edit.
  const sources = import.meta.glob('../../src/scenes/gameDev.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;
  const source = Object.values(sources)[0] ?? '';

  it('the source was actually read — an empty glob would make the rest vacuous', () => {
    expect(source.length).toBeGreaterThan(1000);
  });

  it('the banner draws at HELP_FONT_PX, not at a literal', () => {
    expect(source, 'gameDev.ts no longer imports the constant').toContain('HELP_FONT_PX');
    expect(source, 'the banner does not use HELP_FONT_PX for its fontSize').toContain(
      '`${HELP_FONT_PX}px`',
    );
  });

  it('no hardcoded pixel fontSize survives in the banner', () => {
    // The exact regression: `fontSize: '18px'` is what shipped, and 2.5 is the record of it.
    expect(source, "a literal px fontSize is back — that is item 2.5's defect").not.toMatch(
      /fontSize:\s*'\d+px'/,
    );
  });
});

/**
 * # The counter's digits centre on their INK, not on their glyph box (inventory 3.8, clause 2)
 *
 * Item 3.8 named three UI defects. The padding half was fixed; **this one was silently left out and
 * never recorded** — found by the S.7 gate owner, which makes it a C11 gap as well as a visual one.
 *
 * Phaser `Text` lays out on the font's full ascent + descent box. Digits have no descenders, so
 * centring that box leaves the ink sitting **2–4 px high** next to the gear icon, which is centred
 * on its own bounds.
 *
 * ⚠️ Changing `counter.y` moved **no test at all** — 2283 passed before and after. That is the
 * finding this file exists to close: the value was ungated, so the defect could be introduced or
 * removed without anything noticing, in either direction.
 *
 * **The mutation this names:** drop the `+ fontPx * DIGIT_DESCENT_FRACTION` term.
 */
describe('the gear counter is nudged for the descender it does not have (3.8)', () => {
  const layout = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);

  /** Where a naive ascent+descent centring would put it — the defect's position. */
  function naiveY(l: ReturnType<typeof hudLayout>): number {
    return l.plate.y + l.plate.h / 2 - l.counter.fontPx / 2;
  }

  it('sits BELOW naive centring — the whole point', () => {
    expect(
      layout.counter.y,
      'the counter is centred on its glyph box again, so the digits read high',
    ).toBeGreaterThan(naiveY(layout));
  });

  it('the nudge is a plausible half-descent, not an arbitrary shove', () => {
    // Asserted as a range rather than an equality: an equality against the constant would be the
    // same expression twice and could never fail. A half-descent is ~10% of the em box; anything
    // outside 5–15% is a different decision that should be argued, not tuned in.
    const nudge = (layout.counter.y - naiveY(layout)) / layout.counter.fontPx;
    expect(nudge, `nudge is ${(nudge * 100).toFixed(1)}% of the font size`).toBeGreaterThan(0.05);
    expect(nudge).toBeLessThan(0.15);
  });

  it('scales with the font — it is a fraction, not a literal', () => {
    // The regression that a hardcoded 4 px would cause: correct at 1920x1080, wrong everywhere else.
    // This is half of what Tier 4 was about.
    const small = hudLayout(852, 480, HUD_SLOT);
    const big = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);
    const smallNudge = (small.counter.y - naiveY(small)) / small.counter.fontPx;
    const bigNudge = (big.counter.y - naiveY(big)) / big.counter.fontPx;
    expect(smallNudge).toBeCloseTo(bigNudge, 6);
  });

  it('still leaves the whole HUD on screen at the minimum window', () => {
    // The counter moving down cannot be allowed to push it off the bottom — `hudFits` measures the
    // counter's bottom as `y + fontPx`, so the nudge is inside that budget or it is not.
    expect(hudFits(hudLayout(852, 480, HUD_SLOT), 852, 480, 60)).toBe(true);
  });
});
