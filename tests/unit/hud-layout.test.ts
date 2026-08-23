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
