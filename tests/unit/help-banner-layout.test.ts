/**
 * `helpBannerLayout()` — the pure decision, with no Phaser anywhere near it.
 *
 * Split out of `help-banner-layer.test.ts` on 2026-08-27, when that file reached 509 lines against
 * the project's 400-line ceiling. The seam is the one the architecture already draws: `src/render/`
 * decides, `src/scenes/` applies. This file owns the decision; its sibling drives the layer that
 * applies it against a fake scene.
 *
 * Every case here is arithmetic — no fake scene, no `Text`, no lifecycle. That is the point of the
 * function existing separately from the layer at all *(CLAUDE.md §2)*.
 */

import { describe, expect, it } from 'vitest';

import { COUNTER_GAP, HUD_MARGIN, hudLayout } from '../../src/render/hud';
import { helpBannerLayout } from '../../src/render/helpBanner';

const HUD_SLOT = { x: 150, y: 44, w: 232, h: 40 };

describe('helpBannerLayout — the pure decision', () => {
  it('clears the counter by exactly COUNTER_GAP, scaled', () => {
    expect(helpBannerLayout(600, 1920, 1, 2).x).toBe(600 + COUNTER_GAP);
    expect(helpBannerLayout(600, 852, 0.5, 2).x).toBe(600 + COUNTER_GAP * 0.5);
  });

  it('leaves a usable band at the smallest supported size', () => {
    const scale = 480 / 1080;
    const layout = hudLayout(852, 480, HUD_SLOT);
    const counterRight = layout.counter.x + 96 * scale;
    const banner = helpBannerLayout(counterRight, 852, scale, 3);
    expect(banner.wrapPx, 'no room left for the banner at 852 x 480').toBeGreaterThan(0);
    expect(banner.x + banner.wrapPx).toBeLessThanOrEqual(852);
  });

  it('never returns a wrap width Phaser would read as "do not wrap at all"', () => {
    // 🔴 This asserted `.toBe(0)`, under a comment claiming zero was the safe value. It is the one
    // value that is NOT: `Text.js:392` is `else if (style.wordWrapWidth)`, so zero is falsy and
    // Phaser skips wrapping entirely — one unwrapped line off the right of the screen. The floor is
    // one em, which still wraps. Code-review gate owner, brief 2, finding 6.
    const narrow = helpBannerLayout(900, 800, 1, 2);
    expect(narrow.wrapPx, 'a falsy wrap width turns wrapping OFF').toBeGreaterThan(0);
    expect(narrow.wrapPx).toBe(narrow.fontPx);
  });

  it('is homogeneous in scale, so nothing is a raw design pixel by accident', () => {
    const one = helpBannerLayout(600, 1920, 1, 3);
    const half = helpBannerLayout(300, 960, 0.5, 3);
    expect(half.x).toBeCloseTo(one.x / 2, 6);
    expect(half.wrapPx).toBeCloseTo(one.wrapPx / 2, 6);
    expect(half.fontPx).toBeCloseTo(one.fontPx / 2, 6);
    expect(half.lineHeightPx).toBeCloseTo(one.lineHeightPx / 2, 6);
  });

  it('clamps a tall form to the top margin instead of running off the screen', () => {
    // Eight rows is far taller than the plate; an uncorrected centring puts it above y = 0.
    expect(helpBannerLayout(600, 1920, 1, 8).y).toBe(HUD_MARGIN);
    // And a short one is genuinely centred, so the clamp is not simply always winning.
    expect(helpBannerLayout(600, 1920, 1, 1).y).toBeGreaterThan(HUD_MARGIN);
  });
});
