/**
 * The three ways the run-in refused to end, and the cancel that ends it.
 *
 * Split out of `goal-entry.test.ts` at the 400-line rule. That file gates the happy path — which
 * tick arms, which tick completes, what stays locked in between. This one gates every way the
 * sequence can be entered and then NOT left, which is the failure mode that matters: an armed
 * run-in owns the body, hides the character and eats the input, so a sequence that does not end is
 * a level that cannot be played.
 *
 * All three were found by driving the sim rather than by reading it, and two of them were live
 * defects at the time — see each one's own note.
 */

import { describe, expect, it } from 'vitest';
import { DEATH_TICKS, damagePlayer } from '../../src/sim/combat';
import { KNOCKBACK_SPEED } from '../../src/sim/worldDamage';
import { goalEntryAlpha } from '../../src/render/playerView';
import { GOAL_ENTRY_TICKS, containedInGoal, overlapsGoal } from '../../src/sim/goal';
import { tick } from '../../src/sim/tick';
import type { Rect } from '../../src/sim/types';
import {
  BODY_H,
  FLOOR_Y,
  GOAL,
  SPAWN,
  makeWorld,
  neutral,
  runToGate,
} from './goal-entry-fixture';

describe('the two ways the run-in refused to end, both found by driving it', () => {
  /**
   * 🔴 A REAL knockback, at the real impulse, against the real auto-run.
   *
   * `goal.ts` claimed `!overlapsGoal` covered a shove. The arithmetic says otherwise — clearing the
   * rect from the gate's mouth takes 162 px and `KNOCKBACK_SPEED` is 17.5 px/tick against a
   * `goalEntryDir` already pulling back — and driving it settled the argument: the player moved
   * **25.9 px**, the counter ran on to 25, and the courier was drawn at **alpha 0 for five ticks
   * while its box straddled the gate's left edge**.
   *
   * The assertion is the ALPHA, not the counter, because the counter is an implementation detail
   * and "invisible outside the door" is the actual claim. A fix that cancels, one that clamps the
   * ramp and one that holds the counter all satisfy it; a fix that merely widens the shove does not.
   */
  it('a real hit mid-run-in never leaves the courier invisible outside the door', () => {
    const world = makeWorld();
    runToGate(world);
    for (let i = 0; i < 8; i += 1) tick(world, neutral());
    expect(world.goalEntryTicks, 'premise: eight ticks into the fade').toBe(8);
    expect(containedInGoal(world), 'premise: and not yet inside').toBe(false);

    // What `applyWorldDamage` does on the tick a scavenger connects, at the shipped impulse.
    damagePlayer(world.player, 10);
    world.player.vx = -KNOCKBACK_SPEED;
    world.player.knockbackPending = true;

    let invisibleOutside = 0;
    for (let i = 0; i < 90; i += 1) {
      tick(world, neutral());
      if (goalEntryAlpha(world.goalEntryTicks) === 0 && !containedInGoal(world)) invisibleOutside += 1;
    }
    expect(invisibleOutside, 'ticks drawn at alpha 0 while NOT inside the doorway').toBe(0);
    expect(world.completed, 'and the hit costs the entry, it does not cost the level').toBe(true);
  });

  /**
   * 🔴 An armed run-in must END, whatever the level data does.
   *
   * Completion is an AND, so a player who overlaps the rect and can never be contained satisfies
   * neither half. The gate's checklist review drove exactly this — one solid inside the doorway,
   * `right` held for 4000 ticks — and got `counter=3938, completed=false`, alive and grounded, with
   * no input, no jump and no attack. No shipped level can reach it; nothing stopped the next one.
   */
  it('releases the player even when containment is unreachable, rather than locking forever', () => {
    const wall: Rect = { x: GOAL.x + 20, y: FLOOR_Y - BODY_H, w: 40, h: BODY_H };
    const world = makeWorld([wall]);
    const held = neutral();
    held.right = true;

    let armedRunLength = 0;
    let longest = 0;
    for (let i = 0; i < 600; i += 1) {
      tick(world, { ...held });
      if (world.goalEntryTicks === null) armedRunLength = 0;
      else {
        armedRunLength += 1;
        longest = Math.max(longest, armedRunLength);
      }
      expect(world.completed, 'it must not complete from outside the door either').toBe(false);
    }
    expect(overlapsGoal(world), 'premise: the body really is stuck against the rect').toBe(true);
    expect(containedInGoal(world), 'premise: and containment really is unreachable').toBe(false);
    expect(longest, 'the lock has to let go').toBeLessThanOrEqual(GOAL_ENTRY_TICKS * 2 + 1);
  });
});

describe('the cancel — the blocker Codex found', () => {
  it('DEATH cancels the sequence, so a respawn never inherits a locked run-in', () => {
    // Without this the respawned player auto-runs from the spawn, cannot jump, and cannot reach
    // any exit. Level 01 ships a scavenger patrol ending 96 px from its door, so it is the
    // ordinary way a run ends badly rather than a corner case.
    const world = makeWorld();
    runToGate(world);
    world.player.hp = 0;
    world.player.state = 'death';
    tick(world, neutral());
    expect(world.goalEntryTicks, 'disarmed, so the respawned player is free').toBe(null);
    expect(world.completed).toBe(false);
  });

  /**
   * The same claim, driven through the REAL death machine rather than asserted one tick in.
   *
   * 🔴 The test above writes `hp` and `state` by hand and reads the counter on the very next tick.
   * That proves the cancel BRANCH fires; it does not prove the player is playable again, which is
   * the thing G.4b actually claims. Between those two facts sit `DEATH_TICKS` of corpse, step 4c's
   * `deathWindowClosed`, and `respawnPlayer` — none of which the hand-written version executes. A
   * cancel that re-armed during the death window, or a respawn that left the lock on, would pass it.
   * Raised by the gate's adversarial QA brief.
   */
  it('a REAL death and respawn leaves the player free, opaque and able to jump', () => {
    const world = makeWorld();
    runToGate(world);
    expect(world.goalEntryTicks, 'premise: the run-in owns the body').toBe(0);

    damagePlayer(world.player, world.player.maxHp);
    // The whole corpse window plus the respawn tick, driven one tick at a time. The counter must
    // be null on every one of them — a re-arm anywhere in here is the unwinnable-level defect.
    for (let i = 0; i <= DEATH_TICKS + 1; i += 1) {
      tick(world, neutral());
      expect(world.goalEntryTicks, `death tick ${i}`).toBe(null);
    }

    expect(world.player.x, 'respawned at the spawn point, not at the door').toBe(SPAWN.x);
    expect(world.player.hp).toBe(world.player.maxHp);
    expect(world.completed).toBe(false);

    // Playable: land, then jump. A player still holding the run-in's lock cannot leave the ground.
    for (let i = 0; i < 40; i += 1) tick(world, neutral());
    expect(world.player.grounded, 'premise: back on the floor').toBe(true);
    const input = neutral();
    input.jumpPressed = true;
    input.jumpHeld = true;
    tick(world, input);
    expect(world.player.grounded, 'the respawned player can still jump').toBe(false);
  });

  /**
   * …and then actually FINISHES the level, which is the half G.4b's wording asks for.
   *
   * The test above ends at one successful jump. "Free" and "the level is still winnable" are not
   * the same claim, and the only proof of the second was on the synthetic knockback path — a
   * teleport, not a death. Raised by the gate's checklist review. This chains the whole thing:
   * armed, killed for real, respawned, driven back across the level, and completed.
   */
  it('and a really-killed player can still walk back and finish the level', () => {
    const world = makeWorld();
    runToGate(world);
    damagePlayer(world.player, world.player.maxHp);
    for (let i = 0; i <= DEATH_TICKS + 1; i += 1) tick(world, neutral());
    expect(world.player.x, 'premise: really back at the spawn').toBe(SPAWN.x);
    expect(world.completed, 'premise: and the level is not finished').toBe(false);

    runToGate(world);
    for (let i = 0; i < GOAL_ENTRY_TICKS; i += 1) tick(world, neutral());
    expect(world.completed, 'the level has to still be winnable after a death at the door').toBe(true);
    expect(containedInGoal(world)).toBe(true);
  });

  it('being knocked clean out of the gate cancels it, so nobody fades in open air', () => {
    const world = makeWorld();
    runToGate(world);
    for (let i = 0; i < 5; i += 1) tick(world, neutral());
    expect(world.goalEntryTicks).toBe(5);
    world.player.x = GOAL.x - 400; // shoved well clear of the rect
    tick(world, neutral());
    expect(world.goalEntryTicks).toBe(null);
  });

  it('re-arms cleanly after a cancel, from zero', () => {
    const world = makeWorld();
    runToGate(world);
    world.player.x = GOAL.x - 400;
    tick(world, neutral());
    expect(world.goalEntryTicks).toBe(null);
    runToGate(world);
    expect(world.goalEntryTicks).toBe(0);
    expect(world.completed).toBe(false);
  });

  it('a cancelled run still finishes the level on a second approach', () => {
    const world = makeWorld();
    runToGate(world);
    world.player.x = GOAL.x - 400;
    tick(world, neutral());
    const held = { ...neutral(), right: true };
    for (let i = 0; i < 200 && !world.completed; i += 1) tick(world, { ...held });
    expect(world.completed, 'the door still works the second time').toBe(true);
  });
});
