/**
 * Every shipped level is finished **without touching a single spike**.
 *
 * ## 🔴 Why this gate had to be built, rather than reused
 *
 * The user asked for the low ground between the raised masses to be spiked, so that crossing is a
 * real jump rather than a walk. That is a level-design change with one obvious way to get it wrong:
 * a spike run wider than the player can clear.
 *
 * 🔴 **The ceiling was re-measured here and it is 480 px — not the 252 px `shared.mjs` records.**
 * Both numbers are real and they do not contradict each other: Phase 8's figure came from
 * `level-traversal.test.ts` probing the retired level with the approach that file sets up, and this
 * one comes from this gate's own auto-player. Widths 192/288/384/480 px all cross with zero hits;
 * **576 px does not**.
 *
 * ⚠️ **480 px is what a FLAT run-up clears, and the shipped valley crossings are not that** — the
 * qa-expert's adversarial brief (finding B1) withdrew the stronger claim this paragraph used to
 * make. The two shipped 480 px runs sit in the valley between two raised masses: the player launches
 * from the elevated walkway, clears the spikes by **737 px** and lands **305 px past** the far edge.
 * Their width came from the mass spacing and from widening a run off a descent-landing spot — not
 * from approaching a measured ceiling. Across all 18 shipped hazards the tightest clearance anywhere
 * is 316 px, so **nothing ships near a boundary**. `shared.mjs` carries the same correction; this
 * header went on saying "sized against 480, because that is the number measured on the geometry they
 * actually ship" until Codex implementation review 2 (finding 4) noticed the withdrawal had not
 * reached it.
 *
 * The plan's first draft named three existing gates as the arbiters. The Codex plan review found
 * that **all three are blind to exactly this**, and each claim was re-verified here before the gate
 * was written:
 *
 * | gate | why it cannot see an unjumpable spike run |
 * |---|---|
 * | `level-traversal.test.ts` | reads `tests/fixtures/levels/level-01-phase07.tmj`, a frozen RETIRED level. It never touches the shipped layouts. Its own header says so. |
 * | `level-completable.test.ts` | its auto-player **takes the hits** — 100 hp plus respawn — so it tanks straight across an impassable spike run and still reports `completed`. Its `groundAhead` reads `level.solids` only, so it does not even know to jump. |
 * | `level-hazards.test.ts` | existential: *at least one* hazard per level must hurt a walking player. It says nothing about the other four. |
 *
 * So a spiked stretch nobody could cross would have shipped with the whole suite green. This is the
 * gate that decides how wide those runs may be, and the layouts were sized to what it proves.
 *
 * ## What it isolates, and what it deliberately does not
 *
 * **Enemies are off.** The same separation `level-reach.test.ts` makes for terrain: a route blocked
 * by a patrolling scavenger is a different question from a spike run nobody can jump, and a gate
 * that conflates them produces a red nobody can read. `level-completable.test.ts` already runs the
 * full world with everything live — that gate is untouched and still the one that proves the level
 * is finishable *with* its enemies.
 *
 * **This is still not a claim that a HUMAN finds the route.** That is criterion 8.2's hands-on half
 * and no unit test replaces it *(vault C4)*.
 */

import { describe, expect, it } from 'vitest';

import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { GATE_SEEDS } from './level-reach.test';
import { MAX_TICKS, autoPlay } from './levelAutoPlay';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

const CLEAN = { avoidHazards: true, withEnemies: false } as const;

describe.each(LEVELS)('%s is crossable without taking a hit', (id, level) => {
  it.each(GATE_SEEDS)('reaches the exit having never been hurt (seed %i)', (seed) => {
    const run = autoPlay(level, seed, CLEAN);

    // Order matters in the message, not the assertion: a run that never finished and a run that
    // finished bleeding are different defects, and reporting "0 hurts" on an unfinished run reads
    // like a pass.
    expect(
      run.completed,
      `${id} was not finished in ${MAX_TICKS} ticks with hazards avoided and enemies off. ` +
        `Furthest x ${Math.round(run.furthestX)} of ${level.widthPx}. With no enemies in the world ` +
        'the only things that can stop it are geometry and spikes — so a red here is a spike run ' +
        'or a gap that cannot be jumped, not an enemy in the way.',
    ).toBe(true);

    expect(
      run.hurts,
      `${id}: the route cost ${run.hurts} hit(s), the first at x ${String(run.firstHurtX)}. ` +
        'A hazard on the required route that cannot be jumped is the defect this gate exists for. ' +
        'Measured on these levels: 480 px of continuous hazard crosses clean, 576 px does not — and ' +
        'a run placed where a DESCENT lands is unavoidable at any width, because the policy only ' +
        'reacts while grounded. Three shipped runs were exactly that, and this gate found all three. ' +
        'A FOURTH class was found on 2026-08-27: four unspiked PITS sat on descent landings, and ' +
        'spiking them per the new pit rule made every one unavoidable here. The owner filled them ' +
        'in rather than move them — see `tools/gen/pitDetect.mjs` and `docs/qa/session-hud-and-pits.md`.',
    ).toBe(0);
  });
});

/**
 * 🔴 The proof that this gate can go red, built as the bound NAMES it *(C1, C2)*.
 *
 * Not a convenient mutation. 480 px was measured crossable and 576 px was not, so the fixture is a
 * **6-tile, 576 px** run laid across the level's own floor at a point the route must pass. The
 * first draft used 384 px on the strength of the stale 252 px figure and the gate passed it —
 * which is the whole argument for building the mutation and MEASURING rather than quoting.
 *
 * ⚠️ Both halves are asserted separately, because they fail for different reasons and a single
 * `completed === false` would also be satisfied by a run that died of something else entirely.
 */
describe('the hazard-free gate can report a spike run uncrossable', () => {
  const [id, level] = LEVELS[0]!;
  const TILE = 96;

  /** Across the clean opening run, past the spawn, where the route certainly goes. */
  const spikeX = level.spawn.x + TILE * 8;
  const impassable: LevelData = {
    ...level,
    hazards: [...level.hazards, { x: spikeX, y: level.spawn.y - TILE, w: TILE * 6, h: TILE }],
  };

  it('a 576 px run — over the measured 480 px ceiling — stops it', () => {
    const run = autoPlay(impassable, GATE_SEEDS[0], CLEAN);
    expect(
      run.completed && run.hurts === 0,
      `${id} with a 576 px spike run at x ${spikeX} still passed: completed=${String(run.completed)}, ` +
        `hurts=${run.hurts}. This gate cannot go red, so its green means nothing.`,
    ).toBe(false);
  });

  it('...and the SAME fixture at 2 tiles is crossable, so width is what it measures', () => {
    // 192 px, inside the 216 px standing-clearance figure. Without this the test above would pass
    // for a gate that simply refuses any added hazard, which is not the claim being made.
    const clearable: LevelData = {
      ...level,
      hazards: [...level.hazards, { x: spikeX, y: level.spawn.y - TILE, w: TILE * 2, h: TILE }],
    };
    const run = autoPlay(clearable, GATE_SEEDS[0], CLEAN);
    expect(run.completed, `${id}: a 192 px spike run should still be crossable`).toBe(true);
    expect(run.hurts, `${id}: a 192 px spike run should be crossable WITHOUT a hit`).toBe(0);
  });
});
