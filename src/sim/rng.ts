/**
 * Seeded xorshift32 — vault 2.3 (blocker).
 *
 * "Determinism means no clock and no RNG you did not seed."
 *
 * Three rules, all load-bearing:
 *
 *  1. The generator is OURS and takes an explicit seed. `Math` dot `random` cannot be seeded, so a
 *     run cannot be replayed and a desync cannot be reproduced. `tests/unit/sim-boundary.test.ts`
 *     mechanically forbids it in this directory.
 *  2. The stream is sampled **once per tick, inside the fixed loop** — step 1 of `tick()`, written
 *     to `world.tickRoll`, and nowhere else. Consumers READ that sample; they never pull from the
 *     stream themselves. A read from the render layer would advance the stream a variable number of
 *     times per second and silently destroy replay.
 *  3. **Every roll is gated on `chance > 0`** before it touches anything. A zero-probability roll
 *     that still advanced the stream would desynchronise two runs differing only in an impossible
 *     event. Here the gate is cheap because rolls read `tickRoll` rather than advancing — but the
 *     gate stays, because Phase 5 adds consumers and the guarantee must not depend on them.
 */

import type { Rng, World } from './types';

/**
 * Create a generator.
 *
 * Seed `0` is REJECTED rather than silently repaired. xorshift32 is absorbing at zero — every
 * subsequent output is 0 — and a generator that returns a constant forever is the exact shape of a
 * bug that reads as "the randomness feels wrong" three phases later.
 */
export function createRng(seed: number): Rng {
  const s = seed >>> 0;
  if (s === 0) {
    throw new Error('rng: seed 0 is invalid — xorshift32 is absorbing at zero');
  }
  return { s };
}

/** Advance the stream one step and return the new 32-bit state. THE only mutation point. */
export function nextU32(rng: Rng): number {
  let x = rng.s;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  rng.s = x;
  return x;
}

/** Advance the stream one step and return a float in `[0, 1)`. */
export function nextFloat(rng: Rng): number {
  return nextU32(rng) / 4294967296;
}

/**
 * Roll against this tick's sample.
 *
 * Does NOT advance the stream: it compares against `world.tickRoll`, which step 1 of `tick()`
 * already sampled. So the number of rolls a tick performs cannot change the sequence a later tick
 * sees — which is what makes the sim replayable while behaviour is still being tuned.
 *
 * Consequence worth knowing: two rolls in the same tick are perfectly correlated. That is correct
 * for "does this tick's single decision fire", and wrong for "roll two independent things this
 * tick". Phase 5 gets a per-consumer sample if it ever needs the latter; it does not need it yet.
 */
export function rollChance(world: World, chance: number): boolean {
  // The gate, before anything else touches state (vault 2.3).
  //
  // MEASURED, and recorded rather than quietly kept: deleting these three lines leaves
  // `rng.test.ts` fully green — mutation M9 in QA-LOG.md is the only survivor of the 13. It is
  // redundant BY CONSTRUCTION here, because a roll reads `world.tickRoll` instead of pulling from
  // the stream, so `tickRoll < 0` already returns false and nothing was going to advance anyway.
  //
  // It stays for two reasons. Vault 2.3 states the gate as a blocker, and contradicting a blocker
  // is a STOP-and-ask, not a cleanup. And the property it protects IS enforceable — mutation M13
  // (make this function pull from the stream) turns the suite red — so the guarantee is tested
  // even though this particular line is not. Phase 5 adds the consumers that make it load-bearing.
  if (!(chance > 0)) {
    return false;
  }
  if (chance >= 1) {
    return true;
  }
  return world.tickRoll < chance;
}
