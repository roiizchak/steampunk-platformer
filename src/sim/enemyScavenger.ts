import type { Sighting } from './enemies';
import { windowOpen } from './windows';
import { withinRadius } from './enemyGeometry';

/* ------------------------------------------------------------------ *
 * rust-scavenger — patrols, detects with hysteresis, chases.
 * ------------------------------------------------------------------ */

/**
 * A chase lasts at least this long once entered, whatever the player does.
 *
 * 30 ticks, half a second. Short enough that it is not a punish for the player breaking line of
 * sight properly; long enough that a boundary-straddling player cannot make the scavenger stutter.
 */
export const CHASE_COMMIT_TICKS = 30;

/**
 * Scavenger defaults.
 *
 * `chaseSpeed` 8 px/tick sits between Phase 2's `walkMax` 5.54 and `runMax` 12.0 — **deliberately
 * escapable.** A chaser faster than the player's run means fleeing is never an option, and with no
 * stamina system that is not tension, it is a tax. `releaseRadius` is strictly greater than
 * `detectRadius`; that gap IS the hysteresis and `enemy-ai.test.ts` pins the relationship.
 */
export const SCAVENGER = {
  patrolSpeed: 2.5,
  chaseSpeed: 8,
  detectRadius: 480,
  releaseRadius: 720,
  damage: 15,
  contactCooldown: 45,
} as const;

export interface Scavenger {
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
  patrolSpeed: number;
  chaseSpeed: number;
  detectRadius: number;
  releaseRadius: number;
  facing: 1 | -1;
  /** ONE flag (vault 5.1). */
  chasing: boolean;
  /** ONE counter (vault 5.1) — ticks spent in the current chase episode. */
  chaseCounter: number;
  hp: number;
  maxHp: number;
  /** The start tick of the swing that last connected, or `-1`. See `playerAttack.ts`. */
  lastHitSwing: number;
}

export interface ScavengerOptions {
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
  patrolSpeed?: number;
  chaseSpeed?: number;
  detectRadius?: number;
  releaseRadius?: number;
  hp?: number;
}

export function createScavenger(options: ScavengerOptions): Scavenger {
  const hp = options.hp ?? 60;
  return {
    x: options.x,
    y: options.y,
    patrolMin: options.patrolMin,
    patrolMax: options.patrolMax,
    patrolSpeed: options.patrolSpeed ?? SCAVENGER.patrolSpeed,
    chaseSpeed: options.chaseSpeed ?? SCAVENGER.chaseSpeed,
    detectRadius: options.detectRadius ?? SCAVENGER.detectRadius,
    releaseRadius: options.releaseRadius ?? SCAVENGER.releaseRadius,
    facing: 1,
    chasing: false,
    chaseCounter: 0,
    hp,
    maxHp: hp,
    lastHitSwing: -1,
  };
}

/**
 * Should this scavenger be chasing, given where it already is?
 *
 * **Asymmetric on purpose** — that asymmetry is the whole anti-flap mechanism, so it lives in one
 * exported predicate that the sim and the tests both consult *(vault 5.3)* rather than being
 * restated as two inequalities at the call site.
 */
export function detects(scavenger: Scavenger, at: Sighting): boolean {
  const threshold = scavenger.chasing ? scavenger.releaseRadius : scavenger.detectRadius;
  return withinRadius(scavenger.x, scavenger.y, at, threshold);
}

/** One tick of scavenger behaviour. */
export function stepScavenger(scavenger: Scavenger, at: Sighting): void {
  const sees = detects(scavenger, at);

  if (!scavenger.chasing) {
    if (sees) {
      scavenger.chasing = true;
      scavenger.chaseCounter = 0;
    }
  } else {
    scavenger.chaseCounter += 1;
    // The commitment floor is tested BEFORE the sighting, so a chase entered this tick cannot be
    // cancelled by the same tick's geometry.
    if (!windowOpen(scavenger.chaseCounter, CHASE_COMMIT_TICKS) && !sees) {
      scavenger.chasing = false;
      scavenger.chaseCounter = 0;
    }
  }

  if (scavenger.chasing) {
    const dir: 1 | -1 = at.playerX >= scavenger.x ? 1 : -1;
    scavenger.facing = dir;
    scavenger.x += dir * scavenger.chaseSpeed;
    return;
  }

  scavenger.x += scavenger.facing * scavenger.patrolSpeed;
  // Turn AT the bound and clamp to it, so the patrol never drifts outside the strip it was authored
  // with — a scavenger that overshoots by a fraction each lap walks off its own platform.
  if (scavenger.x >= scavenger.patrolMax) {
    scavenger.x = scavenger.patrolMax;
    scavenger.facing = -1;
  } else if (scavenger.x <= scavenger.patrolMin) {
    scavenger.x = scavenger.patrolMin;
    scavenger.facing = 1;
  }
}
