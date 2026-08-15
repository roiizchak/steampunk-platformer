/**
 * Enemy behaviour — episodes, not per-tick decisions.
 *
 * Vault **5.1** (blocker): *a per-tick probability is not a behaviour — commit to episodes; one
 * counter plus one flag, because two counters admit the unrepresentable state.* And the render-side
 * consequence in the same note: *Phaser restarts a looping animation on every state change, which is
 * how a walk cycle never left frame 0.*
 *
 * The Phase 5 Codex plan review (C9) sharpened this: **determinism alone is not commitment.** A
 * fully deterministic enemy whose *detection* is recomputed every tick still flaps when the player
 * stands exactly on the boundary — and a state that changes every tick restarts the animation every
 * tick, which is the frame-0 bug arriving through the AI instead of through `play()`. So the gate
 * for criterion 5.3 is a flap test, not a structural read of the code.
 */

import { describe, expect, it } from 'vitest';

import {
  createScavenger,
  groundUnder,
  scavengerFooting,
  stepScavenger,
  withinRadius,
} from '../../src/sim/enemies';
import { ATTACK, attackTotalTicks } from '../../src/sim/combat';
import { createSnapshot, latchAttackPress } from '../../src/sim/input';
import { stepEnemies } from '../../src/sim/enemyTurn';
import { createWorld, tick } from '../../src/sim/tick';

describe('rust-scavenger — a chase stops at the edge of the floor', () => {
  /** A ledge ending at x = 2000, with the scavenger's feet on its top surface at y = 960. */
  const LEDGE = scavengerFooting([{ x: 0, y: 960, w: 2000, h: 500 }], 6);

  /** Sight the player from inside `detectRadius`, then have them flee past the drop and stay there. */
  function seeThenFlee(s: ReturnType<typeof createScavenger>): void {
    stepScavenger(s, { playerX: 1600, playerY: 960 }, LEDGE);
    for (let i = 0; i < 300; i += 1) {
      stepScavenger(s, { playerX: 5000, playerY: 960 }, LEDGE);
    }
  }

  it('stops before its LEADING EDGE leaves the floor, not when its centre does', () => {
    const s = createScavenger({ x: 1500, y: 960, patrolMin: 0, patrolMax: 100000 });
    seeThenFlee(s);
    expect(s.chasing).toBe(true);
    // 🔴 The body is 120 px wide, so the last legal centre is a half-body back from the drop —
    // and this bound is what a CENTRE probe (Codex plan review finding 7) would fail: it would
    // happily walk to 2000 and leave half a scavenger hanging over the void.
    expect(s.x).toBeLessThanOrEqual(2000 - LEDGE.halfWidthPx);
    // ...but it did walk right up to it. A scavenger that stopped early for any other reason —
    // a surviving clamp, a stalled chase — fails here.
    expect(s.x).toBeGreaterThan(2000 - LEDGE.halfWidthPx - s.chaseSpeed);
  });

  it('keeps FACING the player it cannot reach, so it does not read as having given up', () => {
    const s = createScavenger({ x: 1500, y: 960, patrolMin: 0, patrolMax: 100000 });
    seeThenFlee(s);
    expect(s.facing).toBe(1);
    expect(s.chasing).toBe(true);
  });

  it('walks back off the edge the moment the player is on the reachable side again', () => {
    const s = createScavenger({ x: 1500, y: 960, patrolMin: 0, patrolMax: 100000 });
    seeThenFlee(s);
    const stopped = s.x;
    for (let i = 0; i < 100; i += 1) {
      stepScavenger(s, { playerX: 200, playerY: 960 }, LEDGE);
    }
    expect(s.x).toBeLessThan(stopped);
    expect(s.facing).toBe(-1);
  });
});

describe('dead enemies stop acting — stepEnemies must filter hp <= 0', () => {
  const SCALE = 6;
  const BOUNDS = { widthPx: 8000, heightPx: 1080 };

  it('a dead sentry pushes zero projectiles and its cooldownCounter does not advance', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      bounds: BOUNDS,
      spawn: { x: 1000, y: 960 },
      enemies: [{ slug: 'brass-sentry', x: 1000, y: 960, patrolMin: 1000, patrolMax: 1000 }],
    });
    const sentry = world.enemies.sentries[0]!;
    sentry.hp = 0;
    const counterBefore = sentry.cooldownCounter;

    for (let i = 0; i < 60; i += 1) {
      stepEnemies(world);
    }

    expect(world.projectiles.length).toBe(0);
    expect(sentry.cooldownCounter).toBe(counterBefore);
  });

  /**
   * 🔴 **Codex plan review finding 3.** The test below was vacuous for the half that mattered: it
   * sets `hp = 0` on a scavenger that had **never chased**, so `expect(chasing).toBe(false)` passed
   * on the initial value of the field and would have passed with the death transition deleted.
   *
   * It could be ignored while a chase lapsed on its own. It cannot now: aggro is permanent, so death
   * is the ONLY exit, and a corpse left flagged `chasing` would keep `enemyView` picking the `chase`
   * sheet for a body that is not going anywhere.
   *
   * The kill is done with **real swings against a live enemy**, not by assigning `hp = 0` — which is
   * separately the gap (T2) that let a dead-enemy defect ship past the entire Phase 5 gate: 5.10 and
   * 5.16 both zeroed hp directly, and the closest real swing stopped two hits short of a kill.
   */
  it('a CHASING scavenger, killed by real swings, stops chasing', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      bounds: BOUNDS,
      solids: [{ x: 0, y: 960, w: 8000, h: 120 }],
      spawn: { x: 1000, y: 960 },
      // 1200 is `player-attack.test.ts`'s IN_REACH: clear of the player's own 132 px box and inside
      // the swing's reach, a gap only `ATTACK_BOX` crosses.
      enemies: [{ slug: 'rust-scavenger', x: 1200, y: 960, patrolMin: 1100, patrolMax: 1300 }],
    });
    const scavenger = world.enemies.scavengers[0]!;

    // Chasing FIRST — the whole point, and what the old version of this test never established.
    // 200 px is well inside the 480 px detect radius.
    stepEnemies(world);
    expect(scavenger.chasing).toBe(true);

    // Then freeze it where it stands. A chaser that closes to contact puts the player in `hurt`,
    // where `canAct` is false and no swing ever starts — the same reason `player-attack.test.ts`
    // disables approach. `chasing` stays true, which is the state under test.
    scavenger.chaseSpeed = 0;

    let killed = false;
    for (let swing = 0; swing < 20 && !killed; swing += 1) {
      // `attackPressed` is an EDGE: re-latched per swing, so a held key cannot become a second hit.
      const input = createSnapshot();
      latchAttackPress(input);
      for (let i = 0; i < attackTotalTicks(ATTACK) + 4; i += 1) {
        tick(world, input);
      }
      killed = scavenger.hp <= 0;
    }

    expect(killed, 'the swing loop never actually killed it — the rest asserts nothing').toBe(true);
    // `tick` runs `stepEnemies`, so the clear has already happened by here — asserted after a kill
    // that took real damage through the real attack path, not after an assignment.
    expect(scavenger.chasing).toBe(false);
    expect(scavenger.chaseCounter).toBe(0);
  });

  it('a dead scavenger with real patrol bounds does not move, turn or start chasing', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      bounds: BOUNDS,
      // Player kept well outside detectRadius (480) so a live scavenger would only PATROL, not
      // chase — patrol drift is monotonic and deterministic, so `x` changing is never a coincidence
      // the way an oscillating chase could be.
      spawn: { x: 99999, y: 960 },
      enemies: [{ slug: 'rust-scavenger', x: 500, y: 960, patrolMin: 400, patrolMax: 900 }],
    });
    const scavenger = world.enemies.scavengers[0]!;
    scavenger.hp = 0;
    const xBefore = scavenger.x;
    const facingBefore = scavenger.facing;

    for (let i = 0; i < 60; i += 1) {
      stepEnemies(world);
    }

    expect(scavenger.x).toBe(xBefore);
    expect(scavenger.facing).toBe(facingBefore);
    expect(scavenger.chasing).toBe(false);
  });
});

/**
 * `withinRadius` and `groundUnder` — the two shared geometry predicates, tested directly.
 *
 * ## T6: deleting `dy * dy` used to turn nothing red
 *
 * `withinRadius` is the single definition BOTH enemies consult (vault 5.3) and it had no direct
 * test. Every fixture that reached it did so through a sentry or a scavenger, and **every one of
 * those placed the enemy and the player at the same `y`** — `y: 0` against `playerY: 0`. With
 * `dy === 0` the vertical term contributes nothing, so removing it from the distance entirely left
 * the whole suite green. The radius was, in effect, only ever tested as a horizontal one.
 *
 * That matters in the shipped level rather than in theory: `level-01` stands its sentry on a ledge
 * four tiles above the player, which is the geometry `enemyTurn.ts` aims the muzzle for.
 */
describe('the shared geometry predicates, asserted directly', () => {
  it('withinRadius measures TRUE distance — a purely vertical gap counts (T6)', () => {
    const at = { playerX: 1000, playerY: 1000 - 500 };
    // Directly above, 500 px up, against a 480 px radius. Out of range — and a predicate that
    // ignored `dy` would compute a distance of 0 and report the player as sighted.
    expect(withinRadius(1000, 1000, at, 480)).toBe(false);
    // The same 500 px gap, now horizontal. Both must answer the same way, or the radius is an
    // ellipse and the sentry can see further along one axis than the other.
    expect(withinRadius(1000, 1000, { playerX: 1500, playerY: 1000 }, 480)).toBe(false);
  });

  it('a DIAGONAL player is judged on the hypotenuse, not on either leg', () => {
    // 300 across and 400 up is exactly 500 by Pythagoras. Each leg alone is inside 480; the true
    // distance is not. This is the case a per-axis test cannot express.
    const diagonal = { playerX: 1000 + 300, playerY: 1000 - 400 };
    expect(withinRadius(1000, 1000, diagonal, 480)).toBe(false);
    expect(withinRadius(1000, 1000, diagonal, 500)).toBe(true); // `<=`, exactly on the boundary
  });

  it('the boundary is EXACT, because squares are compared rather than a square root', () => {
    // `sqrt` returns a float, and comparing a float against an integer radius makes "exactly on
    // the boundary" depend on rounding — which is precisely where the flap test parks the player.
    expect(withinRadius(0, 0, { playerX: 480, playerY: 0 }, 480)).toBe(true);
    expect(withinRadius(0, 0, { playerX: 481, playerY: 0 }, 480)).toBe(false);
  });

  it('groundUnder probes BELOW the feet, so a foot line on a surface reads as supported', () => {
    const floor = [{ x: 0, y: 960, w: 1000, h: 120 }];
    // Feet exactly on the top edge — the normal case, and a boundary comparison at `y` itself
    // would be at the mercy of a level authored half a pixel out.
    expect(groundUnder(500, 960, floor)).toBe(true);
    // Past the right end, and before the left one.
    expect(groundUnder(1001, 960, floor)).toBe(false);
    expect(groundUnder(-1, 960, floor)).toBe(false);
    // Standing at the right height for NO floor at all.
    expect(groundUnder(500, 500, floor)).toBe(false);
    expect(groundUnder(500, 960, [])).toBe(false);
  });
});
