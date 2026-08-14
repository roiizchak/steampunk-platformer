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
import { createWorld, tick } from '../../src/sim/tick';
import { advance } from '../../src/sim/tick';
import type { InputSnapshot, TickEvents, World } from '../../src/sim/types';

const FLOOR = [{ x: 0, y: 960, w: 8000, h: 120 }];
const SPAWN = { x: 1000, y: 960 };

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
   * 🔴 The assertion the defect fails, and it is written per-field rather than as a spot check on
   * `respawned`: the same omission would have hidden `attackStarted` just as completely.
   *
   * For each declared edge, a batch that contains a tick emitting it must report it. Rather than
   * constructing a scenario per event — several of which need contrived state — this drives a real
   * scenario and asserts the equivalence directly: **whatever the individual ticks emitted, the
   * batch reports the OR of it.** That is the whole contract, stated once.
   */
  it('reports the OR of what the individual ticks emitted, field by field', () => {
    const scenario = (): { world: World; input: InputSnapshot } => {
      const world = fresh();
      // A death by hazard, so the batch spans a kill, the whole death window and the respawn — which
      // is the longest chain of edges the sim can produce, and the one `respawned` lives at the end of.
      world.player.hp = 1;
      world.hazards = [{ x: SPAWN.x - 100, y: 900, w: 200, h: 200 }];
      const input = createSnapshot();
      input.jumpHeld = true;
      input.jumpPressed = true;
      input.attackPressed = true;
      return { world, input };
    };

    const TICKS = 90;

    // Lane 1: one tick at a time, accumulating by hand — the ground truth.
    const byHand = scenario();
    const expected: Record<string, boolean> = {};
    for (const key of declaredFields()) expected[key] = false;
    for (let i = 0; i < TICKS; i += 1) {
      const events = tick(byHand.world, byHand.input);
      for (const key of declaredFields()) {
        expected[key] = expected[key] || (events[key] as boolean);
      }
    }

    // Lane 2: the same scenario through `advance()`. Same seed, same solids, same input object,
    // so the two lanes are the same run — the sim is a pure function of (state, input).
    const byAdvance = scenario();
    const got = advance(byAdvance.world, byAdvance.input, TICKS) as unknown as Record<string, boolean>;

    for (const key of declaredFields()) {
      expect(
        got[key],
        `advance() dropped "${key}": the individual ticks emitted ${expected[key]} and the batch ` +
          `reported ${got[key]}. A field added to TickEvents and not accumulated compiles, passes ` +
          `every other test, and shows up as a rendering artifact.`,
      ).toBe(expected[key]);
    }
  });

  /**
   * Non-vacuity. The comparison above is only worth making if the scenario actually FIRES several
   * of these edges — two lanes that both report all-false agree perfectly and prove nothing.
   */
  it('...and that scenario really does emit more than one kind of edge', () => {
    const world = fresh();
    world.player.hp = 1;
    world.hazards = [{ x: SPAWN.x - 100, y: 900, w: 200, h: 200 }];
    const input = createSnapshot();
    input.jumpHeld = true;
    input.jumpPressed = true;
    input.attackPressed = true;

    const got = advance(world, input, 90) as unknown as Record<string, boolean>;
    const fired = declaredFields().filter((key) => got[key]);
    expect(fired.length, `only ${fired.join(', ') || 'nothing'} fired`).toBeGreaterThanOrEqual(2);
    expect(fired, 'the respawn is the edge this file was written for').toContain('respawned');
  });
});
