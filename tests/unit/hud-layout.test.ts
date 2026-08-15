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
 * `hudFits` is imported by this file AND by `tests/e2e/phase-06-hud.spec.ts`. One definition, two
 * consumers — the `viewFits`/`tracksTarget` precedent from Phase 3.
 */

import { describe, expect, it } from 'vitest';
import { HUD_MARGIN, HUD_PLATE, counterText, gearsCollectedFrom, hudFits, hudLayout } from '../../src/render/hud';
import { HUD_SLOT } from '../../src/render/playerHud';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
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
  it('pads to three digits, so the string length never changes', () => {
    expect(counterText(0)).toBe('000');
    expect(counterText(9)).toBe('009');
    expect(counterText(10)).toBe('010');
    expect(counterText(123)).toBe('123');
    for (const n of [0, 1, 9, 10, 99, 100, 999]) {
      expect(counterText(n)).toHaveLength(3);
    }
  });

  it('does not truncate past three digits — a wrong count beats a lying one', () => {
    expect(counterText(1234)).toBe('1234');
  });

  it('clamps nonsense rather than rendering it', () => {
    expect(counterText(-5)).toBe('000');
    expect(counterText(3.7)).toBe('003');
  });
});
