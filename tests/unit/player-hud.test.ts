/**
 * The player's HUD health bar.
 *
 * **This file exists because a playtest found what the whole unit suite could not.** `GameScene`
 * drew `hud-health` as a static image and nothing else, so the bar showed full gold at 20 of 100 hp.
 * 590 tests were green. Not one of them looks at the HUD — vault C4, and the reason a criterion
 * owned by `play` is never satisfied by automated evidence.
 *
 * The fix routes through the SAME `healthBarFillWidth` the enemy bars use, so these tests are about
 * the wiring and the slot, not about re-proving the rule.
 */

import { describe, expect, it } from 'vitest';

import { healthBarFillWidth, fillIsHonest } from '../../src/render/enemyHealthBar';
import { HUD_READY_FRACTION, HUD_SLOT, playerHudFill } from '../../src/render/playerHud';
import { PLAYER_MAX_HP } from '../../src/sim/combat';

describe('the player HUD bar tracks hp instead of being decoration', () => {
  it('is full at full hp and empty at zero — the defect, at both ends', () => {
    expect(playerHudFill(PLAYER_MAX_HP, PLAYER_MAX_HP, 24, 24).w).toBe(HUD_SLOT.w);
    expect(playerHudFill(0, PLAYER_MAX_HP, 24, 24).w).toBe(0);
  });

  it('moves when hp moves — a static bar is exactly what shipped', () => {
    const full = playerHudFill(100, 100, 24, 24).w;
    const hurt = playerHudFill(20, 100, 24, 24).w;
    expect(hurt).toBeLessThan(full);
    expect(hurt).toBeGreaterThan(0);
  });

  /** Inherited from `healthBarFillWidth`, asserted here so the wiring cannot drop it. */
  it('still draws a visible sliver on the last hit', () => {
    const sliver = playerHudFill(1, 100, 24, 24).w;
    expect(fillIsHonest(sliver, HUD_SLOT.w, 1)).toBe(true);
  });

  it('is offset from wherever the HUD image is placed, not pinned to the origin', () => {
    const desc = playerHudFill(50, 100, 24, 24);
    expect(desc.x).toBe(24 + HUD_SLOT.x);
    expect(desc.y).toBe(24 + HUD_SLOT.y);
    // 🔴 This asserted `healthBarFillWidth(50, 100, HUD_SLOT.w)` — the UNCOMPRESSED width — until
    // Phase 6 added criterion 6.4's readiness compression, at which point it failed with 73 vs 80.
    // The assertion's purpose is "the HUD routes through the shared function rather than doing its
    // own arithmetic", and that purpose is served better with the fraction than without it: it now
    // also pins that the HUD passes it. Weakening this to `toBeGreaterThan(0)` was the other option
    // and would have deleted the wiring check to avoid updating a number.
    expect(desc.w).toBe(healthBarFillWidth(50, 100, HUD_SLOT.w, HUD_READY_FRACTION));
  });
});
