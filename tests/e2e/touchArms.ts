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
import { TOUCH_IDS } from '../../src/render/touchLayout';
import { bootToTouchPlay, drawnFaces, drawnZones, installTouchDriver } from './touchHarness';
import { hideTexts } from './touchPerf';

/**
 * **The preconditions, in one place, run by `makeArms` so no spec can have a weaker set.**
 *
 * 🔴 They were written out in the clean gate and only partly copied into the red proofs — the GPU
 * proof checked faces and its amplifier, the CPU proof checked only that its hook fired — while the
 * QA log claimed all three ran "the same preconditions". Codex round 16, finding 4. A red proof
 * that runs a weaker precondition than the gate it proves is measuring a different arm.
 *
 * Three separate claims, and each of them has failed on its own:
 *
 * - **Every control has a hit area.** `drawnZones` counts `Zone`s, which is HITTABILITY.
 * - **Every control puts PIXELS on screen**, by name, through Phaser's own `willRender(camera)`
 *   plus a positive alpha and a nonzero drawn size. A `Zone` renders nothing, so the count above
 *   cannot tell a drawn arm from an undrawn one; and a face at alpha 0 reports `visible: true`.
 * - **The bare arm has NO controls**, or the two arms are the same arm and every delta is zero.
 */
export async function assertArmsDiffer(touch: Page, bare: Page, label: string): Promise<void> {
  // 🔴 BY NAME, EXACTLY ONCE EACH — never by count. `drawnZones(...).length === TOUCH_IDS.length`
  // passes on a set missing `walk` and carrying one unrelated zone, and false-reds the moment a
  // legitimate non-touch zone appears on the UI scene. Codex round 17, finding 4.
  const zones = await drawnZones(touch, 'UI');
  for (const id of TOUCH_IDS) {
    const mine = zones.filter((z) => z.name === id);
    expect(
      mine.length,
      `${label}: ${id} has ${mine.length} hit areas in the touch arm, not exactly one`,
    ).toBe(1);
    expect(mine[0]!.interactive, `${label}: ${id} is not live in the timed arm`).toBe(true);
  }

  const faces = await drawnFaces(touch, 'UI');
  for (const id of TOUCH_IDS) {
    const face = faces.find((f) => f.name === id);
    expect(face, `${label}: ${id} has a hit area and no face object at all`).toBeDefined();
    expect(
      face!.drawn && face!.alpha > 0 && face!.w > 0 && face!.h > 0,
      `${label}: ${id} puts no pixels on screen — drawn=${face!.drawn} alpha=${face!.alpha} ` +
        `${face!.w}x${face!.h}. The timed arm would draw an empty frame there.`,
    ).toBe(true);
  }

  // The bare arm, asked the same two questions and answered the other way. Both halves matter and
  // each has its own failure: a live control in the bare arm makes the two arms the same arm, and a
  // control DRAWN there with no hit area cancels out of the GPU delta while leaving the zone
  // assertion happy. `toEqual([])` over ALL zones was also false-red capable — an unrelated desktop
  // zone on the UI scene is not a touch control.
  const bareZones = (await drawnZones(bare, 'UI')).filter((z) =>
    (TOUCH_IDS as readonly string[]).includes(z.name),
  );
  expect(
    bareZones.map((z) => z.name),
    `${label}: the bare arm has live touch controls, so the two arms are the same arm`,
  ).toEqual([]);

  const bareFaces = (await drawnFaces(bare, 'UI')).filter(
    (f) =>
      (TOUCH_IDS as readonly string[]).includes(f.name) &&
      f.drawn &&
      f.alpha > 0 &&
      f.w > 0 &&
      f.h > 0,
  );
  expect(
    bareFaces.map((f) => f.name),
    `${label}: the bare arm DRAWS control faces, so both arms pay for the controls and the delta ` +
      'cannot see them',
  ).toEqual([]);
}

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

  // 🔴 `hideTexts` runs in PHYSICAL order too, BEFORE roles exist. It was the last setup step
  // still ordered by role: `hideTexts(touch)` always preceded `hideTexts(bare)`, so whatever the
  // first of those two calls costs a page — a layout pass, a texture eviction — always landed on
  // the touch arm. Codex round 16, finding 5. The 30-tick settle probably absorbs it; "probably"
  // is exactly the word this file exists to remove.
  const textFirst = await hideTexts(firstPage);
  const textSecond = await hideTexts(secondPage);

  // Only now does either page acquire a ROLE.
  const touch = touchFirst ? firstPage : secondPage;
  const bare = touchFirst ? secondPage : firstPage;
  const touchContext = touchFirst ? firstCtx : secondCtx;
  const plainContext = touchFirst ? secondCtx : firstCtx;
  const renderer = firstRenderer;
  const textTouch = touchFirst ? textFirst : textSecond;
  const textBare = touchFirst ? textSecond : textFirst;

  // Equalise everything that is not the controls — `hideTexts` carries the evidence.
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

  await assertArmsDiffer(touch, bare, label);

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
