/**
 * The BRAWL instrument behind `phase-09-polish.spec.ts`'s criterion 9.1 — the driver, the arm, and
 * the hit selector. **No assertions about the game live here**; they live in the spec.
 *
 * Split out on 2026-08-24 when the D9 repair pushed the spec past the 400-line rule, in the idiom
 * `polishSeries.ts` already establishes for `tests/e2e/`. The seam is instrument versus claim:
 * everything here is *how a hit is produced and chosen*, and the `throw` that refuses an
 * unmeasurable one belongs on this side because a selection whose preconditions are unmet is not a
 * selection.
 */

import type { Page } from '@playwright/test';
import { bootToGame } from './gameHarness';
import { TAIL_TICKS, installRecorder, readSeries, stopDriving, waitFor, type Sample } from './polishSeries';

/**
 * Spawn scavengers next to the player and bunny-hop, from INSIDE the page.
 * Round trips are not an option — `levelDriver.ts` records 200 of them costing ~40 s of latency.
 * Genuine `KeyboardEvent`s on `window`, with `keyCode` forced on: Phaser's keyboard plugin dispatches
 * on that deprecated field, which `KeyboardEventInit` refuses to set, and a driver without it looks
 * correct and never moves the game.
 *
 * 🔴 **The hops are CUT on purpose.** A full-height jump reaches ~437 px against a 240 px scavenger,
 * so across most of an arc the boxes do not overlap in `y` and the claw — 18 ticks of startup — goes
 * live at an altitude it cannot reach. A ~50 ms hold cuts the jump to a third of that, keeping the
 * player in reach for the whole cycle **and** airborne ~97 % of it: an airborne hit becomes ordinary
 * rather than lucky, and it is the only kind that can prove anything about `vy`.
 */
export async function startBrawl(page: Page): Promise<void> {
  await page.evaluate(() => {
    type G = { __phaserGame: { scene: { getScene(k: string): unknown } }; __drive?: number };
    const w = window as unknown as G;
    const CODES: Record<string, number> = { Space: 32, KeyK: 75 };
    const key = (type: 'keydown' | 'keyup', code: string): void => {
      const e = new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : 'k', bubbles: true });
      Object.defineProperty(e, 'keyCode', { get: () => CODES[code] });
      window.dispatchEvent(e);
    };
    const scene = w.__phaserGame.scene.getScene('Game') as { simWorld?: { player: { vy: number } } };
    /** ~3 ticks. Long enough to leave the ground, short enough that the jump cut applies. */
    const HOLD_MS = 50;
    let frame = 0;
    let holdUntil = 0;
    const step = (t: number): void => {
      frame += 1;
      // `K` is the DEV low-hp scavenger fixture (`gameDev.spawnLowHpFixture`). One press per PAIR of
      // frames, three times: Phaser drains its raw key queue once per frame, so two `keydown`s in a
      // single frame collapse into one spawn.
      if (frame <= 6) {
        key(frame % 2 === 1 ? 'keydown' : 'keyup', 'KeyK');
      } else {
        const p = scene.simWorld?.player;
        // `vy === 0` is the honest "feet are down" test — `levelDriver.ts`'s, evaluated every frame
        // rather than gated behind the hold's own deadline.
        if (p) {
          if (holdUntil !== 0 && t >= holdUntil) { key('keyup', 'Space'); holdUntil = 0; }
          if (holdUntil === 0 && p.vy === 0) { key('keydown', 'Space'); holdUntil = t + HOLD_MS; }
        }
      }
      w.__drive = requestAnimationFrame(step);
    };
    w.__drive = requestAnimationFrame(step);
  });
}

/** Every recorded tick from `from` to `to` inclusive, or `null` if the harness missed one. */
export function contiguous(byTick: Map<number, Sample>, from: number, to: number): Sample[] | null {
  const out: Sample[] = [];
  for (let t = from; t <= to; t++) {
    const s = byTick.get(t);
    if (s === undefined) return null;
    out.push(s);
  }
  return out;
}

/** The bodily state a freeze holds identical. Bit for bit, never within a tolerance. */
export const still = (a: Sample, b: Sample): boolean => a.x === b.x && a.y === b.y && a.vx === b.vx && a.vy === b.vy;

/** One attempt at a brawl arm. Same page, same build — only `search` differs. */
export async function brawlOnce(page: Page, search: string): Promise<Sample[]> {
  await bootToGame(page, search);
  await installRecorder(page);
  // 🔴 A `{ kind: 'run', n: 8 }` stood here and established NOTHING: `startBrawl` tests `p.vy === 0`
  // itself every frame, and `airborneDrop` is the real terminal condition. It was also a latent
  // 60 s hang — a `run` wait is satisfiable only out of the opening burst.
  await startBrawl(page);
  await waitFor(page, { kind: 'airborneDrop', n: TAIL_TICKS });
  const series = await readSeries(page);
  await stopDriving(page);
  return series;
}

/**
 * Drive one brawl arm until the harness produces a MEASURABLE hit, or give up loudly.
 *
 * 🔴 **D9's stated cause was wrong.** §1c attributed *"No usable hit in 61 ticks"* to the
 * `{ kind: 'run', n: 8 }` wait in `brawlOnce`. Measured 2026-08-24: a `run` wait failing produces a
 * 60 s Playwright timeout, **not** that message. It comes from `findAirborneHit`, whose
 * `contiguous(t0, t0 + 7)` is the same eight-tick requirement buried in the SELECTOR, where no
 * finding had looked. Removing the wait alone was the convenient fix, not the one D9 names.
 *
 * The contiguity **cannot** be relaxed: arm A asserts *exactly six* frozen ticks as a COUNT, and
 * with a gap that count is not wrong but **unmeasurable**. "At least six sampled" would pass a game
 * frozen forever. So make the event land where the resolution is: per-tick sampling exists only in
 * the opening burst — 90 frames idle, 61 under CPU saturation — and **a re-boot buys a fresh one**.
 * Profile in `docs/qa/session-phase-09-debts.md`.
 */
export const BRAWL_ATTEMPTS = 3;

export async function brawlArm(page: Page, search: string): Promise<Sample[]> {
  let last: Sample[] = [];
  for (let attempt = 1; attempt <= BRAWL_ATTEMPTS; attempt += 1) {
    last = await brawlOnce(page, search);
    if (findAirborneHit(last) !== null) return last;
    console.log(`[9.1] attempt ${attempt}/${BRAWL_ATTEMPTS} sampled no contiguous window; re-booting`);
  }
  return last;
}

/**
 * The first airborne hit with a full window of ticks recorded either side of it. 🔴 **Its two guards
 * live HERE and are deliberately NOT restated as assertions in the tests** — an `expect` repeating
 * the predicate its own input was selected by cannot fail; it looks like a gate and is not one
 * *(C2)*. This throw is the enforcement, so it says what a maintainer will need to hear.
 */
/**
 * The first airborne hit with eight contiguous ticks recorded around it, or `null`.
 *
 * 🔴 `null` means the HARNESS was too slow, never that the game is broken: `airborneDrop` has
 * already resolved, so an airborne hp drop is guaranteed to be in the series and only the sampling
 * resolution around it can be missing. ⚠️ A `'no-drops'` branch was written here and deleted as
 * unreachable — mutation-tested twice (spawn disabled; bunny-hop disabled so every hit is grounded)
 * and in both cases `airborneDrop` times out at 60 s long before this runs.
 */
export function findAirborneHit(series: Sample[]): { t0: number; byTick: Map<number, Sample> } | null {
  const byTick = new Map(series.map((s) => [s.tick, s]));
  const drops = series.filter((s, i) => i > 0 && s.hp < series[i - 1].hp);
  for (const s of drops) {
    if (!s.grounded && s.vy !== 0 && contiguous(byTick, s.tick, s.tick + 7)) return { t0: s.tick, byTick };
  }
  return null;
}

export function firstAirborneHit(series: Sample[]): { t0: number; byTick: Map<number, Sample> } {
  const found = findAirborneHit(series);
  if (found !== null) return found;
  const drops = series.filter((s, i) => i > 0 && s.hp < series[i - 1].hp);
  throw new Error(
    `THE HARNESS, NOT THE GAME: an airborne hit reached the series — the airborneDrop wait cannot ` +
      `resolve without one — but this box never sampled T0..T0+7 contiguously around any of them, ` +
      `and an unobserved tick cannot be asserted about. ${drops.length} drop(s): ` +
      `[${drops.map((s) => `${s.tick}${s.grounded ? ' gnd' : ''}${s.vy === 0 ? ' vy=0' : ''}`).join(', ')}]. ` +
      `Per-tick resolution exists only in the opening burst, so this arm re-boots and retries for ` +
      `exactly this reason — see \`brawlArm\`. Reaching here means every attempt was too slow. ` +
      `Re-run it alone before believing it.`,
  );
}

