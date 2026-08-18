/**
 * Every shipped level is COMPLETABLE, proved by simulation. Criterion 8.1's hard half.
 *
 * The graph itself — segments as nodes, simulated transitions as edges — lives in `levelGraph.ts`, with
 * the account of why Codex rejected the first design of this gate as a blocker. This file asserts.
 *
 * ## 🔴 The "one pixel too high" answer
 *
 * A schema check passes on a level whose only route is a jump one pixel past the apex. So does a check
 * that every *rise* is inside the apex, because a rise is a number and a route is a path. Here the
 * transition simply fails to prove, the target segment never enters the reachable set, and the BFS
 * reports the goal unreachable — with the segment list in the message.
 *
 * ## Vault 8.2 — two DISJOINT seed sets
 *
 * The first draft dismissed this and Codex finding F6 was right to reject that. `tick()` samples the RNG
 * at step 1 and advances enemies at 4a, **before** player movement, so a traversal is not
 * seed-independent once enemies are in the world. The seeds below are split: `TUNE_SEEDS` is what a
 * layout is iterated against while it is being authored, `GATE_SEEDS` is what the committed assertions
 * run under, and they share no member. A route that only survives its tuning seed got lucky.
 *
 * The graph here is terrain-only, so it is in fact seed-independent — which is why the sets are declared
 * in one place and `level-completable.test.ts`, where enemies are live, imports them.
 */

import { describe, expect, it } from 'vitest';

import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { derivedFeel } from '../../src/sim/derived';
import { DEFAULT_TUNING } from '../../src/sim/player';
import { ticksToMs } from '../../src/sim/index';
import { reachFrom, segments } from './levelGraph';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

/** Seeds used while authoring and iterating a layout. Never used by an assertion. */
export const TUNE_SEEDS = [11, 12, 13] as const;

/** Seeds the committed gates run under. Disjoint from TUNE_SEEDS by construction *(vault 8.2)*. */
export const GATE_SEEDS = [8201, 8202, 8203] as const;

const FEEL = derivedFeel(DEFAULT_TUNING, ticksToMs);

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

/**
 * The uniform delta the margin sweep applies.
 *
 * 🔴 **Additive, and applied to every level identically** — vault 8.5: *"any global difficulty change is
 * a uniform delta; additive preserves differences, normalisation preserves neither."* A multiplicative
 * cut would hit the levels with the tallest steps hardest and quietly turn the sweep into a test of
 * level-05 alone. This is the phase's vault 8.5 evidence, and it is the SPACING half; no global
 * difficulty knob is added, so that half of the vault item does not apply and is recorded as such in
 * `level-ramp.test.ts`.
 *
 * ⚠️ **The size of the delta is MEASURED, not chosen, and it is small.** `jumpVelocity` is 24.3 px per
 * tick and `derivedFeel` puts the apex at 449.5 px; the levels' tallest step is 4 tiles = 384 px, which
 * is 85 % of it. So the whole design headroom is 65 px of apex, and the sweep is sized at half of it:
 *
 * | delta | jumpVelocity | apex |
 * |---|---|---|
 * | 0 | 24.3 | 449.5 px |
 * | **1** | **23.3** | **413.9 px** |
 * | 1.5 | 22.8 | 396.5 px |
 * | 2 | 22.3 | 379.5 px — below the 384 px step, so every 4-tile route legitimately fails |
 *
 * The first draft used 30, on the assumption that `jumpVelocity` was in the hundreds. It is 24.3, so a
 * delta of 30 makes it NEGATIVE and the apex zero — the sweep failed on all five levels and would have
 * failed on any level ever authored. A margin test whose delta exceeds the quantity being reduced is not
 * a strict gate; it is a broken one, and the honest fix was to measure the quantity.
 */
const JUMP_MARGIN_DELTA = 1;

describe.each(LEVELS)('%s is completable, proved segment by segment', (id, level) => {
  it('has a spawn segment and a goal segment to connect', () => {
    const { segs, spawnSegment, goalSegment } = reachFrom(level, { seed: GATE_SEEDS[0] });
    // Non-vacuity: with either endpoint missing the BFS below would be answering a different question.
    expect(segs.length, `${id} derived no walkable segments at all`).toBeGreaterThan(1);
    expect(spawnSegment, `${id}: the spawn is not on any walkable segment`).toBeGreaterThanOrEqual(0);
    expect(goalSegment, `${id}: the exit stands on no walkable segment`).toBeGreaterThanOrEqual(0);
  });

  /**
   * 🔴 The gate. BFS from the spawn's segment must reach the goal's.
   *
   * Run under every gate seed. The graph is terrain-only so the seeds should not matter — asserting it
   * across all three is what would catch the day that stops being true.
   */
  it.each(GATE_SEEDS)('the goal is reachable from the spawn (seed %i)', (seed) => {
    const { segs, reachable, spawnSegment, goalSegment } = reachFrom(level, { seed });
    expect(
      reachable.has(goalSegment),
      `${id}: no proved route from the spawn segment (${spawnSegment}) to the goal segment ` +
        `(${goalSegment}). ${reachable.size} of ${segs.length} segments are reachable. This is the ` +
        '"one pixel too high" failure: some transition on the only route could not be proved with the ' +
        'real sim, so the goal dropped out of the reachable set.',
    ).toBe(true);
  });

  /**
   * The fast pre-filter, kept from the first draft because it localises a bad edit before the graph
   * runs. It is strictly weaker than the BFS — a rise inside the apex says nothing about whether the
   * platform is connected to anything — so it is a diagnostic, not the gate.
   */
  it('every step between consecutive surface heights is inside the measured apex', () => {
    const tops = [...new Set(segments(level).map((s) => s.y))].sort((a, b) => b - a);
    expect(tops.length).toBeGreaterThan(1);
    for (let i = 1; i < tops.length; i += 1) {
      const rise = tops[i - 1]! - tops[i]!;
      expect(
        rise,
        `${id}: a ${rise}px step exceeds the measured ${FEEL.apexPx}px apex — unreachable`,
      ).toBeLessThanOrEqual(FEEL.apexPx);
    }
  });

  /**
   * 🔴 Nothing gated gear reachability before Phase 8, and the old generator said so out loud: *"a gear
   * somewhere unjumpable would ship"*. Every gear must sit over a segment the BFS actually reached — not
   * merely over *a* segment, which a cut-off platform would satisfy.
   */
  it('every gear is actually COLLECTED by some proved transition', () => {
    const { collectableGears } = reachFrom(level, { seed: GATE_SEEDS[0] });
    expect(level.gears.length, `${id} ships no gears`).toBeGreaterThan(0);
    const stranded = level.gears
      .map((g, i) => [i, g] as const)
      .filter(([i]) => !collectableGears.has(i))
      .map(([, g]) => `(${g.x},${g.y})`);
    expect(
      stranded,
      `${id}: no proved transition from a reachable segment ever touched these gears, so they can ` +
        'never be collected and the level cannot be 100 %-ed.',
    ).toEqual([]);
  });

  /**
   * 🔴 The margin sweep — vault 8.5's spacing evidence.
   *
   * The route must survive a uniform additive reduction in `jumpVelocity`. A level that connects only at
   * exactly the shipped jump is a level one balance change away from being uncompletable, and the whole
   * point of proving completability with the real sim is that the sim is allowed to change.
   */
  // ⚠️ Every gate seed, not just the first. The terrain graph builds a world with no enemies and is
  // therefore seed-independent today — but the main reachability assertion above sweeps all three, and
  // a margin proved under one seed while its own gate sweeps three is an inconsistency waiting to
  // become a hole the day this harness grows anything stochastic. Named by the qa-expert brief 2.
  it.each(GATE_SEEDS)(`the route still connects with jumpVelocity reduced by ${JUMP_MARGIN_DELTA} (seed %i)`, (seed) => {
    const weaker = { jumpVelocity: DEFAULT_TUNING.jumpVelocity - JUMP_MARGIN_DELTA };
    const { reachable, goalSegment } = reachFrom(level, { seed, tuning: weaker });
    expect(
      reachable.has(goalSegment),
      `${id}: the route survives at the shipped jump and NOT with ${JUMP_MARGIN_DELTA} less. It has no ` +
        'margin — the next tuning pass would make this level uncompletable, silently.',
    ).toBe(true);
  });

  /**
   * 🔴 And the route genuinely REQUIRES the jump: with `jumpVelocity: 0` the goal must drop out.
   *
   * Without this the whole file is satisfied by a level that is one flat corridor — every segment
   * trivially reachable, every gear on the floor, the margin sweep passing because nothing is being
   * asked *(vault 9.4 — the "satisfied by deleting the hazard" shape)*.
   *
   * ⚠️ The draft this replaces counted "distinct surface heights > 1" and "a hole in the floor or
   * something raised above it". Both are satisfied by geometry the route never touches: a decorative
   * ledge in a corner is a second surface height, and neither says the PATH from spawn to exit passes
   * through any of it. The Phase 8 code-reviewer gate owner named it. Taking the jump away and
   * requiring the goal to become unreachable is the same claim asked of the route itself, using the
   * machinery already here — and it is the exact shape of the `jumpVelocity` margin sweep above, at
   * its limit.
   */
  it('needs the jump: with jumpVelocity 0 the goal is UNREACHABLE', () => {
    const { reachable, goalSegment } = reachFrom(level, {
      seed: GATE_SEEDS[0],
      tuning: { jumpVelocity: 0 },
    });
    expect(
      reachable.has(goalSegment),
      `${id}: a player who cannot jump at all still reaches the exit, so nothing on the route asks ` +
        'for one. Every proof in this file is then about a flat corridor, and the margin sweep above ' +
        'passes because a zero-jump route survives any tuning.',
    ).toBe(false);
  });
});

/**
 * 🔴 The anti-vacuity, as a committed synthetic rather than an assertion about assertions *(vault C2)*.
 *
 * Criterion 8.1 names the mutation: *raise one required platform past the proved edge, and the goal must
 * drop out of the BFS reachable set*. It cannot be built on a shipped level, because every shipped goal
 * stands on the walking surface and needs no climb — the ziggurats are optional score routes. So the
 * shape is constructed here, and both directions are asserted: a step inside the apex connects, and the
 * same step one tile higher does not.
 *
 * ⚠️ **A related mutation on the shipped data FAILED to go red, and that was the gate working.** Widening
 * level-01's first gap to 576 px and then to 1152 px left the goal reachable both times: the level's
 * 2-column wall was now standing over the new pit, and the graph proved a route floor → wall → far floor
 * off the raised ledge. A disconnect had to be built deliberately — widen the gap AND delete the bridge —
 * before the BFS went red, which it then did with "1 of 5 segments are reachable". A graph that finds a
 * route the author did not design is doing exactly what it is for.
 */
describe('the graph refuses a step past the apex', () => {
  const FLOOR = { x: 0, y: 1920, w: 6000, h: 200 };
  const SPAWN = { x: 400, y: 1920 };
  const GOAL_W = 192;

  /** A floor, one raised ledge `riseTiles` above it, and the exit standing on that ledge. */
  const climbTo = (riseTiles: number): LevelData => {
    const top = FLOOR.y - riseTiles * 96;
    return {
      ...LEVELS[0]![1],
      id: `synthetic-climb-${riseTiles}`,
      widthPx: 6000,
      heightPx: 2400,
      spawn: SPAWN,
      hazards: [],
      enemies: [],
      gears: [],
      solids: [FLOOR, { x: 2400, y: top, w: 1200, h: FLOOR.y - top }],
      goal: { x: 2800, y: top - 288, w: GOAL_W, h: 288 },
    };
  };

  it('connects when the step is inside the apex (4 tiles = 384px)', () => {
    const { reachable, goalSegment } = reachFrom(climbTo(4), { seed: GATE_SEEDS[0] });
    expect(goalSegment, 'the synthetic goal stands on no segment — the fixture is wrong').toBeGreaterThanOrEqual(0);
    expect(
      reachable.has(goalSegment),
      `a ${4 * 96}px step is inside the measured ${FEEL.apexPx}px apex and must connect, or the ` +
        'red proof below would be red for the wrong reason',
    ).toBe(true);
  });

  it('🔴 and REFUSES the same step one tile higher (5 tiles = 480px, past the apex)', () => {
    const { reachable, goalSegment } = reachFrom(climbTo(5), { seed: GATE_SEEDS[0] });
    expect(goalSegment).toBeGreaterThanOrEqual(0);
    expect(
      reachable.has(goalSegment),
      `a ${5 * 96}px step is past the measured ${FEEL.apexPx}px apex, so the goal must be unreachable. ` +
        'If this is green the BFS is not proving its edges with the sim and criterion 8.1 is decoration.',
    ).toBe(false);
  });
});

describe('the two seed sets are disjoint (vault 8.2)', () => {
  it('shares no member between tuning and gating', () => {
    const overlap = GATE_SEEDS.filter((s) => (TUNE_SEEDS as readonly number[]).includes(s));
    expect(overlap, 'a route tuned and gated under the same seed proves only that it got lucky').toEqual([]);
    expect(TUNE_SEEDS.length).toBeGreaterThan(0);
    expect(GATE_SEEDS.length).toBeGreaterThan(0);
  });
});
