/**
 * **Criterion 12.11's bounds and its paired-arm machinery.**
 *
 * ⚠️ Deliberately NOT in `perfBudget.ts`. That file holds what Phases 5, 6 and 7 measured, and a
 * Phase 12 number filed beside them would read as one of theirs — the same reasoning `levelPerf.ts`
 * gives for keeping Phase 8's bounds out of it. These are about the cost of the touch CONTROLS,
 * which is a question only this phase asks.
 *
 * ## 🔴 Why the old statistic was replaced rather than re-bounded
 *
 * 12.11 shipped as *frames served with the controls drawn, against 90 % of a control arm*. Both
 * `performance-engineer` briefs reached the same conclusion independently and they were right: **a
 * frames-served ratio against a vsync-locked display cannot order its own mutation.**
 *
 * At 240 Hz the frame period is 4.1667 ms. A frame either makes its deadline or costs a whole
 * period, so the served rate is `R / (1 + p)` for an overrunning fraction `p`, and red at 0.9 needs
 * `p >= 11.1 %`. A CONSTANT per-frame cost — which is exactly what a dozen extra display-list
 * entries are — never produces a partial `p`: below the headroom every frame makes it and the ratio
 * is 1.000, above it every frame misses and the ratio is 0.500. **Nothing lands between**, so 0.60,
 * 0.75 and 0.95 would all behave identically and the 10 % figure was not load-bearing. The invisible
 * band is roughly [0, 2.7 ms] of added per-frame cost — 65 % of this box's frame budget, and a drop
 * to ~30 fps on the owner's 60 Hz laptop.
 *
 * *A statistic that does not order its own mutation cannot be fixed by moving the bound.* So the
 * criterion-bearing statistic is an ABSOLUTE paired per-frame delta in milliseconds, the shape
 * `phase-08-gpu-delta.spec.ts` was red-proved on.
 *
 * ⚠️ The frames-served and baseline-floor assertions are KEPT, not swapped out. They catch a dropped
 * frame and a collapsed baseline, which a delta cannot; the spec's own docstring already said they
 * were worth running.
 *
 * ## The bounds, and why these numbers
 *
 * 🔴 **Fixed before any selection run.** A tolerance chosen after looking at a clean set, with an
 * amplifier sized to clear it, is a gate that cannot fail — the bound and the evidence would be
 * chosen together. So the tolerance is a stated fraction of the frame budget and the runs confirm
 * two things only: that the clean delta sits well under it, and that the amplifier orders every
 * pair. If a clean run does not fit, that is a finding, not a licence to move the number.
 */

import { expect, type Page } from '@playwright/test';

import { type Sample, sample } from './perfSampler';

/** The 60 Hz frame budget the owner actually plays against. This box's is 4.167 ms. */
export const FRAME_BUDGET_MS = 1000 / 60;

/**
 * How much extra rasteriser time per frame the controls may cost.
 *
 * **3 % of the 60 Hz budget**, and the same 0.5 ms Phase 8 fixed for `MAX_LEVEL_GPU_DELTA_MS` —
 * precedent rather than invention. The controls are one image and one zone per button over a HUD
 * that already draws; a regression that mattered (a per-frame layout recompute, a re-created hit
 * area, a filter) costs far more than 3 % of a frame.
 */
export const MAX_TOUCH_GPU_DELTA_MS = 0.5;

/**
 * The same fraction on the MAIN THREAD — but on the MEDIAN of the pairs, not on each pair.
 *
 * A GPU delta is blind to a cost that is all JavaScript, which is the more likely shape of a touch
 * regression: `refresh()` running per frame instead of per state change would move `workMedianMs`
 * and leave the rasteriser untouched. So the statistic is kept and bounded.
 *
 * 🔴 **Per-pair, it is not a bound on the controls — the held-out sweep proved that.** Measured
 * per-frame main-thread work here is **0.8-0.9 ms**, and Chrome clamps `performance.now()` to
 * **0.1 ms**, so `workMedianMs` is a median over a nine-quantum grid. A +/-0.5 ms per-pair band is
 * +/-5 quanta of a 9-quantum quantity — over half of it. Across 16 recorded pairs the delta sat
 * inside +/-0.2 ms fifteen times and once read **exactly -0.5000 ms**, failing on float dust
 * (`0.5000000238414941`), while the median of that same run's four pairs read -0.1000 ms.
 *
 * *A perf bound is chosen on one set of runs and confirmed on a HELD-OUT set*, and the held-out set
 * disagreed. The response is not to move the number: the MEDIAN of four pairs has about half the
 * spread and carries the criterion, and the collapse it cannot see is checked directly instead,
 * as `MIN_TOUCH_ARM_CPU_MS` on each arm's own median.
 */
export const MAX_TOUCH_CPU_DELTA_MS = 0.5;

/**
 * A LOWER floor on each arm's own main-thread median — an instrument-validity check.
 *
 * 🔴 **This replaces a per-pair delta band that could not do the job it claimed.** The per-pair
 * main-thread check was `|delta| < 2 ms`, described as a collapse guard. It is not one: the arms
 * measure 0.8-0.9 ms, so an arm collapsing all the way to **zero** produces a delta of about 0.9 ms
 * and passes a 2 ms band comfortably. Calling a post-data band a collapse detector when the collapse
 * it names cannot reach it is the decoration this repository keeps finding. Codex round 14,
 * finding 9.
 *
 * A collapse is an ABSOLUTE property of one arm, so it is checked as one: each arm must report at
 * least this much per-frame main-thread work. Chrome's `performance.now()` grid is 0.1 ms and the
 * arms sit at 8-9 quanta, so 0.2 ms is two quanta — far below any real measurement here, and
 * unreachable by an arm that stopped measuring.
 */
export const MIN_TOUCH_ARM_CPU_MS = 0.2;

/**
 * An absolute ceiling on the touch arm's OWN median, not a difference.
 *
 * 🔴 A delta has no baseline. Halve the frame rate in both arms — anything in `UIScene.update()`,
 * the renderer, an asset — and the delta stays 0.000 while the game is broken. Phase 7's G32 finding
 * is this exact failure: `audioCues` left in both arms moved each median 2 ms and the delta read
 * 0.000. Half the 60 Hz budget is a generous ceiling that still catches a collapse.
 */
export const MAX_TOUCH_ARM_GPU_MS = 8;

/**
 * The same absolute ceiling on the touch arm's own MAIN-THREAD median.
 *
 * 🔴 **The CPU twin of `MAX_TOUCH_ARM_GPU_MS`, and it was missing.** `cpuDelta` is a pure paired
 * difference, so it has the identical hole the GPU ceiling exists to close: a cost added to BOTH
 * arms divides out and the delta reads 0.000 while the game is broken — Phase 7's G32 finding. The
 * only other backstops are a 50 fps floor and a frames-served ratio, and this file's own header
 * argues at length that frames served against a vsync-locked display is blind to a constant
 * per-frame cost below the headroom band. `performance-engineer` brief 1, finding 2.
 *
 * **8 ms**, the figure `perfBudget.ts:179` fixed for `MAX_FLEET_WORK_MS` for exactly this job —
 * precedent rather than invention, and about nine times the 0.8-0.9 ms either arm measures clean.
 */
export const MAX_TOUCH_ARM_CPU_MS = 8;

/**
 * Pairs per run, and it is EVEN on purpose.
 *
 * AB/BA counterbalancing only cancels order effects across a whole number of AB+BA blocks. An odd
 * count leaves one unmatched ordering, which is a residual bias correlated with the arm.
 */
export const PAIRS = 4;

/** Sim ticks each sampling window spans. Both arms span the same, or nothing compares. */
export const TOUCH_SAMPLE_TICKS = 180;

/**
 * Ticks the woken arm runs BEFORE the window opens, so the wake transient is not inside it.
 *
 * Expressed in ticks and waited on as a condition — never `waitForTimeout`, which this suite has
 * produced both a false green and a false red with.
 */
export const SETTLE_TICKS = 30;

type Loop = { loop: { sleep(): void; wake(seamless?: boolean): void } };

/** Stop a page's game loop — rAF and renderer both. `TimeStep.sleep()` calls `raf.stop()`. */
export async function sleepLoop(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __phaserGame: Loop }).__phaserGame.loop.sleep());
}

/** Restart it. Always in a `finally`, so a failed assertion cannot leave a page asleep. */
export async function wakeLoop(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __phaserGame: Loop }).__phaserGame.loop.wake());
}

/** The live sim tick, from the eight-field debug surface. No ninth field is needed for any of this. */
export async function tickOf(page: Page): Promise<number> {
  return page.evaluate(() => window.__game?.tick ?? -1);
}

/**
 * Sample ONE arm with the other arm's loop stopped, and prove the isolation rather than command it.
 *
 * 🔴 **`bringToFront()` and `visibilityState` do not stop the inactive renderer.** Both browser
 * contexts stay alive and rendering — Playwright ships `--disable-backgrounding-occluded-windows` —
 * so total system load is `2·base + C` in both samples and a GPU-bound cost divides out exactly.
 * *An A/B toggle bounds only what differs between the arms.* Stopping the idle loop is what makes
 * the difference the controls.
 *
 * And a wrong-page call or an ineffective `sleep()` would silently restore that cancellation while
 * every assertion still passed, so the idle arm's tick is asserted FROZEN across the window and the
 * active arm's asserted to advance. Codex plan review, round 3.
 */
export async function sampleArm(
  active: Page,
  idle: Page,
  label: string,
): Promise<Sample> {
  await sleepLoop(idle);
  await wakeLoop(active);
  await active.bringToFront();

  // Settle first, in ticks, so the wake transient is outside the window.
  const from = await tickOf(active);
  await active.waitForFunction(
    (t) => (window.__game?.tick ?? 0) > (t as number),
    from + SETTLE_TICKS,
    { timeout: 30_000 },
  );

  const idleBefore = await tickOf(idle);
  const activeBefore = await tickOf(active);
  expect(
    await active.evaluate(() => document.visibilityState),
    `${label}: the sampled page is not visible, so it is not the page being drawn`,
  ).toBe('visible');

  // 🔴 `true` = stop submitting GPU queries when the tick window closes. The bounded drain used to
  // re-arm the timer on every one of its frames, so renders from AFTER the window entered its
  // median. Opt-in, because Phases 5-8's bounds were fixed against the contaminated median and
  // flipping it globally would re-found four other phases' numbers. Codex round 15, finding 5.
  const result = await sample(active, TOUCH_SAMPLE_TICKS, true);

  expect(
    await tickOf(idle),
    `${label}: the idle arm advanced during the window — its loop is still running and its GPU work ` +
      'is in both samples, which is the cancellation this protocol exists to remove',
  ).toBe(idleBefore);
  expect(
    await tickOf(active),
    `${label}: the sampled arm did not advance, so the window measured a stopped game`,
  ).toBeGreaterThan(activeBefore);

  return result;
}

/** Per-pair differences, and the median of them. Same definition `levelPerf.ts` uses. */
export function pairedDeltas(bare: number[], withControls: number[]): number[] {
  return withControls.map((v, i) => v - bare[i]!);
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Hide every `Text` on the UI scene, and report how many.
 *
 * 🔴 **Because the two arms differed by more than the controls, and it showed.** The first clean run
 * measured every GPU pair NEGATIVE — the touch arm costing *less* rasteriser time than the bare one,
 * which is backwards for an arm that draws six extra faces. The cause is the help banner:
 * `gameDev.ts:helpLine()` prints `ARROWS / WASD move · SPACE / UP / W jump · SHIFT walk · F / L
 * attack · M mute · [ ] volume 100% · ESC levels` on a keyboard device and `VOLUME 100%` on a touch
 * one — about 130 glyphs against 35, at 44 px bold across two wrapped rows. That is real fill rate,
 * and it is larger than the controls.
 *
 * *An A/B toggle bounds only what differs between the arms*, and two things differed. Worse, the
 * offset ran the wrong way: a genuine +0.5 ms regression in the controls would have landed at
 * +0.35 ms and passed. Equalising the text is what makes the delta attributable to the controls,
 * which is what 12.11 actually claims.
 *
 * ⚠️ **The invariant is "neither arm draws text", not "both arms draw the same amount."** The first
 * version asserted equal counts and reddened at once: the touch arm carries three `Text` objects and
 * the bare arm one, because the rotate prompt's two lines exist on a touch device and are merely
 * invisible in landscape. An already-invisible object costs nothing in either arm, so equal counts
 * was over-strict — what has to hold is that nothing textual is DRAWN in either window.
 *
 * ⚠️ **BOTH scenes, and the first version swept only `UI`.** The help banner is built by
 * `gameHud.ts:79` against the **`Game`** scene, not `UI` — it lives there precisely so it can apply
 * the `- cam.x/y` correction `GameScene`'s displaced camera needs. Sweeping `UI` alone moved the
 * median from -0.1188 ms to -0.1065 ms, which is nothing, because the banner was never in the sweep.
 * A helper that reports a count and hides the wrong objects is the shape of a green no-op.
 *
 * @returns how many were visible and got hidden, and how many are still visible after the pass.
 */
export async function hideTexts(page: Page): Promise<{ hidden: number; stillVisible: number }> {
  return page.evaluate(() => {
    type Obj = { type: string; visible: boolean; setVisible(v: boolean): unknown };
    type Scene = { children: { list: Obj[] } };
    const mgr = (window as unknown as { __phaserGame: { scene: { getScene(k: string): Scene | null } } })
      .__phaserGame.scene;
    let hidden = 0;
    let stillVisible = 0;
    let seen = 0;
    for (const key of ['Game', 'UI']) {
      const scene = mgr.getScene(key);
      if (!scene) continue;
      seen += 1;
      for (const o of scene.children.list) {
        if (o.type !== 'Text') continue;
        if (o.visible) hidden += 1;
        o.setVisible(false);
      }
      stillVisible += scene.children.list.filter((o) => o.type === 'Text' && o.visible).length;
    }
    // Neither scene resolved: report an impossible count rather than a clean zero, so a caller
    // asserting `hidden > 0` reds instead of reading a no-op as an equalised pair of arms.
    return seen === 2 ? { hidden, stillVisible } : { hidden: -1, stillVisible: -1 };
  });
}

/**
 * The ONE budget decision, so the clean gate and the red proofs cannot disagree about it.
 *
 * 🔴 **They did.** The clean verdict was written out in `phase-12-perf.spec.ts` and each red proof
 * asserted its own opposite inequality against the same constant — so replacing the clean gate's
 * expectations with unconditional passes left both "red proofs" green, and they proved only that
 * *they* could measure a difference, never that the gate they are about could fail. Codex round 14,
 * finding 3. *A gate that cannot go red is decoration*, and a red proof that does not exercise the
 * gate is not a proof of it.
 *
 * Both directions now route through this function: the clean gate asserts `ok`, each red proof
 * asserts `!ok`. Delete the bound and every one of them changes verdict together.
 *
 * 🔴 **`policy` exists because sharing the evaluator quietly RESURRECTED a bound that had been
 * withdrawn.** The per-pair main-thread band was removed on evidence — a held-out sweep produced a
 * pair at exactly -0.5000 ms while the median of the same four read -0.1000, because `workMedianMs`
 * is a median over Chrome's 0.1 ms grid of a 0.8-0.9 ms quantity — and then the shared evaluator
 * re-applied per-pair rejection to the CPU deltas at that same +/-0.5. The rationale said
 * median-only and the code said otherwise. Codex round 15, finding 1.
 *
 * GPU is `median-and-pairs`: its per-pair spread is +/-0.2 against a 0.5 bound, which the band
 * supports. CPU is `median-only`.
 */
export function withinBudget(
  perPair: number[],
  bound: number,
  label: string,
  policy: 'median-and-pairs' | 'median-only',
): { ok: boolean; why: string } {
  const mid = median(perPair);
  const outliers = policy === 'median-and-pairs' ? perPair.filter((d) => Math.abs(d) >= bound) : [];
  const ok = Math.abs(mid) < bound && outliers.length === 0;
  return {
    ok,
    why:
      `${label}: median ${mid.toFixed(4)} ms against +/-${bound} ms (${policy})` +
      (outliers.length > 0 ? `, ${outliers.length} pair(s) outside the band` : '') +
      ` — pairs ${perPair.map((v) => v.toFixed(4)).join(', ')}`,
  };
}
