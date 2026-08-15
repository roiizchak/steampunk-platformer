/**
 * The shipped HUD plate, measured against the constants that draw on top of it.
 *
 * ## The un-gated number this closes
 *
 * `src/render/playerHud.ts` says it plainly: *"There is no gate that can catch a stale slot: the
 * fill would simply sit slightly off inside the frame, which is a thing only an eye can see."* That
 * was true, and Phase 6 proved it the expensive way — the HUD was re-generated and came back
 * **413 × 128 instead of 305 × 128**, because `nano-banana-pro` is not seed-deterministic
 * (STYLE.md §2b). Every number measured off the old plate was silently wrong.
 *
 * A gate cannot know where the amber ends — that is a measurement, and it stays a measurement. What
 * it CAN know is whether the numbers still describe a plate of this size, and whether the slot is
 * inside it. Both of those go red the moment a re-shoot lands, which turns "remember to re-measure"
 * from a comment into a failing test.
 *
 * Deliberately NOT asserted: that the slot lands on the amber. Only an eye can see that, and
 * claiming otherwise with a colour heuristic would be a number that means nothing *(vault 9.3)*.
 * Criterion 6.8 owns it, and its owner is `play`.
 */

import { describe, expect, it } from 'vitest';
import { readPng } from '../../tools/gen/png.mjs';
import { HUD_PLATE } from '../../src/render/hud';
import { HUD_SLOT } from '../../src/render/playerHud';
import catalog from '../../public/assets/index.json';

const HUD_PATH = 'public/assets/hud/health-assembly.png';

describe('the shipped HUD plate', () => {
  it('the shipped bytes decode — nothing below runs against a missing file', () => {
    // `readPng` throws if the file is absent or is not a PNG, so reaching the assertion at all
    // already proves the bytes are there. Asserting the decode as well keeps this from being a
    // test that passes by not running.
    const png = readPng(HUD_PATH);
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });

  it('is exactly the size HUD_PLATE says it is', () => {
    const png = readPng(HUD_PATH);
    expect(typeof png.width).toBe('number');
    expect(png.width).toBe(HUD_PLATE.w);
    expect(png.height).toBe(HUD_PLATE.h);
  });

  it('the bar slot lies inside the plate, with room for the bezel on every side', () => {
    // Not "inside the image" — inside it with a margin. A slot flush against the edge is a slot
    // that has already slid off the bar and is only still on the picture by accident.
    const margin = 8;
    expect(HUD_SLOT.x).toBeGreaterThanOrEqual(margin);
    expect(HUD_SLOT.y).toBeGreaterThanOrEqual(margin);
    expect(HUD_SLOT.x + HUD_SLOT.w).toBeLessThanOrEqual(HUD_PLATE.w - margin);
    expect(HUD_SLOT.y + HUD_SLOT.h).toBeLessThanOrEqual(HUD_PLATE.h - margin);
  });

  it('the slot is a bar, not a smear or a sliver', () => {
    // A transposed or half-typed measurement produces a rectangle that is still "inside the plate".
    // A health bar is wide and short; this is the cheapest statement of that which can still fail.
    expect(HUD_SLOT.w).toBeGreaterThan(HUD_SLOT.h * 3);
    expect(HUD_SLOT.h).toBeGreaterThan(8);
  });

  it('has a catalog entry — criterion 6.6b', () => {
    const entry = catalog.images.find((i) => i.key === 'hud-health');
    expect(entry).toBeDefined();
    expect(entry?.url).toBe('assets/hud/health-assembly.png');
  });

  it('carries real transparency around the assembly', () => {
    // The plate is keyed off a chroma field, so its corners must be transparent. If the key had
    // done nothing the HUD would draw a green rectangle across the top-left of the screen.
    const png = readPng(HUD_PATH);
    const corners = [
      0,
      (png.width - 1) * 4,
      (png.height - 1) * png.width * 4,
      ((png.height - 1) * png.width + png.width - 1) * 4,
    ];
    for (const i of corners) {
      expect(png.data[i + 3]).toBe(0);
    }
  });
});
