/**
 * Phase 5 combat, in a real browser. Covers 5.7 and 5.11.
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
 * ## 5.11 — a count that cannot pass by not drawing
 *
 * The shipped level already places 2 enemies, so an absolute body count is satisfiable by the
 * baseline alone (vault 9.4). The assertion is the DELTA of `enemies.bodies.length` across the
 * spawn, and it must equal `DEV_FLEET_COUNT` exactly. Frame timing is sampled inside the page once
 * per `requestAnimationFrame` over a fixed frame count and reported as an aggregate — `waitTicks`
 * guarantees only "at least N ticks", never "exactly this window", so it cannot bound a sampling
 * loop (this suite has produced both a false green and a false red that way).
 */

import { expect, test } from '@playwright/test';
import { RENDER_SCALE } from '../../src/game/constants';
import { healthBarDesc } from '../../src/render/enemyHealthBar';
import { BOOT_TIMEOUT, bootToGame } from './gameHarness';

type Page = import('@playwright/test').Page;

// Mirrors `DEV_FLEET_COUNT` in `src/scenes/GameScene.ts` — a private const there, not exported.
const DEV_FLEET_COUNT = 20;

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
}

type PhaserGameHandle = { scene: { getScene(key: string): unknown } };
type GameSceneHandle = {
  world: { enemies: { scavengers: EnemySnapshot[] } };
  enemies: { bodies: unknown[]; isSprite: boolean[]; bars: { commandBuffer: number[] } };
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

/** Waits for the drawn body count to reach at least `target` — the EnemyLayer growth path runs
 * inside `sync()`, called every `GameScene.update()` (every rAF), not synchronously with the spawn. */
async function waitForBodyCount(page: Page, target: number): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const scene = (window as unknown as { __phaserGame: PhaserGameHandle }).__phaserGame.scene.getScene(
        'Game',
      ) as unknown as GameSceneHandle;
      return scene.enemies.bodies.length >= n;
    },
    target,
    { timeout: BOOT_TIMEOUT },
  );
}

test.describe('Phase 5 — combat', () => {
  test('5.7 a live enemy at 2/60 hp draws a non-empty, non-full health bar', async ({ page }) => {
    await bootToGame(page);
    const before = await snapshot(page);

    await page.keyboard.press('m');
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
    const atThisEnemy = after.barRects.filter(
      (r) => Math.abs(r.x - desc.x) < EPS && Math.abs(r.y - desc.y) < EPS,
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

  test('5.11 worst-case fleet: drawn body count grows by exactly N, frame budget measured', async ({
    page,
  }) => {
    await bootToGame(page);
    const before = await snapshot(page);

    await page.keyboard.press('n');
    await waitForScavengerCount(page, before.scavengers.length + DEV_FLEET_COUNT);
    await waitForBodyCount(page, before.bodyCount + DEV_FLEET_COUNT);

    const after = await snapshot(page);
    expect(typeof after.bodyCount).toBe('number');
    // The DELTA, not an absolute — the shipped level's own 2 enemies would satisfy an absolute
    // count on their own, and "fast because nothing new was drawn" is the failure this excludes.
    expect(after.bodyCount - before.bodyCount).toBe(DEV_FLEET_COUNT);

    // Type before value (vault C1). Without this, replacing all 20 fleet sprites with the cheaper
    // Rectangle fallback would still satisfy the body-count assertion above — and would make the
    // frame budget look BETTER, so the render-path check and the perf number must travel together.
    expect(typeof after.spriteCount).toBe('number');
    expect(after.spriteCount - before.spriteCount).toBe(DEV_FLEET_COUNT);

    // Sampled inside the page, once per rAF, over a FIXED frame count — never `waitTicks`, which
    // only bounds "at least N ticks" and cannot bound a sampling window.
    const SAMPLE_FRAMES = 90;
    const budget = await page.evaluate(
      (frameCount) =>
        new Promise<{ frames: number; maxMs: number; medianMs: number }>((resolve) => {
          const deltas: number[] = [];
          let last = performance.now();
          const step = () => {
            const now = performance.now();
            deltas.push(now - last);
            last = now;
            if (deltas.length < frameCount) {
              requestAnimationFrame(step);
            } else {
              const sorted = [...deltas].sort((a, b) => a - b);
              resolve({
                frames: deltas.length,
                maxMs: sorted[sorted.length - 1]!,
                medianMs: sorted[Math.floor(sorted.length / 2)]!,
              });
            }
          };
          requestAnimationFrame(step);
        }),
      SAMPLE_FRAMES,
    );

    expect(typeof budget.frames).toBe('number');
    // The sample loop itself ran the full window — cannot pass by measuring nothing.
    expect(budget.frames).toBe(SAMPLE_FRAMES);
    // eslint-disable-next-line no-console
    console.log(
      `[5.11] frame budget under ${before.bodyCount + DEV_FLEET_COUNT} drawn enemy bodies: ` +
        `${budget.frames} frames, median ${budget.medianMs.toFixed(2)}ms, max ${budget.maxMs.toFixed(2)}ms`,
    );
    // No prior measurement exists (PRD §7: "the vault has nothing on performance" for this phase).
    // Measured on this dev box under a headless-Chromium + Vite-dev-server load, median lands
    // ~55-64ms (a real, reportable number, not a target) — so 100ms (a 10fps floor) is a generous
    // sanity ceiling meant to catch a hang or an O(n^2) regression, not a tuned budget, and it does
    // not flake this gate on a loaded CI box.
    expect(budget.medianMs).toBeLessThan(100);
    // A median at or near 0 means the sampler never actually ran across real frames — a false
    // green, not a fast one.
    expect(budget.medianMs).toBeGreaterThan(0);
  });

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
});
