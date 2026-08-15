/**
 * The enemy health bar — criterion 5.7, decided in engine-free code *(vault 2.12)*.
 *
 * ## The rule, and why it is a shared predicate
 *
 * Vault **6.4**: gate on what is DRAWN, not on the ratio behind it. An enemy at 2/100 HP has a
 * ratio of 0.02, and `0.02 × 120 px` rounds to **2 px** — which at a glance is an empty bar. The
 * player then reads "dead" and walks away from something that is about to hit them. So a non-zero
 * fill is compressed into the upper part of the slot: alive is always **visible**, and more hp is
 * still visibly more bar — including at the very bottom of the range, which is the part a simple
 * `Math.max` floor gets wrong and which no monotonicity test can see.
 *
 * `fillIsHonest` is exported and imported by BOTH this file and `tests/e2e/phase-05-combat.spec.ts`
 * — one definition, two consumers, following the `viewFits`/`tracksTarget` precedent from Phase 3.
 * Two assertions that agree on the happy path are not one gate *(Codex C8)*.
 *
 * ## Why this is its own file
 *
 * Split from `enemy-view.test.ts` on 2026-08-14. That file reached 455 lines — over the 400-line
 * rule — once the animation-key half grew a real exhaustiveness check. The seam is the criterion
 * boundary: **5.7 is the health bar, 5.4/5.4d is the animation key**, and they share no fixture.
 * This is deliberately NOT a `-helpers` module that one file imports, which is the split this
 * project's size gate names as the way to game it (`tests/unit/file-size.test.ts:18-27`).
 */

import { describe, expect, it } from 'vitest';

import {
  BAR_MIN_FILL_PX,
  barSlotWidth,
  fillIsHonest,
  healthBarDesc,
  healthBarFillWidth,
} from '../../src/render/enemyHealthBar';
import { RENDER_SCALE } from '../../src/game/constants';
import { createScavenger } from '../../src/sim/enemies';

/**
 * 🔴 **DERIVED, and it used to be a hardcoded `120`.**
 *
 * The shipped slot is `barSlotWidth(RENDER_SCALE)` = 24 x 6 = **144**. 120 was the pre-Phase-4
 * figure, from before the 3x world rescale, and nothing updated it because nothing connected it to
 * the source. Every threshold in the block below was therefore evaluated against a width the game
 * has never drawn -- including the premise the whole criterion rests on.
 *
 * Deriving it rather than retyping 144 is the point: a second literal would go stale the same way
 * the first one did *(vault 5.3)*.
 */
const SLOT = barSlotWidth(RENDER_SCALE);

/**
 * The scavenger's real hit points, and the reason the low-hp case below moved.
 *
 * At the fictional 120 px slot, `2 of 100` rounded to 2 px and sat below `BAR_MIN_FILL_PX` -- so the
 * premise assertion held by accident. At the real 144 px it rounds to **3**, which is not below the
 * floor, and against 60 max hp there is no enemy with 100 hp in the game at all. **1 of 60** is the
 * honest case: `1/60 x 144 = 2.4`, rounds to 2, genuinely under the floor. It is also a state the
 * player actually reaches -- a scavenger one hit from death.
 */
const SCAV_MAX_HP = 60;

describe('the health bar is never empty above 0 hp (criterion 5.7, vault 6.4)', () => {
  it('draws a VISIBLE sliver at 1 of 60, where the raw ratio would round to nothing', () => {
    const raw = Math.round((1 / SCAV_MAX_HP) * SLOT);
    expect(raw).toBeLessThan(BAR_MIN_FILL_PX); // the defect this exists to prevent, pinned

    const fill = healthBarFillWidth(1, SCAV_MAX_HP, SLOT);
    expect(fill).toBeGreaterThanOrEqual(BAR_MIN_FILL_PX);
    expect(fillIsHonest(fill, SLOT, 1)).toBe(true);
  });

  /**
   * The 2/60 case the user is asked to eyeball for criterion 5.8, asserted here so the screenshot
   * and the arithmetic are talking about the same thing. It is ABOVE the floor on raw arithmetic
   * (2/60 x 144 = 4.8 -> 5), which is worth pinning: session 9's report of a "small red sliver" at
   * this hp was 5.7 WORKING, not a defect, and this is the line that says so.
   */
  it('2 of 60 clears the floor on raw arithmetic alone — the 5.8 screenshot case', () => {
    expect(Math.round((2 / SCAV_MAX_HP) * SLOT)).toBeGreaterThanOrEqual(BAR_MIN_FILL_PX);
    expect(healthBarFillWidth(2, SCAV_MAX_HP, SLOT)).toBeGreaterThan(
      healthBarFillWidth(1, SCAV_MAX_HP, SLOT),
    );
  });

  it('draws nothing at exactly 0, and the predicate agrees', () => {
    expect(healthBarFillWidth(0, SCAV_MAX_HP, SLOT)).toBe(0);
    expect(fillIsHonest(0, SLOT, 0)).toBe(true);
    // A bar still showing a sliver on a dead enemy is the mirror-image lie.
    expect(fillIsHonest(BAR_MIN_FILL_PX, SLOT, 0)).toBe(false);
  });

  it('fills the whole slot at full hp, and never overflows it', () => {
    expect(healthBarFillWidth(SCAV_MAX_HP, SCAV_MAX_HP, SLOT)).toBe(SLOT);
    expect(healthBarFillWidth(SCAV_MAX_HP * 2, SCAV_MAX_HP, SLOT)).toBe(SLOT);
    expect(fillIsHonest(SLOT + 1, SLOT, SCAV_MAX_HP)).toBe(false);
  });

  it('stays monotone across every hp value, and the ends differ', () => {
    let previous = -1;
    for (let hp = 1; hp <= SCAV_MAX_HP; hp += 1) {
      const fill = healthBarFillWidth(hp, SCAV_MAX_HP, SLOT);
      expect(fill, `hp ${hp}`).toBeGreaterThanOrEqual(previous);
      previous = fill;
    }
    expect(healthBarFillWidth(1, SCAV_MAX_HP, SLOT)).toBeLessThan(
      healthBarFillWidth(SCAV_MAX_HP, SCAV_MAX_HP, SLOT),
    );
  });

  /**
   * **The assertion that actually distinguishes the implementation.**
   *
   * The monotonicity test above does NOT: a plain `Math.max(MIN, ratio × slotW)` floor is also
   * non-decreasing and also has differing ends, so it passes everything above while flattening the
   * bottom of the range — 1 hp and 2 hp draw identically, and the bar stops meaning anything in
   * exactly the region where the player most needs it to. Compressing `(0, max]` onto
   * `[MIN, slotW]` keeps the low end readable, and this is the test that says so.
   */
  it('does not flatten the low end — 1 hp and 2 hp are distinguishable', () => {
    expect(healthBarFillWidth(1, SCAV_MAX_HP, SLOT)).toBeLessThan(
      healthBarFillWidth(2, SCAV_MAX_HP, SLOT),
    );
  });

  /**
   * 🔴 **The mutation-catching half, and it needs a geometry the shipped one is not.**
   *
   * Correcting `SLOT` from the fictional 120 to the real 144 exposed something the fiction had been
   * hiding: **at 144 px against 60 max hp, the naive `Math.max` floor and the compression behave
   * almost identically.** The floor only bites at 1 hp (`1/60 × 144` = 2.4), so no two ADJACENT hp
   * values are flattened onto each other, and the test above — the one written specifically to
   * distinguish the two implementations — passes against the naive floor. Verified by mutation, not
   * by reading: swapping `healthBarFillWidth`'s body for `Math.max(MIN, round(ratio × slotW))` left
   * all 17 assertions green.
   *
   * That is vault 9.4's shape (a check that is cheap because it is not really being done), and the
   * fix is not to invent a contrived assertion about the shipped numbers. `healthBarFillWidth` is a
   * pure function of three arguments, so it can be exercised where the difference actually lives.
   *
   * Two enemies each need to round below the floor for flattening to be observable, i.e.
   * `2 × slotW / maxHp < 2.5`. The geometry below is the one this file was ORIGINALLY written
   * against — 120 px and 100 max hp — which is a fair choice: it is the case the compression was
   * designed for, and the shipped geometry has simply drifted away from needing it.
   *
   * | | 1 hp | 2 hp | 3 hp |
   * |---|---|---|---|
   * | compression | 4 | 5 | 7 |
   * | naive floor | **3** | **3** | 4 |
   *
   * Keep BOTH blocks. The shipped one proves the criterion holds where the game actually runs; this
   * one proves the implementation is the right one and can still go red.
   */
  describe('the compression is a real mapping, not a floor — proved where the two differ', () => {
    const DENSE_SLOT = 120;
    const DENSE_MAX_HP = 100;

    it('the premise: two adjacent living hp values BOTH round below the floor here', () => {
      // Without this the block below is vacuous — it would be asserting a difference between two
      // implementations in a regime where the naive one never clips.
      expect(Math.round((1 / DENSE_MAX_HP) * DENSE_SLOT)).toBeLessThan(BAR_MIN_FILL_PX);
      expect(Math.round((2 / DENSE_MAX_HP) * DENSE_SLOT)).toBeLessThan(BAR_MIN_FILL_PX);
    });

    it('1 hp and 2 hp stay distinguishable where a floor would flatten them together', () => {
      expect(healthBarFillWidth(1, DENSE_MAX_HP, DENSE_SLOT)).toBeLessThan(
        healthBarFillWidth(2, DENSE_MAX_HP, DENSE_SLOT),
      );
    });

    it('every living hp step is strictly increasing across the flattened region', () => {
      // Three consecutive values, all inside the region the floor clips. A floor collapses the
      // first two; nothing else in this file would notice.
      const fills = [1, 2, 3].map((hp) => healthBarFillWidth(hp, DENSE_MAX_HP, DENSE_SLOT));
      expect(fills[0]!).toBeLessThan(fills[1]!);
      expect(fills[1]!).toBeLessThan(fills[2]!);
      expect(fills[0]!).toBeGreaterThanOrEqual(BAR_MIN_FILL_PX);
    });
  });

  it('the predicate rejects an empty bar on a living enemy — the criterion, stated directly', () => {
    expect(fillIsHonest(0, SLOT, 2)).toBe(false);
    expect(fillIsHonest(1, SLOT, 2)).toBe(false);
  });
});

describe('the health bar sits above the enemy it belongs to', () => {
  it('is centred on the body and clear of its head', () => {
    const scavenger = createScavenger({ x: 500, y: 900, patrolMin: 400, patrolMax: 600 });
    scavenger.hp = 30;
    const desc = healthBarDesc(scavenger, 'rust-scavenger', 6);

    expect(desc.x + desc.w / 2).toBeCloseTo(scavenger.x, 6);
    // Above the feet by at least the body's own height, or it draws across the sprite's chest.
    expect(desc.y).toBeLessThan(scavenger.y - 40 * 6);
    expect(desc.fillW).toBe(healthBarFillWidth(30, scavenger.maxHp, desc.w));
  });
});
