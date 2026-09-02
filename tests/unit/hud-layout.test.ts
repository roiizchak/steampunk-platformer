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

import { HELP_FONT_PX } from '../../src/render/helpBanner';
import { helpLine } from '../../src/scenes/gameDev';
import {
  HUD_MARGIN,
  HUD_PLATE,
  counterText,
  gearsCollectedFrom,
  hudFits,
  hudLayout,
} from '../../src/render/hud';
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

  /**
   * 🔴 Every control the SHIPPED banner promises is still in it.
   *
   * Codex implementation review, finding 5: nothing discriminating gated the content. The e2e asks
   * for `length > 40` and the word `move`; the production spec says outright that it cannot verify
   * content and delegates the claim to `contrast-floor.test.ts`, which checks size, weight, stroke
   * and ink and says nothing about keys. **Deleting `M mute` or `[ ] volume` would have left every
   * gate in this repo green** — on the one surface that teaches the controls, and for two controls
   * whose whole argument for being in the shipped half is *"a mute control the player cannot
   * discover is a mute control they do not have"*.
   *
   * Asserted against the SHIPPED half specifically. `helpLine()` returns the DEV form under vitest,
   * and the DEV form is a superset — so checking the whole string would pass on keys that only
   * exist in a dev build. The split is on the dev suffix's first key.
   */
  it('the shipped banner still names every control it is the only place to learn', () => {
    // Non-breaking spaces normalised first: `helpLine()` joins each key to its label with U+00A0
    // so Phaser cannot wrap between them, which is invisible on screen and would make every
    // assertion below read as a missing control.
    const shipped = helpLine().replace(/ /g, ' ').split('  ·  P play')[0] ?? '';
    expect(shipped, 'the DEV suffix boundary moved — this split no longer isolates the shipped half')
      .not.toContain('editor');

    for (const control of [
      'move',
      'jump',
      'walk',
      'attack',
      'mute',
      'volume',
      'levels',
    ]) {
      expect(shipped, `the shipped controls banner no longer names "${control}"`).toContain(control);
    }
    // And the keys themselves, not just the verbs — a legend naming an action with no key is worse
    // than no legend.
    for (const key of ['ARROWS', 'WASD', 'SPACE', 'SHIFT', 'ESC', 'M', '[ ]']) {
      expect(shipped, `the shipped controls banner no longer names the "${key}" key`).toContain(key);
    }
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
    // ✅ **RAISED 28 -> 44 on 2026-08-26, and the floor below moved with it.** 28 cleared the 11 px
    // floor at 12.4 px, but 12.4 px is SMALL text, so WCAG AA asks 4.5:1 of it — which no fill in
    // this palette reaches over an arbitrary background (`contrast-floor.test.ts` holds the closed
    // form and the frontier). 44 x 0.44375 = 19.5 px BOLD clears the 14 pt bold large-text
    // threshold, which is what makes the shipped pair's 3.80:1 a formal figure rather than an
    // argued one. The bar here is now that threshold, not the old hand-set 11.
    //
    // Asserted against the same 0.444 scale `hudLayout` derives, so the two cannot drift apart.
    const scale = hudLayout(852, 480, HUD_SLOT).scale;
    expect(
      HELP_FONT_PX * scale,
      'the controls banner is under WCAG’s 14pt-bold large-text threshold, so contrast-floor’s ' +
        '3:1 bar stops applying to it and the bar becomes 4.5:1 — which the palette cannot meet',
    ).toBeGreaterThanOrEqual(18.66);

    // 🔴 **The upper cap survives, and it moved for a MEASURED reason, not to clear this red.**
    // It was 40, with the note *"above ~40 design px the DEV line needs three rows and starts eating
    // the play area."* That note was correct. Measured live at 852x480, wrapped at 1872 px:
    //
    // | design px | physical px | shipped rows | DEV rows |
    // |---|---|---|---|
    // | 41 | 18.19 | 2 | 2 |
    // | 42 | 18.64 | 2 | 3 |
    // | 44 | 19.52 | 2 | 3 (with the OLD dev suffix) |
    //
    // **No size is both large text (>=42) and two DEV rows (<=41).** The conflict was removed rather
    // than traded: `helpLine`'s DEV suffix was abbreviated to `P play · O editor · G gym`, which is
    // dev-only text no player sees, and both forms are two rows at 44.
    //
    // ⚠️ **The cap is 45, and the first number written here (54) was a GUESS that measurement
    // refuted.** Swept live at 852x480 with the new suffix: the shipped line holds two rows all the
    // way to 58 and needs a third at **59**; the DEV line needs a third at **46**. So 54 would have
    // silently re-allowed the three-row DEV banner this cap exists to prevent — the cap has to be
    // the DEV threshold, not the shipped one. 44-45 is the whole window where the banner is large
    // text AND both forms are two rows.
    //
    // 🔴 **EVERY ROW COUNT IN THE TABLE AND THE PARAGRAPH ABOVE IS A MEASUREMENT AT A WRAP WIDTH
    // THAT NO LONGER EXISTS, and the reason the cap exists has been overruled** (2026-08-27).
    //
    // All of it was swept `wrapped at 1872 px` — the full view. The banner does not wrap there any
    // more: it wraps inside the band right of the gear counter, which is roughly two thirds of that,
    // so both forms take MORE rows than the numbers above say. And the thing the cap protects
    // against is gone twice over: the owner's decision this session was **keep every key printed and
    // allow three lines**, and the banner no longer sits over the play area for a third row to eat —
    // `helpBannerLayout()` centres it on the HUD plate's band and clamps it to the top margin.
    //
    // The cap SURVIVES anyway, with a different job: it stops a runaway font size from overflowing a
    // band that is now much narrower than the view. That is a weaker claim than the one it was
    // written for, and it is the honest one. **A row count is deliberately gated nowhere** — see
    // `tests/e2e/session-help-banner.spec.ts`, which pins clearance and containment instead, because
    // pinning rows would gate the wrong thing and red the next time a key is added.
    expect(HELP_FONT_PX, 'above 45 the banner overflows the band right of the gear counter')
      .toBeLessThanOrEqual(45);
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
 * So reverting the banner's `fontSize` to a hardcoded `'18px'` restored the shipped defect — an
 * ~8 physical-pixel banner at the supported minimum — **with the whole suite green**. CLAUDE.md §2:
 * *"every module here owes a draw-path gate."* This is that gate.
 *
 * ⚠️ **Repointed 2026-08-27 from `gameDev.ts` to `helpBannerLayer.ts`**, which is where the banner
 * is drawn now. This block used to end by explaining that source text was *"the only shape
 * reachable"*, because `gameDev.ts` imports Phaser as a value. That is no longer the constraint it
 * describes: the banner moved to a type-only module precisely so it could be driven against a fake
 * scene, and `help-banner-layer.test.ts` asserts the same claim **behaviourally**, from the style
 * object the layer actually hands Phaser.
 *
 * This gate is kept anyway rather than deleted, for the one thing the behavioural one cannot say:
 * that no hardcoded `px` font size has crept back in ANYWHERE in the module — a second `Text` added
 * later with a literal size would satisfy every behavioural assertion about the first one.
 */
describe('HELP_FONT_PX has a consumer (CLAUDE.md §2 draw-path gate)', () => {
  // ⚠️ vitest caches `?raw` glob results — touch this file too when re-running after an edit.
  const sources = import.meta.glob('../../src/scenes/helpBannerLayer.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;
  const source = Object.values(sources)[0] ?? '';

  it('the source was actually read — an empty glob would make the rest vacuous', () => {
    expect(source.length).toBeGreaterThan(1000);
  });

  it('the banner draws at HELP_FONT_PX, not at a literal', () => {
    expect(source, 'helpBannerLayer.ts no longer imports the constant').toContain('HELP_FONT_PX');
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
