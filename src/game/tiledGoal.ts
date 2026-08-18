/**
 * Validation for the one object that makes a level finishable: the EXIT.
 *
 * Phase 8. Its own file rather than another block in `tiledEntities.ts` — that file's header says it
 * holds "the ENTITIES a level's object layers declare — enemies and gears", and the goal is neither.
 * It is also the object with the most rationale per rule in the project, because two of its rules exist
 * only because a Codex review constructed the placements that would have made every completability
 * gate green on an unplayable level.
 *
 * Pure and engine-free like the rest of the parser: no Phaser, no I/O, already-parsed JSON in.
 *
 * ## 🔴 `describeGoalProblem` MUST be called LAST in `describeLevelProblem`, and that is not style
 *
 * `tilemap-data.test.ts` asserts all 23 committed bad-level fixtures fail for their **own distinct
 * reason** — a rule weakened into something matching nothing turns that red instead of silently losing
 * coverage *(vault C2)*. None of those fixtures carries a `goal` property, because none existed when
 * they were written.
 *
 * Call this check anywhere earlier — next to the spawn check, where it "logically belongs" — and every
 * one of those fixtures reports *"no object carries the `goal` property"* before reaching the defect it
 * was committed to demonstrate. The reason set collapses from 23 to 1, the distinct-reason gate goes
 * red, and its failure message reads like a bug in the test rather than in the call order. Codex's plan
 * review flagged this as risk 2 for the phase; last was verified by watching all 23 stay distinct after
 * the rule landed.
 *
 * Last is also right on the merits: a level with a bad spawn or an enemy over a pit has a worse problem
 * than a missing exit, and the first reason a designer sees should be the worst one.
 */

import { boolProperty, hasGroundBelow, type TiledObject } from './tiledObjects';

/**
 * Does this object claim to be the level EXIT?
 *
 * A boolean `goal` property, exactly like `solid`, `hazard`, `spawn` and `gear` — behaviour from a
 * property, never from a name *(vault 3.3)*.
 *
 * Membership is "declares the property", the same way `isEnemyObject` works and for the same reason:
 * an object that declares `goal` and gets its geometry wrong must be refused BY NAME rather than
 * becoming invisible to the validator. A goal the validator cannot see is a level with no exit, and a
 * level with no exit is the one defect this whole phase exists to make impossible.
 */
export function isGoalObject(object: unknown): boolean {
  return boolProperty(object as TiledObject, 'goal');
}

/**
 * `null` if the level's exit is loadable, otherwise a one-line reason.
 *
 * ## Why a rectangle, and why exactly one
 *
 * A RECTANGLE, not a point: the exit is a volume the player's box enters, so it is tested with the
 * same overlap the collider and the pickups use. A point would need an invented radius — a second
 * definition of size a level file could disagree with, which is precisely why gears are points and
 * their size is `GEAR_BOX`. Here the volume IS the design: a wide doorway is easier to hit than a
 * narrow one, and that is a difficulty knob a level should own.
 *
 * EXACTLY ONE, because `World.goal` is one rectangle and completion latches. Two exits would mean the
 * sim silently honoured whichever came first in the file — an ordering dependency in level data, which
 * is the class of bug `isSolidObject`'s note records the Element Editor paying for.
 *
 * ## 🔴 The spawn-overlap rule, and why it is not tidiness
 *
 * The first draft had three rules — one goal, positive size, ground below. Codex rated the result a
 * **blocker** (`docs/reviews/phase-08-plan.md`, F4/B2), because a goal overlapping the spawn passes all
 * three and makes criterion 8.1 green on a level nobody can play:
 *
 *  - `world.completed` is true on tick 1. `levelCompleted` fires, the scripted traversal proof passes
 *    without moving, and the margin sweep passes too, because a zero-jump route survives any
 *    `jumpVelocity`.
 *  - Worse, it fires on every **respawn**. `respawnPlayer` runs at step 4c and restores `state: 'idle'`
 *    with full hp, so step 9d's "death wins ties" guard is already false on the tick the player is put
 *    back. With an overlapping goal, **dying anywhere completes the level.**
 *
 * So the test uses the spawn's BOX, not the spawn point: `spawn` is the feet centre, and a body
 * standing there occupies `PLAYER_BOX` scaled by `RENDER_SCALE`, measured up from the sole.
 *
 * ## What this deliberately does NOT check
 *
 * **How far the exit is from the spawn.** An early draft refused a goal closer than one viewport, and
 * that was the validator overreaching: a short level is a *completable* level, and refusing to boot one
 * is a design opinion in the hot path. It also immediately refused a synthetic 112 px test fixture
 * that had every right to be small. The travel minimum is a property of levels we SHIP, so it is
 * asserted over `SHIPPED_ENTRIES` in `tests/unit/tilemap-data.test.ts` instead, where it can be stated
 * per level and where a fixture is not collateral damage.
 *
 * **Reachability.** `hasGroundBelow` is weak by construction — it accepts a solid 3000 px below,
 * because it answers "is this over a pit" and nothing more. Codex made exactly this point about the
 * first draft claiming otherwise. Real reachability is `tests/unit/level-reach.test.ts`, which proves a
 * path from the spawn segment to the goal segment with the actual sim.
 */
export function describeGoalProblem(
  goalObjects: TiledObject[],
  spawn: { x: number; y: number },
  bounds: { widthPx: number; heightPx: number },
  solids: TiledObject[],
  playerBox: { w: number; h: number },
): string | null {
  // Two distinct messages, because zero and two are two different authoring mistakes and
  // `tilemap-data.test.ts` asserts every committed fixture fails for its OWN reason.
  if (goalObjects.length === 0) {
    return (
      'no object carries the `goal` property — the level has no exit and can never be completed. ' +
      'Add a rectangle with `goal: true` (bool), the way `solid` and `hazard` rects are authored.'
    );
  }
  if (goalObjects.length > 1) {
    return (
      `${goalObjects.length} objects carry the \`goal\` property, expected exactly one — ` +
      `\`World.goal\` is a single rectangle, so a second exit would make completion depend on the ` +
      `ORDER objects happen to sit in the file`
    );
  }

  const goal = goalObjects[0]!;
  if (typeof goal.x !== 'number' || typeof goal.y !== 'number') {
    return 'the goal has a non-numeric position';
  }
  if (!Number.isFinite(goal.x) || !Number.isFinite(goal.y)) {
    return `the goal has a non-finite position (${goal.x}, ${goal.y})`;
  }
  // A point-authored goal, mirroring the enemy rule: a zero-size volume can never overlap the
  // player's box, so the level would validate and simply never complete.
  if (
    typeof goal.width !== 'number' ||
    typeof goal.height !== 'number' ||
    !(goal.width > 0) ||
    !(goal.height > 0)
  ) {
    return `the goal must be a rectangle with positive size — a zero-size exit can never overlap the player, got ${String(goal.width)} x ${String(goal.height)}`;
  }

  const gx = goal.x;
  const gy = goal.y;
  const gw = goal.width;
  const gh = goal.height;

  if (gx < 0 || gy < 0 || gx + gw > bounds.widthPx || gy + gh > bounds.heightPx) {
    return `the goal at (${gx}, ${gy}) ${gw} x ${gh} is not fully inside the map (${bounds.widthPx} x ${bounds.heightPx})`;
  }

  /**
   * Buried inside solid, which is different from merely touching one.
   *
   * An exit flush against the level's right wall legitimately overlaps that wall — that is what a door
   * in a wall looks like. What is unreachable is a volume with solid everywhere in it, and since the
   * player can never be inside a solid, the two boxes could never overlap.
   *
   * 🔴 Tested against the UNION, by sampling, not against each solid in turn. The first version asked
   * whether any ONE solid contained the whole goal, and two abutting rects that jointly bury the exit
   * answered no to that question every time — which is precisely how this generator emits a mass:
   * one collision strip per row. Found by the Phase 8 code-reviewer gate owner.
   *
   * A sample grid rather than a rectangle-subtraction: the question is only "is there anywhere in this
   * volume a player could be", the interior offsets below are well inside the smallest authored goal,
   * and exact coverage arithmetic over arbitrary rects is a lot of code to answer a yes/no.
   */
  const FRACTIONS = [0.1, 0.3, 0.5, 0.7, 0.9];
  const covers = (solid: TiledObject, px: number, py: number): boolean =>
    px >= (solid.x as number) &&
    py >= (solid.y as number) &&
    px <= (solid.x as number) + (solid.width as number) &&
    py <= (solid.y as number) + (solid.height as number);

  let freeSample = false;
  for (const fx of FRACTIONS) {
    for (const fy of FRACTIONS) {
      if (!solids.some((solid) => covers(solid, gx + gw * fx, gy + gh * fy))) {
        freeSample = true;
      }
    }
  }
  if (!freeSample) {
    // Named against the solid over the CENTRE, so the message points at something the author can find.
    const middle = solids.find((solid) => covers(solid, gx + gw / 2, gy + gh / 2));
    return (
      `the goal at (${gx}, ${gy}) ${gw} x ${gh} is entirely inside the solid at ` +
      `(${middle?.x}, ${middle?.y}) ${middle?.width} x ${middle?.height} — the player can ` +
      `never be inside a solid, so the exit can never be entered`
    );
  }

  // 🔴 Not overlapping the body of a player STANDING AT THE SPAWN. See the header for why this rule
  // exists and why a respawn makes an overlapping goal worse than it first looks.
  const spawnBox = {
    x: spawn.x - playerBox.w / 2,
    y: spawn.y - playerBox.h,
    w: playerBox.w,
    h: playerBox.h,
  };
  if (
    gx < spawnBox.x + spawnBox.w &&
    gx + gw > spawnBox.x &&
    gy < spawnBox.y + spawnBox.h &&
    gy + gh > spawnBox.y
  ) {
    return (
      `the goal at (${gx}, ${gy}) ${gw} x ${gh} overlaps the body of a player standing at the ` +
      `spawn (${spawnBox.x}, ${spawnBox.y}) ${spawnBox.w} x ${spawnBox.h} — the level would ` +
      `complete on tick 1, and again on every respawn`
    );
  }

  // Ground below the exit's bottom-CENTRE. Tiled's rect origin is the top-left, so passing the raw
  // fields would test a corner hanging in the air above the doorway.
  if (!hasGroundBelow(solids, gx + gw / 2, gy + gh)) {
    return `the goal at (${gx}, ${gy}) ${gw} x ${gh} has no solid beneath it — the player would fall out of the world trying to reach it`;
  }

  return null;
}

/** The exit volume, world pixels. The caller has already validated it through `describeGoalProblem`. */
export function goalRect(goalObjects: TiledObject[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const goal = goalObjects[0]!;
  return {
    x: goal.x as number,
    y: goal.y as number,
    w: goal.width as number,
    h: goal.height as number,
  };
}
