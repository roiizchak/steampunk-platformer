/**
 * Live enemy knobs for the Playground — engine-free, so the sweep that proves them can be a unit
 * test rather than a browser session *(vault 2.12)*.
 *
 * ## What criterion 5.9 actually demands
 *
 * Vault **A6**, and Codex plan review C4 sharpening it: *"a displayed number can move while the
 * live enemy reads a stale value — the exact Phase 2 four-knob failure repeating."* A panel that
 * increments its own copy of `chaseSpeed` and shows the new figure looks identical to one that
 * retunes the enemy. So every knob here reads and writes **the live entity's own field**, and
 * `enemy-tuning.test.ts` asserts the enemy's *measured travel over N ticks* changes — not that a
 * readout changed.
 *
 * That is why these are accessor pairs over a live object rather than a config record that
 * something later copies onto the enemy. There is no second copy to drift.
 *
 * ## Why the field list is named rather than enumerated
 *
 * `PlaygroundScene` enumerates movement knobs with `Object.keys(world.tuning)`, which is right
 * there: every field of `TuningKnobs` is a knob. An enemy is not like that — `x`, `y`, `hp`,
 * `chaseCounter` and `lastHitSwing` are state, not tuning, and a panel that let you drag `hp`
 * upward would be a cheat menu rather than a tuning tool. So the tunable fields are listed, and the
 * cost is that adding one means adding it here. Stated rather than hidden.
 */

import { SENTRY_FIRE_TICKS } from './enemyView';
import type { Scavenger, Sentry } from '../sim/enemies';
import type { World } from '../sim/types';

export interface Knob {
  /** Shown in the panel, e.g. `scavenger.chaseSpeed`. */
  label: string;
  get(): number;
  set(value: number): void;
  /** How far one keypress moves it. */
  step: number;
  /** Floor. A radius of 0 is a tuning; a speed of 0 is a broken scene you cannot tune back. */
  min: number;
}

/** Distances step by pixels, speeds by a fraction of a pixel per tick, cadences by whole ticks. */
const STEP = { distance: 20, speed: 0.5, ticks: 5, damage: 1 } as const;

function knob(
  label: string,
  target: Record<string, number>,
  field: string,
  step: number,
  min: number,
  /**
   * 🔴 Optional CEILING, added 2026-08-15. Every knob had a floor and none had a roof, and the
   * criterion 5.3 adversarial brief found that asymmetry is not harmless: `deadZone` at step 20 with
   * no maximum walks past `attackRange` (144) in five keypresses, and past it the gait animation
   * restarts **132 times in 300 ticks**. `createScavenger` now throws on that relationship, but a
   * knob mutates a live object and never re-enters the constructor — so the guard has to exist on
   * both sides or the Gym is the one door that bypasses it. Same shape as the sentry cooldown FLOOR
   * (`SENTRY_FIRE_TICKS + 1`), which is the precedent this mirrors, one bound the other way up.
   */
  max = Infinity,
): Knob {
  return {
    label,
    get: () => target[field]!,
    set: (value) => {
      target[field] = Math.min(max, Math.max(min, value));
    },
    step,
    min,
  };
}

/**
 * Every tunable field on every live enemy, in a stable order.
 *
 * Indexed by entity as well as field, so two scavengers are two independent sets rather than one
 * shared row that silently retunes both — which would make a 5.11 spawn-many test unable to isolate
 * anything.
 */
export function enemyKnobs(world: World): Knob[] {
  const knobs: Knob[] = [];

  world.enemies.sentries.forEach((sentry: Sentry, index) => {
    const name = `sentry${index}`;
    const target = sentry as unknown as Record<string, number>;
    knobs.push(
      knob(`${name}.radius`, target, 'radius', STEP.distance, 0),
      /**
       * 🔴 Floor of `SENTRY_FIRE_TICKS + 1`, raised from **1** on 2026-08-14.
       *
       * A cooldown of 0 fires every tick — not a tuning of the turret but a different weapon, and
       * the projectile list grows without bound. That was the original reason for a floor, and it
       * was set too low. `sentryAnim` derives the firing EPISODE as
       * `windowOpen(cooldownCounter, SENTRY_FIRE_TICKS)` while `stepSentry` saturates that counter
       * at `cooldown`, so any `cooldown <= 18` leaves a counter that can never reach 18 and a
       * window that never closes. Measured by the criterion 5.3 gate owner: at `cooldown` 18 the
       * turret shows `fire` on **400 of 400** ticks and `idle` on none — an episode that never
       * closes, which is the exact failure 5.3 exists to forbid, reached in fifteen keypresses
       * through the knob criterion 5.9 requires to be sweepable.
       *
       * `enemy-tuning.test.ts` asserts the relationship rather than the number, so moving
       * `SENTRY_FIRE_TICKS` cannot re-open the hole.
       */
      knob(`${name}.cooldown`, target, 'cooldown', STEP.ticks, SENTRY_FIRE_TICKS + 1),
    );
  });

  world.enemies.scavengers.forEach((scavenger: Scavenger, index) => {
    const name = `scav${index}`;
    const target = scavenger as unknown as Record<string, number>;
    knobs.push(
      knob(`${name}.patrolSpeed`, target, 'patrolSpeed', STEP.speed, STEP.speed),
      knob(`${name}.chaseSpeed`, target, 'chaseSpeed', STEP.speed, STEP.speed),
      // 🔴 Capped one px below this scavenger's OWN `releaseRadius`. `createScavenger` throws on
      // the same relationship, but a **constructor** throw cannot see a knob dragged after the
      // object exists — which is exactly the live-edit half this file's header used to claim had
      // nothing left to guard. Same shape as `deadZone` below, and same reason it reads the
      // instance rather than the shared default.
      knob(`${name}.detectRadius`, target, 'detectRadius', STEP.distance, 0, scavenger.releaseRadius - 1),
      // Capped one px below this scavenger's OWN `attackRange`, not below the shared default — a
      // per-instance `attackRange` is a legal option, so reading it off the constant would let a
      // fixture-tuned scavenger walk past its own limit. `createScavenger` throws on the same
      // relationship; this is the live-object half of that guard.
      knob(`${name}.deadZone`, target, 'deadZone', STEP.distance, 0, scavenger.attackRange - 1),
    );
  });

  return knobs;
}

/**
 * The panel line for one knob.
 *
 * Speeds print to one decimal because `STEP.speed` is 0.5 — rounding to an integer would show two
 * consecutive presses as the same number, which is exactly the "the readout did not move so the
 * knob must be dead" confusion vault A6 is about.
 */
export function knobLine(k: Knob, selected: boolean): string {
  const value = Number.isInteger(k.get()) ? String(k.get()) : k.get().toFixed(1);
  return `${selected ? '>' : ' '} ${k.label.padEnd(20)} ${value}`;
}

/**
 * 🔴 **`enforceHysteresis` is deleted, and the invariant it held now lives on the knob itself.**
 *
 * It existed to hold `releaseRadius > detectRadius`, because a panel that let you drag one past the
 * other handed you a scavenger stuttering between patrol and chase every tick.
 *
 * ⚠️ **This block used to end *"`releaseRadius` no longer exists and there is no pair of knobs left
 * to hold in order"*, and that stopped being true on 2026-08-23** when the owner reopened the
 * permanent-aggro ruling (inventory 2b.1) and `releaseRadius` came back at 720. The comment survived
 * the reversal by three files, and the S.3 gate owner found it — one of four places still describing
 * a design that had been changed.
 *
 * The flap was **reachable again in the one tool built to tune these numbers**: `createScavenger`
 * throws on an empty band, but a constructor throw cannot see a knob dragged after the object
 * exists. So the cap moved onto `detectRadius`'s own `max` above, which is the `deadZone` pattern
 * and needs no separate enforcement pass.
 *
 * Criterion 5.9 is still why this is not a no-op left in place: a knob that no longer moves a number,
 * and an invariant with nothing to enforce, both read as working machinery in a panel.
 */
