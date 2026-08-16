/**
 * Phase 5 combat, in a real browser. Covers 5.4 and 5.7 — **5.11 has moved**, see below.
 *
 * ⚠️ **The claim that used to be here — that 5.4 could not be tested because
 * `rust-scavenger-walk` "does not exist yet" — went stale in session 7 when that sheet shipped as a
 * 12-frame looping catalog row.** The Codex implementation review read this comment and correctly
 * reported 5.4 as unrun on the strength of it. 5.4 has since been run by hand with `playwright-cli`,
 * sampling `frame.index` in-page off the `animationupdate` event: 12 distinct indices during patrol.
 * Evidence in `docs/qa/phase-05-combat.md`.
 *
 * **5.4 now has an automated spec below**, sampling `anims.currentFrame.index` inside the page once
 * per `requestAnimationFrame` (never off `animationupdate` — see that test's own comment) across a
 * fixed window, and asserting the animation key is `rust-scavenger-walk` before trusting the frame
 * spread at all.
 *
 * Both dev fixtures come from `src/scenes/devSpawn.ts` via the keys `GameScene.bindKeys()` binds
 * under `import.meta.env.DEV` (~L294): `M` for one scavenger at 2/60 hp (5.7), `N` for the
 * worst-case fleet (5.11).
 *
 * ## 5.7 — reading the shared bar Graphics honestly
 *
 * All enemy bars share ONE `Graphics` object (`enemyLayer.ts:41,60`), so "a Graphics exists"
 * proves nothing. Phaser 4.2.1's `Graphics#commandBuffer` is a public flat array — `fillStyle`
 * pushes `[FILL_STYLE, color, alpha]` and `fillRect` pushes `[FILL_RECT, x, y, w, h]`
 * (`node_modules/phaser/src/gameobjects/graphics/{Graphics,Commands}.js`) — and `clear()` only
 * empties it, so the completed buffer is readable between frames. TypeScript `private` is erased
 * at runtime, so `scene.enemies.bars.commandBuffer` and `scene.enemies.bodies` are reachable
 * through `window.__phaserGame`, same seam every other Phase 2-4 e2e spec already uses.
 *
 * The buffer is walked by opcode, not scanned for the literal `3` — a coordinate could also equal
 * 3, and only structural walking tells FILL_RECT's opcode from one of its own arguments.
 *
 * `healthBarDesc` (position math: `x`, `y`, background `w`) is imported from the source rather
 * than restated — vault 5.3, two definitions of one concept is where the bug lives. Its `fillW`
 * field is NOT used for the pass/fail bound: that field comes from `healthBarFillWidth`, the exact
 * function 5.7 gates on, so comparing the drawn value against that same (possibly mutated)
 * function would go green even if it always returned the full slot width. Both bounds — `> 0` and
 * `< slotW` — are asserted against the OTHER drawn rectangle's own width instead.
 *
 * ## 5.11 is not here any more
 *
 * It moved to `phase-05-perf.spec.ts`, which runs under its own **headed, real-GPU** Playwright
 * project. Default headless Chromium falls back to SwiftShader and reports the same scene 21x
 * slower *(HANDOFF §14)*, so a number measured beside these tests could not be a frame budget —
 * and giving this whole file that project would have made every combat test open a window. Details,
 * including what the old version was actually measuring, are in that file's header.
 */

import { expect, test } from '@playwright/test';
import { RENDER_SCALE } from '../../src/game/constants';
import { SCAVENGER } from '../../src/sim/enemyScavenger';
import { healthBarDesc } from '../../src/render/enemyHealthBar';
import { BOOT_TIMEOUT, bootToGame } from './gameHarness';

type Page = import('@playwright/test').Page;

interface EnemySnapshot {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

interface BarRect {
  x: number;
  y: number;
  w: number;
}

interface SceneSnapshot {
  scavengers: EnemySnapshot[];
  bodyCount: number;
  spriteCount: number;
  barRects: BarRect[];
  /** Where each body was actually DRAWN this frame, in `bodies` order. See `bodyPositions` below. */
  bodyPositions: { x: number; y: number }[];
}

type PhaserGameHandle = { scene: { getScene(key: string): unknown } };
type GameSceneHandle = {
  world: { enemies: { sentries: unknown[]; scavengers: EnemySnapshot[] } };
  enemies: {
    bodies: { x: number; y: number }[];
    isSprite: boolean[];
    bars: { commandBuffer: number[] };
  };
};

/**
 * One atomic read of the live scene: sim enemies, the drawn body count, and every FILL_RECT queued
 * on the shared bar `Graphics`, walked structurally (FILL_STYLE=7 takes 2 args, FILL_RECT=3 takes
 * 4) rather than scanned for a magic number.
 */
async function snapshot(page: Page): Promise<SceneSnapshot> {
  return page.evaluate(() => {
    const scene = (window as unknown as { __phaserGame: PhaserGameHandle }).__phaserGame.scene.getScene(
      'Game',
    ) as unknown as GameSceneHandle;
    const buf = scene.enemies.bars.commandBuffer;
    const barRects: BarRect[] = [];
    let i = 0;
    while (i < buf.length) {
      const op = buf[i];
      if (op === 7) {
        i += 3;
      } else if (op === 3) {
        barRects.push({ x: buf[i + 1] as number, y: buf[i + 2] as number, w: buf[i + 3] as number });
        i += 5;
      } else {
        i += 1;
      }
    }
    return {
      scavengers: scene.world.enemies.scavengers.map((s) => ({ x: s.x, y: s.y, hp: s.hp, maxHp: s.maxHp })),
      bodyCount: scene.enemies.bodies.length,
      // `isSprite` runs parallel to `bodies` (`enemyLayer.ts:39-40`) so criterion 5.11 can tell a
      // real Sprite from the Rectangle grey-box fallback — a body count alone cannot (vault 9.4).
      spriteCount: scene.enemies.isSprite.filter(Boolean).length,
      barRects,
      // 🔴 Read in the SAME `page.evaluate` as `barRects`, which is what makes comparing them
      // meaningful: enemies are drawn BETWEEN ticks now (`enemyLayer.ts`), so a body position
      // sampled on a different frame than the bar it is compared against is a different moment.
      bodyPositions: scene.enemies.bodies.map((b) => ({ x: b.x, y: b.y })),
    };
  });
}

/** Waits for the live scavenger count to reach at least `target` — never a tick or timeout sleep. */
async function waitForScavengerCount(page: Page, target: number): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const scene = (window as unknown as { __phaserGame: PhaserGameHandle }).__phaserGame.scene.getScene(
        'Game',
      ) as unknown as GameSceneHandle;
      return scene.world.enemies.scavengers.length >= n;
    },
    target,
    { timeout: BOOT_TIMEOUT },
  );
}

test.describe('Phase 5 — combat', () => {
  test('5.7 a live enemy at 2/60 hp draws a non-empty, non-full health bar', async ({ page }) => {
    await bootToGame(page);
    const before = await snapshot(page);

    // `k`, not `m`. Phase 7 took `M` for mute — a shipped, player-facing control — so the DEV-only
    // low-hp spawn moved. This line is the reason that move needed checking rather than assuming.
    await page.keyboard.press('k');
    await waitForScavengerCount(page, before.scavengers.length + 1);

    const after = await snapshot(page);
    const spawned = after.scavengers[after.scavengers.length - 1];
    // Type before value (vault C1): the debug surface elsewhere returns `unknown` on purpose.
    expect(typeof spawned?.hp).toBe('number');
    expect(typeof spawned?.maxHp).toBe('number');
    expect(spawned!.hp).toBe(2);
    expect(spawned!.maxHp).toBe(60);

    // Position math only — NOT `desc.fillW`, which comes from the function 5.7 gates on.
    const desc = healthBarDesc(spawned!, 'rust-scavenger', RENDER_SCALE);
    const EPS = 0.01;

    // 🔴 Anchored to the DRAWN body, not to the sim position, and this is not a tolerance
    // loosening — it is the same exactness against the right reference. Enemies are interpolated
    // between ticks as of 2026-08-14, so on most frames the body is a fraction of a tick behind
    // `spawned.x`; `enemyLayer.sync` shifts the bar by exactly that delta so it rides the body it
    // describes. Comparing against the sim position made this test fail for the RIGHT reason: the
    // two really are different points now.
    const drawn = after.bodyPositions[after.bodyPositions.length - 1]!;
    const shiftX = drawn.x - spawned!.x;
    const shiftY = drawn.y - spawned!.y;
    const atThisEnemy = after.barRects.filter(
      (r) => Math.abs(r.x - (desc.x + shiftX)) < EPS && Math.abs(r.y - (desc.y + shiftY)) < EPS,
    );
    // Both the background slot AND a fill rect were drawn at this enemy's own x — "a Graphics
    // exists" would pass with only one, or none.
    expect(atThisEnemy.length).toBe(2);

    const slotRect = atThisEnemy.find((r) => Math.abs(r.w - desc.w) < EPS);
    expect(typeof slotRect?.w).toBe('number');
    const fillRect = atThisEnemy.find((r) => r !== slotRect);
    expect(typeof fillRect?.w).toBe('number');

    // Criterion 6.4 itself: never empty above 0 hp...
    expect(fillRect!.w).toBeGreaterThan(0);
    // ...and the half a Codex review called most likely to ship wrong: not a FULL bar drawn for a
    // "2 HP" enemy that was accidentally built at 2/2 instead of 2/60.
    expect(fillRect!.w).toBeLessThan(slotRect!.w);
  });

  /**
   * 🔴 **5.11 lived here and has moved to `phase-05-perf.spec.ts`.**
   *
   * Not a tidy-up. It needs a browser this project does not run for anything else — a headed
   * Chromium on the real GPU — because the default headless one falls back to SwiftShader and
   * reports the same scene 21x slower (HANDOFF §14). `playwright.config.ts` gives that spec its own
   * project, and keeping it in this file would have dragged every combat test into it.
   *
   * What was here measured the rAF INTERVAL over 90 frames against a 100 ms ceiling, with
   * `DEV_FLEET_OFFSET_X` putting all twenty enemies off camera. See the new file's header.
   */

  test('5.4 rust-scavenger walk animation advances past frame 0 during patrol', async ({ page }) => {
    await bootToGame(page);

    const SAMPLE_FRAMES = 90;
    const result = await page.evaluate(
      (frameCount) =>
        new Promise<{ isSprite: boolean; animKey: string; frames: number; distinctFrames: number }>(
          (resolve) => {
            const scene = (
              window as unknown as { __phaserGame: PhaserGameHandle }
            ).__phaserGame.scene.getScene('Game') as unknown as GameSceneHandle;
            // The last body is always the last scavenger: `addBody` appends sentries then
            // scavengers, in both `create()` and the growth path (enemyLayer.ts:51-56,107-109), so
            // the shipped level's own baseline scavenger — already patrolling at boot, no keypress
            // needed — is `bodies[bodies.length - 1]`.
            const i = scene.enemies.bodies.length - 1;
            // Rectangle fallback has no `anims` — checked before it is ever read (vault, see header).
            const isSprite = scene.enemies.isSprite[i] === true;
            if (!isSprite) {
              resolve({ isSprite: false, animKey: '', frames: 0, distinctFrames: 0 });
              return;
            }
            const sprite = scene.enemies.bodies[i] as unknown as {
              anims: { currentAnim: { key: string } | null; currentFrame: { index: number } | null };
            };
            const indices = new Set<number>();
            let n = 0;
            const step = () => {
              const frame = sprite.anims.currentFrame;
              if (frame !== null) {
                indices.add(frame.index);
              }
              n++;
              if (n < frameCount) {
                requestAnimationFrame(step);
              } else {
                resolve({
                  isSprite: true,
                  animKey: sprite.anims.currentAnim?.key ?? '',
                  frames: n,
                  distinctFrames: indices.size,
                });
              }
            };
            requestAnimationFrame(step);
          },
        ),
      SAMPLE_FRAMES,
    );

    expect(result.isSprite).toBe(true);
    // Assert the key BEFORE trusting the frame spread — a test that silently sampled `idle` or
    // `chase` must not be able to pass by accident.
    expect(result.animKey).toBe('rust-scavenger-walk');
    // The sample loop ran the whole window — cannot pass by measuring nothing.
    expect(result.frames).toBe(SAMPLE_FRAMES);
    // More than one distinct DISPLAYED frame index: the frame-0 bug (enemyView.ts Guard G3) is a
    // walk cycle that never leaves frame 0.
    expect(result.distinctFrames).toBeGreaterThan(1);
  });

  /**
   * 🔴 The enemy half of session 9's ghost fix, which was missing for five days.
   *
   * `phase-02-movement.spec.ts` asserts the same property of the PLAYER, and it is the only reason
   * that half stayed fixed. Nothing asked it of the enemies, so `enemyLayer.sync` kept drawing them
   * at raw tick positions on a display faster than 60 Hz — three identical frames, then a jump. The
   * user reported it on 2026-08-14 as the scavenger being *"not smooth like my character"*, which
   * names the exact comparison this file was missing.
   *
   * `tests/unit/enemy-interpolation.test.ts` gates the layer's arithmetic. This gates the wiring
   * that unit test cannot see: that `GameScene` actually calls `snapshot()` before the last tick and
   * feeds `sync()` a live alpha. Deleting either reverts the drawn position to the sim position on
   * every frame, and `maxLag` collapses to 0.
   *
   * Sampled once per `requestAnimationFrame` INSIDE the page and returned as an aggregate — a wait
   * expressed in ticks cannot bound a sampling window, and this suite has produced both a false
   * green and a false red that way.
   */
  test('the drawn enemy is interpolated between ticks, exactly as the player is', async ({
    page,
  }) => {
    await bootToGame(page);

    const sampled = await page.evaluate(
      () =>
        new Promise<{ lags: number[]; simXs: number[] }>((resolve) => {
          const scene = (
            window as unknown as { __phaserGame: PhaserGameHandle }
          ).__phaserGame.scene.getScene('Game') as unknown as GameSceneHandle & {
            world: { enemies: { sentries: unknown[]; scavengers: { x: number }[] } };
            enemies: { bodies: { x: number }[] };
          };
          // Bodies are built sentries-then-scavengers (`enemyLayer.ts`), so the first scavenger's
          // body sits after every sentry. Derived, never the literal index — a level with a
          // different enemy mix must not silently sample a turret.
          const at = scene.world.enemies.sentries.length;
          const lags: number[] = [];
          const simXs: number[] = [];
          let n = 0;
          const step = (): void => {
            const sim = scene.world.enemies.scavengers[0];
            const drawn = scene.enemies.bodies[at];
            if (sim && drawn) {
              lags.push(sim.x - drawn.x);
              // 🔴 The subject's OWN position, recorded alongside. Interpolation is only observable
              // while the thing being interpolated is moving, so a window that caught the scavenger
              // standing still would report every lag as 0 — which is also exactly what the defect
              // this test exists for looks like. Without this the two are indistinguishable, and a
              // full-suite run produced precisely that false red while the test passed alone.
              simXs.push(sim.x);
            }
            // 240 frames rather than 90: a patrol reversal, or a chase paused inside the dead zone,
            // can hold the scavenger still for a stretch, and the window has to outlast it.
            if (++n < 240) requestAnimationFrame(step);
            else resolve({ lags, simXs });
          };
          requestAnimationFrame(step);
        }),
    );

    const { lags, simXs } = sampled;
    expect(lags.length).toBeGreaterThan(30);
    // Non-vacuity, and the diagnosis for the flake above: if the scavenger never moved, this test
    // has measured nothing and must say so in those words rather than failing as "not interpolated".
    expect(
      Math.max(...simXs) - Math.min(...simXs),
      'the scavenger did not move at all during the sample window, so interpolation was not ' +
        'observable — this is a window that caught it standing still, not a body pinned to the tick',
    ).toBeGreaterThan(0);
    // 🔴 The assertion the defect fails. Exactly zero on EVERY frame means the body is pinned to
    // the sim tick, which is the tick-stepping the user reported.
    expect(Math.max(...lags.map(Math.abs))).toBeGreaterThan(0);
    /**
     * Never further behind than ONE tick of the fastest thing a scavenger does.
     *
     * 🔴 This was `6 * RENDER_SCALE` = **36 px**, six times too loose, on the belief that
     * `chaseSpeed` was in sim units needing a scale multiply. It is not: `scavengerRenderDesc`
     * returns `x: scavenger.x` unscaled, so the sim's px and the drawn px are the same px. A frame
     * can drain up to `MAX_TICKS_PER_FRAME` ticks and `GameScene` snapshots before only the LAST
     * of them, so a 36 px ceiling would have accepted a snapshot taken before the whole batch —
     * which is exactly the batch-ordering bug this test exists to catch. Found by the Codex
     * implementation review.
     *
     * Imported, not retyped, so retuning the chase cannot leave a stale ceiling behind *(5.3)*.
     */
    expect(Math.max(...lags.map(Math.abs))).toBeLessThanOrEqual(SCAVENGER.chaseSpeed);
  });
});
