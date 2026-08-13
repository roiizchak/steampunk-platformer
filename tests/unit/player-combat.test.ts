/**
 * Combat as it actually runs — inside the tick order, not as a table of constants.
 *
 * `combat.test.ts` pins the timing table. This file pins what step 4 does with it, and its first
 * test is the trap the Phase 5 Codex plan review (C7) named: **`resolveState` at step 11 derives
 * the player's state from movement every tick, so an `attack` entered at step 4 would be
 * overwritten on the same tick, every tick, and the attack animation would never be seen.**
 *
 * That defect is invisible to a "did an attack happen" assertion — the state is set, it is simply
 * gone again before anything can draw it. So these tests assert **which tick** the player is in
 * which state, across a whole swing.
 */

import { describe, expect, it } from 'vitest';

import {
  ATTACK,
  DEATH_TICKS,
  HURT_LOCK_TICKS,
  HURT_TICKS,
  IFRAME_TICKS,
  attackTotalTicks,
  canAct,
  createSnapshot,
  createWorld,
  damagePlayer,
  invulnerable,
  latchAttackPress,
  latchJumpPress,
  movementLocked,
  tick,
} from '../../src/sim';
import type { InputSnapshot, World } from '../../src/sim';

function grounded(): { world: World; input: InputSnapshot } {
  const world = createWorld({ seed: 1, scale: 1 });
  const input = createSnapshot();
  // Settle onto the floor so the state machine is in `idle`, not `fall`.
  for (let i = 0; i < 30; i += 1) {
    tick(world, input);
  }
  return { world, input };
}

describe('the attack state survives step 11 — Codex C7', () => {
  it('holds `attack` for every tick of the swing instead of being overwritten', () => {
    const { world, input } = grounded();
    expect(world.player.state).toBe('idle');

    latchAttackPress(input);
    const states: string[] = [];
    for (let i = 0; i < attackTotalTicks(ATTACK) + 4; i += 1) {
      tick(world, input);
      states.push(world.player.state);
    }

    // Every tick of the swing is `attack` — not just the first, which is what a state overwritten
    // at step 11 would still produce.
    const swing = states.slice(0, attackTotalTicks(ATTACK));
    expect(new Set(swing)).toEqual(new Set(['attack']));

    // And it ends. A state that never releases is the mirror defect.
    expect(states[attackTotalTicks(ATTACK)]).toBe('idle');
  });

  it('a standing-still player does not silently leave `attack` because movement says idle', () => {
    const { world, input } = grounded();
    latchAttackPress(input);
    tick(world, input);
    expect(world.player.state).toBe('attack');

    // Walk into the swing: movement wants `run`, combat must win.
    input.right = true;
    for (let i = 1; i < attackTotalTicks(ATTACK); i += 1) {
      tick(world, input);
      expect(world.player.state).toBe('attack');
    }
  });

  it('ignores a second press while already swinging — no cancel, no restart', () => {
    const { world, input } = grounded();
    latchAttackPress(input);
    tick(world, input);

    latchAttackPress(input);
    tick(world, input);
    // If the second press restarted the swing, the counter would be back at its first tick and the
    // move would end late. Assert on where the swing ENDS.
    //
    // The swing occupies `attackTotalTicks` ticks and is RELEASED on the one after — the tick that
    // finds the window closed. So the total is `attackTotalTicks + 1`, and two have already run.
    for (let i = 2; i < attackTotalTicks(ATTACK); i += 1) {
      tick(world, input);
      expect(world.player.state).toBe('attack');
    }
    // Ticks 1..attackTotalTicks are the swing; the release happens on the NEXT one, the tick that
    // finds the window closed. If the second press had restarted the move, this tick would still
    // be `attack`.
    tick(world, input);
    expect(world.player.state).toBe('idle');
  });
});

describe('damage, hitstun and i-frames', () => {
  it('taking a hit costs hp, enters `hurt`, and opens the i-frame window', () => {
    const { world, input } = grounded();
    const before = world.player.hp;

    expect(damagePlayer(world.player, 10)).toBe(true);
    expect(world.player.hp).toBe(before - 10);
    expect(world.player.state).toBe('hurt');
    expect(invulnerable(world.player)).toBe(true);

    void input;
  });

  it('hitstun lasts exactly HURT_TICKS and then returns control', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);

    for (let i = 0; i < HURT_TICKS; i += 1) {
      expect(world.player.state).toBe('hurt');
      tick(world, input);
    }
    expect(world.player.state).not.toBe('hurt');
  });

  /**
   * **Criterion 5.6, both endpoints.** The fixture outlasts the window, and the last tick inside it
   * and the first tick outside it are asserted separately — a length-only check passes an i-frame
   * window that ends one tick early.
   */
  it('i-frames span their full window and then stop, both ends pinned', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);

    const open: number[] = [];
    for (let i = 0; i < IFRAME_TICKS * 2; i += 1) {
      if (invulnerable(world.player)) open.push(i);
      tick(world, input);
    }

    expect(open.length).toBe(IFRAME_TICKS);
    expect(open[0]).toBe(0);
    expect(open[open.length - 1]).toBe(IFRAME_TICKS - 1);
  });

  it('i-frames outlast hitstun, so recovery is not a free second hit', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);
    for (let i = 0; i < HURT_TICKS; i += 1) {
      tick(world, input);
    }
    expect(world.player.state).not.toBe('hurt');
    expect(invulnerable(world.player)).toBe(true);
  });

  it('refuses damage while invulnerable — hp does not move', () => {
    const { world } = grounded();
    damagePlayer(world.player, 10);
    const afterFirst = world.player.hp;

    expect(damagePlayer(world.player, 10)).toBe(false);
    expect(world.player.hp).toBe(afterFirst);
  });

  it('accepts damage again the tick after i-frames close', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);
    for (let i = 0; i < IFRAME_TICKS; i += 1) {
      tick(world, input);
    }
    expect(invulnerable(world.player)).toBe(false);
    expect(damagePlayer(world.player, 10)).toBe(true);
  });
});

describe('hitstun locks movement — W3', () => {
  it('vx stays 0 with a direction held through the lock, and moves once it opens', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);
    input.right = true;

    for (let i = 0; i < HURT_LOCK_TICKS - 1; i += 1) {
      tick(world, input);
      expect(world.player.vx).toBe(0);
    }
    tick(world, input);
    expect(world.player.vx).toBeGreaterThan(0);
  });

  /**
   * Pins the exact tick control returns, not merely that it does — an existence check ("did it
   * unlock") passed while a documented window was off by one elsewhere in this project. `dir` is
   * read from `movementLocked` right after step 4b has advanced `combatCounter` (tick.ts), so on
   * tick call `k` the counter the predicate sees is `k`; the lock covers `k` in `1..HURT_LOCK_TICKS
   * - 1` and opens at `k === HURT_LOCK_TICKS` — one tick short of a naive "6 calls locked" reading,
   * because `damagePlayer` sets `combatCounter = 0` OUTSIDE any tick, so the `counter === 0`
   * instant of the window is never observed by a call inside `tick()`.
   */
  it('the last locked tick and the first free tick are adjacent, with no gap or overlap', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);
    input.right = true;

    for (let k = 1; k < HURT_LOCK_TICKS; k += 1) {
      tick(world, input);
      expect(world.player.vx).toBe(0); // last locked tick is k === HURT_LOCK_TICKS - 1
    }
    tick(world, input); // k === HURT_LOCK_TICKS — the first free tick
    expect(world.player.vx).toBeGreaterThan(0);
  });

  it('the attack edge stays blocked for the full HURT_TICKS, not just the movement lock', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);
    // Latched ONCE: consumed and refused on the first tick below (canAct is false), so it cannot
    // still be pending on the release tick and mask this test behind the pre-existing edge case
    // where a press queued on the exact tick `hurt` releases is honoured that same tick — a
    // different, already-shipped rule this item must not touch.
    latchAttackPress(input);

    for (let i = 0; i < HURT_TICKS - 1; i += 1) {
      expect(canAct(world.player)).toBe(false);
      tick(world, input);
      expect(world.player.state).toBe('hurt');
    }
    tick(world, input);
    expect(world.player.state).not.toBe('attack');
    expect(canAct(world.player)).toBe(true);
  });

  /**
   * FIX 1 (QA gate, session 8): hitstun locked `dir` (step 5) but never gated step 7's jump
   * resolution, so a jump pressed on the first locked tick fired anyway — measured against the
   * real sim as `vy: -48.6, grounded: false` while `state: 'hurt'`. Movement returns at the same
   * tick horizontal control does, so the jump gate is the same `movementLocked` predicate.
   */
  it('a jump pressed during hitstun does not fire — vy and grounded stay put through the lock', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);
    latchJumpPress(input);

    for (let k = 1; k < HURT_LOCK_TICKS; k += 1) {
      tick(world, input);
      expect(world.player.vy).toBe(0);
      expect(world.player.grounded).toBe(true);
    }
  });

  /**
   * Pins WHICH tick the jump becomes available again — an existence check ("did a jump happen")
   * cannot verify a timing claim (project rule, see `tick.ts` header). The lock opens at
   * `k === HURT_LOCK_TICKS`, the same tick horizontal control returns (test above this describe
   * block), so the jump must not fire before it and must be free to fire from it.
   */
  it('the jump becomes available on exactly the tick the lock lifts, not before', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);
    latchJumpPress(input);

    for (let k = 1; k < HURT_LOCK_TICKS; k += 1) {
      tick(world, input);
      expect(movementLocked(world.player)).toBe(true);
      expect(world.player.vy).toBe(0);
    }
    tick(world, input); // k === HURT_LOCK_TICKS — the first free tick
    expect(movementLocked(world.player)).toBe(false);
    expect(world.player.vy).toBeLessThan(0);
    expect(world.player.grounded).toBe(false);
  });

  /**
   * DECISION (b): the jump edge is consumed and the buffer window armed at step 2/3 exactly as
   * always — hitstun gates only step 7's EXECUTION, not the latch. So a press made during the lock
   * is not discarded; it survives in the buffer and fires the instant the lock lifts, same as any
   * other jump the player is not yet able to take (grounded/coyote already work this way). Option
   * (a) — consuming and discarding the press during the lock — was rejected: it would silently eat
   * a buffered jump, contradicting the buffer's own documented purpose (`tick.ts`: "a press is
   * remembered ... and fires the moment the player is next able to jump"). This test pins (b): the
   * press from the first locked tick is still alive HURT_LOCK_TICKS ticks later.
   */
  it('a buffered press made during hitstun fires when the lock lifts, not discarded', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, 10);
    latchJumpPress(input); // pressed on the very first locked tick
    tick(world, input); // k === 1, locked — the press must NOT fire yet (rules out no gate at all)
    expect(world.player.vy).toBe(0);
    expect(world.player.grounded).toBe(true);

    for (let k = 2; k < HURT_LOCK_TICKS; k += 1) {
      tick(world, input);
    }
    tick(world, input); // k === HURT_LOCK_TICKS — the buffer must still hold it (rules out option (a))
    expect(world.player.vy).toBeLessThan(0);
    expect(world.player.grounded).toBe(false);
  });

  it('locks movement the same way airborne', () => {
    const { world, input } = grounded();
    latchJumpPress(input);
    tick(world, input); // leaves the ground
    expect(world.player.grounded).toBe(false);

    damagePlayer(world.player, 10);
    input.right = true;

    for (let k = 1; k < HURT_LOCK_TICKS; k += 1) {
      tick(world, input);
      // Locked: horizontal velocity does not move toward the held direction while airborne either.
      expect(movementLocked(world.player)).toBe(true);
      expect(world.player.vx).toBe(0);
    }
    tick(world, input);
    expect(movementLocked(world.player)).toBe(false);
    expect(world.player.vx).toBeGreaterThan(0);
  });
});

describe('death', () => {
  it('hp reaching zero enters `death` and stays there', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, world.player.maxHp);

    expect(world.player.hp).toBe(0);
    expect(world.player.state).toBe('death');

    for (let i = 0; i < DEATH_TICKS - 1; i += 1) {
      tick(world, input);
      expect(world.player.state).toBe('death');
    }
  });

  it('hp never goes below zero, however large the hit', () => {
    const { world } = grounded();
    damagePlayer(world.player, world.player.maxHp * 10);
    expect(world.player.hp).toBe(0);
  });

  it('a dead player does not accept an attack input', () => {
    const { world, input } = grounded();
    damagePlayer(world.player, world.player.maxHp);
    latchAttackPress(input);
    tick(world, input);
    expect(world.player.state).toBe('death');
  });
});
