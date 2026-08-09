/**
 * Enemy render decisions — criteria 5.7 and 5.4, decided in engine-free code *(vault 2.12)*.
 *
 * ## The health bar rule, and why it is a shared predicate
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
 */

import { describe, expect, it } from 'vitest';

import {
  BAR_MIN_FILL_PX,
  fillIsHonest,
  healthBarDesc,
  healthBarFillWidth,
} from '../../src/render/enemyHealthBar';
import { enemyAnimTimings } from '../../src/render/animTiming';
import { SENTRY_FIRE_TICKS, enemyAnimKeys, scavengerAnim, sentryAnim } from '../../src/render/enemyView';
import { createScavenger, createSentry } from '../../src/sim/enemies';

const SLOT = 120;

describe('the health bar is never empty above 0 hp (criterion 5.7, vault 6.4)', () => {
  it('draws a VISIBLE sliver at 2 of 100, where the raw ratio would round to nothing', () => {
    const raw = Math.round((2 / 100) * SLOT);
    expect(raw).toBeLessThan(BAR_MIN_FILL_PX); // the defect this exists to prevent, pinned

    const fill = healthBarFillWidth(2, 100, SLOT);
    expect(fill).toBeGreaterThanOrEqual(BAR_MIN_FILL_PX);
    expect(fillIsHonest(fill, SLOT, 2)).toBe(true);
  });

  it('draws nothing at exactly 0, and the predicate agrees', () => {
    expect(healthBarFillWidth(0, 100, SLOT)).toBe(0);
    expect(fillIsHonest(0, SLOT, 0)).toBe(true);
    // A bar still showing a sliver on a dead enemy is the mirror-image lie.
    expect(fillIsHonest(BAR_MIN_FILL_PX, SLOT, 0)).toBe(false);
  });

  it('fills the whole slot at full hp, and never overflows it', () => {
    expect(healthBarFillWidth(100, 100, SLOT)).toBe(SLOT);
    expect(healthBarFillWidth(200, 100, SLOT)).toBe(SLOT);
    expect(fillIsHonest(SLOT + 1, SLOT, 100)).toBe(false);
  });

  it('stays monotone across every hp value, and the ends differ', () => {
    let previous = -1;
    for (let hp = 1; hp <= 100; hp += 1) {
      const fill = healthBarFillWidth(hp, 100, SLOT);
      expect(fill, `hp ${hp}`).toBeGreaterThanOrEqual(previous);
      previous = fill;
    }
    expect(healthBarFillWidth(1, 100, SLOT)).toBeLessThan(healthBarFillWidth(100, 100, SLOT));
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
    expect(healthBarFillWidth(1, 100, SLOT)).toBeLessThan(healthBarFillWidth(2, 100, SLOT));
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

describe('enemy animation keys come from sim state (criterion 5.4, guard G2)', () => {
  it('the sentry plays fire only inside the window after a shot, then returns to idle', () => {
    const sentry = createSentry({ x: 0, y: 0 });
    sentry.cooldownCounter = 0; // just fired
    expect(sentryAnim(sentry)).toBe('fire');

    sentry.cooldownCounter = SENTRY_FIRE_TICKS - 1;
    expect(sentryAnim(sentry)).toBe('fire');

    sentry.cooldownCounter = SENTRY_FIRE_TICKS;
    expect(sentryAnim(sentry)).toBe('idle');

    sentry.hp = 0;
    expect(sentryAnim(sentry)).toBe('death');
  });

  it('the scavenger walks while patrolling and chases while committed', () => {
    const scavenger = createScavenger({ x: 0, y: 0, patrolMin: -100, patrolMax: 100 });
    expect(scavengerAnim(scavenger)).toBe('walk');

    scavenger.chasing = true;
    expect(scavengerAnim(scavenger)).toBe('chase');

    scavenger.hp = 0;
    expect(scavengerAnim(scavenger)).toBe('death');
  });

  /**
   * Death outranks everything. A corpse still playing `chase` is the frame-0 bug's cousin: the
   * animation and the state disagree, and only one of them is on screen.
   */
  it('death wins over every other state', () => {
    const scavenger = createScavenger({ x: 0, y: 0, patrolMin: -100, patrolMax: 100 });
    scavenger.chasing = true;
    scavenger.hp = 0;
    expect(scavengerAnim(scavenger)).toBe('death');
  });

  it('every key a subject can ask for is declared, so the scene registers exactly what it plays', () => {
    const keys = enemyAnimKeys();
    expect(keys).toContain('brass-sentry-fire');
    expect(keys).toContain('rust-scavenger-chase');
    // No duplicates — a repeated key means two subjects fighting over one animation.
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * Guard **G2** extended to the enemies — criterion 5.4d, before a single enemy sheet exists.
 *
 * Codex C4 on 5.4d: *"reacting to a changed input proves the algebra runs, not that it is right."*
 * So both halves are here — a hand-computed expected value, AND the non-vacuity check that a
 * different `simTicks` yields a different fps.
 */
describe('enemy frame rates are derived, never authored (5.4d, guard G2)', () => {
  const strides = { walk: 60, chase: 96 };

  it('matches a fps computed by hand from the sim durations', () => {
    const rows = enemyAnimTimings('brass-sentry', { idle: 6, fire: 4, death: 9 }, strides);
    const fire = rows.find((row) => row.name === 'fire')!;

    // 4 frames over SENTRY_FIRE_TICKS ticks at 60 Hz. Written out rather than recomputed with the
    // production formula, which would agree with itself whatever it did (vault C2).
    expect(fire.simTicks).toBe(SENTRY_FIRE_TICKS);
    expect(fire.fps).toBeCloseTo((4 * 60) / 18, 9);
    expect(fire.derivedFrom).toBe('sim');
  });

  it('divides the chase stride by chase speed, not by patrol speed', () => {
    const rows = enemyAnimTimings('rust-scavenger', { walk: 8, chase: 8, death: 9 }, strides);
    const walk = rows.find((row) => row.name === 'walk')!;
    const chase = rows.find((row) => row.name === 'chase')!;

    // Same frame count, different speeds — so a chase cycle MUST be shorter in ticks and faster in
    // fps. Reusing walk's number is exactly how a sprint ends up flip-booking at walking pace.
    expect(chase.simTicks).toBeLessThan(walk.simTicks);
    expect(chase.fps).toBeGreaterThan(walk.fps);
  });

  it('a different simTicks yields a different fps — the derivation is not decorative', () => {
    const base = enemyAnimTimings('rust-scavenger', { walk: 8, chase: 8, death: 9 }, strides);
    const doubled = enemyAnimTimings('rust-scavenger', { walk: 8, chase: 8, death: 9 }, { walk: 120, chase: 96 });

    const before = base.find((row) => row.name === 'walk')!.fps;
    const after = doubled.find((row) => row.name === 'walk')!.fps;
    expect(after).not.toBe(before);
  });

  it('refuses to invent a frame count for a sheet that has not been built', () => {
    expect(() => enemyAnimTimings('brass-sentry', { idle: 6, fire: 4 }, strides)).toThrow(/death/);
  });
});
