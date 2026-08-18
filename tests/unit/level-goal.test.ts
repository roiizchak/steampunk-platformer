/**
 * Criterion 8.1's first half — every shipped level HAS an exit, and a bad exit is refused.
 *
 * Phase 8 added the `goal` object: a rectangle the player's box enters, which is what makes a level
 * finishable at all. This file gates the rules; `level-reach.test.ts` gates whether the exit can
 * actually be *reached*, which is a different and much harder question.
 *
 * ## Why per-fixture reasons and not just "rejected"
 *
 * `tilemap-data.test.ts` sweeps every committed fixture for "rejected, with a distinct reason". That
 * sweep cannot tell WHICH rule fired, and a rule that rejects for the wrong reason is not a gate —
 * mutation M20 survived a loose `/solid/i` assertion in exactly that way *(vault C2)*. So each goal
 * fixture is asserted against its own message, the same shape `level-entities.test.ts` uses.
 */

import { describe, expect, it } from 'vitest';
import { CAMERA_ZOOM, GAME_WIDTH, RENDER_SCALE } from '../../src/game/constants';
import { describeLevelProblem, parseLevel } from '../../src/game/tilemap';
import { PLAYER_BOX } from '../../src/sim/player';
import { BAD_LEVELS, SHIPPED_ENTRIES } from './tilemap-data-fixtures';

/** The player's standing box in world pixels — the figure vault 8.4 says to anchor prop scale to. */
const BODY_W = PLAYER_BOX.w * RENDER_SCALE;
const BODY_H = PLAYER_BOX.h * RENDER_SCALE;

describe('REJECTS a level whose exit is missing or badly placed', () => {
  const cases: [string, RegExp][] = [
    // The defect this whole phase exists to make impossible: a level nobody can finish.
    ['no-goal', /no object carries the `goal` property/],
    // Two exits would make completion depend on the order objects sit in the file.
    ['two-goals', /2 objects carry the `goal` property/],
    // A zero-size volume can never overlap the player's box, so the level would validate and simply
    // never complete — the quietest possible way to ship an unfinishable level.
    ['goal-not-a-rect', /must be a rectangle with positive size/],
    ['goal-outside-map', /is not fully inside the map/],
    ['goal-inside-solid', /is entirely inside the solid at/],
    /**
     * 🔴 The same defect built out of TWO rects, and it is not a duplicate of the line above.
     *
     * The first version of this rule asked whether any ONE solid contained the whole goal, and this
     * generator emits a mass as one collision strip per row — so an exit buried in a wall answered
     * "no" to that question and validated. The rule now samples the goal against the UNION, and this
     * fixture is what stops it sliding back: it passes the per-solid test and fails the union one.
     * Found by the Phase 8 code-reviewer gate owner.
     */
    ['goal-inside-abutting-solids', /is entirely inside the solid at/],
    /**
     * 🔴 The two Codex forced. `docs/reviews/phase-08-plan.md` F4/B2.
     *
     * A goal overlapping the spawn makes `world.completed` true on tick 1: the scripted traversal
     * proof passes without moving and the `jumpVelocity` margin sweep passes too, because a zero-jump
     * route survives any tuning. And because `respawnPlayer` restores `state: 'idle'` with full hp at
     * step 4c, step 9d's "death wins ties" guard is already false on the respawn tick — so with an
     * overlapping goal, **dying anywhere completes the level**.
     */
    ['goal-on-spawn', /overlaps the body of a player standing at the spawn/],
    // Authored so the goal is clear of the standing spawn box, or this would trip the overlap rule
    // instead and the pit rule would be ungated — the same care `enemy-over-a-pit` needed.
    ['goal-over-a-pit', /has no solid beneath it/],
  ];

  it.each(cases)('%s', (name, reason) => {
    const raw = BAD_LEVELS[`../fixtures/bad-levels/${name}.fixture`];
    expect(raw, `fixture ${name} is missing`).toBeTypeOf('string');
    expect(describeLevelProblem(JSON.parse(raw!))).toMatch(reason);
  });
});

describe('every shipped level carries a reachable-looking exit (criterion 8.1)', () => {
  it('the sweep is not vacuous: shipped levels were found', () => {
    // Without this, a glob that matched nothing makes every `it.each` below pass by running zero
    // times — the exact failure shape vault 3.1 is about.
    expect(SHIPPED_ENTRIES.length).toBeGreaterThan(0);
  });

  it.each(SHIPPED_ENTRIES)('%s declares exactly one exit, with positive size', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);
    // `parseLevel` throwing would already have failed this, but assert the TYPE before the value:
    // a `goal` of `undefined` would make every comparison below vacuously pass.
    expect(typeof level.goal.x, `${id} goal.x`).toBe('number');
    expect(typeof level.goal.y, `${id} goal.y`).toBe('number');
    expect(level.goal.w, `${id} goal width`).toBeGreaterThan(0);
    expect(level.goal.h, `${id} goal height`).toBeGreaterThan(0);
  });

  /**
   * The travel minimum, asserted HERE rather than in `describeGoalProblem`.
   *
   * An early draft made this a validator rule and it was the validator overreaching: a short level is
   * a *completable* level, and refusing to boot one is a design opinion in the hot path. It also
   * immediately refused a synthetic 112 px test fixture that had every right to be small.
   *
   * It is a real rule about levels we SHIP, though. An exit visible from the spawn makes "this level
   * is completable" a claim about nothing — the reachability graph would connect spawn to goal in one
   * hop and report success on a level that is one screen long.
   *
   * Straight-line, not "one screen to the right": a level may legitimately send the player left or up,
   * and hardcoding a direction here would be a design decision smuggled into a gate.
   */
  it.each(SHIPPED_ENTRIES)('%s puts its exit at least a viewport away from the spawn', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);
    const dx = level.goal.x + level.goal.w / 2 - level.spawn.x;
    const dy = level.goal.y + level.goal.h / 2 - level.spawn.y;
    const travel = Math.hypot(dx, dy);

    expect(
      travel,
      `${id}: the exit is ${Math.round(travel)} px from the spawn. An exit the player can see from ` +
        `the start makes "completable" a claim about nothing.`,
    ).toBeGreaterThanOrEqual(GAME_WIDTH / CAMERA_ZOOM);
  });

  /**
   * Prop scale anchored to a human figure *(vault 8.4)* — cited by this phase and, until Codex's plan
   * review found it missing (F7), absent from the plan entirely.
   *
   * The figure is the player: 132 x 288 px measured, not guessed, from `PLAYER_BOX * RENDER_SCALE`. A
   * doorway has to read as something a person walks through at true sprite size, so it is bounded on
   * BOTH sides — too short and it is a crate, too tall and it is an archway the character is lost in.
   * Asserting only a lower bound would let a 20-tile-tall exit pass.
   */
  it.each(SHIPPED_ENTRIES)('%s scales its exit to the character, not to the tile grid', (id, raw) => {
    const level = parseLevel(id, JSON.parse(raw) as unknown);

    expect(
      level.goal.h,
      `${id}: an exit ${level.goal.h} px tall against a ${BODY_H} px character does not read as a ` +
        `door someone walks through (vault 8.4)`,
    ).toBeGreaterThanOrEqual(BODY_H);
    expect(level.goal.h, `${id}: exit is over 2 characters tall`).toBeLessThanOrEqual(BODY_H * 2);
    expect(
      level.goal.w,
      `${id}: an exit ${level.goal.w} px wide is narrower than the ${BODY_W} px character`,
    ).toBeGreaterThanOrEqual(BODY_W);
  });
});
