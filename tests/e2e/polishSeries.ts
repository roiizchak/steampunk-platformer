/**
 * The tick-indexed SERIES instrument behind `phase-09-polish.spec.ts` — the recorder, the positive
 * wait, and the read-back. **No assertions about the game live here**; they live in the spec.
 *
 * Split out when the spec crossed the 400-line rule, in the idiom `gameHarness.ts` already
 * establishes for `tests/e2e/`. The seam is instrument versus claim: everything here is *how the
 * game is observed*, and every `expect` about the observation's validity (the camera at its base,
 * the two `__phaserGame` fields typed, ticks strictly increasing) stays with it, because a reading
 * whose preconditions are unchecked is not a reading.
 */

import { expect, type Page } from '@playwright/test';

/** One deduped tick, read in one synchronous callback. `ox`/`oy` are the camera's offset from its
 * unshaken base — `gameEffects.applyShake` writes `camera.x`/`.y`. `frozenUntil` is the sim's live
 * freeze DEADLINE, which is why a freeze between two samples is still visible from either side. */
export interface Sample {
  tick: number; hp: number; x: number; y: number; vx: number; vy: number;
  grounded: boolean; ox: number; oy: number; frozenUntil: number;
}

/**
 * What a test waits for, as plain DATA: `waitForFunction` serialises its argument, so a closure would
 * have to be stringified and re-evaluated in the page — fragile, and a second copy of the rule.
 * 🔴 `run` is the harness's own RESOLUTION, not a perf number. One `requestAnimationFrame` cannot
 * observe two sim ticks, so a frame that drains three leaves two that can never be sampled. Right
 * after boot this harness drains ~2.7 ticks/frame (shader compilation, texture upload), making
 * "exactly six frozen ticks" not wrong but *unmeasurable*. Every test waits on `run` first — a
 * positive condition on the INSTRUMENT, never a sleep.
 */
export interface WaitSpec {
  kind: 'run' | 'drop' | 'airborneDrop' | 'land';
  /** For `run`, the gap-free series length required; otherwise ticks recorded after the event. */
  n: number;
}

/** Generous: a real hang still fails as a timeout rather than passing as a long-enough sleep. */
export const RUN_TIMEOUT = 60_000;
/** Ticks recorded after the event a test reduces. Longer than the 6-tick freeze, with slack. */
export const TAIL_TICKS = 14;

/**
 * Install the per-frame recorder — every test's data comes from this one array. `window.__game` gives
 * the eight published fields; `grounded` and the camera come off `window.__phaserGame`, the sanctioned
 * route for anything the closed surface does not carry. **No ninth field was added.**
 */
export async function installRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    type G = { __phaserGame: { scene: { getScene(k: string): unknown } } };
    const w = window as unknown as G & { __rec?: unknown[]; __view?: unknown; __recRaf?: number };
    const scene = w.__phaserGame.scene.getScene('Game') as {
      simWorld: { player: { grounded: boolean; hitstopUntil: number } };
      effects: { base(): { x: number; y: number } };
      cameras: { main: { x: number; y: number; width: number; height: number } };
    };
    const cam = scene.cameras.main;
    // 🔴 The unshaken base comes from `attachEffects`, NOT from `cam.x` at install. `applyShake`
    // writes `baseX + offset` every frame, so `cam.x` here is the base plus this frame's offset —
    // and an error CONSTANT from before install cancels out of every sample. `setPosition(baseX + x
    // + 5, …)` passed the whole shake suite under the old zero. Now `ox`/`oy` ARE the applied offset.
    const { x: baseX, y: baseY } = scene.effects.base();
    const rec: Record<string, number | boolean>[] = [];
    w.__rec = rec;
    w.__view = { w: cam.width, h: cam.height };
    let last = -1;
    const step = (): void => {
      const g = window.__game;
      const p = g?.player as { x: number; y: number; vx: number; vy: number } | undefined;
      if (g && p && g.tick !== last) {
        last = g.tick;
        const { x, y, vx, vy } = p;
        const sim = scene.simWorld.player;
        // `hitstopUntil` is a DEADLINE nothing clears and `freezePair` only raises, so a freeze
        // armed between two samples stays legible from any later one — which is what lets a
        // gap-tolerant series make an untolerant claim. See the hazard test.
        rec.push({
          tick: g.tick, hp: g.health, x, y, vx, vy,
          grounded: sim.grounded, frozenUntil: sim.hitstopUntil,
          ox: cam.x - baseX, oy: cam.y - baseY,
        });
      }
      w.__recRaf = requestAnimationFrame(step);
    };
    w.__recRaf = requestAnimationFrame(step);
  });
}

/**
 * Wait on a POSITIVE terminal condition computed from the recorded series. Never a sleep.
 *
 * ⚠️ **`drop` re-arms on the LAST qualifying hit**, deliberately: `firstAirborneHit` may select a
 * later drop than the first, so waiting on the first would drop the tail guarantee for exactly the
 * hits the selector picks. It cannot re-arm forever — every hp drop routes through `damagePlayer`,
 * which grants `IFRAME_TICKS`, so drops are never closer than that. **Asserted in 9.1's body**, not
 * left here as prose.
 */
export async function waitFor(page: Page, spec: WaitSpec): Promise<void> {
  await page.waitForFunction(
    (s: WaitSpec) => {
      const rec = (window as unknown as { __rec?: Sample[] }).__rec ?? [];
      if (rec.length < 2) return false;
      let at = -1;
      let run = 1;
      for (let i = 1; i < rec.length; i++) {
        const [a, b] = [rec[i - 1], rec[i]];
        run = b.tick === a.tick + 1 ? run + 1 : 1;
        const hit =
          s.kind === 'land'
            ? b.grounded && !a.grounded
            : b.hp < a.hp && (s.kind === 'drop' || (!b.grounded && b.vy !== 0));
        if (s.kind !== 'run' && hit) at = b.tick;
      }
      return s.kind === 'run' ? run >= s.n : at >= 0 && rec[rec.length - 1].tick >= at + s.n;
    },
    spec,
    { timeout: RUN_TIMEOUT, polling: 100 },
  );
}

export async function readSeries(page: Page): Promise<Sample[]> {
  const raw = await page.evaluate(() => (window as unknown as { __rec: Sample[] }).__rec);
  expect(Array.isArray(raw)).toBe(true);
  expect(raw.length).toBeGreaterThan(10);
  // Type before value for the two fields off the untyped `__phaserGame` route *(C1)*.
  expect(typeof raw[0].grounded, 'grounded, off __phaserGame, must be typed').toBe('boolean');
  expect(typeof raw[0].frozenUntil, 'hitstopUntil, off __phaserGame, must be typed').toBe('number');
  // 🔴 The camera must be quiescent on the first recorded frame, and this is now a REAL check: the
  // zero comes from `attachEffects.base()`, so a non-zero here means the camera genuinely was not at
  // its base — it is no longer `cam.x - cam.x`, which was true by construction and proved nothing.
  expect([raw[0].ox, raw[0].oy], 'the camera was not at its unshaken base at install').toEqual([0, 0]);
  // Deduped at record time; asserted here, so a broken dedupe cannot inflate a span.
  for (let i = 1; i < raw.length; i++) expect(raw[i].tick).toBeGreaterThan(raw[i - 1].tick);
  return raw;
}

export async function stopDriving(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __drive?: number; __recRaf?: number };
    if (w.__drive !== undefined) cancelAnimationFrame(w.__drive);
    if (w.__recRaf !== undefined) cancelAnimationFrame(w.__recRaf);
  });
}

