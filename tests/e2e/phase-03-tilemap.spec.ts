/**
 * Phase 3 criteria 3.1, 3.2 and 3.4 — collision against the shipped level, and the camera.
 *
 * ## Two rules this file is built around
 *
 * **Sample in the page, once per animation frame, and assert on an aggregate.** A wait expressed
 * in ticks cannot bound a sampling window: `waitTicks(N)` guarantees *at least* N ticks, and under
 * parallel workers a single round trip has outlasted an entire 65-tick jump arc. That has produced
 * both a false green with a mutation applied and a false red on correct code, in this suite. Every
 * loop below therefore runs inside `page.evaluate` and returns a summary — including its own
 * sample count, so an empty loop cannot pass.
 *
 * **Assert against what was DRAWN, not only against the debug surface.** Codex plan review P4:
 * every position oracle here could otherwise come from the same collision data that drives the
 * sim, so all of it would pass with the tile layer missing or displaced — which is precisely the
 * art-versus-collision defect this phase's Element Editor exists for. So each collision test also
 * reaches through `window.__phaserGame` to the real `TilemapLayer` and asserts the drawn tile's
 * edge agrees with the collision strip. Phase 2 needed the identical seam (Codex I5) after
 * deleting `renderPlayer()` left the whole suite green.
 */

import { expect, test } from '@playwright/test';
import { cameraSetup, tracksTarget, viewFits } from '../../src/render/cameraRig';
import { BOOT_TIMEOUT, bootToGame, readPlayer, waitTicks } from './gameHarness';
// Fixtures and page-driving helpers extracted to a sibling module when this file crossed 400
// lines — DATA and SETUP only, every `test()`/`expect` verifying a criterion stays here. Not
// named `*.spec.ts` so Playwright's testMatch does not collect it as an empty spec. See
// tilemapHelpers.ts.
import {
  drawnTileAt,
  groundAtSpawn,
  HALF_BODY,
  readCameraView,
  readClampedCorners,
  readDrawnLayerStats,
  readScrollY,
  sampleCameraTrack,
  sampleHorizontalRun,
  sampleJumpArc,
  sampleLowestScrollY,
  shippedLevel,
  wallRightOfSpawn,
} from './tilemapHelpers';

test.describe('Phase 3 — tilemap collision and camera', () => {
  test('3.1 the player lands on the collision layer and never falls through it', async ({ page }) => {
    await bootToGame(page);
    const level = await shippedLevel(page);
    const ground = groundAtSpawn(level);

    await waitTicks(page, 15);
    const resting = await readPlayer(page);
    expect(resting.y).toBe(ground.y);
    expect(resting.vy).toBe(0);
    expect(resting.state).toBe('idle');

    // Standing still proves nothing about falling THROUGH. Jump, then watch the whole arc: the
    // deepest y ever observed must be the strip's top, never past it.
    await page.keyboard.down('Space');
    const arc = await sampleJumpArc(page);
    await page.keyboard.up('Space');

    expect(arc.samples).toBeGreaterThan(60);
    // It really left the ground, so the arc is a jump and not a stationary read.
    expect(ground.y - arc.highest).toBeGreaterThan(100);
    // And never sank below the surface at any sampled frame.
    expect(arc.lowest).toBe(ground.y);

    // Codex P4: everything above reads the same data the sim collides against, so it would all
    // pass with nothing drawn. The DRAWN tile under the player must have its top at the strip top.
    const tile = await drawnTileAt(page, resting.x, ground.y + 1);
    expect(tile, 'no tile is drawn where the player is standing').not.toBeNull();
    expect(tile!.pixelY).toBe(ground.y);
    expect(tile!.index).toBeGreaterThan(0);
  });

  test('3.2 the player cannot pass through a solid horizontally', async ({ page }) => {
    // 🔴 A LIVENESS bound, not a performance one, and the distinction is the whole comment.
    //
    // `sampleHorizontalRun` waits for 400 animation frames — 1.7 s at the ~240 fps this machine
    // serves when it is idle. Under load the headless page has been measured at roughly 8 fps, where
    // the same 400 frames take 47 s and blow the 30 s default. Phase 9 spent a long stretch treating
    // that as a collision regression: it reproduced on `main`, on the phase branch, and in an
    // agent's worktree, and it was three concurrent heavy jobs every time. Run alone the test passes
    // in 46.7 s.
    //
    // So the number below is NOT a claim about how fast the game is — no assertion here reads a
    // clock. It is the ceiling above which "the page stopped painting" is the likelier explanation
    // than "the box is busy". Generous on purpose: a real hang still fails, two minutes later, and
    // this project would rather wait than read a busy machine as a broken one.
    //
    // The honest fix for the slowness is not here — see `docs/qa/phase-09-polish.md`: nothing heavy
    // may run beside the e2e suite, and only one Playwright run may exist at a time.
    test.setTimeout(120_000);

    await bootToGame(page);
    const level = await shippedLevel(page);
    const wall = wallRightOfSpawn(level);

    await waitTicks(page, 10);
    await page.keyboard.down('ArrowRight');

    // Run until x stops changing, sampling per frame. The aggregate is the final x plus how many
    // consecutive frames it held — a player still creeping forward has not been stopped.
    const run = await sampleHorizontalRun(page);
    await page.keyboard.up('ArrowRight');

    expect(run.samples).toBeGreaterThan(200);
    expect(run.stableFrames).toBeGreaterThan(30);

    // Codex P5: `player.x` is the feet CENTRE, so a body stopped flush against the wall has its
    // centre half a body-width short of it. Asserting `=== wall.x` would bless 22px of the player
    // standing inside the wall.
    expect(run.finalX).toBe(wall.x - HALF_BODY);
    // It never got past that even for one frame, which a settled final position cannot show.
    expect(run.maxX).toBe(wall.x - HALF_BODY);

    // And the wall the player stopped against is actually drawn there (Codex P4).
    //
    // ⚠️ The drawn cell must be INSIDE the wall's span, not at its left edge. This read
    // `expect(tile!.pixelX).toBe(wall.x)`, which was only ever true because Phase 7's wall was exactly
    // one tile wide: Phase 8 made it two columns of masonry, the sample at the wall's centre landed in
    // the second column, and the assertion failed at 3360 against 3264 with a message about a missing
    // tile. The claim being made is "the wall is painted where the collider stopped the player", and
    // that claim does not care how wide the wall is.
    const tile = await drawnTileAt(page, wall.x + wall.w / 2, wall.y + wall.h / 2);
    expect(tile, 'no tile is drawn where the wall stopped the player').not.toBeNull();
    expect(tile!.pixelX).toBeGreaterThanOrEqual(wall.x);
    expect(tile!.pixelX).toBeLessThan(wall.x + wall.w);
  });

  test('3.4 the camera follows the player and never shows outside the map', async ({ page }) => {
    await bootToGame(page);
    const level = await shippedLevel(page);
    const { bounds } = cameraSetup(level, 1920, 1080);

    await waitTicks(page, 10);
    await page.keyboard.down('ArrowRight');

    const track = await sampleCameraTrack(page);
    await page.keyboard.up('ArrowRight');

    expect(track.views.length).toBeGreaterThan(100);

    // Never outside the map, on any sampled frame — asserted with the SAME predicate the unit
    // suite uses, so there is one definition of "inside the map" rather than two.
    const escaped = track.views.filter((v) => !viewFits(bounds, v));
    expect(escaped, `camera showed outside the map on ${escaped.length} frames`).toEqual([]);

    // It actually moved. A camera pinned at the origin satisfies containment trivially.
    expect(track.views[track.views.length - 1]!.x).toBeGreaterThan(track.views[0]!.x);

    // Codex P6: containment plus movement is satisfied by a scripted pan that ignores the player.
    // This is the claim the criterion actually makes — the player stays comfortably on screen.
    // `bounds` is passed so the inset is not demanded on a side the camera is clamped against.
    // Without it this asserted something `viewFits` — asserted three lines up — forbids: the map is
    // 2112 px tall and the walking surface is at y 1920, so a grounded player is 192 px above the
    // world's bottom edge and can never be 200 px clear of a view pinned there. See
    // `tracksTarget` in cameraRig.ts.
    const lost = track.views.filter(
      (v, i) => !tracksTarget(v, track.targets[i]!.x, track.targets[i]!.y, 200, bounds),
    );
    expect(lost, `camera stopped tracking the player on ${lost.length} frames`).toEqual([]);
  });

  test('3.4 the camera follows VERTICALLY as well — scrollY responds to a jump', async ({ page }) => {
    /**
     * Added in Phase 4, after the adversarial brief predicted — and a mutation confirmed — that
     * criterion 3.4 passes with vertical following **entirely dead**.
     *
     * `startFollow(sprite, false, lerpX, 0)` leaves every other assertion in this file green: the
     * view still fits the map, `scrollX` still increases, and `tracksTarget` is satisfied because
     * the camera is bottom-clamped on this level, so its bottom inset is excused and a grounded
     * player at y 1920 trivially clears the top one.
     *
     * The honest history is worth keeping: BEFORE the inset was made clamp-aware, 3.4 failed on
     * 200/200 frames — on a correct camera — so it was red-on-everything and equally
     * non-discriminating. The fix turned a fail-CLOSED vacuum into a fail-OPEN one. This is the
     * assertion that was missing from both versions.
     *
     * It is testable only because the arithmetic allows it: the map is 2112 px tall against a
     * 1080 px view, so the camera clamps at scrollY 1032 and cannot move until the player rises
     * above y 1572 — 348 px of climb. The jump apex is 413 px. A shorter jump, a taller view or a
     * shallower map would make vertical follow genuinely unobservable here, and this test would
     * have to say so rather than quietly weaken.
     */
    await bootToGame(page);
    await waitTicks(page, 30);

    const grounded = await readScrollY(page);
    expect(typeof grounded).toBe('number');

    // Sample INSIDE the page, once per animation frame, across the whole arc and return an
    // aggregate — a tick-expressed wait cannot bound this window (see the file header).
    await page.keyboard.down('Space');
    const lowest = await sampleLowestScrollY(page);
    await page.keyboard.up('Space');

    // The camera rose. Asserted as a strict inequality against the grounded clamp, because
    // "scrollY changed" would also be satisfied by it drifting back down after a landing.
    expect(lowest, 'the camera never moved vertically during a jump').toBeLessThan(grounded);
  });

  test('3.4 the camera stays inside the map at the left edge, where clamping is doing the work', async ({
    page,
  }) => {
    // The interesting half of `setBounds`: at spawn the player is far left, so the camera CANNOT
    // centre on it without showing past x=0. If bounds were dropped, this is what notices, and
    // the moving-right test above would not.
    await bootToGame(page);
    const level = await shippedLevel(page);
    const { bounds } = cameraSetup(level, 1920, 1080);

    await waitTicks(page, 10);
    const view = await readCameraView(page);

    expect(typeof view.x).toBe('number');
    expect(viewFits(bounds, view)).toBe(true);
    expect(view.x).toBe(0);
    // Bottom-clamped too: the level is taller than the view and the player is near its floor.
    expect(view.y + view.h).toBe(bounds.h);
  });

  /**
   * The RIGHT and TOP clamps, which nothing else reaches.
   *
   * Found by the code-reviewer gate owner (brief 2): the follow test holds ArrowRight, and the
   * player wall-stops at x=1898 out of a 5760-wide level, so the camera never travels past
   * x≈2860. Of `viewFits`'s four inequalities only the left and bottom were ever evaluated against
   * a clamp doing work — a `bounds.w` of twice the level's width would have passed the whole suite.
   *
   * Driving the player there would take thousands of frames, so this scrolls the camera directly:
   * the clamp under test is Phaser's, and it applies to any scroll however it was requested.
   */
  test('3.4 the camera clamps at the right and top edges too', async ({ page }) => {
    await bootToGame(page);
    const level = await shippedLevel(page);
    const { bounds } = cameraSetup(level, 1920, 1080);

    const corners = await readClampedCorners(page);

    expect(viewFits(bounds, corners.bottomRight)).toBe(true);
    expect(viewFits(bounds, corners.topLeft)).toBe(true);

    // And the clamps landed exactly on the level's own extent, so an oversized bound is visible
    // rather than merely tolerated.
    expect(corners.bottomRight.x + corners.bottomRight.w).toBe(level.widthPx);
    expect(corners.bottomRight.y + corners.bottomRight.h).toBe(level.heightPx);
    expect(corners.topLeft.x).toBe(0);
    expect(corners.topLeft.y).toBe(0);
  });

  test('3.3 the shipped level is the one the game actually loaded', async ({ page }) => {
    // Ties the unit suite's shipped-data sweep to the running game. `tilemap-data.test.ts` proves
    // the file on disk is valid; this proves the browser loaded THAT file and nothing else.
    await bootToGame(page);
    const level = await shippedLevel(page);

    const view = await page.evaluate(() => window.__game);
    expect(view?.levelId).toBe(level.id);

    const drawn = await readDrawnLayerStats(page);

    expect(drawn, 'no tilemap layer was added to the scene').not.toBeNull();
    expect(drawn!.w).toBe(level.widthPx);
    expect(drawn!.h).toBe(level.heightPx);
    expect(drawn!.total).toBe(level.widthTiles * level.heightTiles);
  });
});

test.describe('Phase 3 — the boot gate covers levels too', () => {
  test('3.3 a malformed level refuses to route, exactly like a corrupt image', async ({ page }) => {
    // The level equivalent of Phase 1's asset-refusal cases. Without this a 404'd or broken level
    // reaches GameScene and draws an empty world the player stands in — which reads as a broken
    // camera rather than a missing file, and is a clean boot as far as any other gate can tell.
    await page.route('**/assets/levels/level-01.tmj', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ width: 4, height: 4, tilewidth: 32, tileheight: 32, layers: [] }),
      }),
    );

    await page.goto('/');
    await page.waitForFunction(
      () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
      undefined,
      { timeout: BOOT_TIMEOUT },
    );

    const game = await page.evaluate(() => window.__game);
    expect(typeof game?.bootError).toBe('string');
    expect(game?.bootError).toContain('level-01');
    expect(game?.ready).toBe(false);
    expect(game?.sceneKey).toBe('Boot');
  });

  test('3.3 a level with no camera travel refuses to route (vault 3.2)', async ({ page }) => {
    // A level exactly the size of the viewport is structurally valid and completely unplayable as
    // a side-scroller. Vault 3.2 is a shipped game with 10px of scroll room, so this is the case
    // that must be loud rather than merely wrong.
    await page.route('**/assets/levels/level-01.tmj', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          width: 60,
          height: 34,
          tilewidth: 32,
          tileheight: 32,
          layers: [
            {
              type: 'tilelayer',
              name: 'ground',
              width: 60,
              height: 34,
              // A row of real tiles, not 2040 zeros. An all-empty tile layer is now rejected in
              // its own right ("draws nothing"), which would make this test pass for the wrong
              // reason — it is here to prove the CAMERA TRAVEL rule fires.
              data: [...new Array(1980).fill(0), ...new Array(60).fill(1)],
            },
            {
              type: 'objectgroup',
              name: 'collision',
              objects: [
                {
                  x: 0,
                  y: 1056,
                  width: 1920,
                  height: 32,
                  properties: [{ name: 'solid', type: 'bool', value: true }],
                },
                {
                  x: 96,
                  y: 1056,
                  width: 0,
                  height: 0,
                  point: true,
                  properties: [{ name: 'spawn', type: 'bool', value: true }],
                },
                // 🔴 Phase 8. This fixture must be valid in EVERY respect except camera travel, or it
                // stops proving what it is named for. Without an exit it refused with "no object
                // carries the `goal` property" and the `camera travel` assertion went red — the same
                // trap the bad-level fixtures under `tests/fixtures/` carry a written rule about, and
                // the reason `describeGoalProblem` runs last inside `describeLevelProblem`. It cannot
                // run last overall: the camera-travel rule lives in `bootLevels.ts`, downstream of the
                // whole level validator.
                //
                // Standing on the floor at the far right, clear of the standing spawn box (x 30…162).
                {
                  x: 1700,
                  y: 768,
                  width: 100,
                  height: 288,
                  properties: [{ name: 'goal', type: 'bool', value: true }],
                },
              ],
            },
          ],
        }),
      }),
    );

    await page.goto('/');
    await page.waitForFunction(
      () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
      undefined,
      { timeout: BOOT_TIMEOUT },
    );

    const game = await page.evaluate(() => window.__game);
    expect(typeof game?.bootError).toBe('string');
    expect(game?.bootError).toContain('camera travel');
    expect(game?.ready).toBe(false);
  });
});
