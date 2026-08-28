import { expect, test } from '@playwright/test';

/**
 * # The overlay must be VISIBLE, not merely present
 *
 * 🔴 This gate exists because the first pin probe passed every check that asked whether it existed
 * and still showed the owner nothing. The objects were on the display list, `visible`, `alpha` 1,
 * `renderFlags` 15, at a depth above the tile layer, inside the camera's `worldView` — and the
 * overlay was an 18 % cyan wash on dark brown brick whose only on-screen edge sat exactly under the
 * floor's own painted top edge. The owner played a whole session against it and reported "no
 * rectangle, just nothing to see", which reads exactly like the bug being hunted.
 *
 * An assertion that the object exists cannot tell those apart. **So this one reads pixels.**
 * `CLAUDE.md` §2: a decision function with no consumer is the same defect as a burst of zero
 * particles — it satisfies every assertion about itself and draws nothing.
 */

/**
 * Share of the frame that is strongly magenta.
 *
 * ⚠️ **Measured from Playwright's own screenshot, not from the canvas in-page.** The first version
 * of this gate did `drawImage(canvas)` into a 2D context and read `getImageData`. Against a WebGL
 * canvas without `preserveDrawingBuffer` that returns a CLEARED buffer once the frame has been
 * presented — so the `?pin=1` case measured zero while the overlay was plainly painting, and the
 * no-flag case "passed" for the same wrong reason. A false green and a false red from one bad
 * measurement. `page.screenshot()` composites the real frame.
 *
 * `tools/gen/png.mjs` is the project's own dependency-free decoder, already used by the asset
 * pipeline.
 */
async function magentaShare(page: import('@playwright/test').Page): Promise<number> {
  const png = await page.screenshot();
  const { decodePng } = (await import('../../tools/gen/png.mjs')) as {
    decodePng: (b: Uint8Array) => {
      width: number;
      height: number;
      data: Uint8Array | Uint8ClampedArray;
    };
  };
  const { width, height, data } = decodePng(png);
  let hits = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    // Red and blue both high, green clearly lower. The overlay's fill and stroke land here; nothing
    // in the steampunk palette does.
    if (r > 110 && b > 110 && g + 40 < Math.min(r, b)) hits += 1;
  }
  return hits / (width * height);
}

test.describe('the pin probe overlay', () => {
  test('paints a visible magenta collision overlay when ?pin=1 is present', async ({ page }) => {
    await page.goto('/?pin=1');
    await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30_000 });

    const share = await magentaShare(page);
    // The ground solid alone fills the lower third of the view. One percent is far below what the
    // overlay actually paints and far above any stray anti-aliasing.
    expect(share, 'the overlay is present in the scene graph but invisible on screen').toBeGreaterThan(
      0.01,
    );
  });

  test('paints nothing at all without the flag', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 30_000 });

    const share = await magentaShare(page);
    expect(share, 'the overlay drew without its flag').toBeLessThan(0.001);

    // Reached the way every other spec reaches the live scene tree — see `drawnVsSim.ts`.
    const named = await page.evaluate(() => {
      const w = window as unknown as {
        __phaserGame: { scene: { getScene(k: string): unknown } };
      };
      const scene = w.__phaserGame.scene.getScene('Game') as {
        children: { list: { name?: string }[] };
      };
      return scene.children.list.filter((k) => (k.name ?? '').startsWith('devPinProbe')).length;
    });
    expect(named, 'probe objects exist without the flag').toBe(0);
  });
});
