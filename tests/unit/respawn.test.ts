/**
 * Death ends. Until 2026-08-14 it did not.
 *
 * ## The defect, in the user's words
 *
 * > *"I cannot die. It gets stuck before I actually see the kill. [It] stops getting low health when
 * > I get hit. Also, the animation doesn't play anymore for anything."*
 *
 * Every clause of that is one bug with three faces:
 *
 *  - **`combatCounter` never advanced in `death`.** `stepCombat` excluded the state from its expiry
 *    block entirely, so the counter sat at 0 forever and the death window could never close.
 *  - **Nothing anywhere respawned the player.** `DEATH_TICKS`'s own docstring said *"45 ticks before
 *    the respawn"*; `stepCombat` said *"the respawn is the caller's decision"*; **no caller decided.**
 *    `hazards.ts` had recorded the gap as deliberate Phase-4 debt, to be closed once a health model
 *    existed. Phase 5 built the health model and never came back.
 *  - **`damagePlayer` returns early on a dead player**, so hp stops moving — *"stops getting low
 *    health"* — and `movementLocked` holds the body, so no input does anything and the sprite sits on
 *    whichever frame it was on.
 *
 * Not one test caught it, because every test asserted that dying **happens**. Nothing asked what
 * happens **next** — vault 9.4's shape, on the terminal state of the whole game.
 */

import { describe, expect, it } from 'vitest';

import { DEATH_TICKS, PLAYER_MAX_HP, deathWindowClosed, respawnPlayer } from '../../src/sim/combat';
import { DEFAULT_TUNING } from '../../src/sim/player';
import { createSnapshot } from '../../src/sim/input';
import { createScavenger } from '../../src/sim/enemies';
import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, World } from '../../src/sim/types';

const SCALE = 6;
const FLOOR = [{ x: 0, y: 960, w: 8000, h: 120 }];
const BOUNDS = { widthPx: 8000, heightPx: 1080 };
const SPAWN = { x: 1000, y: 960 };

function world(): World {
  return createWorld({ seed: 1, scale: SCALE, solids: FLOOR, bounds: BOUNDS, spawn: SPAWN });
}

/** Run `n` ticks with no input held, returning how many reported a respawn. */
function run(w: World, n: number, input: InputSnapshot = createSnapshot()): number {
  let respawns = 0;
  for (let i = 0; i < n; i += 1) {
    if (tick(w, input).respawned) respawns += 1;
  }
  return respawns;
}

describe('the world remembers where the player started', () => {
  it('carries the spawn it was built with, not just a player placed at it', () => {
    // Without this the respawn has nowhere to return to — which is precisely why there was no
    // respawn: `spawn` was a constructor argument that initialised the player and was forgotten.
    expect(world().spawn).toEqual(SPAWN);
  });

  it('defaults the grey-box spawn onto the world too, so a Phase-2 fixture can also respawn', () => {
    const greybox = createWorld({ seed: 1, scale: 1 });
    expect(greybox.spawn).toEqual({ x: greybox.player.x, y: greybox.player.y });
  });
});

describe('a dead player is released after DEATH_TICKS — the freeze, gated', () => {
  it("🔴 the death counter ADVANCES, which it did not before", () => {
    const w = world();
    w.player.hp = 0;
    tick(w, createSnapshot()); // the kill plane is not involved; hp 0 alone does not kill
    w.player.state = 'death';
    w.player.combatCounter = 0;

    const before = w.player.combatCounter;
    tick(w, createSnapshot());
    expect(
      w.player.combatCounter,
      'a dead player whose counter never advances can never be released — this is the freeze',
    ).toBeGreaterThan(before);
  });

  it('respawns exactly once, on exactly one tick, and lands at the spawn', () => {
    const w = world();
    w.player.x = 4000;
    w.player.hp = 1;
    // Killed the way the game kills: real damage through the real path.
    w.hazards = [{ x: 3900, y: 900, w: 200, h: 200 }];
    tick(w, createSnapshot());
    expect(w.player.state).toBe('death');

    const respawns = run(w, DEATH_TICKS + 30);
    expect(respawns, 'a respawn must be an EDGE — one tick, not a condition that keeps firing').toBe(1);
    expect(w.player.x).toBe(SPAWN.x);
    expect(w.player.hp).toBe(PLAYER_MAX_HP);
    expect(w.player.state).not.toBe('death');
  });

  /**
   * WHICH tick, not merely "a respawn happened" — an existence assertion cannot verify a timing
   * claim, and `DEATH_TICKS` exists so the death sheet is seen before the body is taken away.
   */
  it('holds the corpse for the FULL death window and not a tick less', () => {
    const w = world();
    w.player.hp = 1;
    w.hazards = [{ x: SPAWN.x - 100, y: 900, w: 200, h: 200 }];
    tick(w, createSnapshot());
    expect(w.player.state).toBe('death');

    // Counted rather than asserted at a hand-computed index — the kill lands at step 9b and
    // `enterCombatState` zeroes the counter there, so the arithmetic for "which tick" depends on
    // the same step-order subtlety the hurt lock's docstring spends twenty lines on. Counting
    // states the property directly: the corpse is held for exactly DEATH_TICKS ticks after the
    // one that killed it.
    let held = 0;
    while (!tick(w, createSnapshot()).respawned) {
      expect(w.player.state, `released from death early, after ${held} ticks`).toBe('death');
      held += 1;
      expect(held, 'never respawned at all').toBeLessThan(DEATH_TICKS * 3);
    }
    expect(held).toBe(DEATH_TICKS - 1);
  });

  it('a dead player cannot walk, right up until the moment they are alive again', () => {
    // The reason `death` is still terminal inside `stepCombat`: releasing it into `idle` there
    // would hand control back to a corpse.
    const w = world();
    w.player.hp = 1;
    w.hazards = [{ x: SPAWN.x - 100, y: 900, w: 200, h: 200 }];
    tick(w, createSnapshot());

    const held: InputSnapshot = createSnapshot();
    held.right = true;
    const xWhileDead = w.player.x;
    for (let i = 0; i < DEATH_TICKS - 3; i += 1) {
      tick(w, held);
      expect(w.player.x, `the corpse moved on tick ${i}`).toBe(xWhileDead);
    }
  });
});

describe('what the respawn restores, and what it deliberately leaves alone', () => {
  it('clears the counters and the momentum, not just the position', () => {
    const p = { ...world().player, x: 9, y: 9, vx: 12, vy: -30, hp: 0, state: 'death' as const };
    p.combatCounter = 99;
    p.iFrameCounter = 99;
    p.grounded = true;
    respawnPlayer(p, SPAWN, DEFAULT_TUNING);

    expect(p).toMatchObject({ x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, state: 'idle' });
    expect(p.hp).toBe(p.maxHp);
    expect(p.combatCounter).toBe(0);
    // i-frames OPEN, so whatever was touching the player when they died cannot instantly re-kill
    // them. A grace window, not invulnerability — it lapses on its own.
    expect(p.iFrameCounter).toBe(0);
    expect(p.grounded).toBe(false);
    // 🔴 Both forgiveness windows CLOSED, and this is the assertion, not `grounded`. See the test
    // below for the defect that distinction was hiding.
    expect(p.ticksSinceGrounded).toBe(DEFAULT_TUNING.coyoteTicks);
    expect(p.ticksSinceJumpPressed).toBe(DEFAULT_TUNING.jumpBufferTicks);
  });

  /**
   * 🔴 **The respawn handed out a free mid-air jump, and the test named for it checked the wrong
   * field.** `respawnPlayer`'s docstring said *"`grounded` false and `ticksSinceGrounded` saturated,
   * so a respawn cannot hand out a free coyote jump"*; the code cleared only `grounded`, and the
   * test above asserted only `grounded`. The comment named the behaviour and the assertion checked
   * something else — CLAUDE.md §5's *"an existence assertion cannot verify a timing claim"*.
   *
   * A corpse stays `grounded` for the whole death window, so step 10 re-armed `ticksSinceGrounded`
   * to 0 on all 45 of those ticks, and step 7 of the respawn tick read a wide-open coyote window.
   * Holding jump while dead — which is what a player does — launched the courier **216 px above the
   * spawn point, in mid-air, at full `jumpVelocity`**. Measured by the criterion 5.3 gate owner.
   *
   * This drives the real `tick()` with the jump held for the whole death, which is the input that
   * produced it.
   */
  it('🔴 does not fire a jump held down through the death — no free coyote from a corpse', () => {
    const w = world();
    w.player.hp = 1;
    w.hazards = [{ x: SPAWN.x - 100, y: 900, w: 200, h: 200 }];
    tick(w, createSnapshot());
    expect(w.player.state).toBe('death');

    const jump: InputSnapshot = createSnapshot();
    jump.jumpHeld = true;
    jump.jumpPressed = true;

    let respawnTick = -1;
    for (let i = 0; i < DEATH_TICKS * 2 && respawnTick < 0; i += 1) {
      // Re-armed EVERY tick, and that is the whole fixture. `jumpPressed` is a latched edge that
      // `consumeJumpPress` clears when it is read, so setting it once before the loop leaves it
      // false for every tick after the first — and the press never survives to the respawn tick,
      // which made the first draft of this test green against the unfixed code. A player mashing
      // jump while dead presses it again on every frame; this is that input.
      jump.jumpPressed = true;
      if (tick(w, jump).respawned) respawnTick = i;
    }
    expect(respawnTick, 'never respawned at all').toBeGreaterThanOrEqual(0);

    // On the respawn tick itself the player is alive, at the spawn, and NOT launched. `vy` is the
    // honest witness: `jumpVelocity` is negative-up, so a free jump shows as a large negative.
    expect(w.player.vy, 'the respawn fired a jump from mid-air').toBeGreaterThanOrEqual(0);
    expect(w.player.state).not.toBe('jump');
    expect(w.player.y).toBeGreaterThanOrEqual(SPAWN.y - 1);
  });

  /**
   * The world is NOT reset, and that is a decision rather than an omission — recorded here because
   * the missing respawn itself was once read as one. A life is not a checkpoint restart.
   */
  it('leaves the enemies exactly as the player left them', () => {
    const w = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: BOUNDS,
      spawn: SPAWN,
      enemies: [{ slug: 'rust-scavenger', x: 5000, y: 960, patrolMin: 4900, patrolMax: 5100 }],
    });
    const scavenger = w.enemies.scavengers[0]!;
    scavenger.hp = 7;

    w.player.hp = 1;
    w.hazards = [{ x: SPAWN.x - 100, y: 900, w: 200, h: 200 }];
    tick(w, createSnapshot());
    run(w, DEATH_TICKS + 5);

    expect(w.player.hp).toBe(PLAYER_MAX_HP);
    expect(scavenger.hp, 'the respawn healed an enemy — it must restore the PLAYER only').toBe(7);
  });

  it('falling out of the world respawns too, which closes the Phase 4 "fall forever" defect', () => {
    const w = world();
    w.player.y = BOUNDS.heightPx + 500; // below the kill plane
    tick(w, createSnapshot());
    expect(w.player.state).toBe('death');

    run(w, DEATH_TICKS + 5);
    expect(w.player.y).toBe(SPAWN.y);
    expect(w.player.hp).toBe(PLAYER_MAX_HP);
  });
});

/**
 * 🔴 Dying resets the board — gate finding B4, decided by the user 2026-08-14 (D4).
 *
 * Aggro is permanent by design: *"it should keep coming until I kill it"*. Nothing cleared `chasing`
 * on respawn, though, so after a death every scavenger walked toward the NEW spawn and never
 * patrolled again. Repeated deaths converge every scavenger in a level onto the spawn point, and
 * each death makes the level harder than the last — which reads as punishing rather than difficult.
 *
 * This does not weaken what was asked for. **Within one life the scavenger still never gives up**;
 * the only new exit is the player's own death, which is a thing the player has already paid for.
 *
 * Invisible in play today because `level-01` places one scavenger — so it is gated here, not left to
 * a playtest that cannot see it.
 */
describe('death releases aggro, so a respawn is not walked to', () => {
  /**
   * The scavenger patrols 4000 px from the spawn, deliberately.
   *
   * ⚠️ The first draft of this fixture put it 400 px away and both tests failed — **correctly**.
   * `detectRadius` is 480, so a scavenger that close re-aggros the moment the player reappears, and
   * "aggro survived the death" is indistinguishable from "aggro was earned again immediately". The
   * release only has a visible effect where the respawn is outside the detection radius, so that is
   * where it has to be measured.
   *
   * The aggro distance (300 px) is inside `detectRadius` and outside body overlap, so the chase
   * starts without contact damage putting the player in `hurt` with i-frames — which is what made
   * the first draft's kill land as `hurt` instead of `death`.
   */
  const FAR = 5000;

  function worldWithChaser(): World {
    const w = world();
    w.enemies.scavengers.push(
      createScavenger({ x: FAR, y: 960, patrolMin: FAR - 200, patrolMax: FAR + 200 }),
    );
    return w;
  }

  /** Aggro the scavenger through the real predicate, then kill the player the way the game kills. */
  function aggroThenDie(w: World, scavenger: ReturnType<typeof createScavenger>): void {
    w.player.x = scavenger.x - 300;
    tick(w, createSnapshot());
    expect(scavenger.chasing, 'the fixture must actually aggro, or this gate is vacuous').toBe(true);

    w.player.hp = 1;
    w.hazards = [{ x: w.player.x - 50, y: 900, w: 100, h: 200 }];
    tick(w, createSnapshot());
    expect(w.player.state, 'the fixture must actually kill, or this gate is vacuous').toBe('death');
  }

  it('clears the chase flag and its counter by the time the respawn completes', () => {
    const w = worldWithChaser();
    const scavenger = w.enemies.scavengers[0]!;
    aggroThenDie(w, scavenger);

    const respawns = run(w, DEATH_TICKS + 5);
    expect(respawns).toBe(1);
    expect(scavenger.chasing, 'a respawn must reset the board').toBe(false);
    expect(scavenger.chaseCounter).toBe(0);
  });

  it('lets it patrol again rather than converge on the spawn', () => {
    const w = worldWithChaser();
    const scavenger = w.enemies.scavengers[0]!;
    aggroThenDie(w, scavenger);
    run(w, DEATH_TICKS + 5);
    w.hazards = [];

    const xBefore = scavenger.x;
    run(w, 20);
    expect(scavenger.chasing, 'the spawn is 4000 px away — nothing here re-aggros it').toBe(false);
    expect(scavenger.x, 'a released scavenger patrols, so it moves').not.toBe(xBefore);
    expect(scavenger.x).toBeGreaterThanOrEqual(scavenger.patrolMin);
    expect(scavenger.x).toBeLessThanOrEqual(scavenger.patrolMax);
  });

  /**
   * The half of the decision that must NOT change: permanent aggro within one life. A test that only
   * proved the release would stay green if death released aggro every tick.
   */
  it('does not release aggro while the player is merely running away', () => {
    const w = worldWithChaser();
    const scavenger = w.enemies.scavengers[0]!;
    w.player.x = scavenger.x - 300;
    tick(w, createSnapshot());
    expect(scavenger.chasing).toBe(true);

    w.player.x = 0; // far outside detectRadius, alive
    run(w, 60);
    expect(scavenger.chasing, 'within one life it never gives up — that is the whole design').toBe(true);
  });
});

describe('deathWindowClosed — the predicate, never restated at the call site', () => {
  it('is false for the living, whatever their counter says', () => {
    const p = world().player;
    p.combatCounter = 9999;
    expect(deathWindowClosed(p)).toBe(false);
  });

  it('is false inside the window and true once it has elapsed', () => {
    const p = world().player;
    p.state = 'death';
    p.combatCounter = DEATH_TICKS - 1;
    expect(deathWindowClosed(p)).toBe(false);
    p.combatCounter = DEATH_TICKS;
    expect(deathWindowClosed(p)).toBe(true);
  });
});
