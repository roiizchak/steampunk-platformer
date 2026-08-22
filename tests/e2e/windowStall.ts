/**
 * The sampling window's **deadline**, its diagnosis, and the mutation that proves both.
 *
 * ## Why this exists — a gate that hangs is worse than one that reds
 *
 * `perfSampler.sample()` resolves its in-page promise on exactly one condition: `window.__game.tick`
 * advancing `tickSpan` ticks from where it started. Nothing else settles it and it carries no
 * deadline of its own, so **anything that stops the simulation stops the spec forever**. What that
 * looks like from the outside is `Error: page.evaluate: Test timeout of 600000ms exceeded` — ten
 * minutes of silence, then a message naming neither the arm, nor the sweep point, nor the cause.
 *
 * It was observed on criterion 9.5 roughly one run in six by the phase owner, and it is worth being
 * precise about the damage: a red is investigated, and a hang is **attributed to the machine**. This
 * suite has already paid for that confusion once — `playwright.config.ts`'s `workers: 1` note ends
 * *"that is the danger: it trains a reader to dismiss a red suite as 'just flaky', which is precisely
 * how a real hang would ship"*.
 *
 * ## Why the bound is here rather than inside `sample()`
 *
 * `perfSampler.ts` is at 398 of the 400-line limit and is shared by the Phase 5, 7 and 8 perf specs.
 * The rule is *split, never exempt*, so the deadline wraps the call instead of living inside it, and
 * the wrapper is what criterion 9.5's readings go through. **The same unbounded wait is still
 * reachable from every other `sample()` caller in the suite** — recorded as such in
 * `docs/qa/phase-09-polish.md`, because a fix that silently covers one caller is worse than a fix
 * that does not say which callers it left alone.
 */

import { EFFECT_SAMPLE_TICKS } from './effectBudget';
import { sample, type Sample } from './perfSampler';

type Page = import('@playwright/test').Page;

/**
 * How long one `EFFECT_SAMPLE_TICKS` window may take before it is declared stalled.
 *
 * 120 ticks is 2 s of game time and every healthy window in this suite closes in about that; the
 * bound is **30x** it, so it can only fire on a window that is not progressing at all. It is
 * deliberately not tuned to a distribution — the failure it names is unbounded, not slow.
 */
export const WINDOW_STALL_MS = 60_000;

/**
 * Diagnose a page whose sampling window is not closing, WITHOUT depending on the thing that stopped.
 *
 * 🔴 The counters are read over a 500 ms wall-clock stretch driven by `setTimeout`, never by
 * `requestAnimationFrame`: if rAF is what died, a rAF-terminated probe hangs exactly like the window
 * it was sent to explain. What comes back distinguishes the three causes that produce the same
 * ten-minute silence — the simulation stopped (`tick` frozen, frames still served), the page stopped
 * painting (frames frozen), or the storm never populated (`live` short of its target, per emitter).
 */
export async function stallReport(page: Page, target: number): Promise<string> {
  return page.evaluate(
    (want: number) =>
      new Promise<string>((resolve) => {
        const w = window as unknown as {
          __game: { tick: number; ready: boolean; bootError: string | null };
          __phaserGame: { scene: { getScene(k: string): unknown } };
        };
        const scene = w.__phaserGame.scene.getScene('Game') as unknown as {
          effects: {
            emitters(): Record<string, { getAliveParticleCount(): number; maxAliveParticles: number }>;
          };
        };
        const tick0 = w.__game.tick;
        let frames = 0;
        const count = (): void => {
          frames += 1;
          requestAnimationFrame(count);
        };
        requestAnimationFrame(count);
        setTimeout(() => {
          const per = Object.entries(scene.effects.emitters())
            .map(([k, e]) => `${k} ${e.getAliveParticleCount()}/${e.maxAliveParticles}`)
            .join(', ');
          const live = Object.values(scene.effects.emitters()).reduce(
            (n, e) => n + e.getAliveParticleCount(),
            0,
          );
          resolve(
            `over 500 ms: ${w.__game.tick - tick0} sim ticks and ${frames} animation frames; ` +
              `live ${live} of a target ${want} (${per}); ` +
              `ready ${String(w.__game.ready)}, bootError ${String(w.__game.bootError)}, ` +
              `visibility ${document.visibilityState}`,
          );
        }, 500);
      }),
    target,
  );
}

/**
 * `PERF_MUTATION=stall`: stop the simulation while the page keeps painting.
 *
 * The red proof for the bound below, and it reproduces the observed failure rather than an invented
 * one. Pausing the scene is the smallest thing that produces that state: Phaser's loop and every
 * `requestAnimationFrame` keep running — frames are still served, the storm still tops up — and only
 * `GameScene.update` stops, which is the one thing that advances `__game.tick`.
 */
export async function stallSimulation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as { scene: { pause(): unknown } };
    scene.scene.pause();
  });
}

/**
 * `sample()`, but BOUNDED — a window that never closes fails here, with the reason, in a minute.
 *
 * The abandoned `page.evaluate` is left with a handler attached rather than dropped: it settles when
 * Playwright tears the page down, and an unhandled late rejection would surface as noise on a run
 * that has already reported its real failure.
 */
export async function boundedWindow(page: Page, alive: number, label: string): Promise<Sample> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const window_ = sample(page, EFFECT_SAMPLE_TICKS);
  void window_.catch(() => undefined);
  const watchdog = new Promise<'stalled'>((resolve) => {
    timer = setTimeout(() => resolve('stalled'), WINDOW_STALL_MS);
  });
  const result = await Promise.race([window_, watchdog]);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  if (result !== 'stalled') {
    return result;
  }
  throw new Error(
    `${label}: the ${EFFECT_SAMPLE_TICKS}-tick window did not close within ${WINDOW_STALL_MS} ms. ` +
      `${await stallReport(page, alive)}`,
  );
}
