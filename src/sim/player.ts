/**
 * The player: tuning knobs, the state machine, and the ONE conversion out of local box space.
 *
 * Vault items this file exists to satisfy:
 *  - **2.6** every state has exactly one door — `enterState()` is it.
 *  - **2.10** collision boxes are authored local, `+x` forward, `+y` up from the feet, with a
 *    single `toWorld`.
 *  - **2.11** `scale` is a required argument, validated `> 0`, applied to geometry only.
 *  - **A6** every knob in `DEFAULT_TUNING` is swept by `tests/unit/knob-sweep.test.ts`.
 *
 * The physics steps here are called by `tick.ts` in its numbered order. They are exported
 * separately rather than inlined so the step order is readable as a list at the call site — the
 * order is the contract, and a contract buried inside 200 lines of arithmetic is not one.
 */

import type { LocalBox, PlayerSim, PlayerState, Rect, TuningKnobs } from './types';

/**
 * Starting values, tuned by hand in the Playground.
 *
 * Every DURATION is an integer tick count (vault 2.1). Distances are pixels, velocities px/tick,
 * accelerations px/tick^2 — so nothing here is ever multiplied by a frame delta.
 *
 * `gravity: 0.9` with `jumpVelocity: 16` is deliberate and not arbitrary: it puts the discrete
 * apex about 8 px away from the continuous `v^2/2g` answer, which keeps criterion 2.2's check
 * able to detect the substitution vault 2.14 is about. `player-movement.test.ts` asserts that gap
 * still exists, so retuning cannot silently make the apex test vacuous.
 */
export const DEFAULT_TUNING: TuningKnobs = {
  runAccel: 1.1,
  airAccel: 0.65,
  runMax: 5.2,
  groundFriction: 1.6,
  airFriction: 0.22,
  gravity: 0.9,
  maxFallSpeed: 17,
  jumpVelocity: 16,
  jumpCutDivisor: 3,
  coyoteTicks: 7,
  jumpBufferTicks: 8,
};

/** The player's collision box, authored local: `+x` forward, `+y` up from the feet (vault 2.10). */
export const PLAYER_BOX: LocalBox = { x: -13, y: 0, w: 26, h: 46 };

export function createTuning(): TuningKnobs {
  return { ...DEFAULT_TUNING };
}

/**
 * THE single conversion from local box space to world space (vault 2.10).
 *
 * Local space is `+x` forward and `+y` **up from the feet**; world space is `+y` **down** from the
 * top-left. Both flips happen here and nowhere else, which is the whole point: a second conversion
 * elsewhere is how a hitbox ends up mirrored on one axis only, and how art bottoms and collision
 * bottoms disagree — the defect Phase 3's ElementEditor exists because of.
 *
 * `facing` mirrors by reflecting the box's forward edge, so a box offset 4px ahead of centre ends
 * up 4px behind it, not 4px ahead on the other side.
 */
export function toWorld(
  box: LocalBox,
  feetX: number,
  feetY: number,
  facing: 1 | -1,
  scale: number,
): Rect {
  const w = box.w * scale;
  const h = box.h * scale;
  const forward = facing === 1 ? box.x : -(box.x + box.w);
  return {
    x: feetX + forward * scale,
    y: feetY - (box.y + box.h) * scale,
    w,
    h,
  };
}

/**
 * The one door into every state (vault 2.6).
 *
 * Right now the bookkeeping is trivial, which is exactly when to establish the funnel — Phase 5
 * adds `attack`, `hurt` and `death`, each of which must clear a hit-window id and reset an i-frame
 * counter on entry. A comment asking callers to remember that is not enforcement; a single
 * function they cannot bypass is.
 */
export function enterState(player: PlayerSim, next: PlayerState): void {
  if (player.state === next) {
    return;
  }
  player.state = next;
}

/**
 * Step 4 of the tick order: pick the state from the facts already established this tick.
 *
 * Derived, never assigned piecemeal from six places — which is how a state machine acquires a
 * transition nobody can find.
 */
export function resolveState(player: PlayerSim, movingHorizontally: boolean): void {
  if (!player.grounded) {
    enterState(player, player.vy < 0 ? 'jump' : 'fall');
    return;
  }
  enterState(player, movingHorizontally ? 'run' : 'idle');
}

/** Step 6: horizontal acceleration, friction, and the speed cap. */
export function stepHorizontal(player: PlayerSim, tuning: TuningKnobs, dir: -1 | 0 | 1): void {
  const accel = player.grounded ? tuning.runAccel : tuning.airAccel;
  const friction = player.grounded ? tuning.groundFriction : tuning.airFriction;

  if (dir === 0) {
    // Decelerate toward zero and STOP there. Without the clamp the player creeps forever at a
    // speed too small to see but large enough to slide off a ledge while apparently standing.
    if (player.vx > 0) {
      player.vx = Math.max(0, player.vx - friction);
    } else if (player.vx < 0) {
      player.vx = Math.min(0, player.vx + friction);
    }
    return;
  }

  player.facing = dir === 1 ? 1 : -1;
  player.vx = Math.max(-tuning.runMax, Math.min(tuning.runMax, player.vx + accel * dir));
}

/** Step 7: gravity, the fall-speed clamp, and the early-release jump cut. */
export function stepVertical(player: PlayerSim, tuning: TuningKnobs, jumpHeld: boolean): void {
  if (player.jumpCutPending && !jumpHeld && player.vy < 0) {
    player.vy = player.vy / tuning.jumpCutDivisor;
    player.jumpCutPending = false;
  }
  if (player.vy >= 0) {
    // Past the apex there is nothing left to cut.
    player.jumpCutPending = false;
  }

  player.vy = Math.min(player.vy + tuning.gravity, tuning.maxFallSpeed);
}

/**
 * Step 10: resolve the player's box against static geometry, one axis at a time.
 *
 * Axis-separated resolution rather than a single overlap push. A combined push has to guess which
 * axis caused the overlap, and it guesses wrong exactly at the corner of a platform — which reads
 * as the player snagging on a ledge they should have cleared. Horizontal first, then vertical, so
 * a player pressed into a wall while falling still lands rather than sticking.
 *
 * Returns whether the player is standing on something.
 */
export function resolveCollisions(
  player: PlayerSim,
  solids: Rect[],
  scale: number,
  previousX: number,
  previousY: number,
): boolean {
  const halfW = (PLAYER_BOX.w * scale) / 2;
  const height = PLAYER_BOX.h * scale;

  for (const solid of solids) {
    const left = player.x - halfW;
    const right = player.x + halfW;
    const top = player.y - height;
    if (right <= solid.x || left >= solid.x + solid.w) {
      continue;
    }
    if (player.y <= solid.y || top >= solid.y + solid.h) {
      continue;
    }
    const wasLeft = previousX + halfW <= solid.x;
    const wasRight = previousX - halfW >= solid.x + solid.w;
    if (wasLeft) {
      player.x = solid.x - halfW;
      player.vx = 0;
    } else if (wasRight) {
      player.x = solid.x + solid.w + halfW;
      player.vx = 0;
    }
  }

  let grounded = false;
  for (const solid of solids) {
    const left = player.x - halfW;
    const right = player.x + halfW;
    const top = player.y - height;
    if (right <= solid.x || left >= solid.x + solid.w) {
      continue;
    }
    if (player.y <= solid.y || top >= solid.y + solid.h) {
      continue;
    }
    // Land only when arriving from ABOVE. Without the previous-position check, walking into the
    // side of a platform teleports the player onto its roof.
    if (player.vy >= 0 && previousY <= solid.y) {
      player.y = solid.y;
      player.vy = 0;
      grounded = true;
    } else if (player.vy < 0 && previousY - height >= solid.y + solid.h) {
      player.y = solid.y + solid.h + height;
      player.vy = 0;
    }
  }
  return grounded;
}
