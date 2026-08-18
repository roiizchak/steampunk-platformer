/**
 * Every edge a tick can emit survives a batch of ticks.
 *
 * ## The defect
 *
 * `advance()` runs N ticks against one input snapshot and OR-accumulates the edges, because a render
 * frame can drain many ticks and a whole action can begin and end between two frames *(vault 2.5)*.
 * It did that with **three named assignments** — `jumped`, `landed`, `leftGround` — while
 * `TickEvents` had grown to **seven** fields.
 *
 * So `attackStarted`, `hitActive`, `hitLanded` and `respawned` were dropped on the way out, and
 * `GameScene.update()` — the only production caller — read `events.respawned` as **always false**.
 * The guard it gates, dropping the interpolation snapshot so a player who dies within `MAX_LEAP_PX`
 * of the spawn is not blended across the gap, could never fire. Found by the criterion 5.12 gate
 * owner, 2026-08-14.
 *
 * ## Why the test that should have caught it did not
 *
 * `respawn.test.ts` calls `tick()` directly, one tick at a time — which is the right way to assert
 * *when* a respawn happens. It never goes through `advance()`, and `advance()` is what the game
 * calls. A seam that no test crosses is a seam a field can be dropped in.
 *
 * ## What this file gates, and why it is shaped this way
 *
 * It walks the **declared** field list rather than naming fields, so adding an eighth event to
 * `TickEvents` extends this test automatically. A test that named the same seven would have to be
 * remembered too, and forgetting it is the identical mistake one layer up.
 */

import { describe, expect, it } from 'vitest';

import { createSnapshot } from '../../src/sim/input';
import { PLAYER_ATTACK_DAMAGE } from '../../src/sim/playerAttack';
import { createWorld, tick } from '../../src/sim/tick';
import { advance } from '../../src/sim/tick';
import type { InputSnapshot, TickEvents, World } from '../../src/sim/types';

const FLOOR = [{ x: 0, y: 960, w: 8000, h: 120 }];
const SPAWN = { x: 1000, y: 960 };

/**
 * Far enough that the player's swing reaches it, close enough that it never touches the player.
 *
 * 🔴 The first draft parked it at `SPAWN.x + 40`, which is inside CONTACT range: the scavenger
 * damaged the player on the same tick the swing started, `enterCombatState` overwrote `attack`
 * with `hurt`, and the hit window never opened. `ATTACK_BOX` reaches past contact-overlap
 * distance, and 1200 is the gap `player-attack.test.ts` already uses for exactly this.
 */
const IN_REACH = 1200;

const fresh = (): World =>
  createWorld({
    seed: 1,
    scale: 6,
    solids: FLOOR,
    bounds: { widthPx: 8000, heightPx: 1080 },
    spawn: SPAWN,
  });

/** The field names `noEvents()` actually declares, read off a real return rather than retyped. */
const declaredFields = (): (keyof TickEvents)[] =>
  Object.keys(advance(fresh(), createSnapshot(), 0)) as (keyof TickEvents)[];

describe('advance() carries every edge a tick can emit', () => {
  it('a zero-tick batch still returns the full field set — nothing is conditionally present', () => {
    const fields = declaredFields();
    // Seven today. The floor is what makes "the loop below iterates something" true; the exact
    // membership is asserted against TickEvents by the compiler, not restated here.
    expect(fields.length).toBeGreaterThanOrEqual(7);
    expect(fields).toContain('respawned');
    expect(fields).toContain('attackStarted');
    expect(fields).toContain('hitActive');
  });

  /**
   * The two scenarios the comparison runs over.
   *
   * TWO, because no single one reaches every edge: a player killed on tick 1 never completes a
   * swing, and a player who never dies never respawns. The first draft used only the death
   * scenario, so `hitActive` and `hitLanded` were false in BOTH lanes — they agreed perfectly, and
   * dropping their accumulation would have passed. Codex's implementation review said so about the
   * first draft of this file, and the strengthened non-vacuity check below caught it on the next
   * run: `expected [ 'landed', 'attackStarted', ... ] to include 'hitActive'`.
   */
  const SCENARIOS: Record<string, () => { world: World; input: InputSnapshot }> = {
    /** A swing that connects: an enemy parked inside the player's reach, and nothing lethal. */
    kill: () => {
      const world = createWorld({
        seed: 1,
        scale: 6,
        solids: FLOOR,
        bounds: { widthPx: 8000, heightPx: 1080 },
        spawn: SPAWN,
        enemies: [
          { slug: 'rust-scavenger', x: IN_REACH, y: SPAWN.y, patrolMin: IN_REACH, patrolMax: IN_REACH },
        ],
      });
      // The enemy is parked and blind: `detectRadius = 0` stops it chasing and `patrolSpeed = 0`
      // stops it drifting, so the only thing that happens in this scenario is the player's swing.
      const target = world.enemies.scavengers[0]!;
      target.detectRadius = 0;
      target.patrolSpeed = 0;
      // Left on exactly one blow's worth of hp, so the single swing this scenario gets also KILLS.
      // `advance()` takes one snapshot for the whole batch and `consumeAttackPress` clears the edge
      // on the first tick, so a scenario that needs two swings cannot exist here — pre-damaging the
      // target is what makes `enemyKilled` reachable at all. Phase 7, Codex plan review F7.
      target.hp = PLAYER_ATTACK_DAMAGE;
      // NO jump here. Holding jump made the player leave the ground and the swing never reached
      // its active window - `hitActive` stayed false and the strengthened check below said so.
      // A standing swing at a parked enemy is what actually lands a hit.
      const input = createSnapshot();
      input.attackPressed = true;
      return { world, input };
    },
    /** A death by hazard, spanning the kill, the whole death window and the respawn at the end. */
    death: () => {
      const world = fresh();
      world.player.hp = 1;
      world.hazards = [{ x: SPAWN.x - 100, y: 900, w: 200, h: 200 }];
      const input = createSnapshot();
      input.attackPressed = true;
      input.jumpHeld = true;
      input.jumpPressed = true;
      return { world, input };
    },
    /**
     * Damage the player SURVIVES — Phase 7's `playerHurt`.
     *
     * Separate from `death` rather than folded into it: that scenario starts on 1 hp so the first
     * hazard tick is lethal, which reaches `playerDied` and `respawned` but never `playerHurt`. Full
     * hp against the same hazard reaches the other edge. One scenario cannot do both, because they
     * are mutually exclusive by construction (`worldDamage.ts`).
     */
    hurt: () => {
      const world = fresh();
      world.hazards = [{ x: SPAWN.x - 100, y: 900, w: 200, h: 200 }];
      return { world, input: createSnapshot() };
    },
    /**
     * A player walking on the ground — Phase 7's `footstep`.
     *
     * `FOOTSTEP_TICKS.walk` is 24, so a 90-tick batch contains three footfalls. Nothing else in this
     * file moves the player horizontally, and a stationary player never plants a foot.
     */
    walk: () => ({
      world: fresh(),
      input: { ...createSnapshot(), right: true, walkHeld: true },
    }),
    /**
     * A player who runs into the level's exit — Phase 8's `levelCompleted`.
     *
     * Its own scenario because no other one can reach it: `walk` has no goal, and every scenario with a
     * goal would complete early and freeze, since `tick()` returns `noEvents()` once
     * `world.completed` is true. That freeze is exactly why this scenario is needed — a batch that
     * finishes the level stops emitting anything else, so folding a goal into `walk` would have
     * silently deleted its footsteps.
     *
     * The exit stands on the floor 400 px to the right, clear of the standing spawn box (x 934…1066),
     * and running reaches it in about 40 of the 90 ticks.
     */
    complete: () => ({
      world: createWorld({
        seed: 1,
        scale: 6,
        solids: FLOOR,
        bounds: { widthPx: 8000, heightPx: 1080 },
        spawn: SPAWN,
        goal: { x: SPAWN.x + 400, y: SPAWN.y - 288, w: 200, h: 288 },
      }),
      // Running, not walking: `walkHeld` would need more than 90 ticks to cover the distance.
      input: { ...createSnapshot(), right: true },
    }),
  };

  const TICKS = 90;

  /** Every field that fired anywhere across both scenarios, batched. */
  const firedAcrossScenarios = (): Set<string> => {
    const fired = new Set<string>();
    for (const build of Object.values(SCENARIOS)) {
      const { world, input } = build();
      const got = advance(world, input, TICKS) as unknown as Record<string, boolean>;
      for (const key of declaredFields()) if (got[key]) fired.add(key);
    }
    return fired;
  };

  /**
   * 🔴 The assertion the defect fails, written per-field rather than as a spot check on
   * `respawned`: the same omission hid `attackStarted` just as completely.
   *
   * Rather than constructing a fixture per event, this asserts the contract directly — **whatever
   * the individual ticks emitted, the batch reports the OR of it** — over both scenarios.
   */
  it.each(Object.keys(SCENARIOS))('reports the OR of what the ticks emitted, field by field (%s)', (name) => {
    const build = SCENARIOS[name]!;

    // Lane 1: one tick at a time, accumulating by hand - the ground truth.
    const byHand = build();
    const expected: Record<string, boolean> = {};
    for (const key of declaredFields()) expected[key] = false;
    for (let i = 0; i < TICKS; i += 1) {
      const events = tick(byHand.world, byHand.input);
      for (const key of declaredFields()) {
        expected[key] = expected[key] || (events[key] as boolean);
      }
    }

    // Lane 2: the same scenario through `advance()`. Same seed, same solids, same input object, so
    // the two lanes are the same run - the sim is a pure function of (state, input).
    const byAdvance = build();
    const got = advance(byAdvance.world, byAdvance.input, TICKS) as unknown as Record<string, boolean>;

    for (const key of declaredFields()) {
      expect(
        got[key],
        `advance() dropped "${key}" in the ${name} scenario: the individual ticks emitted ` +
          `${expected[key]} and the batch reported ${got[key]}. A field added to TickEvents and not ` +
          `accumulated compiles, passes every other test, and shows up as a rendering artifact.`,
      ).toBe(expected[key]);
    }
  });

  /**
   * Non-vacuity, and it is named field by field rather than counted. A count is satisfied by any
   * two; the point is that the scenarios REACH the fields that were being dropped. A field that
   * never fires agrees in both lanes and its accumulation could be deleted unnoticed.
   */
  it('...and the scenarios really do emit every edge this file exists to protect', () => {
    const fired = firedAcrossScenarios();
    // 🔴 The four Phase 7 names are here because the OR-contract test above **cannot** see them.
    // It discovers fields automatically, which sounds like it covers anything new — but it compares
    // by-hand against `advance()`, and both lanes agree on `false === false`. A field added to
    // `TickEvents` that never fires anywhere passes every other assertion in this file, and its
    // accumulation could be deleted unnoticed. Codex plan review F7 caught that before the fields
    // existed; extending this list is what closes it.
    for (const key of [
      'respawned',
      'attackStarted',
      'hitActive',
      'hitLanded',
      'playerHurt',
      'playerDied',
      'enemyKilled',
      'footstep',
      // Phase 8. Added the same day the edge was, because the OR-contract test above discovers it
      // automatically and would have compared `false === false` in every scenario — the exact hole
      // Codex's F7 described. Reached by the `complete` scenario and nothing else.
      'levelCompleted',
    ] as const) {
      expect(
        [...fired].sort(),
        `"${key}" never fired in either scenario, so the comparison above proves nothing about it`,
      ).toContain(key);
    }
  });
});
