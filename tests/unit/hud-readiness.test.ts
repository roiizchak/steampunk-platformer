/**
 * Criterion 6.4 — the player's health bar must never DRAW full while health is below max.
 *
 * ## The defect this file was written against (REPRODUCTION, red→green)
 *
 * `healthBarFillWidth(99, 100, 156)` returned **154 of 156 px**. Two pixels of a 156 px bar is not a
 * difference a player can see, so a character one hit from full looked untouched — and the mirror of
 * that, which is what vault 6.4 is actually about, is a readiness cue that reads as ready and then
 * refuses in silence. The vault's own case was a meter at 98/100 drawing **315 px of a 318 px bar**.
 *
 * It shipped in Phase 5 on the bar that matters most, and nothing in the suite looked at it.
 *
 * ## Why the fix is a compression and not a special case
 *
 * Everything below max is compressed into the first `HUD_READY_FRACTION` of the slot, so the
 * mapping stays **monotone** and the full-width state is reserved for actually-full. Clamping the
 * top end instead — "subtract a few pixels near the end" — would make two different health values
 * draw the same width, which is a second lie in place of the first.
 *
 * ## Where this test stops, and what covers the rest
 *
 * Everything here asserts a **computed** width. That is not the whole criterion: the renderer turns
 * that width into a dark "spent" rectangle, and its coordinates, colour or invocation can all be
 * wrong while every assertion in this file passes — Codex's Phase 6 plan review made exactly that
 * point (finding F4). The drawn pixels are asserted in `tests/e2e/phase-06-hud.spec.ts`, on the real
 * GPU. Both halves are the criterion; neither alone is.
 */

import { describe, expect, it } from 'vitest';
import { BAR_MIN_FILL_PX, fillIsHonest, healthBarFillWidth } from '../../src/render/enemyHealthBar';
import { HUD_READY_FRACTION, HUD_SLOT, playerHudFill } from '../../src/render/playerHud';

const MAX_HP = 100;
const SLOT_W = HUD_SLOT.w;

describe('the player HUD bar never draws full below max health', () => {
  it('REPRODUCTION: 99 of 100 hp does not draw a bar that READS as full', () => {
    // 🔴 This assertion was `fill < SLOT_W` when it was first written, and it came back GREEN
    // against the defect — the shipped code returned 154 of 156, which satisfies "less than the
    // slot" while being two pixels from the end of a 156 px bar. A reproduction that passes has
    // not found the bug *(vault C3)*, and "not literally the maximum" is not the claim; "a player
    // can see it is not full" is. So the assertion is against the compression ceiling.
    const fill = healthBarFillWidth(99, MAX_HP, SLOT_W, HUD_READY_FRACTION);

    expect(typeof fill).toBe('number');
    expect(fill).toBeLessThanOrEqual(Math.floor(SLOT_W * HUD_READY_FRACTION));
    // And the number the defect produced, named so a regression to it is unmistakable.
    expect(fill).not.toBe(154);
  });

  it('no health below max draws more than the ready fraction of the slot', () => {
    const ceiling = Math.floor(SLOT_W * HUD_READY_FRACTION);

    for (let hp = 1; hp < MAX_HP; hp += 1) {
      const fill = healthBarFillWidth(hp, MAX_HP, SLOT_W, HUD_READY_FRACTION);
      expect(fill, `hp ${hp} drew ${fill} of ${SLOT_W}`).toBeLessThanOrEqual(ceiling);
      expect(fill, `hp ${hp} drew ${fill}, which is the full slot`).toBeLessThan(SLOT_W);
    }
  });

  it('full health draws exactly the full slot — the reserved state is reachable', () => {
    expect(healthBarFillWidth(MAX_HP, MAX_HP, SLOT_W, HUD_READY_FRACTION)).toBe(SLOT_W);
    // And overfull, which a heal could produce, is clamped rather than overflowing the bezel.
    expect(healthBarFillWidth(MAX_HP + 40, MAX_HP, SLOT_W, HUD_READY_FRACTION)).toBe(SLOT_W);
  });

  it('a living player always draws a visible sliver, never an empty slot', () => {
    for (let hp = 1; hp < MAX_HP; hp += 1) {
      expect(healthBarFillWidth(hp, MAX_HP, SLOT_W, HUD_READY_FRACTION)).toBeGreaterThanOrEqual(
        BAR_MIN_FILL_PX,
      );
    }
  });

  it('0 hp is the ONLY input that draws nothing', () => {
    expect(healthBarFillWidth(0, MAX_HP, SLOT_W, HUD_READY_FRACTION)).toBe(0);
    expect(healthBarFillWidth(-10, MAX_HP, SLOT_W, HUD_READY_FRACTION)).toBe(0);
    for (let hp = 1; hp <= MAX_HP; hp += 1) {
      expect(healthBarFillWidth(hp, MAX_HP, SLOT_W, HUD_READY_FRACTION)).toBeGreaterThan(0);
    }
  });

  it('is monotone non-decreasing in health — no two-way jitter as you heal', () => {
    let previous = -1;
    for (let hp = 0; hp <= MAX_HP; hp += 1) {
      const fill = healthBarFillWidth(hp, MAX_HP, SLOT_W, HUD_READY_FRACTION);
      expect(fill, `hp ${hp} drew ${fill}, narrower than hp ${hp - 1}`).toBeGreaterThanOrEqual(
        previous,
      );
      previous = fill;
    }
  });

  it('there is a visible gap between "nearly full" and "full"', () => {
    // The point of the whole criterion, stated as one number a human can check.
    const nearlyFull = healthBarFillWidth(MAX_HP - 1, MAX_HP, SLOT_W, HUD_READY_FRACTION);
    const full = healthBarFillWidth(MAX_HP, MAX_HP, SLOT_W, HUD_READY_FRACTION);

    expect(full - nearlyFull).toBeGreaterThanOrEqual(8);
  });
});

describe('fillIsHonest states the criterion, for both consumers', () => {
  it('rejects a full-width fill at less than full health', () => {
    expect(fillIsHonest(SLOT_W, SLOT_W, 99, MAX_HP, HUD_READY_FRACTION)).toBe(false);
  });

  it('accepts what healthBarFillWidth actually produces, at every health', () => {
    for (let hp = 0; hp <= MAX_HP; hp += 1) {
      const fill = healthBarFillWidth(hp, MAX_HP, SLOT_W, HUD_READY_FRACTION);
      expect(
        fillIsHonest(fill, SLOT_W, hp, MAX_HP, HUD_READY_FRACTION),
        `hp ${hp} produced ${fill}, which its own predicate rejects`,
      ).toBe(true);
    }
  });

  it('rejects an empty bar on a living player, and a non-empty one on a dead one', () => {
    expect(fillIsHonest(0, SLOT_W, 1, MAX_HP, HUD_READY_FRACTION)).toBe(false);
    expect(fillIsHonest(BAR_MIN_FILL_PX, SLOT_W, 0, MAX_HP, HUD_READY_FRACTION)).toBe(false);
  });

  it('keeps its three-argument meaning, so the enemy bars are untouched', () => {
    // Criterion 5.7's calls pass three arguments and must behave exactly as they did in Phase 5:
    // a full-width fill below max health is honest for an ENEMY bar, which has no readiness claim.
    expect(fillIsHonest(SLOT_W, SLOT_W, 99)).toBe(true);
    expect(fillIsHonest(0, SLOT_W, 0)).toBe(true);
    expect(fillIsHonest(0, SLOT_W, 1)).toBe(false);
  });
});

describe('playerHudFill applies the compression, so the scene cannot forget to', () => {
  it('never returns a full-slot width below max health', () => {
    for (let hp = 1; hp < MAX_HP; hp += 1) {
      const fill = playerHudFill(hp, MAX_HP, 24, 24);
      expect(typeof fill.w).toBe('number');
      expect(fill.w, `hp ${hp} drew the full slot`).toBeLessThan(HUD_SLOT.w);
    }
  });

  it('positions the fill inside the slot, offset by the HUD origin', () => {
    const fill = playerHudFill(50, MAX_HP, 24, 24);
    expect(fill.x).toBe(24 + HUD_SLOT.x);
    expect(fill.y).toBe(24 + HUD_SLOT.y);
    expect(fill.h).toBe(HUD_SLOT.h);
  });

  it('the enemy bars did NOT inherit the compression', () => {
    // One predicate, two consumers — but they are consumers with different claims. An enemy bar at
    // 99% is allowed to look full; it promises nothing. Asserting this here is what stops a later
    // edit from "tidying" the default and silently retuning criterion 5.7.
    const enemySlot = 144;
    expect(healthBarFillWidth(MAX_HP - 1, MAX_HP, enemySlot)).toBeGreaterThan(
      Math.floor(enemySlot * HUD_READY_FRACTION),
    );
  });
});
