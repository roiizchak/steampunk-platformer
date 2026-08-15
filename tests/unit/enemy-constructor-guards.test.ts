/**
 * The CONSTRUCTOR guards — the configurations `createSentry` and `createScavenger` refuse outright.
 *
 * Split from `enemy-tuning.test.ts` on 2026-08-15, which sat one line over the 400-line rule after
 * the QA gate's new coverage. The seam is a real concern boundary rather than a cut at a line count:
 * `enemy-tuning.test.ts` asks whether a LIVE knob moves the simulation, and this asks which
 * configurations may never be constructed at all. Both are criterion 5.9's, from opposite ends.
 *
 * Every guard here follows vault 2.11: a required argument throws rather than silently substituting,
 * because the substitution is what makes the resulting bug invisible.
 */

import { describe, expect, it } from 'vitest';

import { SENTRY_FIRE_TICKS, sentryAnim } from '../../src/render/enemyView';
import { createSnapshot } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';
import type { World } from '../../src/sim/types';
import {
  SCAVENGER,
  SCAVENGER_ATTACK_TICKS,
  SENTRY,
  createScavenger,
  createSentry,
} from '../../src/sim/enemies';

/** One sentry on flat ground — enough to drive a cooldown to saturation through the real tick. */
function freshWorld(): World {
  return createWorld({
    seed: 1,
    scale: 6,
    solids: [{ x: 0, y: 960, w: 9000, h: 120 }],
    bounds: { widthPx: 9000, heightPx: 1080 },
    spawn: { x: 2800, y: 960 },
    enemies: [{ slug: 'brass-sentry', x: 3200, y: 960, patrolMin: 3190, patrolMax: 3210 }],
  });
}

/** A minimal legal scavenger, so each guard test varies exactly one argument. */
const BASE = { x: 0, y: 0, patrolMin: -100, patrolMax: 100 };

describe('createSentry refuses a cooldown that would jam its own animation', () => {
  it('throws at exactly SENTRY_FIRE_TICKS, the largest jamming value', () => {
    expect(() => createSentry({ x: 0, y: 0, cooldown: SENTRY_FIRE_TICKS })).toThrow(
      /cooldown must be an integer tick count greater than/,
    );
  });

  it('throws below it too, and names the offending value', () => {
    expect(() => createSentry({ x: 0, y: 0, cooldown: 1 })).toThrow(/got 1/);
  });

  /**
   * The other direction. A guard that rejected everything would satisfy the two above and make the
   * sentry unconstructible — so the smallest LEGAL value must be accepted, and it must be exactly
   * one tick above the window.
   */
  it('accepts the smallest cooldown that lets the episode close', () => {
    const sentry = createSentry({ x: 0, y: 0, cooldown: SENTRY_FIRE_TICKS + 1 });
    expect(sentry.cooldown).toBe(SENTRY_FIRE_TICKS + 1);
  });

  it('still accepts the shipped default with no cooldown given at all', () => {
    expect(createSentry({ x: 0, y: 0 }).cooldown).toBe(SENTRY.cooldown);
  });

  /**
   * A fractional cooldown is rejected for the project's flat rule — every duration is an INTEGER
   * count of 60 Hz ticks — and because `windowOpen` would compare against a float boundary.
   */
  it('refuses a fractional tick count', () => {
    expect(() => createSentry({ x: 0, y: 0, cooldown: 90.5 })).toThrow(/integer tick count/);
  });

  /**
   * 🔴 The one that proves the guard is worth having: at the smallest accepted value the episode
   * really does open AND close, driven through the real `tick`. Without this the guard could be off
   * by one and every assertion above would still pass.
   */
  it('and at that smallest accepted value the episode opens AND closes', () => {
    const world = freshWorld();
    const sentry = world.enemies.sentries[0]!;
    sentry.cooldown = SENTRY_FIRE_TICKS + 1;
    sentry.cooldownCounter = sentry.cooldown;
    world.player.x = sentry.x;
    world.player.y = sentry.y;

    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      tick(world, createSnapshot());
      seen.add(sentryAnim(sentry));
    }
    expect([...seen].sort()).toEqual(['fire', 'idle']);
  });
});

/**
 * `createScavenger` refuses a cooldown that would jam its own swing — the same guard, for the same
 * reason, as `createSentry`'s (D7).
 *
 * A cooldown inside `SCAVENGER_ATTACK_TICKS` means `attackInProgress` never goes false: the body
 * stops moving forever and the sprite shows `attack` on every tick. That is an unrepresentable state
 * reachable through an ordinary-looking argument, which is what vault 2.11's required-args-throw
 * exists to prevent.
 */
describe('createScavenger refuses a cooldown that would jam its own swing', () => {
  it('throws on a cooldown equal to the swing length — the boundary, not merely below it', () => {
    expect(() => createScavenger({ ...BASE, attackCooldown: SCAVENGER_ATTACK_TICKS })).toThrow(
      /attackCooldown/,
    );
  });

  it('throws below it', () => {
    expect(() => createScavenger({ ...BASE, attackCooldown: 1 })).toThrow(/attackCooldown/);
  });

  it('accepts the smallest cooldown that leaves one recovered tick', () => {
    expect(() =>
      createScavenger({ ...BASE, attackCooldown: SCAVENGER_ATTACK_TICKS + 1 }),
    ).not.toThrow();
  });

  it('refuses a non-integer — every duration is an integer count of ticks', () => {
    expect(() => createScavenger({ ...BASE, attackCooldown: 72.5 })).toThrow(/attackCooldown/);
  });

  /** Non-vacuity: the shipped default must itself satisfy the rule it enforces. */
  it('the shipped default is legal, or the guard would reject the game', () => {
    expect(SCAVENGER.attackCooldown).toBeGreaterThan(SCAVENGER_ATTACK_TICKS);
    expect(() => createScavenger({ ...BASE })).not.toThrow();
  });
});
