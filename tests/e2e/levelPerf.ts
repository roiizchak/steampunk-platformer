/**
 * Shared machinery for criterion 8.7's frame budget, split out of `phase-08-perf.spec.ts` when that
 * file reached the 400-line limit. The bounds live here with their reasoning; the spec holds the
 * three measurements that assert against them.
 *
 * ⚠️ The bounds are deliberately NOT in `perfBudget.ts`. That file holds what Phases 5, 6 and 7
 * measured, and a Phase 8 number filed beside them would read as one of theirs. These are about level
 * SIZE, which is a question only this phase asks.
 */

import type { Page } from '@playwright/test';

import { waitTicks } from './gameHarness';
import { SAMPLE_TICKS } from './perfBudget';
import { sample, type Sample } from './perfSampler';

export const PROGRESS_KEY = 'steampunk.progress';

/**
 * How much more per-frame work the biggest level may cost than the smallest.
 *
 * 2.0 against a level with 2.4x the cells, 3.7x the painted tiles and 3x the enemies. The claim being
 * gated is that the camera cull makes level SIZE nearly free — if it were not, this would be closer to
 * 2.4 than to 1. It is deliberately not 1.1: the enemy count genuinely rises across the ramp and the
 * gate must not forbid the game's own design.
 */
export const MAX_LEVEL_WORK_RATIO = 2;

/**
 * The **absolute** ceiling on the largest level's median main-thread work per frame, in milliseconds.
 *
 * 🔴 **A ratio alone is not a frame budget.** Any cost that lands in BOTH arms divides straight out of
 * `MAX_LEVEL_WORK_RATIO`, so a regression that made every level 30 ms per frame would leave the ratio
 * at 1.00 and this criterion green while the game ran at 30 fps. The Phase 8 performance-engineer gate
 * owner named it, and the project has already paid for it three times: `MAX_FLEET_WORK_MS`
 * (`perfBudget.ts`), `MAX_HUD_WORK_DELTA_MS` and `MAX_AUDIO_WORK_DELTA_MS` are the same repair applied
 * to criteria 5.11, 6.9 and 7.7 in turn.
 *
 * 8 ms — roughly half of a 60 Hz frame's 16.67 ms — matching `MAX_FLEET_WORK_MS` on the same box for
 * the same reason: level-05 measures **0.4 - 0.9 ms** clean here across repeated runs, so the bound
 * sits roughly ten times above the worst clean reading and cannot fail on driver noise, while still
 * catching the whole band a ratio is blind to.
 */
export const MAX_LEVEL_WORK_MS = 8;

/**
 * How many off-map copies of the sim's swept geometry the mutation arm adds.
 *
 * Off-map (`x + 1e6`) on purpose: the copies are swept by `resolveCollisions`, `hazardHit` and
 * `collectGears` exactly as real geometry is, and by `GearLayer.sync()` every frame — which is the
 * cost that scales with level size and therefore the cost `MAX_LEVEL_WORK_RATIO` is a claim about —
 * but they can never touch the player, so the mutation changes the frame's cost and nothing else.
 */
export const BLOAT_COPIES = 30000;

/**
 * The ceiling on the largest level's **p95** frame work, in milliseconds.
 *
 * 🔴 A median is blind to a minority of expensive frames by construction, which is the defect that
 * killed `MAX_BURST_RATIO` for criterion 5.11 — and 8.7 did not re-derive the fix for itself.
 * `SAMPLE_TICKS` is deliberately two sentry cooldowns, so every window CONTAINS two synchronised
 * volleys; level-05 has three sentries against level-01's one, so the burst is level-05-specific and
 * lands on roughly one frame in three hundred. `perfSampler` has computed `workP95Ms` all along.
 *
 * 16 ms — one whole 60 Hz frame. Deliberately not tuned to the observed value: the claim worth gating
 * is "no one-in-twenty frame misses the deadline on its own", and a bound hugging today's number
 * fails on driver noise and teaches the next reader to raise it.
 */
export const MAX_LEVEL_WORK_P95_MS = 16;

/**
 * Interleaved pairs, so drift in the machine hits both arms alike.
 *
 * 🔴 **FOUR, not three, and the arithmetic is the Codex implementation review's.** At `PAIRS = 3`
 * the AB/BA alternation runs **AB, BA, AB** — an odd number of blocks, so one order occurs twice.
 * Under steady linear drift the three pair deltas are `+d, −d, +d` and their **median is `+d`**: the
 * order bias survives the pairing completely, which is the one thing the pairing exists to remove.
 * An even count gives `+d, −d, +d, −d`, whose median is 0.
 *
 * ⚠️ `exitCostBudget.ts:84` cites this constant *"for the same reason: three is enough to median
 * over"*. Three is enough to median over and is **not** enough to balance the order, and those are
 * different properties. `perfBudgetRepaired.ts:162-169` records the same lesson being learned on
 * criterion 7.7: `PAIRS` went 3 → 6 → 10 there, and the **held-out** run is what proved 6 too few.
 */
export const PAIRS = 4;

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * **The median of the per-pair deltas — never the delta of the two medians.**
 *
 * `phase-07-perf.spec.ts` recorded the correction and `phase-09-perf.spec.ts:129-132` cites it for
 * its `PAIRS` block: two arms sampled seconds apart share whatever the machine was doing at that
 * moment, so subtracting *within* a pair cancels the drift and subtracting two medians taken minutes
 * apart does not. Medians-of-medians there could not separate a clean run from a mutated one that
 * per-pair separated with no overlap at all.
 *
 * 🔴 It lives here, beside `median`, because `phase-09-perf.spec.ts`'s **sweep** stated that
 * principle in a docstring and then reduced its own points the other way. Six back-to-back runs on
 * `ca3814f` ordered 1/6 under the delta of medians and 6/6 under this, on the same readings. A
 * primitive is harder to state and then not use than a paragraph is.
 *
 * `before` and `after` must be the same length and index-aligned: entry `i` of each is one pair.
 */
export const medianPairedDelta = (before: number[], after: number[]): number =>
  median(after.map((v, i) => v - before[i]!));

/** A save that unlocks everything, so any level can be entered directly. */
export function unlockAll(): string {
  const levels: Record<string, { completed: boolean; bestGears: number }> = {};
  for (const id of ['level-01', 'level-02', 'level-03', 'level-04']) {
    levels[id] = { completed: true, bestGears: 0 };
  }
  return JSON.stringify({ version: 1, lastLevel: 'level-01', levels });
}

/**
 * Enter `levelId` and let it settle, then sample one window of steady play.
 *
 * `mutate` runs after the level is in and before the settle, because `scene.start` rebuilds the world
 * and the layer from the parsed file — anything applied before entry is thrown away, and a "loaded"
 * arm would quietly read clean.
 */
export async function sampleLevel(page: Page, levelId: string, mutate?: (p: Page) => Promise<void>): Promise<Sample> {
  await page.evaluate((id) => {
    const game = (window as unknown as { __phaserGame: { scene: { start(k: string, d: unknown): void } } })
      .__phaserGame;
    game.scene.start('Game', { levelId: id });
  }, levelId);
  await page.waitForFunction(
    (id) => (window as unknown as { __game: { levelId: string | null; ready: boolean } }).__game.levelId === id,
    levelId,
    { timeout: 20_000 },
  );
  if (mutate) await mutate(page);
  // Settle: the first frames after a scene start include texture binds and layer creation, which belong
  // to neither arm of the comparison.
  await waitTicks(page, 60);
  return sample(page, SAMPLE_TICKS);
}

/**
 * The mutation criterion 8.7's bound NAMES: this level's size stops being free per frame.
 *
 * Two halves, because "level size costs per frame" has two mechanisms in this game and neither alone
 * clears the measurement noise on this box:
 *
 * - **the tilemap stops culling to the camera** — `skipCull` makes every cell in the level considered
 *   each frame instead of the ~220 on screen. This is the literal wording of the bound's failure
 *   message, and the whole reason a 2.4x-bigger level is expected to cost 1x.
 * - **the sim's per-tick sweeps grow with the level** — `resolveCollisions` scans `solids` twice a
 *   tick, `hazardHit` scans `hazards`, `collectGears` scans `gears`. The copies are parked at
 *   `x + 1e6 * i`, so they are swept exactly as real geometry is and can never touch the player: the
 *   mutation changes the frame's cost and nothing else about the run.
 */
export async function costLevelSize(page: Page, copies: number): Promise<void> {
  await page.evaluate((n) => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      groundLayer: { skipCull: boolean };
      world: { solids: { x: number }[]; hazards: { x: number }[]; gears: { x: number }[] };
    };
    scene.groundLayer.skipCull = true;
    const bloat = <T extends { x: number }>(list: T[]): T[] => {
      const out = [...list];
      for (let i = 1; i <= n; i += 1) for (const item of list) out.push({ ...item, x: item.x + 1_000_000 * i });
      return out;
    };
    scene.world.solids = bloat(scene.world.solids);
    scene.world.hazards = bloat(scene.world.hazards);
    scene.world.gears = bloat(scene.world.gears);
  }, copies);
}

/**
 * How much longer level-05 may take to CONSTRUCT than level-01.
 *
 * 🔴 Scene creation is the cost `sample()` structurally cannot see. `sample` starts timing at the
 * first `requestAnimationFrame` after it is installed, and `sampleLevel` settles for 60 ticks before
 * that — so `drawLevelLayer`'s `forEachTile` walk over every cell, `GearLayer.create()` and
 * `EnemyLayer.create()` have all finished before the first frame is measured. That walk is O(level
 * area), which is **exactly the quantity the steady-state ratio bound is a claim about**, and until
 * this measurement existed nothing in criterion 8.7 looked at it. Named by the Phase 8
 * performance-engineer's adversarial brief.
 *
 * 4x, against an area ratio of 4480 / 2208 = **2.03**. Creation is ALLOWED to scale with area — it
 * genuinely walks every cell once — so the bound is not 1.x; what it forbids is super-linear growth,
 * an O(n^2) tile pass being the shape that would make a sixth level unopenable.
 *
 * Measured on this box: level-01 **2.7 ms**, level-05 **3.8 ms**, ratio **1.41x** — below the area
 * ratio, which is what you would expect from a walk whose per-cell cost is dominated by the PAINTED
 * cells rather than by the empty ones.
 */
export const MAX_LEVEL_CREATE_RATIO = 4;

/**
 * The absolute ceiling on constructing the largest level, in milliseconds.
 *
 * A refusal bound rather than a measured one, in the sense `MAX_LEVEL_GEARS` uses: this is the pause
 * a player sits through between pressing ENTER on the completion panel and the next level appearing,
 * and 400 ms is where a transition stops reading as instant and starts reading as a load. It is
 * deliberately far above what this box measures — a bound that hugs today's number fails on machine
 * noise and teaches the next reader to raise it.
 */
export const MAX_LEVEL_CREATE_MS = 400;

/**
 * Wrap `GameScene.create` so it records its own duration. Call once, after boot.
 *
 * 🔴 The draft this replaces timed from `scene.start` until `__game.levelId` flipped, polling on
 * `requestAnimationFrame`. It reported **4.6 ms for both levels, a ratio of 1.00x** — which is not
 * construction cost, it is one animation frame at 240 fps. `scene.start` is queued, the build happens
 * at the top of the next frame, and the poll sees it on that same frame, so the number was the frame
 * period and nothing else. A gate that reports the same figure whatever it measures is decoration;
 * this measures `create()` itself, where the O(area) tile walk actually runs.
 *
 * `SceneManager.bootScene` calls `scene.create.call(scene, settings.data)` — looked up on the
 * instance at call time, so an own property shadows the prototype method and survives every restart.
 * (Unlike `update`, which `Systems` captures once at boot as `sys.sceneUpdate`.)
 */
export async function installCreateTimer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __phaserGame: { scene: { getScene(k: string): unknown } };
      __createMs?: number;
    };
    const scene = w.__phaserGame.scene.getScene('Game') as { create(data?: unknown): void };
    const original = scene.create.bind(scene);
    scene.create = function timed(data?: unknown): void {
      const started = performance.now();
      original(data);
      w.__createMs = performance.now() - started;
    };
  });
}

/**
 * Milliseconds spent inside `GameScene.create()` building `levelId`.
 *
 * ⚠️ Callers must ALTERNATE levels: the terminal condition is `__game.levelId`, so asking for the
 * level already loaded would resolve against a build that never happened.
 */
export async function timeLevelCreation(page: Page, levelId: string): Promise<number> {
  return page.evaluate(
    (id) =>
      new Promise<number>((resolve) => {
        const w = window as unknown as {
          __phaserGame: { scene: { start(k: string, d: unknown): void } };
          __game: { levelId: string | null };
          __createMs?: number;
        };
        w.__createMs = undefined;
        w.__phaserGame.scene.start('Game', { levelId: id });
        const poll = (): void => {
          if (typeof w.__createMs === 'number' && w.__game.levelId === id) resolve(w.__createMs);
          else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }),
    levelId,
  );
}

/**
 * **Criterion 8.7's GPU bound: the PAIRED absolute delta between the two levels, in milliseconds.**
 *
 * ## Why this replaced a ratio, and why the ratio's deletion was the wrong call
 *
 * Phase 8 shipped `MAX_LEVEL_GPU_RATIO = 2` as `median(largeGpu) / median(smallGpu)` — a ratio of two
 * **unpaired** medians-of-medians, over samples that are index-aligned pairs from an AB/BA loop and
 * are simply never subtracted pairwise. Its clean reading swung **1.073 / 0.097 / 1.304** across
 * three runs of one commit, and the 0.097 came from two windows sitting on `gpuTimer`'s reporting
 * floor. `docs/qa/phase-08-levels.md` recorded it as red-proved; it never was.
 *
 * On 2026-08-25 I deleted it, on the grounds that no GPU mutation ordered the statistic. 🔴 **That
 * conclusion was WRONG, and both perf briefs of the §10a round caught it.** The mutation I tested it
 * with was `skipCull`, and `skipCull` cannot produce fragment work: `CullTiles.js:41-47` widens the
 * cull bounds to the whole layer and `RunCull.js:47` drops only tiles with `index === -1`, so the
 * extra ~1355 quads are submitted **entirely off-screen**. A rasteriser-time statistic *should* read
 * them as free — the flat result measured the mutation, not the instrument. The same runs showed 60
 * full-screen alpha scrims ordering the paired delta every single time, per-pair and never
 * overlapping clean, which is the class of cost this bound is actually about.
 *
 * The owner's pre-approved branch was **rewrite to a paired absolute delta, or delete if no GPU
 * mutation orders it**. One does. So: rewrite.
 *
 * ## The bound
 *
 * `medianPairedDelta(smallGpu, largeGpu)` — level-05's rasteriser time minus level-01's, per pair,
 * then the median of those differences. Pairing is what kills the drift that made the ratio swing:
 * the two arms of a pair are seconds apart, the medians-of-medians are a whole run apart.
 *
 * ⚠️ **This changes criterion 8.7's unit from a ratio to milliseconds**, on a box whose own spec
 * header says absolute figures are not trustworthy. That objection is answered by the delta being a
 * DIFFERENCE taken inside a pair rather than a level: whatever the machine was doing during that pair
 * is in both terms and subtracts out. It is the same argument `medianPairedDelta`'s own docstring
 * makes, and the same one G.7b shipped on.
 *
 * Chosen on one set of runs and confirmed on a HELD-OUT set — readings in
 * `docs/qa/phase-08-levels.md`. level-05 paints 3.7x the tiles of level-01, so a positive delta is
 * EXPECTED; what is bounded is how large it may be before the extra geometry has stopped being
 * culled to the camera and started costing fill rate.
 */
export const MAX_LEVEL_GPU_DELTA_MS = 0.5;
