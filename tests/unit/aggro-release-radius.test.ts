import { describe, expect, it } from 'vitest';
import {
  SCAVENGER,
  attackInProgress,
  createScavenger,
  scavengerFooting,
  stepScavenger,
} from '../../src/sim/enemies';

/**
 * # A chase ends when the player gets far enough away (session inventory 2b.1)
 *
 * ## This REVERSES a recorded ruling, deliberately
 *
 * D4, 2026-08-14: *"it should keep coming until I kill it."* Aggro became permanent, and
 * `releaseRadius` and `CHASE_COMMIT_TICKS` were **deleted** rather than re-tuned — `enemies.ts`
 * argued, correctly, that *"a flag that cannot be un-set cannot flap, which is a stronger guarantee
 * than two thresholds: there is no gap to stand in the middle of."*
 *
 * What that argument did not weigh is what permanence looks like from the other side. A scavenger
 * that saw you once stares from **851 px** — nearly twice `detectRadius` — indefinitely, and never
 * patrols again. `docs/qa/session-bugfix-perf-gates-03-hands-on.md:60-74` found it by playing.
 * Reopened and reversed by the owner on 2026-08-23.
 *
 * ## So the flap risk is back, and it is this file's main job
 *
 * The old design's guarantee is genuinely lost: `chasing` can now be cleared by geometry, so it CAN
 * flap. Hysteresis is what replaces it, and hysteresis is only a guarantee if the gap is real — a
 * `releaseRadius` equal to `detectRadius` is a single threshold with two names and flaps on every
 * tick a player stands on it.
 *
 * Two things enforce it: `createScavenger` **throws** unless `releaseRadius > detectRadius` (vault
 * 2.11 — a required relationship refuses rather than silently substituting), and the flap test
 * below walks a player across the whole band and counts transitions.
 *
 * ⚠️ `enemy-ai-scavenger.test.ts`'s *"never gives up: a chase entered once survives the player
 * leaving the level"* asserted the old ruling and has been **inverted, not deleted**. Its
 * replacement asserts the same 1000-tick scenario with the opposite expectation, so the reversal is
 * visible in the diff rather than being a test that quietly stopped existing.
 */

const EVERYWHERE = scavengerFooting([{ x: -1e6, y: -1e6, w: 2e6, h: 2e6 }], 6);

/** A scavenger pinned to a point, so its own patrol cannot close the distance under the test. */
function pinned() {
  return createScavenger({ x: 500, y: 0, patrolMin: 500, patrolMax: 500 });
}

/** Acquire a chase, then confirm it — never assume the premise. */
function chasing() {
  const s = pinned();
  stepScavenger(s, { playerX: 500, playerY: 0 }, EVERYWHERE);
  expect(s.chasing, 'the scavenger never acquired, so nothing below tests a release').toBe(true);
  return s;
}

describe('the release radius (inventory 2b.1)', () => {
  it('has a real hysteresis gap — the whole guarantee rests on this', () => {
    expect(SCAVENGER.releaseRadius).toBeGreaterThan(SCAVENGER.detectRadius);
  });

  it('refuses a configuration with no gap, rather than silently flapping', () => {
    expect(() =>
      createScavenger({
        x: 0,
        y: 0,
        patrolMin: 0,
        patrolMax: 0,
        detectRadius: 480,
        releaseRadius: 480,
      }),
    ).toThrow(/releaseRadius/);
    expect(() =>
      createScavenger({
        x: 0,
        y: 0,
        patrolMin: 0,
        patrolMax: 0,
        detectRadius: 480,
        releaseRadius: 300,
      }),
    ).toThrow(/releaseRadius/);
  });

  it('gives up once the player is beyond the release radius', () => {
    const s = chasing();
    stepScavenger(s, { playerX: 500 + SCAVENGER.releaseRadius + 1, playerY: 0 }, EVERYWHERE);
    expect(s.chasing).toBe(false);
    // Released by the ONE exit, so it clears what death clears — `releaseAggro`, not an inline
    // `chasing = false` that would leave `chaseCounter` and a live swing behind.
    expect(s.chaseCounter).toBe(0);
    // ⚠️ NOT `attackCounter === 0`. `releaseAggro` parks it at `SCAVENGER_ATTACK_TICKS` to CLOSE an
    // in-flight swing rather than rewinding one — R5's fix, and its docstring says why. The
    // behaviour that matters is that no swing survives the release.
    expect(attackInProgress(s), 'a live swing survived the release — R5, by a new route').toBe(
      false,
    );
  });

  it('KEEPS chasing inside the band — 851 px is the reported symptom, and it is now released', () => {
    // The band: past `detectRadius`, short of `releaseRadius`. A scavenger here has committed and
    // must not give up, or the release is just a second, larger detection radius.
    const inBand = SCAVENGER.detectRadius + 1;
    expect(inBand).toBeLessThan(SCAVENGER.releaseRadius);

    const s = chasing();
    for (let i = 0; i < 600; i += 1) {
      stepScavenger(s, { playerX: 500 + inBand, playerY: 0 }, EVERYWHERE);
    }
    expect(s.chasing, 'gave up inside the hysteresis band — the gap is not doing its job').toBe(
      true,
    );

    // And the reported 851 px stare is gone. Measured from where the scavenger IS — it may have
    // closed ground during the 600 ticks above, and an absolute number would silently test a
    // different distance than the one it names.
    stepScavenger(s, { playerX: s.x + 851, playerY: 0 }, EVERYWHERE);
    expect(s.chasing, 'still staring from 851 px').toBe(false);
  });

  it('does not flap: a player walking out and back crosses each threshold once', () => {
    const s = pinned();
    const states: boolean[] = [];

    // ⚠️ The player must move FASTER than `chaseSpeed`, or this tests nothing: a chaser closes on a
    // slower runner and the distance never reaches `releaseRadius` at all. The first version of this
    // test walked the player out at 1 px/tick and recorded `chasing` true for every one of ~1500
    // samples — a flap test that could not observe a release, which is a gate that cannot go red.
    const STEP = Math.ceil(SCAVENGER.chaseSpeed) + 8;
    const OUT = SCAVENGER.releaseRadius + 400;

    for (let d = 0; d <= OUT; d += STEP) {
      stepScavenger(s, { playerX: s.x + d, playerY: 0 }, EVERYWHERE);
      states.push(s.chasing);
    }
    for (let d = OUT; d >= 0; d -= STEP) {
      stepScavenger(s, { playerX: s.x + d, playerY: 0 }, EVERYWHERE);
      states.push(s.chasing);
    }

    let changes = 0;
    for (let i = 1; i < states.length; i += 1) {
      if (states[i] !== states[i - 1]) changes += 1;
    }
    // Acquire, release, acquire again. Three is the honest floor for out-and-back; a flapping
    // implementation produces dozens.
    expect(changes, `chasing toggled ${changes} times over one out-and-back walk`).toBeLessThanOrEqual(3);

    // Non-vacuity, both ways: it must actually have chased AND actually have stopped, or "few
    // changes" is trivially true of a flag that never moved.
    expect(states.filter(Boolean).length, 'it never chased at all').toBeGreaterThan(5);
    expect(states.filter((c) => !c).length, 'it never released at all').toBeGreaterThan(5);
  });

  it('re-acquires afterwards — releasing is not a one-way ticket to never chasing again', () => {
    const s = chasing();
    stepScavenger(s, { playerX: 500 + SCAVENGER.releaseRadius + 1, playerY: 0 }, EVERYWHERE);
    expect(s.chasing).toBe(false);

    stepScavenger(s, { playerX: 500, playerY: 0 }, EVERYWHERE);
    expect(s.chasing, 'a released scavenger went blind').toBe(true);
  });
});
