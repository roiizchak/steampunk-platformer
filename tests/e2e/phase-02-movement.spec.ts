
/**
 * Phase 2 — movement, in a real browser, through the real keyboard.
 *
 * **Why this file exists at all.** Criteria 2.2, 2.3 and 2.4 are unit tests against `src/sim/`,
 * and every one of them stays green if the keyboard never reaches the simulation — Codex plan
 * review F2b. The sim could be flawless and the game unplayable. So these tests drive
 * `page.keyboard` and read the results back through `window.__game`, which is the only path that
 * crosses every seam: DOM event -> Phaser Key -> `latchJumpPress` -> snapshot -> `advance()` ->
 * `updateDebugState`.
 *
 * Two vault rules shape how they wait:
 *  - **Never `waitForTimeout`.** Every wait is on `window.__game`, so a hang fails as a timeout
 *    instead of passing as a sleep that happened to be long enough.
 *  - **Assert the type before the value** *(C1)*. `player` is `unknown` on the debug surface on
 *    purpose; a prior project passed vacuously on `undefined === undefined`.
 *
 * The tuning values are imported from `src/sim/player.ts`, so expectations are derived from the
 * LIVE knob and bracketed with a floor AND a ceiling *(vault 2.8)*. A hard-coded distance here
 * would encode today's tuning and quietly stop meaning anything after the first Playground session.
 */

import { expect, test } from '@playwright/test';
import { DEFAULT_TUNING } from '../../src/sim/player';
import { BOOT_TIMEOUT, bootToGame, currentTick, readPlayer, waitTicks } from './gameHarness';

test.describe('Phase 2 — player movement', () => {
  test('the simulation actually ticks in a headless browser', async ({ page }) => {
    // The prerequisite for every other test here, and a real hazard: a headless browser can
    // report itself hidden, at which point the engine loop pauses and every movement assertion
    // below would pass vacuously against a frozen world (vault B5).
    await bootToGame(page);

    const before = await currentTick(page);
    await page.waitForFunction((t) => (window.__game?.tick ?? 0) > t + 30, before, {
      timeout: BOOT_TIMEOUT,
    });
    expect(await currentTick(page)).toBeGreaterThan(before + 30);
  });

  test('2.1 holding Right increases x monotonically, within the knob bracket', async ({ page }) => {
    await bootToGame(page);
    await waitTicks(page, 10);

    const start = await readPlayer(page);
    const startTick = await currentTick(page);

    await page.keyboard.down('ArrowRight');

    let previousX = start.x;
    const target = startTick + 90;
    for (;;) {
      const sample = await readPlayer(page);
      expect(sample.x).toBeGreaterThanOrEqual(previousX);
      previousX = sample.x;
      if ((await currentTick(page)) >= target) {
        break;
      }
    }

    await page.keyboard.up('ArrowRight');

    const end = await readPlayer(page);
    const elapsed = (await currentTick(page)) - startTick;
    const travelled = end.x - start.x;

    expect(elapsed).toBeGreaterThan(0);
    // CEILING: nothing can outrun the speed cap. This is the half Codex F2a found missing — a
    // "monotonically increases" assertion alone is satisfied by one pixel of drift, and equally
    // by a runaway with no cap at all.
    expect(travelled).toBeLessThanOrEqual(DEFAULT_TUNING.runMax * elapsed + 1);
    // FLOOR: it has to really move. Loose enough to absorb the acceleration ramp and the ticks
    // spent between the key event and the first sample.
    expect(travelled).toBeGreaterThan(DEFAULT_TUNING.runMax * elapsed * 0.2);

    expect(['run', 'idle', 'jump', 'fall']).toContain(end.state);
  });

  test('2.1 the DRAWN rectangle tracks the sim, not just the debug surface (Codex I5)', async ({
    page,
  }) => {
    // Codex implementation review I5: plan-review F2a was only half applied. Every other assertion
    // in this file reads `window.__game`, which `GameScene.publishDebugState()` writes — so
    // deleting `renderPlayer()` entirely would leave the whole suite green with nothing drawn.
    // This reaches through the dev-only `__phaserGame` handle to the actual Game Object.
    await bootToGame(page);
    await waitTicks(page, 10);

    const readBoth = () =>
      page.evaluate(() => {
        const scene = (
          window as unknown as {
            __phaserGame: { scene: { getScene(k: string): unknown } };
          }
        ).__phaserGame.scene.getScene('Game') as {
          children: { list: { x: number; y: number; width: number; height: number }[] };
        };
        // The player rectangle is the one whose size matches the collision box (26x46).
        const drawn = scene.children.list.find((o) => o.width === 26 && o.height === 46);
        const sim = window.__game?.player as { x?: number; y?: number } | null | undefined;
        return {
          drawn: drawn ? { x: drawn.x, y: drawn.y } : null,
          sim: { x: sim?.x, y: sim?.y },
        };
      });

    const still = await readBoth();
    expect(still.drawn).not.toBeNull();
    expect(typeof still.drawn?.x).toBe('number');
    expect(still.drawn?.x).toBe(still.sim.x);
    expect(still.drawn?.y).toBe(still.sim.y);

    // And it keeps tracking while moving — a one-off position set at create() would pass above.
    await page.keyboard.down('ArrowRight');
    await waitTicks(page, 30);
    const moving = await readBoth();
    await page.keyboard.up('ArrowRight');

    expect(moving.drawn?.x).toBe(moving.sim.x);
    expect(moving.drawn?.y).toBe(moving.sim.y);
    expect(moving.drawn?.x).toBeGreaterThan(still.drawn?.x ?? 0);
  });

  test('2.1 holding Left decreases x, and facing follows', async ({ page }) => {
    await bootToGame(page);
    await waitTicks(page, 10);

    const start = await readPlayer(page);
    await page.keyboard.down('ArrowLeft');
    await waitTicks(page, 40);
    await page.keyboard.up('ArrowLeft');

    const end = await readPlayer(page);
    expect(end.x).toBeLessThan(start.x);
  });

  test('jump reaches the sim through the real keyboard (Codex F2b)', async ({ page }) => {
    await bootToGame(page);
    await waitTicks(page, 15);

    const start = await readPlayer(page);
    expect(start.state).toBe('idle');

    await page.keyboard.down('Space');

    /**
     * Sample the arc EVERY ANIMATION FRAME, in the page.
     *
     * The previous version round-tripped `readPlayer` + `currentTick` per sample and stopped at
     * `tick + 90`. That is the same overshoot bug this suite has now hit three times: two round
     * trips can cost more than 90 ticks of wall clock under parallel workers, so the loop ran once
     * or twice and never observed the descent — `sawDownward` was false and the test failed on a
     * correct game. A wait or bound expressed in ticks cannot bound a SAMPLING window.
     */
    const arc = await page.evaluate(async () => {
      let highest = Number.POSITIVE_INFINITY;
      let sawUpward = false;
      let sawDownward = false;
      let samples = 0;

      for (let frame = 0; frame < 90; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const p = window.__game?.player as { y?: number; vy?: number } | null | undefined;
        if (typeof p?.y !== 'number' || typeof p?.vy !== 'number') {
          continue;
        }
        samples += 1;
        highest = Math.min(highest, p.y);
        if (p.vy < 0) {
          sawUpward = true;
        }
        if (sawUpward && p.vy > 0) {
          sawDownward = true;
        }
      }
      return { highest, sawUpward, sawDownward, samples };
    });
    await page.keyboard.up('Space');

    expect(arc.samples).toBeGreaterThan(50);
    // Rose: the impulse crossed every seam from the DOM event to the integrator.
    expect(start.y - arc.highest).toBeGreaterThan(20);
    // And came back down: vy changed sign, so this is a jump and not a teleport.
    expect(arc.sawUpward).toBe(true);
    expect(arc.sawDownward).toBe(true);

    // Landed again on the platform it left.
    await page.waitForFunction(
      (y) => {
        const p = window.__game?.player as { y?: number; state?: string } | null | undefined;
        return typeof p?.y === 'number' && p.y === y && p.state === 'idle';
      },
      start.y,
      { timeout: BOOT_TIMEOUT },
    );
  });

  test('OS-style key repeat does not bunny-hop the player (emitOnRepeat: false)', async ({
    page,
  }) => {
    // The OS repeats a held key ~30 times a second. If those repeats latched fresh edges the
    // player would bunny-hop forever off one press — the same replay failure vault 2.4 describes,
    // arriving through the browser instead of through the snapshot.
    //
    // This test used to hold Space with `page.keyboard.down` and assert the player ended at rest.
    // MEASURED: Playwright/CDP emits exactly ONE keydown for a three-second hold — no repeats at
    // all. So the old test could never fail from the cause it was named for: decoration, in the
    // precise sense of vault C2. Repeat events are therefore dispatched directly, which is what
    // the OS does and what Phaser's `emitOnRepeat` flag actually filters.
    await bootToGame(page);
    await waitTicks(page, 15);

    const rest = await readPlayer(page);
    expect(rest.state).toBe('idle');

    /**
     * Dispatch `count` Space keydowns IN THE PAGE, sampling the player's y every animation frame,
     * and return the highest point reached.
     *
     * Both halves have to happen in-page. Round-tripping each dispatch is slow enough that under
     * parallel workers the burst spreads across the whole jump arc; and sampling with
     * `waitTicks(30)` afterwards is worse still, because a wait for "at least 30 ticks" OVERSHOOTS
     * arbitrarily far under load — the player jumped, landed and returned to rest before the
     * assertion read anything, and the test passed while the guard was mutated away.
     *
     * MEASURED: with `emitOnRepeat` mutated to `true`, that version passed on 6 parallel workers
     * and failed on 1. Per-frame in-page sampling cannot miss a 65-tick arc.
     */
    const burst = (count: number, repeat: boolean) =>
      page.evaluate(
        async ({ n, isRepeat }) => {
          const send = () => {
            const event = new KeyboardEvent('keydown', {
              code: 'Space',
              key: ' ',
              repeat: isRepeat,
              bubbles: true,
              cancelable: true,
            });
            // `keyCode` is ignored by the KeyboardEvent constructor in Chromium and Phaser keys
            // off it, so it has to be defined after construction or the event reaches nothing.
            Object.defineProperty(event, 'keyCode', { get: () => 32 });
            Object.defineProperty(event, 'which', { get: () => 32 });
            window.dispatchEvent(event);
          };

          let highest = Number.POSITIVE_INFINITY;
          let samples = 0;
          for (let i = 0; i < n; i += 1) {
            send();
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
            const p = window.__game?.player as { y?: number } | null | undefined;
            if (typeof p?.y === 'number') {
              highest = Math.min(highest, p.y);
              samples += 1;
            }
          }
          return { highest, samples };
        },
        { n: count, isRepeat: repeat },
      );

    const release = () =>
      page.evaluate(() => {
        const event = new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true });
        Object.defineProperty(event, 'keyCode', { get: () => 32 });
        Object.defineProperty(event, 'which', { get: () => 32 });
        window.dispatchEvent(event);
      });

    // Positive control: a real (non-repeat) press does reach the game. Without this the test could
    // pass by dispatching events that go nowhere at all.
    const first = await burst(30, false);
    expect(first.samples).toBeGreaterThan(20);
    expect(first.highest).toBeLessThan(rest.y - 20);

    // Back to rest, key still held — never released, exactly as during an OS key repeat.
    await page.waitForFunction(
      (y) => {
        const p = window.__game?.player as { y?: number; state?: string } | null | undefined;
        return typeof p?.y === 'number' && p.y === y && p.state === 'idle';
      },
      rest.y,
      { timeout: BOOT_TIMEOUT },
    );

    // The guard itself: sixty repeats across sixty frames. Not one may become a jump.
    const repeats = await burst(60, true);
    expect(repeats.samples).toBeGreaterThan(40);
    expect(repeats.highest).toBe(rest.y);

    // And a genuine release-then-press still jumps, so the guard blocks repeats rather than
    // blocking everything after the first press ever.
    await release();
    const afterRelease = await burst(30, false);
    expect(afterRelease.highest).toBeLessThan(rest.y - 20);
  });

});
