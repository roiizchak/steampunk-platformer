/**
 * Phase 6 — criterion 6.3, the ONE case that drives a real resize.
 *
 * Split out of `phase-06-chrome.spec.ts` on 2026-09-01, when rewriting this case for the filled
 * view pushed that file to 412 lines against the project's 400-line ceiling. The seam is the
 * criterion's own: everything left there is about where the HUD SITS at a fixed size, and this is
 * the only case that changes the size while the game is running.
 *
 * ## Runs on `chromium-gpu`, headed, on a real GPU
 *
 * `GPU_SPECS` in `playwright.config.ts` matches `phase-06-` by PREFIX rather than by a list of
 * names, precisely so a split like this one cannot silently opt the new file back into
 * SwiftShader. Nothing in the config needed editing for this file to exist, and that is the point
 * of the prefix.
 *
 * No `waitForTimeout` anywhere: waits are on `window.__game.ready`, on a tick count, or on a poll.
 */

import { expect, test } from '@playwright/test';
import { bootToGame, waitTicks } from './gameHarness';
import { readHud } from './hudHelpers';
import { hudFits } from '../../src/render/hud';

test.describe('criterion 6.3 — a resize re-lays-out the HUD rather than cropping it', () => {
  /**
   * Codex plan review F6.
   *
   * 🔴 **Rewritten 2026-09-01: a real BROWSER resize, because that path now exists.** This used to
   * open *"the scale mode is `FIT`, so a browser resize never changes `scale.gameSize`"*, and drove
   * a synthetic `game.scale.resize(1280, 720)` for want of a real one. `src/game/viewSize.ts` makes
   * the view a function of the viewport, so the real path is available — and the synthetic one is
   * no longer reachable at all: `scale.resize` emits `resize`, the fill loop hears it and snaps the
   * view straight back to what the viewport says. A spec driving it measures the loop undoing it.
   *
   * ⚠️ **Two assertions were dropped rather than adapted, and that is a REDUCTION.** The old resize
   * shrank the height to 720, so `layout.scale` and `plate.w` both fell and could be asserted to
   * fall. Height is now pinned at 1080 at every viewport, and `hudLayout` scales off height alone
   * (`hud.ts:16`) — so the HUD genuinely does not re-lay-out under a width change, and asserting
   * that it does would be asserting a falsehood. What survives is the half vault 6.2 is actually
   * about: a UI camera built from a LITERAL rather than from the live view, which crops the HUD the
   * moment the two differ. That is checked at both sizes, and the width now differs by 480 px.
   */
  test('a real browser resize re-sizes the UI camera rather than cropping the HUD', async ({
    page,
  }) => {
    // Exactly 16:9, so the view starts at the design size and the widening below is unambiguous.
    await page.setViewportSize({ width: 1024, height: 576 });
    await bootToGame(page);
    const before = await readHud(page);
    expect(before.gameSize.height).toBe(1080);
    expect(before.gameSize.width, 'a 16:9 viewport should sit at the design width').toBe(1920);

    /**
     * The camera is checked at BOTH sizes, and the second check alone is not enough — found by the
     * red run. A camera pinned to a literal that happens to equal the resize TARGET (1280 x 720)
     * satisfies the after-check perfectly and is still vault 6.2's defect; it is simply wrong
     * before the resize instead of after. Asserting only the end state made the gate pass on the
     * mutation it exists to catch.
     */
    expect(
      { w: before.uiCamera.width, h: before.uiCamera.height },
      `the UI camera is ${before.uiCamera.width}x${before.uiCamera.height} at the design size ` +
        `${before.gameSize.width}x${before.gameSize.height} — it was built from a literal, not ` +
        `from the live game size`,
    ).toEqual({ w: before.gameSize.width, h: before.gameSize.height });

    // EXACTLY 20:9 (2.2222), a landscape phone's aspect, inside the 2.37 ceiling. 1024x461 was
    // here first and is 2.2213, which rounds the view to 2399 — near enough to read as 2400 and
    // wrong enough to fail an equality, which is how these viewports earned their exact numbers.
    // The view widens to 2400 x 1080.
    await page.setViewportSize({ width: 1000, height: 450 });
    await expect
      .poll(async () => (await readHud(page)).gameSize.width, {
        message: 'the view never widened after the browser resize',
      })
      .toBe(2400);
    await waitTicks(page, 4);

    const after = await readHud(page);
    expect(after.gameSize.height, 'the height pin let the view grow vertically').toBe(1080);
    // The HUD scales off HEIGHT alone, which is pinned — so it must be IDENTICAL across this
    // resize. Stated as an assertion rather than left unsaid: if it ever moves, the height pin
    // that every `gameH / GAME_HEIGHT` ratio in `src/render/` depends on has been broken.
    expect(after.layout.scale).toBe(before.layout.scale);
    expect(after.plate.w).toBe(before.plate.w);
    expect(hudFits(after.layout, 2400, 1080, after.counter.w)).toBe(true);
    expect(after.plate.willRender).toBe(true);

    /**
     * 🔴 **The UI camera itself, read rather than inferred** — Codex implementation finding C4, and
     * the qa-expert owner independently from the other side.
     *
     * Everything above asserts the *layout numbers* and `hudFits`. None of it looks at the camera
     * the HUD is actually drawn through. The no-cropping guarantee holds today only because
     * `UIScene` never creates an explicit camera and inherits one Phaser resizes for it — an
     * emergent property. Vault 6.2's blocker is exactly the opposite case: a second camera built at
     * an explicit size never auto-resizes, and at a hardcoded 1280 it cropped a whole HUD plate off
     * a phone. Nothing in this suite would have noticed a regression that introduced one.
     */
    expect(
      { w: after.uiCamera.width, h: after.uiCamera.height },
      `the UI camera is ${after.uiCamera.width}x${after.uiCamera.height} after a resize to ` +
        `${after.gameSize.width}x${after.gameSize.height}. A camera that does not track the game ` +
        `size crops the HUD — vault 6.2, where a camera pinned at 1280 lost a whole plate.`,
    ).toEqual({ w: after.gameSize.width, h: after.gameSize.height });

    // Size alone is not enough: a correctly sized camera that is offset, scrolled or zoomed crops
    // the HUD just as effectively, and `hudFits` works in layout space so it cannot see any of it.
    expect(
      {
        x: after.uiCamera.x,
        y: after.uiCamera.y,
        scrollX: after.uiCamera.scrollX,
        scrollY: after.uiCamera.scrollY,
        zoom: after.uiCamera.zoom,
      },
      'the UI camera is no longer at the origin, unscrolled and unzoomed — the HUD is drawn ' +
        'through it, so any of these silently shifts or scales the whole HUD',
    ).toEqual({ x: 0, y: 0, scrollX: 0, scrollY: 0, zoom: 1 });
  });
});
