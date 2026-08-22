/**
 * Shared fixtures for the two hit-stop suites.
 *
 * Split out when `hitstop.test.ts` crossed the 400-line rule, and shared by BOTH
 * `hitstop.test.ts` and `hitstop-interactions.test.ts` rather than being the single-consumer
 * `-helpers` module `file-size.test.ts` names as the way to game that gate. The idiom is the one
 * `goal-entry-fixture.ts` and `sheet-packing-fixtures.ts` already use here.
 *
 * ## Why both fixtures carry MOTION into the hit
 *
 * A swing from a standing start has `vx === 0`, so an **ungated step 8** (`x += vx`) leaves `x`
 * unchanged and every freeze assertion passes on a body that is not frozen at all — vacuous in
 * exactly the way vault 2.7 describes. `strikeWhileRunning` drives the player at `runMax` into the
 * blow; `clawedWhileIdle` gets its motion from the knockback impulse the claw writes at the same
 * 9b. Each suite asserts that motion is non-zero before asserting it stopped.
 */

import { ATTACK } from '../../src/sim/combat';
import { ATTACK_BOX } from '../../src/sim/playerAttack';
import { SCAVENGER_BOX, type Scavenger } from '../../src/sim/enemies';
import { createSnapshot, latchAttackPress } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, World } from '../../src/sim/types';

const SCALE = 6;
const FLOOR = [{ x: 0, y: 960, w: 20000, h: 120 }];
const BOUNDS = { widthPx: 20000, heightPx: 1080 };
const IDLE: InputSnapshot = createSnapshot();

/** The swing's forward edge in world px, and the target's half-width — both derived, never typed. */
const REACH_PX = (ATTACK_BOX.x + ATTACK_BOX.w) * SCALE;
const TARGET_HALF_PX = -SCAVENGER_BOX.x * SCALE;

/** Where the target patrols, far enough right that the player is at `runMax` long before it. */
const TARGET_X = 3000;

/**
 * A patrolling target with its AI off, and optional extra enemies.
 *
 * `detectRadius: 0` is the documented off-switch (`detects`): no chase, and therefore no swing —
 * `maybeStartSwing` is gated on `chasing`, so this creature can never claw back and confuse a
 * player-side freeze with a `playerHurt` one. It still **patrols**, which is what makes the
 * "the enemy's x did not change" assertions below mean something.
 */
function runningWorld(extra: readonly { x: number; span: number }[] = []): World {
  const world = createWorld({
    seed: 1,
    scale: SCALE,
    solids: FLOOR,
    bounds: BOUNDS,
    spawn: { x: 1000, y: 960 },
    enemies: [
      { slug: 'rust-scavenger', x: TARGET_X, y: 960, patrolMin: TARGET_X - 300, patrolMax: TARGET_X + 300 },
      ...extra.map((e) => ({
        slug: 'rust-scavenger' as const,
        x: e.x,
        y: 960,
        patrolMin: e.x - e.span,
        patrolMax: e.x + e.span,
      })),
    ],
  });
  for (const scavenger of world.enemies.scavengers) {
    scavenger.detectRadius = 0;
  }
  return world;
}

interface Strike {
  world: World;
  input: InputSnapshot;
  target: Scavenger;
  /** The value of `world.tickCount` DURING the tick the hit landed. */
  hitTick: number;
}

/**
 * Run right at full speed and swing once, timed so the active window opens inside reach.
 *
 * The press distance is computed from the live knobs — the swing's outer reach, the target's
 * half-width and the ground the player covers during `ATTACK.startup` — so a locomotion retune
 * moves the fixture with the game instead of quietly making it miss.
 */
function strikeWhileRunning(opts: {
  extra?: readonly { x: number; span: number }[];
  targetHp?: number;
} = {}): Strike {
  const world = runningWorld(opts.extra ?? []);
  const target = world.enemies.scavengers[0]!;
  if (opts.targetHp !== undefined) {
    target.hp = opts.targetHp;
  }
  const input = createSnapshot();
  input.right = true;
  const pressAt = REACH_PX + TARGET_HALF_PX + ATTACK.startup * world.tuning.runMax;

  let pressed = false;
  for (let i = 0; i < 2000; i += 1) {
    if (!pressed && target.x - world.player.x <= pressAt) {
      latchAttackPress(input);
      pressed = true;
    }
    const hpBefore = target.hp;
    tick(world, input);
    if (target.hp < hpBefore) {
      return { world, input, target, hitTick: world.tickCount - 1 };
    }
  }
  throw new Error('fixture broken: the running swing never connected');
}

/** The scavenger-claw fixture: player idle, one creature in range, swinging on its own. */
function clawedWhileIdle(): { world: World; scavenger: Scavenger; hitTick: number } {
  const world = createWorld({
    seed: 1,
    scale: SCALE,
    solids: FLOOR,
    bounds: BOUNDS,
    spawn: { x: 700, y: 960 },
    enemies: [{ slug: 'rust-scavenger', x: 700, y: 960, patrolMin: 600, patrolMax: 800 }],
  });
  const scavenger = world.enemies.scavengers[0]!;
  for (let i = 0; i < 400; i += 1) {
    const hpBefore = world.player.hp;
    tick(world, { ...IDLE });
    if (world.player.hp < hpBefore) {
      return { world, scavenger, hitTick: world.tickCount - 1 };
    }
  }
  throw new Error('fixture broken: the claw never landed');
}

export { SCALE, FLOOR, BOUNDS, IDLE, TARGET_X, runningWorld, strikeWhileRunning, clawedWhileIdle };
export type { Strike };
