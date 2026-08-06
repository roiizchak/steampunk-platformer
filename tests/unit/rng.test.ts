/**
 * Seeded RNG — vault 2.3 (blocker).
 *
 * "Seed your own RNG, sample once per tick inside the fixed loop, and gate every roll on
 * `chance > 0` — a zero-probability roll still advances the shared stream."
 *
 * All three clauses are tested here, and the second one is why this file is not just a test of
 * `nextU32`. **Codex plan review F7b**: a suite that only exercises the standalone helpers passes
 * with complete confidence while `tick()` contains no sampling step at all — which is exactly the
 * state the plan was in when Codex read it. So the load-bearing assertion is against `advance()`,
 * not against the helpers.
 *
 * Every test below is a GUARD (green -> green) except `advances the stream exactly once per tick`
 * and `a zero-chance roll does not touch the stream`, which are REPRODUCTIONS (red -> green) of
 * plan-review findings F3 and F7b respectively. *(vault C3)*
 */

import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextU32, rollChance } from '../../src/sim/rng';
import { advance, createWorld } from '../../src/sim/tick';
import { createSnapshot } from '../../src/sim/input';

describe('xorshift32 (vault 2.3)', () => {
  it('is deterministic: the same seed replays the same stream', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const fromA = [nextU32(a), nextU32(a), nextU32(a)];
    const fromB = [nextU32(b), nextU32(b), nextU32(b)];

    expect(typeof fromA[0]).toBe('number');
    expect(fromA).toEqual(fromB);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(nextU32(a)).not.toBe(nextU32(b));
  });

  it('rejects seed 0 — xorshift32 is absorbing at zero and would return 0 forever', () => {
    expect(() => createRng(0)).toThrow(/seed/i);
  });

  it('nextFloat stays in [0, 1) across a long run', () => {
    const rng = createRng(99);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 5000; i += 1) {
      const v = nextFloat(rng);
      expect(typeof v).toBe('number');
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    // A floor AND a ceiling (vault 2.8): a generator stuck at a constant passes a bounds-only
    // check, so also require the run to have actually spread out.
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
  });
});

describe('the stream advances once per tick, inside the fixed loop (vault 2.3)', () => {
  it('advances the stream exactly once per tick — not zero times, not per render frame', () => {
    const world = createWorld({ seed: 4242, scale: 1 });
    const reference = createRng(4242);

    const TICKS = 37;
    advance(world, createSnapshot(), TICKS);

    for (let i = 0; i < TICKS; i += 1) {
      nextU32(reference);
    }

    expect(typeof world.rng.s).toBe('number');
    // Exactly N: a floor alone would pass an implementation that rolls several times per tick,
    // and a ceiling alone would pass one that never rolls (vault 2.8).
    expect(world.rng.s).toBe(reference.s);
    expect(world.tickCount).toBe(TICKS);
  });

  it('exposes this tick sample on the world, so consumers read it instead of pulling', () => {
    const world = createWorld({ seed: 7, scale: 1 });
    advance(world, createSnapshot(), 1);

    expect(typeof world.tickRoll).toBe('number');
    expect(world.tickRoll).toBeGreaterThanOrEqual(0);
    expect(world.tickRoll).toBeLessThan(1);
  });
});

describe('every roll is gated on chance > 0 (vault 2.3)', () => {
  it('a zero-chance roll returns false AND does not touch the stream', () => {
    const world = createWorld({ seed: 555, scale: 1 });
    advance(world, createSnapshot(), 1);

    const before = world.rng.s;
    const rolled = world.tickRoll;

    expect(rollChance(world, 0)).toBe(false);
    expect(rollChance(world, -1)).toBe(false);

    // The whole point of the vault item: a zero-probability roll must not perturb the shared
    // stream, or two runs that differ only in an impossible event desynchronise.
    expect(world.rng.s).toBe(before);
    expect(world.tickRoll).toBe(rolled);
  });

  it('a certain roll returns true, and rolls read the tick sample rather than advancing', () => {
    const world = createWorld({ seed: 556, scale: 1 });
    advance(world, createSnapshot(), 1);
    const before = world.rng.s;

    expect(rollChance(world, 1)).toBe(true);
    rollChance(world, 0.5);
    rollChance(world, 0.5);

    expect(world.rng.s).toBe(before);
  });

  it('rolls are consistent within a tick and can change between ticks', () => {
    const world = createWorld({ seed: 31337, scale: 1 });
    const input = createSnapshot();

    advance(world, input, 1);
    const first = rollChance(world, 0.5);
    expect(rollChance(world, 0.5)).toBe(first);

    const seen = new Set<boolean>([first]);
    for (let i = 0; i < 200; i += 1) {
      advance(world, input, 1);
      seen.add(rollChance(world, 0.5));
    }
    // Over 200 ticks a fair coin must have produced both faces. A single-value result means the
    // sample is frozen, which a per-tick assertion alone cannot see.
    expect(seen.size).toBe(2);
  });
});
