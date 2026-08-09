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
): Knob {
  return {
    label,
    get: () => target[field]!,
    set: (value) => {
      target[field] = Math.max(min, value);
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
      // Floor of 1: a cooldown of 0 fires every tick, which is not a tuning of the turret, it is a
      // different weapon, and it makes the projectile list grow without bound.
      knob(`${name}.cooldown`, target, 'cooldown', STEP.ticks, 1),
    );
  });

  world.enemies.scavengers.forEach((scavenger: Scavenger, index) => {
    const name = `scav${index}`;
    const target = scavenger as unknown as Record<string, number>;
    knobs.push(
      knob(`${name}.patrolSpeed`, target, 'patrolSpeed', STEP.speed, STEP.speed),
      knob(`${name}.chaseSpeed`, target, 'chaseSpeed', STEP.speed, STEP.speed),
      knob(`${name}.detectRadius`, target, 'detectRadius', STEP.distance, 0),
      knob(`${name}.releaseRadius`, target, 'releaseRadius', STEP.distance, 0),
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
 * The hysteresis gap is an INVARIANT, not two independent knobs.
 *
 * `releaseRadius` must stay strictly greater than `detectRadius` or the anti-flap mechanism is
 * gone — and a tuning panel that lets you drag one past the other hands you a scavenger that
 * stutters between patrol and chase every tick, which is the frame-0 animation bug arriving through
 * the AI. Called after every adjustment rather than being a rule inside each knob, because it is a
 * relationship between two of them.
 */
export function enforceHysteresis(world: World): void {
  for (const scavenger of world.enemies.scavengers) {
    if (scavenger.releaseRadius <= scavenger.detectRadius) {
      scavenger.releaseRadius = scavenger.detectRadius + STEP.distance;
    }
  }
}
