/**
 * **What the page is actually rendering WITH, and how many bodies it has drawn.**
 *
 * Split out of `perfSampler.ts` when that file crossed the 400-line non-negotiable. These three are
 * page interrogation, not sampling: nothing here opens a measurement window, and `realGpu.ts`,
 * `effectCounts.ts` and two phase specs want them without wanting the sampler.
 */

import { BOOT_TIMEOUT } from './gameHarness';

type Page = import('@playwright/test').Page;

/**
 * The WebGL renderer string the page is actually rendering with.
 *
 * 🔴 **The `chromium-gpu` project ASKS for a GPU; nothing checked it got one.** `headless: false`
 * plus `--enable-gpu-rasterization` is a request, and Chromium falls back to **SwiftShader** — a
 * CPU rasteriser — whenever the driver is unavailable, blocklisted, or the box has no display.
 * HANDOFF §14 measured that fallback at **21x** slower, which is the entire reason this spec exists
 * as a separate project. Declaring "a real GPU" in a docstring while a software renderer silently
 * served the numbers is the same class of unverified claim the rest of this rebuild removed.
 * Found by the Codex implementation review.
 *
 * Read through `WEBGL_debug_renderer_info` on the game's own context, so it is the renderer that
 * drew the frames being measured and not a second one made for the question.
 */
export async function webglRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const game = (window as unknown as { __phaserGame: { renderer: { gl?: WebGLRenderingContext } } })
      .__phaserGame;
    const gl = game.renderer.gl;
    if (!gl) return 'no-webgl-context';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'no-debug-renderer-info';
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? 'unknown');
  });
}

/** Renderer names that mean the frames were rasterised on the CPU. Lower-cased before matching. */
export const SOFTWARE_RENDERERS = ['swiftshader', 'llvmpipe', 'software', 'microsoft basic render'];

/** Waits for the drawn body count to reach `target`. The growth path runs inside `sync()`. */
export async function waitForBodyCount(page: Page, target: number): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as { enemies: { bodies: unknown[] } };
      return scene.enemies.bodies.length >= n;
    },
    target,
    { timeout: BOOT_TIMEOUT },
  );
}
