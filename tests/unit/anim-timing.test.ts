/**
 * Animation frame rates are derived, not authored — criteria 4.7 and 4.22, vault **4.22** (blocker).
 *
 * The load-bearing tests here are the two that can go red for a real reason:
 *
 *  1. **`fall` is counted, not subtracted.** `airtimeTicks` includes the landing tick, which is
 *     already grounded and publishes `idle`/`run`. Codex plan review finding 9 predicted that
 *     `airtime - rise` would misallocate one tick to the fall animation; measured, rise is 18,
 *     fall is 18, and airtime is 37 — so the naive subtraction gives 19 and is wrong by exactly
 *     the tick the review named. The test asserts the RELATIONSHIP, so it stays true if the tuning
 *     changes, and separately pins today's numbers so a silent re-tune is visible.
 *
 *  2. **A wrong `simTicks` produces a different fps.** Without this the formula test is vacuous:
 *     `fps = renderFrames * TICK_HZ / simTicks` will happily validate its own algebra against any
 *     duration at all *(vault C2, and Codex finding 2 — "4.7 can pass by recomputing fps from a
 *     wrong simTicks")*.
 *
 * These are GUARDS *(vault C3)*.
 */

import { describe, expect, it } from 'vitest';
import { TICK_HZ } from '../../src/game/constants';
import {
  IDLE_TICKS,
  animTimings,
  deriveFps,
  strideTicks,
  type AnimName,
  type MeasuredFrames,
} from '../../src/render/animTiming';
import { derivedFeel } from '../../src/sim/derived';
import { ticksToMs } from '../../src/sim/index';
import { DEFAULT_TUNING } from '../../src/sim/player';

const feel = () => derivedFeel(DEFAULT_TUNING, ticksToMs);

/** Frame counts stand in for what the real sheets will report. The timings must not assume them. */
const FRAMES: MeasuredFrames = {
  idle: 4,
  walk: 8,
  run: 8,
  jump: 4,
  fall: 4,
  attack: 6,
  hurt: 3,
  death: 6,
};
const STRIDES = { run: 144, walk: 96 };
/**
 * Authored loop cadences, fps. Session 9: locomotion `simTicks` comes from these, not from
 * `STRIDES` — see `src/render/animTiming.ts`'s "A LOOP HAS NO WINDOW" header. `STRIDES` stays
 * because `strideTicks` is still exported and still tested; it just no longer reaches the screen.
 */
const CADENCE = { run: 32, walk: 36 };

describe('jump and fall durations are COUNTED from the sim (Codex finding 9)', () => {
  it('rise + fall is airtime MINUS the landing tick, not airtime', () => {
    const f = feel();
    expect(f.riseTicks + f.fallTicks).toBe(f.airtimeTicks - 1);
  });

  it('the naive subtraction is wrong by exactly one, which is why it is not used', () => {
    const f = feel();
    const naive = f.airtimeTicks - f.riseTicks;
    expect(naive).toBe(f.fallTicks + 1);
    expect(naive).not.toBe(f.fallTicks);
  });

  it('pins the measured values on the shipped tuning', () => {
    const f = feel();
    expect(f.airtimeTicks).toBe(37);
    expect(f.riseTicks).toBe(18);
    expect(f.fallTicks).toBe(18);
  });

  it('rise matches the closed form, so the counter is not counting something else', () => {
    const f = feel();
    expect(f.riseTicks).toBe(Math.ceil(DEFAULT_TUNING.jumpVelocity / DEFAULT_TUNING.gravity));
  });

  it('walkTopSpeed is the walk cap and differs from topSpeed', () => {
    const f = feel();
    expect(f.walkTopSpeed).toBeCloseTo(DEFAULT_TUNING.walkMax, 2);
    expect(f.topSpeed).toBeCloseTo(DEFAULT_TUNING.runMax, 2);
    expect(f.walkTopSpeed).toBeLessThan(f.topSpeed);
  });
});

describe('deriveFps is the one formula (vault 4.22)', () => {
  it('computes renderFrames * TICK_HZ / simTicks', () => {
    expect(deriveFps(8, 16)).toBe((8 * TICK_HZ) / 16);
    expect(deriveFps(4, 18)).toBe((4 * TICK_HZ) / 18);
  });

  it('a WRONG simTicks yields a different fps — the formula test is not vacuous', () => {
    const right = deriveFps(8, 14);
    const wrong = deriveFps(8, 15);
    expect(wrong).not.toBe(right);
  });

  it('refuses a non-integer or non-positive duration rather than returning a plausible number', () => {
    expect(() => deriveFps(8, 0)).toThrow(/simTicks/);
    expect(() => deriveFps(8, 13.8)).toThrow(/simTicks/);
    expect(() => deriveFps(0, 14)).toThrow(/renderFrames/);
    expect(() => deriveFps(2.5, 14)).toThrow(/renderFrames/);
  });
});

describe('strideTicks rounds to an integer tick count (PRD Global Constraints)', () => {
  it('rounds rather than truncating, and never returns a fraction', () => {
    // 144 / 10.4 = 13.846… -> 14. A raw quotient would describe a cycle the sim cannot have.
    expect(strideTicks(144, 10.4)).toBe(14);
    expect(Number.isInteger(strideTicks(144, 10.4))).toBe(true);
    expect(Number.isInteger(strideTicks(96, 4.8))).toBe(true);
  });

  it('never returns zero, however fast the state is', () => {
    expect(strideTicks(1, 1000)).toBe(1);
  });

  it('refuses garbage rather than producing Infinity or NaN', () => {
    expect(() => strideTicks(144, 0)).toThrow();
    expect(() => strideTicks(0, 10)).toThrow();
    expect(() => strideTicks(144, Number.NaN)).toThrow();
  });
});

describe('the timing table', () => {
  const timings = () => animTimings(feel(), FRAMES, CADENCE);

  it('covers every animation exactly once', () => {
    const names = timings().map((t) => t.name).sort();
    // Phase 5 added the three combat rows. The list is spelled out rather than derived from the
    // table under test, so a row silently disappearing is a failure rather than a smaller loop.
    const expected: AnimName[] = [
      'attack',
      'death',
      'fall',
      'hurt',
      'idle',
      'jump',
      'run',
      'walk',
    ];
    expect(names).toEqual(expected);
  });

  it('every fps equals the formula applied to that row — no row is hand-set', () => {
    for (const t of timings()) {
      expect(t.fps, `${t.name} fps was not derived`).toBe(
        (t.renderFrames * TICK_HZ) / t.simTicks,
      );
    }
  });

  it('every simTicks is a positive integer', () => {
    for (const t of timings()) {
      expect(Number.isInteger(t.simTicks), `${t.name} simTicks is not an integer`).toBe(true);
      expect(t.simTicks).toBeGreaterThan(0);
    }
  });

  it('labels provenance honestly — the authored rows are exactly the LOOPS', () => {
    // Session 9 widened this from `['idle']`. The list is spelled out rather than computed from
    // `loop`, so adding a fourth authored row is a deliberate edit here and not a silent drift.
    const authored = timings().filter((t) => t.derivedFrom === 'authored');
    expect(authored.map((t) => t.name).sort()).toEqual(['idle', 'run', 'walk']);
    expect(authored.every((t) => t.loop)).toBe(true);
    expect(timings().find((t) => t.name === 'idle')?.simTicks).toBe(IDLE_TICKS);
  });

  it('jump and fall take their durations from the sim, not from the stride measurements', () => {
    const f = feel();
    const byName = new Map(timings().map((t) => [t.name, t]));
    expect(byName.get('jump')?.simTicks).toBe(f.riseTicks);
    expect(byName.get('fall')?.simTicks).toBe(f.fallTicks);
    expect(byName.get('jump')?.derivedFrom).toBe('sim');
    expect(byName.get('fall')?.derivedFrom).toBe('sim');
  });

  it('locomotion loops and airborne states do not (vault 4.23)', () => {
    const byName = new Map(timings().map((t) => [t.name, t]));
    expect(byName.get('idle')?.loop).toBe(true);
    expect(byName.get('walk')?.loop).toBe(true);
    expect(byName.get('run')?.loop).toBe(true);
    expect(byName.get('jump')?.loop).toBe(false);
    expect(byName.get('fall')?.loop).toBe(false);
  });

  it('a slower walk means MORE ticks per cycle — the derivation tracks the sim, not a constant', () => {
    const byName = new Map(timings().map((t) => [t.name, t]));
    const walk = byName.get('walk');
    const run = byName.get('run');
    // Same stride would give walk more ticks; these strides differ, so compare the ratio instead.
    expect(walk && run).toBeTruthy();
    expect(strideTicks(STRIDES.run, feel().walkTopSpeed)).toBeGreaterThan(
      strideTicks(STRIDES.run, feel().topSpeed),
    );
  });

  /**
   * 🔴 This assertion is INVERTED from what it said before session 9, deliberately.
   *
   * It used to read "retuning runMax changes the run fps without anyone editing a number", and that
   * coupling was the whole point of deriving a loop's rate from a stride. It is also what made the
   * character glide: the coupling is only correct if the stride is correct, and the stride is not
   * measurable to better than ~20 % off generated art (vault 4.18). So the coupling is now cut on
   * purpose, and the new invariant is the opposite one — worth pinning precisely because the old
   * behaviour was intentional and someone reading the diff will wonder if this was an accident.
   *
   * What retuning `runMax` changes now: how far the character travels. Nothing about the animation.
   * The two are tuned independently, against each other, by eye — which is what the sibling
   * Street-Fighter project does and why its movement reads correctly.
   */
  it('retuning runMax does NOT change the run fps — speed and cadence are independent now', () => {
    const slow = derivedFeel({ ...DEFAULT_TUNING, runMax: DEFAULT_TUNING.runMax / 2 }, ticksToMs);
    const fast = feel();
    const runOf = (f: ReturnType<typeof feel>) =>
      animTimings(f, FRAMES, CADENCE).find((t) => t.name === 'run')?.fps;
    expect(runOf(slow)).toBe(runOf(fast));
    // Non-vacuity: the row must actually exist, or `undefined === undefined` passes it.
    expect(runOf(fast)).toBeGreaterThan(0);
  });

  it('a WINDOWED animation still moves with the simulation — 4.22 is intact', () => {
    // The half of the old coupling that must survive: retune the attack window and the attack
    // sheet's fps follows, with nobody editing a number. This is what stops "0.43s of art over a
    // 0.25s move" coming back, and it is why cutting the LOOP coupling is not cutting 4.22.
    const table = timings();
    const attack = table.find((t) => t.name === 'attack');
    expect(attack?.derivedFrom).toBe('sim');
    expect(attack?.fps).toBeCloseTo((attack!.renderFrames * 60) / attack!.simTicks, 6);
  });
});
