/**
 * The render decision — vault 2.12 (costly).
 *
 *   > "Pull render DECISIONS out of scenes into engine-free modules. Rule: 'if a scene rule has an
 *   > edge case, that's the move — not a browser test.' Last project extracted eleven."
 *
 * `playerRenderDesc` is that extraction. It answers where the box goes, how big it is, which way
 * it faces and what colour it is — all of which have edge cases (mirroring, the feet origin, the
 * scale seam) — and it answers them without importing Phaser, so this file tests them in
 * milliseconds instead of in a browser.
 *
 * The scene is then a one-liner that applies the answer. There is nothing left in it to get wrong
 * that this file cannot see.
 *
 * GUARDS, except `origin` and `does not scale velocity`, which are REPRODUCTIONS of the two
 * defaults that bite: Phaser objects default to a CENTRED origin, and scaling is easy to apply to
 * the wrong quantity *(vault C3)*.
 */

import { describe, expect, it } from 'vitest';
import { playerRenderDesc } from '../../src/render/playerView';
import { IFRAME_TICKS, PLAYER_MAX_HP } from '../../src/sim/combat';
import { GOAL_ENTRY_TICKS } from '../../src/sim/goal';
import { PLAYER_BOX } from '../../src/sim/player';
import { createWorld } from '../../src/sim/tick';
import type { PlayerSim } from '../../src/sim/types';

function playerAt(overrides: Partial<PlayerSim> = {}): PlayerSim {
  return {
    x: 400,
    y: 700,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    state: 'idle',
    ticksSinceGrounded: 0,
    ticksSinceJumpPressed: 0,
    jumpCutPending: false,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    combatCounter: 0,
    iFrameCounter: IFRAME_TICKS,
    knockbackPending: false,
    strideCounter: 0,
    strideGait: null,
    ...overrides,
  };
}

describe('playerRenderDesc (vault 2.12)', () => {
  it('places the sprite at the FEET, with a bottom-centre origin', () => {
    const desc = playerRenderDesc(playerAt(), 1);

    expect(typeof desc.x).toBe('number');
    expect(desc.x).toBe(400);
    expect(desc.y).toBe(700);

    // Phaser Game Objects default to origin 0.5/0.5. Vault 2.10 authors boxes "+y up from the
    // feet", so the render origin has to be stated explicitly or the box floats half its height
    // above the ground — the exact art-bottom / collision-bottom disagreement Phase 3 exists to
    // edit away.
    expect(desc.originX).toBe(0.5);
    expect(desc.originY).toBe(1);
  });

  it('sizes from the shared PLAYER_BOX so art and collision cannot drift apart', () => {
    const desc = playerRenderDesc(playerAt(), 1);
    expect(desc.w).toBe(PLAYER_BOX.w);
    expect(desc.h).toBe(PLAYER_BOX.h);
  });

  it('scales geometry, and only geometry (vault 2.11)', () => {
    const player = playerAt({ vx: 4, vy: -9 });
    const oneX = playerRenderDesc(player, 1);
    const threeX = playerRenderDesc(player, 3);

    expect(threeX.w).toBe(oneX.w * 3);
    expect(threeX.h).toBe(oneX.h * 3);
    // Position is a world coordinate the sim already owns — scaling it here would move the player
    // relative to the collision the sim resolved against.
    expect(threeX.x).toBe(oneX.x);
    expect(threeX.y).toBe(oneX.y);

    // And nothing in the descriptor carries a velocity at all, so there is nothing to scale.
    expect(Object.keys(oneX)).not.toContain('vx');
    expect(Object.keys(oneX)).not.toContain('vy');
  });

  it('rejects a non-positive scale rather than rendering a zero-size box', () => {
    expect(() => playerRenderDesc(playerAt(), 0)).toThrow(/scale/i);
    expect(() => playerRenderDesc(playerAt(), -2)).toThrow(/scale/i);
  });

  it('flips from facing, never from velocity', () => {
    expect(playerRenderDesc(playerAt({ facing: 1 }), 1).flipX).toBe(false);
    expect(playerRenderDesc(playerAt({ facing: -1 }), 1).flipX).toBe(true);

    // Facing is the sim's decision and survives the player coasting the other way — deriving the
    // flip from `vx` would make the sprite spin around during a knockback or a skid.
    expect(playerRenderDesc(playerAt({ facing: 1, vx: -5 }), 1).flipX).toBe(false);
    expect(playerRenderDesc(playerAt({ facing: -1, vx: 5 }), 1).flipX).toBe(true);
  });

  it('gives every state a distinct colour, so the grey-box feel check is readable', () => {
    const states = ['idle', 'run', 'jump', 'fall'] as const;
    const colours = states.map((state) => playerRenderDesc(playerAt({ state }), 1).colour);

    for (const colour of colours) {
      expect(typeof colour).toBe('number');
      expect(colour).toBeGreaterThanOrEqual(0);
      expect(colour).toBeLessThanOrEqual(0xffffff);
    }
    // Distinct: two states sharing a colour makes a stuck state machine invisible on screen,
    // which is exactly what criterion 2.8's hands-on pass is supposed to be able to notice.
    expect(new Set(colours).size).toBe(states.length);
  });

  it('describes a real player driven by the sim, not just hand-built fixtures', () => {
    const world = createWorld({ seed: 8, scale: 2 });
    const desc = playerRenderDesc(world.player, world.scale);

    expect(desc.x).toBe(world.player.x);
    expect(desc.y).toBe(world.player.y);
    expect(desc.w).toBe(PLAYER_BOX.w * 2);
  });
});

/**
 * The gate-entry fade — a RENDER decision driven by a SIM integer.
 *
 * The sim counts ticks and nothing under `src/sim/` knows the player becomes transparent. A Phaser
 * tween was the obvious alternative and is wrong twice over: it is a millisecond duration on a body
 * whose whole sequence is tick-counted (vault 2.1), and it would need cancelling on every scene
 * restart. Recomputed from the counter every frame instead, so a new level's `null` restores
 * opacity with nothing to remember and no teardown to forget.
 */
describe('the gate-entry fade', () => {
  it('is fully opaque when no run-in is running', () => {
    expect(playerRenderDesc(playerAt(), 6, null).alpha).toBe(1);
    expect(playerRenderDesc(playerAt(), 6).alpha, 'and by default, for every pre-existing caller').toBe(1);
  });

  it('pins the alpha at EVERY tick of the ramp, not just its endpoints', () => {
    // 🔴 The endpoints are worthless on their own. An instant fade, a half-strength fade and this
    // linear one all agree at 0 and at N — only the middle of the curve tells them apart, which is
    // why the mutation proofs in `docs/qa/phase-08-gate-entry.md` target this test and not the
    // two below it.
    for (let t = 0; t <= GOAL_ENTRY_TICKS; t += 1) {
      expect(playerRenderDesc(playerAt(), 6, t).alpha, `tick ${t}`).toBeCloseTo(
        1 - t / GOAL_ENTRY_TICKS,
        10,
      );
    }
  });

  it('is monotonically decreasing — it never brightens mid-sequence', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let t = 0; t <= GOAL_ENTRY_TICKS; t += 1) {
      const alpha = playerRenderDesc(playerAt(), 6, t).alpha;
      expect(alpha, `tick ${t} is brighter than tick ${t - 1}`).toBeLessThan(previous);
      previous = alpha;
    }
  });

  it('reaches exactly 0 at GOAL_ENTRY_TICKS and never goes negative', () => {
    // 0 on the earliest tick completion can fire, so the character is gone by the time the level
    // ends rather than winking out at it. Past that the sim is frozen, so the clamp is what holds
    // alpha at 0 rather than driving it below.
    expect(playerRenderDesc(playerAt(), 6, GOAL_ENTRY_TICKS).alpha).toBe(0);
    expect(playerRenderDesc(playerAt(), 6, GOAL_ENTRY_TICKS + 40).alpha).toBe(0);
  });

  it('plays the run animation for the whole sequence, whatever the sim state says', () => {
    // The sim's own state reads `fall` for a tick or two if the player entered airborne, and `idle`
    // once the dead zone stops them at the centre. The brief asks the character to RUN in, so the
    // override lives HERE rather than teaching the state machine about doorways.
    for (const state of ['idle', 'fall', 'jump', 'walk'] as const) {
      expect(playerRenderDesc(playerAt({ state }), 6, 3).animKey).toBe('brass-courier-run');
    }
  });

  it('leaves the animation key alone when no run-in is running', () => {
    // Without this the override could be unconditional and every test above would still pass.
    expect(playerRenderDesc(playerAt({ state: 'fall' }), 6, null).animKey).toBe('brass-courier-fall');
  });
});
