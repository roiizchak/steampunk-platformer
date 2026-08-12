/**
 * Criterion 5.9 — every enemy knob sweeps, and **the enemy's behaviour changes**.
 *
 * Vault A6 asks that turning a knob move an observable output. Codex plan review C4 sharpened it
 * into the thing that actually bites: *"a displayed number can move while the live enemy reads a
 * stale value — the exact Phase 2 four-knob failure repeating."*
 *
 * So the sweep below does not check that `knob.get()` returns what `knob.set()` was given — that is
 * true of a knob wired to nothing. It runs the SIMULATION either side of the change and asserts the
 * enemy moved, detected, or fired differently. A knob that writes a field nobody reads fails here.
 */

import { describe, expect, it } from 'vitest';

import { enemyKnobs, enforceHysteresis, knobLine } from '../../src/render/enemyTuning';
import { createSnapshot } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';
import type { World } from '../../src/sim/types';

/**
 * The player RETREATS for the whole run, and that is not scenery either.
 *
 * `releaseRadius` is the threshold for LEAVING a chase, so it can only be observed while the
 * distance is growing. With a stationary player the scavenger closes in and stays, and no value of
 * `releaseRadius` changes anything — which the first version of this file reported as a dead knob.
 * Running away also crosses `detectRadius` outward, which is the case hysteresis exists for.
 */
const RETREAT = { ...createSnapshot(), left: true };

/**
 * THREE placements, because no single one makes every knob live.
 *
 * `near` puts the player inside both radii, so detection, chasing and firing are all happening —
 * which is where `chaseSpeed`, `cooldown` and shrinking a radius are observable. `far` puts them
 * outside, so the scavenger patrols and the turret is silent — which is where `patrolSpeed` and
 * GROWING a radius are observable. The first version of this file used one fixture and reported
 * four knobs dead; they were not dead, they were out of range. A sweep that cannot put the knob in
 * play is measuring the fixture.
 *
 * 🔴 `contact` was added in session 8 and the reason is worth keeping, because the fixture went
 * blind through no fault of its own. `deadZone` only gates behaviour when the player is CLOSE, and
 * in `near` the scavenger chases the retreating player straight into `patrolMin` and clamps there —
 * so total travel saturates at `3000 - 2600 = 400` for **every** value of `deadZone`, and the knob
 * reads dead. The clamp is the new S2 fix, so **this session's own sim change is what cost the
 * sweep its sensitivity.** `contact` gives the scavenger bounds far wider than it can cross in the
 * run, making travel speed-limited rather than clamp-limited, and starts the player inside the dead
 * zone so the knob is in play from tick 0.
 *
 * A third placement can only make the sweep MORE sensitive — the assertion is `some()` across
 * placements, so nothing that passed before can start failing. That is broadening what the gate
 * MEASURES, never loosening what it TOLERATES.
 */
function freshWorld(placement: 'near' | 'far' | 'contact' = 'near'): World {
  const spawnX = { near: 2800, far: 400, contact: 3000 }[placement];
  // Wide enough that 240 ticks at `chaseSpeed` 8 (1920 px) cannot reach either bound from 3000.
  const scavBounds = placement === 'contact' ? { min: 800, max: 5200 } : { min: 2600, max: 3400 };
  return createWorld({
    seed: 1,
    scale: 6,
    solids: [{ x: 0, y: 960, w: 9000, h: 120 }],
    bounds: { widthPx: 9000, heightPx: 1080 },
    spawn: { x: spawnX, y: 960 },
    enemies: [
      { slug: 'brass-sentry', x: 3200, y: 960, patrolMin: 3190, patrolMax: 3210 },
      {
        slug: 'rust-scavenger',
        x: 3000,
        y: 960,
        patrolMin: scavBounds.min,
        patrolMax: scavBounds.max,
      },
    ],
  });
}

/**
 * A number that summarises what the enemies DID over a run: total travel plus shots fired.
 *
 * Deliberately an aggregate of behaviour rather than a read of the knob. If a knob's field is never
 * consulted by the sim, this cannot move, however cleanly the setter worked.
 */
function behaviourSignature(world: World, ticks: number): number {
  const startX = world.enemies.scavengers.map((s) => s.x);
  let shots = 0;
  for (let i = 0; i < ticks; i += 1) {
    tick(world, { ...RETREAT });
    shots += world.projectiles.length;
  }
  const travel = world.enemies.scavengers.reduce(
    (sum, s, i) => sum + Math.abs(s.x - startX[i]!),
    0,
  );
  return travel * 1000 + shots;
}

describe('every enemy knob is live (criterion 5.9, vault A6)', () => {
  it('the sweep is not vacuous — there are knobs, and they are named per entity', () => {
    const knobs = enemyKnobs(freshWorld());
    expect(knobs.length).toBeGreaterThan(0);
    expect(knobs.map((k) => k.label)).toContain('scav0.chaseSpeed');
    expect(knobs.map((k) => k.label)).toContain('sentry0.radius');
    // Per entity, not per type: two scavengers must not share one row.
    expect(new Set(knobs.map((k) => k.label)).size).toBe(knobs.length);
  });

  /**
   * Each knob is turned hard BOTH ways in BOTH placements, and has to move the outcome in at least
   * one of the four. Requiring a specific direction in a specific fixture would mean hand-mapping
   * every knob to the situation that exposes it, and getting one wrong reads as a dead knob.
   *
   * The turns are large on purpose: a one-step nudge can round away inside a tick and produce a
   * false failure. `min` is one end because shrinking a radius to nothing is the cleanest way to
   * make a detection knob observable.
   */
  it.each(enemyKnobs(freshWorld()).map((k) => k.label))(
    '%s changes what the enemies actually do, not just what the panel says',
    (label) => {
      const observed = (['near', 'far', 'contact'] as const).some((placement) => {
        const baseline = behaviourSignature(freshWorld(placement), 240);
        return [Number.NaN, 0].some((_, i) => {
          const world = freshWorld(placement);
          const target = enemyKnobs(world).find((k) => k.label === label)!;
          target.set(i === 0 ? target.min : target.get() * 2 + 200);
          enforceHysteresis(world);
          return behaviourSignature(world, 240) !== baseline;
        });
      });

      expect(observed, `${label} moved no observable output in either placement`).toBe(true);
    },
  );

  it('a knob cannot be driven below its floor', () => {
    const world = freshWorld();
    for (const k of enemyKnobs(world)) {
      k.set(-9999);
      expect(k.get(), k.label).toBeGreaterThanOrEqual(k.min);
    }
  });
});

describe('the hysteresis gap survives tuning', () => {
  it('release is pushed back above detect when detect is dragged past it', () => {
    const world = freshWorld();
    const scavenger = world.enemies.scavengers[0]!;

    const detect = enemyKnobs(world).find((k) => k.label === 'scav0.detectRadius')!;
    detect.set(scavenger.releaseRadius + 200);
    enforceHysteresis(world);

    // Without this the two thresholds invert, the anti-flap mechanism is gone, and the scavenger
    // stutters patrol/chase every tick — the frame-0 animation bug arriving through the AI.
    expect(scavenger.releaseRadius).toBeGreaterThan(scavenger.detectRadius);
  });
});

describe('the panel line', () => {
  it('shows fractional speeds, so two consecutive presses are not the same number', () => {
    const world = freshWorld();
    const speed = enemyKnobs(world).find((k) => k.label === 'scav0.patrolSpeed')!;
    const first = knobLine(speed, true);
    speed.set(speed.get() + speed.step);
    expect(knobLine(speed, true)).not.toBe(first);
  });

  it('marks the selected row and only the selected row', () => {
    const world = freshWorld();
    const k = enemyKnobs(world)[0]!;
    expect(knobLine(k, true).startsWith('>')).toBe(true);
    expect(knobLine(k, false).startsWith('>')).toBe(false);
  });
});
