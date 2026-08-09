/**
 * The combat timing contract.
 *
 * Every number here is an integer count of 60 Hz ticks, and **these are the numbers Phase 5's art
 * is generated against** — `fps = renderFrames * TICK_HZ / simTicks` *(vault 4.22)*. Criterion 5.4b
 * requires them frozen and recorded BEFORE any clip is shot, because authoring a flat frame rate is
 * how *"every light attack had 0.43 s of art over a 0.25 s move, so the strike was never drawn."*
 *
 * So this file is not only a test. It is the document the art derives from, and changing a number
 * in it is a balance change that invalidates a generated sheet.
 */

import { describe, expect, it } from 'vitest';

import {
  ATTACK,
  DEATH_TICKS,
  HURT_TICKS,
  IFRAME_TICKS,
  attackPhase,
  attackTotalTicks,
  hitWindowOpen,
} from '../../src/sim/combat';

describe('the timing table', () => {
  it('is expressed entirely in integer ticks — never a float of seconds', () => {
    const durations = [
      ATTACK.startup,
      ATTACK.active,
      ATTACK.recovery,
      HURT_TICKS,
      IFRAME_TICKS,
      DEATH_TICKS,
    ];
    for (const d of durations) {
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    }
  });

  /**
   * i-frames must outlast hitstun, or the player is actionable while still invulnerable-free and
   * can be chain-hit out of a single mistake with no counterplay. This is the one relationship
   * between two of these numbers that is a design rule rather than a taste value, so it is pinned.
   */
  it('i-frames outlast hitstun, so recovery is not a free second hit', () => {
    expect(IFRAME_TICKS).toBeGreaterThan(HURT_TICKS);
  });

  it('attack length is the sum of its three phases', () => {
    expect(attackTotalTicks(ATTACK)).toBe(ATTACK.startup + ATTACK.active + ATTACK.recovery);
  });
});

describe('attackPhase — which tick am I on', () => {
  /**
   * The phase boundaries, asserted at every tick of a whole swing rather than sampled.
   *
   * A sampled version passes while the boundary is off by one, and an off-by-one boundary is
   * exactly the defect 5.4c exists to catch on the art side. Cheap to assert exhaustively; the
   * swing is 20 ticks.
   */
  it('walks startup → active → recovery → done with no gaps or overlaps', () => {
    const seen: string[] = [];
    for (let counter = 0; counter < attackTotalTicks(ATTACK) + 3; counter += 1) {
      seen.push(attackPhase(counter, ATTACK));
    }

    const startup = seen.filter((p) => p === 'startup').length;
    const active = seen.filter((p) => p === 'active').length;
    const recovery = seen.filter((p) => p === 'recovery').length;

    expect(startup).toBe(ATTACK.startup);
    expect(active).toBe(ATTACK.active);
    expect(recovery).toBe(ATTACK.recovery);

    // Order, not just counts: a shuffled sequence with the right totals must not pass.
    expect(seen.indexOf('active')).toBe(ATTACK.startup);
    expect(seen.indexOf('recovery')).toBe(ATTACK.startup + ATTACK.active);
    expect(seen.indexOf('done')).toBe(attackTotalTicks(ATTACK));
  });
});

describe('hitWindowOpen — criterion 5.5', () => {
  /**
   * **BOTH ends of the active window, and both neighbours outside it.**
   *
   * "Does the attack register" was green in a prior project while the window semantics were wrong;
   * an existence assertion cannot verify a timing claim. So: the last startup tick must NOT
   * register, every active tick must, and the first recovery tick must not.
   */
  it('registers on every active tick and on no wind-up or recovery tick', () => {
    const registering: number[] = [];
    const silent: number[] = [];

    for (let counter = 0; counter < attackTotalTicks(ATTACK); counter += 1) {
      (hitWindowOpen(counter, ATTACK) ? registering : silent).push(counter);
    }

    const firstActive = ATTACK.startup;
    const lastActive = ATTACK.startup + ATTACK.active - 1;

    expect(registering).toEqual(
      Array.from({ length: ATTACK.active }, (_, i) => firstActive + i),
    );

    // The four ticks that matter, named rather than implied by the array above.
    expect(hitWindowOpen(firstActive - 1, ATTACK)).toBe(false); // last wind-up tick
    expect(hitWindowOpen(firstActive, ATTACK)).toBe(true); // first active tick
    expect(hitWindowOpen(lastActive, ATTACK)).toBe(true); // last active tick
    expect(hitWindowOpen(lastActive + 1, ATTACK)).toBe(false); // first recovery tick

    expect(silent.length).toBe(ATTACK.startup + ATTACK.recovery);
  });

  /** A counter past the whole swing is not a second hit. */
  it('does not reopen after the swing ends', () => {
    for (let counter = attackTotalTicks(ATTACK); counter < attackTotalTicks(ATTACK) * 3; counter += 1) {
      expect(hitWindowOpen(counter, ATTACK)).toBe(false);
    }
  });
});
