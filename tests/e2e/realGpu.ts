/**
 * "Prove this is a real GPU before trusting a single number from it."
 *
 * `headless: false` plus `--enable-gpu-rasterization` is a **REQUEST**, and Chromium answers a
 * refused request by silently falling back to **SwiftShader**, its software rasteriser. HANDOFF §14
 * measured the same scene at **90.10 ms** headless against **4.2 ms** on the real GPU — a factor of
 * 21 — so every pre-session-8 frame number in this project was a measurement of a CPU drawing
 * pixels, and criterion 5.11's 100 ms "budget" was a 10 fps hang detector that had been read as a
 * budget.
 *
 * The fallback is **invisible unless something asks**, which is the whole reason this exists.
 *
 * ⚠️ **Never soften this into a skip.** A skipped perf test reads as a passing suite; a failed one
 * reads as a broken environment, which is what it is.
 *
 * Extracted 2026-08-17 — it was copied into `phase-05-perf`, `phase-06-perf` and `phase-07-perf`,
 * three copies of an argument that must not drift, and the Phase 5 spec had crossed the 400-line
 * rule. Same seam as `hudHelpers.ts` and `drawnVsSim.ts`.
 */

import { expect } from '@playwright/test';
import { SOFTWARE_RENDERERS, webglRenderer } from './perfRenderer';

/** Asserts a hardware renderer, logs which one, and returns it lower-cased. */
export async function assertRealGpu(
  page: import('@playwright/test').Page,
  tag: string,
): Promise<string> {
  const renderer = (await webglRenderer(page)).toLowerCase();
  // 🔴 The two sentinels `webglRenderer` returns when it cannot answer, refused explicitly.
  //
  // `'no-webgl-context'` means `game.renderer.gl` was falsy — Phaser fell back to the CANVAS
  // renderer, a CPU rasteriser, which is exactly the case this helper exists to catch.
  // `'no-debug-renderer-info'` means the extension is unavailable and the renderer is unknown.
  // Neither string contains `swiftshader`, `llvmpipe`, `software` or `microsoft basic render`, so
  // the loop below passed both — a CPU-rasterised run and an unidentifiable one were green.
  // Found by the QA gate's 12.11 brief.
  expect(
    renderer,
    `${tag} could not identify its renderer (${renderer}). A number taken here would be a ` +
      'measurement of an unknown substrate, which is the thing this assertion refuses.',
  ).not.toMatch(/^no-(webgl-context|debug-renderer-info)$/);
  // eslint-disable-next-line no-console
  console.log(`[${tag}] WebGL renderer: ${renderer}`);
  for (const software of SOFTWARE_RENDERERS) {
    expect(
      renderer,
      `${tag} ran on "${renderer}", a SOFTWARE rasteriser. Every number in this spec would be a ` +
        `measurement of the CPU drawing pixels, not of the frame budget. Do not soften this into a ` +
        `skip: the point of the chromium-gpu project is that the fallback is invisible.`,
    ).not.toContain(software);
  }
  return renderer;
}
