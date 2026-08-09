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
  HURT_TICKS,
  IFRAME_TICKS,
  attackTotalTicks,
  createSnapshot,
  createWorld,
  damagePlayer,
  invulnerable,
  latchAttackPress,
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
