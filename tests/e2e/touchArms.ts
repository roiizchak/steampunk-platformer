/**
 * **Two comparable arms, with the touch role NOT pinned to one browser context.**
 *
 * ## 🔴 Why this file exists
 *
 * `performance-engineer` brief 2, finding 1, and it is the explanation for an anomaly that was
 * already recorded and mis-attributed. The clean gate created `newContext({hasTouch:true})` first
 * and `newContext({hasTouch:false})` second, for the whole run, and AB/BA swapped only which page
 * was **sampled first within a pair**. It never swapped which physical context played touch. So any
 * cost tied to context identity — renderer-process JIT warmth, GPU context and swap-chain
 * allocation order, window creation order — rode along on every pair in the same direction.
 *
 * The symptom was in the log before the cause was: **-0.07 to -0.18 ms across all 16 recorded
 * pairs**, the touch arm reading *cheaper* than the bare one while drawing six more images. That is
 * up to **36 % of the 0.5 ms tolerance**, systematically in the direction that hides a real
 * regression. Calling it noise was wrong; it is a unidirectional bias, and no amount of reordering
 * *within* a run removes it.
 *
 * `hasTouch` is fixed when a context is created, so the role cannot be swapped in place. The
 * counterbalance is therefore across BLOCKS: half the pairs run with the touch context created
 * first, half with it created second, and the pairs are pooled. Creation order then appears equally
 * on both sides of the comparison, exactly as sampling order already did.
 */

import { expect, type Browser, type Page } from '@playwright/test';

import { installGpuTimer } from './gpuTimer';
import { assertRealGpu } from './realGpu';
import { bootToTouchPlay, installTouchDriver } from './touchHarness';
import { hideTexts } from './touchPerf';

export interface Arms {
  touch: Page;
  bare: Page;
  renderer: string;
  close(): Promise<void>;
}

/**
 * Boot one comparable pair of arms.
 *
 * @param touchFirst which context is created first — the whole point of this module.
 * @param label carried into the GPU-renderer refusal messages so a failure names its block.
 */
export async function makeArms(browser: Browser, touchFirst: boolean, label: string): Promise<Arms> {
  // 🔴 **EVERY setup step in physical order, roles assigned only afterwards.** An earlier version
  // alternated context creation and then always made the touch page first, booted it first and
  // timed it first — which counterbalanced almost nothing, because an empty `BrowserContext` is
  // cheap and the renderer process, the WebGL context, the swap chain and the JIT warm-up are all
  // created by the PAGE and BOOT work. Those costs stayed touch-correlated. Codex round 14,
  // finding 2.
  //
  // Awaiting in sequence rather than `Promise.all` is deliberate: `Promise.all` would hand the
  // order to the scheduler and the counterbalance would stop being one.
  const firstCtx = await browser.newContext({ hasTouch: touchFirst });
  const secondCtx = await browser.newContext({ hasTouch: !touchFirst });
  const firstPage = await firstCtx.newPage();
  const secondPage = await secondCtx.newPage();
  await installTouchDriver(firstPage);
  await installTouchDriver(secondPage);
  await bootToTouchPlay(firstPage);
  await bootToTouchPlay(secondPage);
  const firstRenderer = await assertRealGpu(firstPage, `${label} first-created arm`);
  await assertRealGpu(secondPage, `${label} second-created arm`);
  await installGpuTimer(firstPage);
  await installGpuTimer(secondPage);

  // Only now does either page acquire a ROLE.
  const touch = touchFirst ? firstPage : secondPage;
  const bare = touchFirst ? secondPage : firstPage;
  const touchContext = touchFirst ? firstCtx : secondCtx;
  const plainContext = touchFirst ? secondCtx : firstCtx;
  const renderer = firstRenderer;

  // Equalise everything that is not the controls — `hideTexts` carries the evidence.
  const textTouch = await hideTexts(touch);
  const textBare = await hideTexts(bare);
  expect(
    textTouch.hidden + textBare.hidden,
    `${label}: no text was visible in either arm, so this helper equalised nothing`,
  ).toBeGreaterThan(0);
  for (const [t, name] of [
    [textTouch, 'touch'],
    [textBare, 'bare'],
  ] as const) {
    expect(
      t.stillVisible,
      `${label}: ${t.stillVisible} text objects are still drawn in the ${name} arm — the arms ` +
        'differ by more than the controls',
    ).toBe(0);
  }

  return {
    touch,
    bare,
    renderer,
    async close(): Promise<void> {
      await touchContext.close();
      await plainContext.close();
    },
  };
}
