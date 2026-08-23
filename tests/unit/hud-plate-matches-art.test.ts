import { describe, expect, it } from 'vitest';
import { readPng } from '../../tools/gen/png.mjs';
import { HUD_PLATE, hudLayout } from '../../src/render/hud';
import { HUD_SLOT } from '../../src/render/playerHud';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';

/**
 * # `HUD_PLATE` is the shipped PNG's real size — inventory 3.4
 *
 * Both `hud.ts` and `playerHud.ts` carry the same warning on these constants:
 *
 * > 🔴 **Measured from the shipped file, and it must be re-measured if the HUD is re-generated** …
 * > nothing can catch a stale number here, because a wrong plate size draws a HUD that is merely
 * > slightly off.
 *
 * **The second half of that is false, and this file is the proof.** The claim was that only an eye
 * could catch it — but the authority for the number is a **file in the repository**, and
 * `tools/gen/png.mjs` already exports `readPng`. Nothing had to be built; the gate just had to be
 * written.
 *
 * That matters beyond one constant. *"No gate can catch this"* is how a by-eye item stays by-eye
 * forever, and this session found the same sentence attached to a `verify-dist` claim that turned
 * out to be half true and to a `dropCastShadow` guard whose suggested fix was already in the code.
 * A claim that something is uncheckable is worth checking.
 *
 * ## Why this is a real regression risk, not a formality
 *
 * The plate is **art**. A re-generated HUD comes back at whatever size the model produced, and
 * `hudLayout` derives the gear icon's position, the counter's position and `hudFits`' whole
 * bounding box from `HUD_PLATE`. A stale value does not throw and does not look broken in a
 * screenshot — it slides every element a few pixels and passes every existing assertion, which is
 * exactly the class of defect the Phase 6 gate owner found by eye in an evidence screenshot.
 *
 * **The mutation this names:** change either component of `HUD_PLATE`.
 */

const PLATE_PATH = 'public/assets/hud/health-assembly.png';

describe('HUD_PLATE matches the shipped art (3.4)', () => {
  const png = readPng(PLATE_PATH);

  it('the file was actually read — a zero-size decode would make the rest vacuous', () => {
    expect(png.width, `${PLATE_PATH} decoded to a zero width`).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });

  it('is exactly the plate PNG size', () => {
    expect(
      { w: png.width, h: png.height },
      `HUD_PLATE is ${HUD_PLATE.w}x${HUD_PLATE.h} but ${PLATE_PATH} is ${png.width}x${png.height}. ` +
        `Re-measure the constant — do NOT edit the art to match a stale number.`,
    ).toEqual({ w: HUD_PLATE.w, h: HUD_PLATE.h });
  });

  it('the health slot fits inside the plate it is drawn on', () => {
    // `HUD_SLOT` carries the same by-eye warning and is measured off the same image. A slot larger
    // than its own plate is the shape a re-generation produces when only one of the two constants
    // is updated.
    expect(HUD_SLOT.x).toBeGreaterThanOrEqual(0);
    expect(HUD_SLOT.y).toBeGreaterThanOrEqual(0);
    expect(HUD_SLOT.x + HUD_SLOT.w, 'the health bar runs off the right of its plate').toBeLessThanOrEqual(
      png.width,
    );
    expect(HUD_SLOT.y + HUD_SLOT.h, 'the health bar runs off the bottom of its plate').toBeLessThanOrEqual(
      png.height,
    );
  });

  it('the slot is a real bar, not a degenerate rectangle', () => {
    // The counter-fixture for the containment check above: `{0, 0, 0, 0}` fits inside anything.
    expect(HUD_SLOT.w).toBeGreaterThan(png.width * 0.3);
    expect(HUD_SLOT.h).toBeGreaterThan(4);
  });

  it('the whole assembly still fits on screen at the smallest supported window', () => {
    // The end of the chain the constant feeds: plate size drives the icon, the counter and
    // `hudFits`. Asserted here so a re-measurement that is CORRECT but too large is also caught —
    // a bigger plate is a legitimate art change and an illegitimate layout.
    const layout = hudLayout(852, 480, HUD_SLOT);
    expect(layout.plate.w).toBeGreaterThan(0);
    expect(layout.plate.x + layout.plate.w).toBeLessThanOrEqual(852);
    expect(layout.plate.y + layout.plate.h).toBeLessThanOrEqual(480);
  });

  it('and at the design size', () => {
    const layout = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);
    expect(layout.plate.x + layout.plate.w).toBeLessThanOrEqual(GAME_WIDTH);
    expect(layout.plate.y + layout.plate.h).toBeLessThanOrEqual(GAME_HEIGHT);
  });
});
