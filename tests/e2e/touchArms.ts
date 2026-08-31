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
  // 🔴 The creation order IS the variable. Awaiting them in sequence, not in a `Promise.all`, is
  // deliberate: `Promise.all` would leave the order to the scheduler and this counterbalance would
  // stop being a counterbalance.
  const first = await browser.newContext({ hasTouch: touchFirst });
  const second = await browser.newContext({ hasTouch: !touchFirst });
  const touchContext = touchFirst ? first : second;
  const plainContext = touchFirst ? second : first;
  const touch = await touchContext.newPage();
  const bare = await plainContext.newPage();

  await installTouchDriver(touch);
  await installTouchDriver(bare);
  await bootToTouchPlay(touch);
  await bootToTouchPlay(bare);

  const renderer = await assertRealGpu(touch, `${label} touch arm`);
  await assertRealGpu(bare, `${label} bare arm`);
  await installGpuTimer(touch);
  await installGpuTimer(bare);

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
