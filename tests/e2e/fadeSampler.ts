/**
 * The gate run-in's alpha INSTRUMENT — the per-frame sampler, and the aggregate it returns.
 *
 * **No assertions about the game live here**; they live in `session-gate-entry.spec.ts`. Split out
 * when that spec crossed the 400-line rule under the Phase 9 gate round's sampler fix, in the idiom
 * `polishSeries.ts` and `gameHarness.ts` already establish for `tests/e2e/`. The seam is instrument
 * versus claim: everything here is *how the fade is observed*, and every `expect` about what the
 * observation means stays with the spec.
 *
 * The reasoning for the RAMP-based statistic — why counting distinct alphas per animation frame was
 * a false red at this harness's ~11 fps — is in the spec's header, with the rest of the claim.
 */

/** Must match `GOAL_ENTRY_TICKS` in `src/sim/goal.ts`. The spec asserts it rather than assuming. */
export const GOAL_ENTRY_TICKS = 20;

export interface FadeReport {
  /** Did the level actually finish? Everything else is meaningless if not. */
  completed: boolean;
  samples: number;
  /** Frames on which the run-in was armed (`goalEntryTicks !== null`). */
  armedFrames: number;
  /**
   * Every distinct alpha the sprite was drawn with **while the run-in was armed**, first-seen order.
   *
   * ⚠️ The four fields below are ARMED-WINDOW statistics, and the distinction is load-bearing rather
   * than pedantic: the sampler runs from boot, so the full series also carries the i-frame flicker
   * from any hit taken on the way to the exit — which is a correct behaviour of a different feature.
   */
  alphasSeen: number[];
  /** Those that are NOT a value on the `1 - k/20` ramp. Must be empty. */
  offRamp: number[];
  /** How many were strictly between 0 and 1 — the partially-faded frames a blink cannot produce. */
  partialCount: number;
  /** True if alpha ever rose after it first fell, within the armed window. */
  roseAgain: boolean;
  finalAlpha: number;
  /** Every animation key seen while the run-in owned the body. */
  animsWhileArmed: string[];
  /** Alphas seen in the frames sampled AFTER completion latched. */
  tailAlphas: number[];
  /** The counter's first and last observed values. */
  counterRange: [number, number] | null;
}

/**
 * Install a per-frame sampler and LEAVE IT RUNNING.
 *
 * 🔴 **It has to be installed before the level is driven, and the first version was not.**
 * `playToExit` waits on `world.completed`, so a sampler started after it returns begins life on an
 * already-finished level: it saw one alpha (`0`), a counter frozen at 20, and reported *"the courier
 * was never drawn partially faded"*. That is a true statement about a window it had entirely missed,
 * and it reads exactly like a blink-out defect — two of the three shape assertions were red for a
 * feature that works.
 */
export async function startFadeSampler(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __phaserGame: { scene: { getScene(k: string): unknown } };
      __fade?: { alphas: number[]; armedAlphas: number[]; counters: number[]; anims: string[]; raf: number };
    };
    const scene = w.__phaserGame.scene.getScene('Game') as {
      playerSprite: { alpha: number; anims?: { currentAnim?: { key: string } } };
      simWorld: { completed: boolean; goalEntryTicks: number | null };
    };
    const store = { alphas: [] as number[], armedAlphas: [] as number[], counters: [] as number[], anims: [] as string[], raf: 0 };
    const step = () => {
      const alpha = Number(scene.playerSprite.alpha.toFixed(4));
      store.alphas.push(alpha);
      if (scene.simWorld.goalEntryTicks !== null) {
        // 🔴 The ARMED series, kept separately, and the three shape claims read from it.
        //
        // They used to read from `alphas`, which is every frame from boot — including the whole
        // playthrough before the run-in ever arms. Phase 9's i-frame flicker made that a false red:
        // taking a hit on the way to the exit strobes the sprite 1 -> 0.35 -> 1, so `roseAgain`
        // latched on a frame that had nothing to do with the fade. `offRamp` did NOT catch it, and
        // only by coincidence — `IFRAME_FLOOR_ALPHA` is 0.35 and `1 - 13/20` is also 0.35, so the
        // flicker's floor happened to land exactly on a step of the ramp. A gate that stays green
        // because two unrelated constants collide is one retune away from a mystery.
        store.armedAlphas.push(alpha);
        store.counters.push(scene.simWorld.goalEntryTicks);
        const key = scene.playerSprite.anims?.currentAnim?.key;
        if (key && !store.anims.includes(key)) store.anims.push(key);
      }
      store.raf = requestAnimationFrame(step);
    };
    store.raf = requestAnimationFrame(step);
    w.__fade = store;
  });
}

/** Run past completion to catch a pop-back, stop the sampler, and aggregate inside the page. */
export async function harvestFade(page: import('@playwright/test').Page): Promise<FadeReport> {
  return page.evaluate(async (entryTicks: number) => {
    const w = window as unknown as {
      __phaserGame: { scene: { getScene(k: string): unknown } };
      __fade: { alphas: number[]; armedAlphas: number[]; counters: number[]; anims: string[]; raf: number };
    };
    const scene = w.__phaserGame.scene.getScene('Game') as {
      playerSprite: { alpha: number };
      simWorld: { completed: boolean };
    };

    // 60 further frames purely to catch a pop-back after the level-complete panel appears.
    const tail: number[] = [];
    for (let j = 0; j < 60; j += 1) {
      await new Promise((r) => requestAnimationFrame(r));
      tail.push(Number(scene.playerSprite.alpha.toFixed(4)));
    }
    cancelAnimationFrame(w.__fade.raf);

    const alphas = w.__fade.alphas;
    // The three SHAPE claims are about the fade, so they read the armed series — see the sampler.
    const armed = w.__fade.armedAlphas;
    const counters = w.__fade.counters;
    const anims = w.__fade.anims;

    let roseAgain = false;
    let seenFall = false;
    for (let i = 1; i < armed.length; i += 1) {
      const delta = armed[i - 1]! - armed[i]!;
      if (delta > 0) seenFall = true;
      else if (delta < 0 && seenFall) roseAgain = true;
    }

    // Is this value a step on the `1 - k/20` ramp? Compared with a tolerance because the sprite's
    // alpha is a float and the report rounds to four places.
    const onRamp = (a: number) => {
      for (let k = 0; k <= entryTicks; k += 1) {
        if (Math.abs(a - Math.max(0, 1 - k / entryTicks)) < 1e-3) return true;
      }
      return false;
    };
    const distinct = [...new Set(armed)];

    return {
      completed: scene.simWorld.completed,
      samples: alphas.length,
      armedFrames: counters.length,
      alphasSeen: distinct,
      offRamp: distinct.filter((a) => !onRamp(a)),
      partialCount: distinct.filter((a) => a > 0 && a < 1).length,
      roseAgain,
      finalAlpha: alphas.length ? alphas[alphas.length - 1]! : Number.NaN,
      animsWhileArmed: [...anims],
      tailAlphas: [...new Set(tail)],
      counterRange: counters.length ? [counters[0]!, counters[counters.length - 1]!] : null,
    };
  }, GOAL_ENTRY_TICKS);
}
