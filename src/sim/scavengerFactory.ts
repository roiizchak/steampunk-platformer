/**
 * Building a scavenger, and the three guards that refuse a configuration the sim cannot honour.
 *
 * Split from `enemyScavenger.ts` on 2026-08-15, when the QA gate's explanations took that file past
 * the 400-line rule. The seam is real rather than arithmetic: this is **construction and
 * validation**, `enemyScavenger.ts` is **the per-tick creature**, and `scavengerAttack.ts` is **the
 * swing**. Every guard here follows vault 2.11 — a required argument throws rather than silently
 * substituting, because the substituted value is what makes the bug invisible.
 */

import { SCAVENGER, type Scavenger } from './enemyScavenger';
import { SCAVENGER_ATTACK_TICKS } from './scavengerAttack';

export interface ScavengerOptions {
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
  patrolSpeed?: number;
  chaseSpeed?: number;
  detectRadius?: number;
  deadZone?: number;
  hp?: number;
  attackRange?: number;
  attackCooldown?: number;
}

export function createScavenger(options: ScavengerOptions): Scavenger {
  const hp = options.hp ?? 60;

  const attackCooldown = options.attackCooldown ?? SCAVENGER.attackCooldown;
  // The same guard `createSentry` carries, for the same reason (D7). A cooldown inside the swing's
  // own length means the window never closes: `attackInProgress` stays true forever, the body never
  // moves again, and the sprite shows `attack` on every tick. Required-args-throw (vault 2.11).
  if (!Number.isInteger(attackCooldown) || attackCooldown <= SCAVENGER_ATTACK_TICKS) {
    throw new Error(
      `createScavenger: attackCooldown must be an integer tick count greater than ` +
        `SCAVENGER_ATTACK_TICKS (${SCAVENGER_ATTACK_TICKS}), or the swing never closes — the ` +
        `scavenger freezes mid-attack and never moves again, got ${attackCooldown}`,
    );
  }

  const attackRange = options.attackRange ?? SCAVENGER.attackRange;
  const deadZone = options.deadZone ?? SCAVENGER.deadZone;
  /**
   * 🔴 **`deadZone` must stay INSIDE `attackRange`, and this is now stated rather than assumed.**
   *
   * The gait key comes from `moving`, a per-tick readback of whether `x` changed, and the dead zone
   * freezes `x` — so a player oscillating across the dead-zone boundary toggles `idle`↔`chase` every
   * few ticks, and `playIfChanged` restarts the animation at frame 0 on every toggle. That is vault
   * 5.1's frame-0 defect arriving through the gait instead of through the AI.
   *
   * At shipped values it cannot happen, and **only by accident**: `attackRange` 144 > `deadZone` 96,
   * so `attackInProgress` outranks the gait in `scavengerAnim` and covers the whole flap band. The
   * criterion 5.3 adversarial brief measured what happens when that accident stops holding — five
   * increments of the Gym's `deadZone` knob (step 20, **no maximum**) reaches 196, and a player
   * drifting 2 px/tick then produces **132 animation restarts in 300 ticks**, with every gate in the
   * phase green.
   *
   * So the masking relationship becomes an invariant with a guard, exactly as `createSentry`'s
   * cooldown floor did for the identical shape one session earlier (D7) — and `enemyTuning.ts` caps
   * the knob so the Gym cannot walk past it either. **Stated limitation:** this makes the flap
   * unreachable rather than removing it. Hysteresis on the dead zone would remove it at the source;
   * that was weighed and declined (user decision 2026-08-15) because it re-adds the machinery this
   * phase deliberately deleted when aggro became permanent.
   */
  /**
   * ⚠️ **`attackRange: 0` is the documented "attack disabled" configuration and is exempt**, stated
   * rather than quietly allowed. Zero means `withinRadius(…, 0)` is true only at `dx === dy === 0`,
   * which several fixtures use to isolate the dead-zone rule from the swing that would otherwise
   * outrank it. In that configuration the gait flap IS reachable — there is no swing to mask it —
   * and that is accepted, because **no shipped path can produce it**: `attackRange` is not authorable
   * from Tiled, is not a Gym knob, and reaches `createScavenger` only from a test fixture or
   * `devSpawn`. A hole that only a fixture can walk through is a smaller cost than a fixture that
   * cannot isolate the rule it exists to test.
   */
  if (!Number.isFinite(attackRange) || attackRange < 0) {
    throw new Error(
      `createScavenger: attackRange must be a finite, non-negative pixel distance, got ` +
        `${attackRange}. A negative range BYPASSES the dead-zone guard below and then behaves as a ` +
        `positive radius, because withinRadius squares it (Codex 5.14, major 5).`,
    );
  }
  if (attackRange > 0 && !(deadZone < attackRange)) {
    throw new Error(
      `createScavenger: deadZone (${deadZone}) must be less than attackRange (${attackRange}), ` +
        `or a player straddling the dead-zone edge flaps the gait animation between idle and ` +
        `chase every few ticks and playIfChanged restarts it at frame 0 each time`,
    );
  }

  return {
    x: options.x,
    y: options.y,
    patrolMin: options.patrolMin,
    patrolMax: options.patrolMax,
    patrolSpeed: options.patrolSpeed ?? SCAVENGER.patrolSpeed,
    chaseSpeed: options.chaseSpeed ?? SCAVENGER.chaseSpeed,
    detectRadius: options.detectRadius ?? SCAVENGER.detectRadius,
    deadZone,
    facing: 1,
    chasing: false,
    chaseCounter: 0,
    moving: true,
    hp,
    maxHp: hp,
    lastHitSwing: -1,
    // Saturated: a scavenger that spawns already next to the player swings on its first tick
    // rather than granting a free cooldown of safety.
    attackCounter: attackCooldown,
    attackRange,
    attackCooldown,
  };
}

/**
 * Should this scavenger START chasing?
 *
 * One threshold now, asked only while it is NOT chasing — a chase has no geometric exit any more,
 * so there is no second radius for this predicate to be asymmetric about. It stays an exported
 * predicate rather than an inline inequality because the sim and the tests must consult the same
 * definition *(vault 5.3)*, and because `detectRadius = 0` is the AI off-switch several combat
 * fixtures rely on.
 */
