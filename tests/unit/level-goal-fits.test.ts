/**
 * Can the player's box actually FIT inside each shipped exit? Nothing else asks.
 *
 * The gate-entry session. `level-goal.test.ts` gates the exit's DATA — one rect, positive size, far
 * enough from the spawn — and `goal-entry.test.ts` gates the run-in's behaviour against a fixture.
 * This file is the join between them, and it exists because completion changed from OVERLAP to full
 * CONTAINMENT and that made a level's geometry able to make the level unwinnable.
 *
 * ## 🔴 The exact-equality problem, stated once
 *
 * `PLAYER_BOX.h * RENDER_SCALE` is **288**. Every shipped goal rect is **exactly 288 tall** and sits
 * flush on its floor. So `containedInGoal`'s vertical test is an exact equality at BOTH edges:
 *
 * ```
 *   top    === goal.y                 <- only while standing on that floor
 *   bottom === goal.y + goal.h
 * ```
 *
 * It works, and Codex's plan review confirmed independently that grounded play reaches it reliably
 * — `resolveCollisions` snaps `player.y` to `solid.y`, and this game has no slopes and no moving
 * platforms to drift it. But it is a razor edge, and **an exit one pixel taller than the body can
 * never be entered at all.** The level would load, validate, draw its door, and simply refuse to
 * finish.
 *
 * ## Why this is a test and not a rule in `tiledGoal.ts`
 *
 * `describeGoalProblem` validates level DATA. "Is this rect big enough for the player" is not a
 * property of level data — it is a consequence of `PLAYER_BOX` and `RENDER_SCALE`, which live in a
 * different layer and could change without any `.tmj` being touched. Teaching the validator the
 * player's size would give it a second reason to fail and a dependency it does not have today.
 *
 * A test can hold the join without either side learning about the other, and it goes red from BOTH
 * directions: the day someone authors a 240 px exit, and the day someone retunes `RENDER_SCALE`.
 *
 * ⚠️ Codex's plan review called this file "future-proofing, not current delivery" and it is right
 * that today's five levels already pass. **Recorded and kept anyway** *(C11)*: it is ten lines, and
 * the failure it prevents is an unwinnable shipped level that every other gate in this repository
 * would call fine.
 */

import { describe, expect, it } from 'vitest';
import { RENDER_SCALE } from '../../src/game/constants';
import { parseLevel } from '../../src/game/tilemap';
import { PLAYER_BOX } from '../../src/sim/player';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const BODY_W = PLAYER_BOX.w * RENDER_SCALE; // 132
const BODY_H = PLAYER_BOX.h * RENDER_SCALE; // 288

describe('every shipped goal rect admits full containment', () => {
  it('finds the shipped levels at all — an empty sweep proves nothing', () => {
    // The guard `level-goal.test.ts` carries for the same reason: `it.each([])` is silently green,
    // so a glob that stops matching would retire this whole file without a single red line.
    expect(SHIPPED_ENTRIES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(SHIPPED_ENTRIES)('%s is wide enough for the body to fit inside', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);
    // Assert the TYPE before the value: a `w` of `undefined` makes every comparison below
    // vacuously pass, which is the shape `level-goal.test.ts` already guards against.
    expect(typeof level.goal.w, `${id} goal.w`).toBe('number');
    expect(level.goal.w, `${id}: a goal narrower than the ${BODY_W}px body can never contain it`)
      .toBeGreaterThanOrEqual(BODY_W);
  });

  it.each(SHIPPED_ENTRIES)('%s is EXACTLY body-tall, so the vertical equality is reachable', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);
    expect(typeof level.goal.h, `${id} goal.h`).toBe('number');
    // Not `>=`. Taller is just as fatal as shorter: the body's top would sit BELOW `goal.y` and
    // `top >= goal.y` would hold, but `bottom <= goal.y + goal.h` needs the feet on the rect's
    // bottom edge — and the floor is what puts them there.
    expect(level.goal.h, `${id}: containment needs the rect exactly ${BODY_H}px tall`).toBe(BODY_H);
  });

  it.each(SHIPPED_ENTRIES)('%s has a solid whose top edge is flush with the exit bottom', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);
    const bottom = level.goal.y + level.goal.h;
    // Standing on that solid is the ONLY way `bottom === goal.y + goal.h` is ever true. Without a
    // floor here the player falls through the doorway and the level cannot be finished.
    const flush = level.solids.filter(
      (s) => s.y === bottom && s.x < level.goal.x + level.goal.w && s.x + s.w > level.goal.x,
    );
    expect(flush.length, `${id}: no solid at y=${bottom} spanning the exit — nothing to stand on`)
      .toBeGreaterThan(0);
  });

  it.each(SHIPPED_ENTRIES)('%s leaves a containment window the run-in can actually land in', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);
    // The auto-run's dead zone is one tick of travel wide, so the window has to be at least that
    // or the player oscillates around a centre they can never satisfy containment at.
    const window = level.goal.w - BODY_W;
    expect(window, `${id}: only ${window}px of horizontal slack`).toBeGreaterThanOrEqual(18);
  });
});
