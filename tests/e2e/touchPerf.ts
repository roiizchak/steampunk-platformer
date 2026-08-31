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

import { TOUCH_IDS } from '../../src/render/touchLayout';
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
 * The same fraction on the MAIN THREAD, and bounded rather than merely reported.
 *
 * A GPU delta is blind to a cost that is all JavaScript, which is the more likely shape of a touch
 * regression: `refresh()` running per frame instead of per state change would move `workMedianMs`
 * and leave the rasteriser untouched.
 */
export const MAX_TOUCH_CPU_DELTA_MS = 0.5;

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

/**
 * Extra copies of the controls' own faces, drawn in the touch arm only.
 *
 * 🔴 **The controls' own textures, not scrims.** Phase 8 paid for this: its first red proof used 240
 * full-viewport alpha rectangles, and the Codex implementation review was right that this proves the
 * timer can see extreme fill-rate work, not that a regression in *the thing the bound is about* can
 * cross it. Every extra fragment here is a fragment of a touch control.
 */
export const FACE_COPIES = 40;

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

  const result = await sample(active, TOUCH_SAMPLE_TICKS);

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

/**
 * Draw `count` extra copies of every control face on the touch arm's UI scene.
 *
 * Returns the number of objects actually added, which the caller asserts — an amplifier that added
 * nothing reads as a bound failing to fire when nothing was ever drawn.
 */
export async function addFaceCopies(page: Page, count: number): Promise<number> {
  return page.evaluate(
    ([n, ids]) => {
      type Obj = { type: string; name: string; x: number; y: number; alpha: number; texture?: { key: string } };
      type Scene = {
        children: { list: Obj[] };
        add: { image(x: number, y: number, key: string): { setAlpha(a: number): { setDepth(d: number): unknown } } };
      };
      const h = (window as unknown as { __phaserGame: { scene: { getScene(k: string): Scene | null } } })
        .__phaserGame;
      const ui = h.scene.getScene('UI');
      if (!ui) return -1;
      let added = 0;
      for (const id of ids as readonly string[]) {
        const face = ui.children.list.find((o) => o.name === id && o.type !== 'Zone');
        if (!face?.texture) continue;
        for (let i = 0; i < (n as number); i += 1) {
          ui.add.image(face.x, face.y, face.texture.key).setAlpha(face.alpha).setDepth(-1);
          added += 1;
        }
      }
      return added;
    },
    [count, TOUCH_IDS] as const,
  );
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
