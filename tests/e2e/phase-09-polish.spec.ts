/**
 * Phase 9 — the BEHAVIOURAL gate on hit-stop, screen shake and the effects depth band (9.1, 9.2). No
 * millisecond is measured here; two reasons to go red cannot be told apart.
 *
 * **The sampling method.** `tick` is one of the eight `window.__game` fields and it is read in the
 * **same synchronous callback** as `player` and `health` — which turns the debug surface into a
 * tick-indexed SERIES: one atomic read per animation frame, deduped by `tick` (the FIRST sample of
 * each; at ~4 frames per tick a raw series shows a six-tick freeze as twenty-four), reduced in Node.
 * ⚠️ **A wait expressed in ticks cannot bound a sampling window**, so nothing here waits N ticks and
 * then looks: Playwright waits on a positive CONDITION computed from the series, never on a sleep.
 *
 * **Why `vy` is load-bearing.** Under ordinary hitstun the player is locked horizontally but
 * **gravity still runs**, so `vy` changes every tick, and a constant NON-ZERO `vy` across six ticks
 * is impossible for a body the sim is still integrating. That one field separates "the freeze works"
 * from "hitstun happened"; `tick` rising over the same span rules out a stalled tab and a stopped
 * game. A grounded hit has `vy === 0` and satisfies the identity check **vacuously** — hence the
 * bunny-hop driver, and hence `firstAirborneHit` refusing to hand any test a grounded hit.
 *
 * **Both arms, same session.** `?hitstop=0` is a committed DEV mutation (`hitstopScaleFromSearch`,
 * `gameLevelPick.ts`): the plateau is PRESENT at scale 1 and ABSENT at scale 0, same page, same
 * build, back to back *(vault C2)*. Without arm B it is a description, not a gate.
 */

import { expect, test, type Page } from '@playwright/test';
import { bootToGame } from './gameHarness';
import { EFFECT_DEPTH, type EffectKind } from '../../src/render/effects';
import { SHAKE, shakeOffset, shakeWithinEnvelope, type ShakeState } from '../../src/render/screenShake';
import { HITSTOP_TICKS } from '../../src/sim/hitstop';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { IFRAME_TICKS } from '../../src/sim/combatTiming';
// The instrument — recorder, positive wait, read-back — lives beside the spec, not in it.
import {
  HOPS,
  RUN_TIMEOUT,
  TAIL_TICKS,
  coveredLanding,
  installRecorder,
  readSeries,
  startHopping,
  stopDriving,
  waitFor,
  type Sample,
} from './polishSeries';

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
async function startBrawl(page: Page): Promise<void> {
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
function contiguous(byTick: Map<number, Sample>, from: number, to: number): Sample[] | null {
  const out: Sample[] = [];
  for (let t = from; t <= to; t++) {
    const s = byTick.get(t);
    if (s === undefined) return null;
    out.push(s);
  }
  return out;
}

/** The bodily state a freeze holds identical. Bit for bit, never within a tolerance. */
const still = (a: Sample, b: Sample): boolean => a.x === b.x && a.y === b.y && a.vx === b.vx && a.vy === b.vy;

/** Drive one brawl arm and return its series. Same page, same build — only `search` differs. */
async function brawlArm(page: Page, search: string): Promise<Sample[]> {
  await bootToGame(page, search);
  await installRecorder(page);
  await waitFor(page, { kind: 'run', n: 8 });
  await startBrawl(page);
  await waitFor(page, { kind: 'airborneDrop', n: TAIL_TICKS });
  const series = await readSeries(page);
  await stopDriving(page);
  return series;
}

/**
 * The first airborne hit with a full window of ticks recorded either side of it. 🔴 **Its two guards
 * live HERE and are deliberately NOT restated as assertions in the tests** — an `expect` repeating
 * the predicate its own input was selected by cannot fail; it looks like a gate and is not one
 * *(C2)*. This throw is the enforcement, so it says what a maintainer will need to hear.
 */
function firstAirborneHit(series: Sample[]): { t0: number; byTick: Map<number, Sample> } {
  const byTick = new Map(series.map((s) => [s.tick, s]));
  const drops = series.filter((s, i) => i > 0 && s.hp < series[i - 1].hp);
  for (const s of drops) {
    if (!s.grounded && s.vy !== 0 && contiguous(byTick, s.tick, s.tick + 7)) return { t0: s.tick, byTick };
  }
  throw new Error(
    `No usable hit in ${series.length} ticks. Usable = AIRBORNE with vy !== 0 (a grounded hit holds ` +
      `vy === 0 for six ticks frozen or not, so the freeze check would pass VACUOUSLY) AND T0..T0+7 ` +
      `all recorded (an unobserved tick cannot be asserted about). ${drops.length} drop(s): ` +
      `[${drops.map((s) => `${s.tick}${s.grounded ? ' gnd' : ''}${s.vy === 0 ? ' vy=0' : ''}`).join(', ')}]. ` +
      `All grounded = the bunny-hop driver stopped working; all airborne = dropped ticks (WaitSpec.run).`,
  );
}

test.describe('9.1 hit-stop freezes the body, in the shipped game, at the tick it claims', () => {
  test.setTimeout(RUN_TIMEOUT * 3);
  test('a claw holds x, y, vx, vy for exactly six ticks — and ?hitstop=0 removes it', async ({ page }) => {
    // 🔴 What makes `waitFor`'s re-arming `drop` condition terminate, asserted rather than argued.
    // Retune `IFRAME_TICKS` under 14 and this names the wait that would start hanging.
    expect(TAIL_TICKS, 'TAIL_TICKS must stay under IFRAME_TICKS or the drop wait can re-arm forever')
      .toBeLessThan(IFRAME_TICKS);
    // ── ARM A: the shipped behaviour ─────────────────────────────────────────────────────────────
    const { t0, byTick } = firstAirborneHit(await brawlArm(page, ''));
    const hit = byTick.get(t0)!;
    // Type before value (C1). The airborne and contiguity guards are NOT repeated here —
    // `firstAirborneHit` enforces both by selection; restating them could not fail.
    for (const f of ['tick', 'hp', 'x', 'y', 'vx', 'vy'] as const) {
      expect(typeof hit[f], `arm A: __game.${f} at T0`).toBe('number');
    }
    const win = contiguous(byTick, t0, t0 + 7)!;
    // T0+1..T0+6 bit-identical to T0 — exactly six, as a COUNT. Then it ENDS: without that last
    // line the count passes for a game that stopped simulating the player altogether.
    expect(
      win.slice(1, 7).filter((s) => still(s, hit)).length,
      `arm A: frozen ticks after T0=${t0} (expected ${HITSTOP_TICKS.playerHurt})`,
    ).toBe(HITSTOP_TICKS.playerHurt);
    expect(HITSTOP_TICKS.playerHurt).toBe(6);
    expect(win[7].x, `arm A: x must move again at T0+7 (t=${t0 + 7})`).not.toBe(hit.x);
    // ── ARM B: the same driver, the same page, the freeze scaled to zero ──────────────────────────
    const b = firstAirborneHit(await brawlArm(page, '?hitstop=0'));
    const bHit = b.byTick.get(b.t0)!;
    const bWin = contiguous(b.byTick, b.t0, b.t0 + 7)!;
    expect(
      bWin.slice(1, 7).filter((s) => still(s, bHit)).length,
      `arm B (?hitstop=0): no tick after T0=${b.t0} may hold the body still`,
    ).toBe(0);
    // The body moved on the very next tick — the plain-language version of the same fact.
    expect(bWin[1].x === bHit.x && bWin[1].vy === bHit.vy).toBe(false);
  });
  test('a HAZARD hit costs health and freezes nothing — the other side of "impact"', async ({ page }) => {
    await bootToGame(page);
    await installRecorder(page);
    await waitFor(page, { kind: 'run', n: 8 });
    // The spike strips in `level-01` sit at x 2304 and 2592 on flat ground; the spawn is at 624.
    // Holding one key is the whole driver — no jumps, no enemies, nothing else that can hurt.
    await page.keyboard.down('ArrowRight');
    await waitFor(page, { kind: 'drop', n: TAIL_TICKS });
    await page.keyboard.up('ArrowRight');
    const series = await readSeries(page);
    await stopDriving(page);
    const at = series.findIndex((s, i) => i > 0 && s.hp < series[i - 1].hp);
    expect(at, 'a hazard hit must have been recorded').toBeGreaterThan(0);
    const drop = series[at];
    const t0 = drop.tick;
    for (const f of ['tick', 'hp', 'x', 'vx', 'vy'] as const) {
      expect(typeof drop[f], `hazard: __game.${f} at T0`).toBe('number');
    }
    // 🔴 **The claim at full resolution, from a gap-tolerant series** — the review's F9, which was
    // recorded as future-proofing rather than closed. The position assertions below can only speak
    // about ticks the harness OBSERVED, so a freeze shorter than the sampling gap slips between two
    // samples; so does a freeze whose deadline has already passed by the time anything is sampled.
    // The sentinel cannot be slipped past. `hitstopUntil` starts at **-1**, nothing ever clears it,
    // and `freezePair` only raises it — so in a run where the only damage source is a swept
    // rectangle it must still read -1 at every sample, and a freeze of ANY length armed at ANY tick
    // leaves a value that is not -1. No tick arithmetic, no dependence on which ticks were seen.
    const armed = series.filter((s) => s.tick <= t0 + HITSTOP_TICKS.playerHurt && s.frozenUntil !== -1);
    expect(
      armed.map((s) => [s.tick, s.frozenUntil]),
      `hazard at T0=${t0}: a freeze deadline was armed; -1 is the never-frozen sentinel`,
    ).toEqual([]);
    // The same claim read off the BODY rather than the deadline, so a freeze applied without going
    // through `freezePair` is caught too. A hazard is a swept rectangle, not a body.
    const after = series.filter((s) => s.tick > t0 && s.tick <= t0 + HITSTOP_TICKS.playerHurt);
    expect(after.length, `hazard: ticks after T0=${t0} were recorded at all`).toBeGreaterThan(0);
    expect(
      after[0].x !== drop.x || after[0].vy !== drop.vy,
      `hazard at T0=${t0}: x or vy must change by t=${after[0].tick} ` +
        `(x ${drop.x}->${after[0].x}, vy ${drop.vy}->${after[0].vy})`,
    ).toBe(true);
    expect(
      after.filter((s) => still(s, drop)).map((s) => s.tick),
      `hazard at T0=${t0}: no tick may hold x/y/vx/vy identical`,
    ).toEqual([]);
  });
});
test.describe('9.2 the effects are sequenced off the tick series, never off an effect completing', () => {
  test.setTimeout(RUN_TIMEOUT * 2);
  test('the landing shake stays inside shakeWithinEnvelope and settles to EXACTLY zero', async ({ page }) => {
    await bootToGame(page);
    await installRecorder(page);
    // 🔴 Nothing awaits `SHAKE_COMPLETE` — `Camera.reset()`/`.destroy()` skip it, so waiting on it
    // hangs on exactly the paths that matter. The wait is the tick series: a landing, then a tail.
    // 🔴 No `{ kind: 'run', n: 12 }` here any more, and its removal is half the flake fix. It asked
    // for twelve CONSECUTIVE gap-free ticks; the same probe that measured the frame rate measured
    // the run lengths, and after the first second the longest gap-free run this harness produces is
    // **1**. The wait was satisfiable only out of the post-boot burst, so on a busy box — the full
    // suite — it was never satisfiable at all and spent its whole 60 s timing out. That is the
    // second failure mode 9.2 showed. Nothing below needs contiguity: it needs a sampled window,
    // which `coveredLanding` establishes positively.
    await startHopping(page);
    await waitFor(page, { kind: 'landings', n: HOPS, tail: TAIL_TICKS });
    const series = await readSeries(page);
    const view = await page.evaluate(
      () => (window as unknown as { __view: { w: number; h: number } }).__view,
    );
    await stopDriving(page);
    expect([typeof view.w, typeof view.h]).toEqual(['number', 'number']);
    // 🔴 The amplitude basis is the DESIGN size, not `view` — re-taken 2026-08-23 for inventory
    // 2b.7. `__view` records the LIVE camera, and `attachEffects` now grows that viewport by the
    // shake margin so a shake cannot uncover the page background: `cam.width` is 1940, not 1920.
    // `applyShake` deliberately passes the design size (feeding the grown size back in would raise
    // the amplitude, which raises the required margin, which raises the amplitude), so the oracle
    // has to name the same two numbers or it is measuring a different shake.
    //
    // `view` is still read, and this assertion still earns its place: it is what catches the
    // recorder returning `undefined`, which would make every offset below compare against NaN.
    expect(view.w, 'the live viewport is not grown — 2b.7 regressed').toBeGreaterThan(GAME_WIDTH);
    const span = SHAKE.land.durationTicks;
    // 🔴 The touchdown the SIM stamped, chosen for tick coverage alone. The paragraph that used to
    // sit here claimed a drained frame "costs samples, not truth" because `landTick` and `arm`'s
    // `tick` moved together — which was wrong twice over: `arm` starts the shake from `hitTick`
    // (`player.landedTick`), not from the frame's `tick`, and the inferred `grounded` edge is a
    // frame late on top of that. Both errors pushed the window past the shake.
    const landTick = coveredLanding(series, span);
    // From the same table `gameEffects.arm` reads, never a second copy; `land` starts on the hit tick,
    // having no freeze to wait for — `shakeStartTick('land', hitTick) === hitTick`.
    const state: ShakeState = { startedTick: landTick, cmd: SHAKE.land };
    const arc = series.filter((s) => s.tick >= landTick - 6 && s.tick <= landTick + TAIL_TICKS);
    for (const s of arc) {
      expect([typeof s.ox, typeof s.oy]).toEqual(['number', 'number']);
      // 🔴 `s.tick - 1`, re-taken 2026-08-23 for inventory 3.1. `applyShake` now reads `tick - 1` so
      // it is in phase with the landing squash, which means the offset a frame REPORTING tick `t`
      // has drawn is the one for index `t - 1`. Re-taken, not loosened — the envelope is unchanged
      // and still exact; only the index the oracle names moved, to the one the renderer uses.
      expect(
        shakeWithinEnvelope(state, s.tick - 1, s.ox, s.oy, GAME_WIDTH, GAME_HEIGHT),
        `t=${s.tick} (land=${landTick}): offset (${s.ox}, ${s.oy}) outside the envelope`,
      ).toBe(true);
    }
    // 🔴 Non-vacuity: a camera that never moves satisfies EVERY branch of the envelope — zero is
    // inside the peak box as well as being the required value outside it.
    // 🔴 `(landTick, landTick + span)`, open at the bottom. A frame reporting `tickCount === landTick`
    // has not executed index `landTick` yet — `fresh` is `[cursor, tick)` — so the touchdown is not
    // stamped, `arm('land')` has not been called, and the camera is correctly at zero. Of `land`'s
    // three ticks the renderer can only ever put TWO on screen, and this is where that is recorded:
    // `applyShake(camera, tick)` draws from the frame's `tickCount` while the landing squash three
    // lines above it draws from `tick - 1`. Left alone here deliberately — a one-tick phase change to
    // a shipped effect is a balance decision with its own gate, not part of unflaking this spec.
    // 🔴 **The window moved by one frame — inventory 3.1, and this is the half the unit layer could
    // not show.** `applyShake` now reads `tick - 1`, so the offset drawn on a frame REPORTING tick
    // `t` is the one for index `t - 1`; the shake's indices `[landTick, landTick + span)` are
    // therefore reported at `[landTick + 1, landTick + span]`.
    //
    // The upper bound went `<` to `<=` because that extra frame is the whole point of 3.1: of
    // `SHAKE.land`'s three ticks the renderer could previously only ever put TWO on screen, and the
    // third is now one of these samples. A window left where it was would have measured the old
    // phase and called the fix a regression.
    const running = arc.filter((s) => s.tick > landTick && s.tick <= landTick + span);
    expect(
      running.map((s) => s.tick),
      `shake window t=${landTick + 1}..${landTick + span - 1} went unsampled; nearby: ${arc.map((s) => s.tick)}`,
    ).not.toEqual([]);
    const peak = Math.max(...running.map((s) => Math.max(Math.abs(s.ox), Math.abs(s.oy))));
    expect(peak, 'the camera must actually have MOVED during the shake').toBeGreaterThan(0);
    // 🔴 And the EXACT value: `peak > 0` plus a peak box is not an amplitude claim — a 100×
    // regression (`0.01 * cmd.ax`) is non-zero and inside the box. `shakeOffset` is the same function
    // `applyShake` writes from, deterministic in `(cmd, tick, w, h)`; nothing here need be loose.
    // 🔴 **1e-9 px, not bit equality — and this is a fact about ECMAScript, not a softened claim.**
    // The left side is computed by Chromium's V8 and the right by Node's, and `Math.sin` is
    // *implementation-approximated* (ECMA-262 §21.3.2.30): the two are permitted to disagree.
    // Measured 2026-08-22 with both engines asked for the same argument:
    // `Math.sin(405 * 12.9898)` is `0.9632082153419407` in the browser and `…08` in Node — **1 ULP**,
    // and `toEqual` red-flagged a perfectly correct camera on 1 run in 12 because of it. (The camera
    // arithmetic is NOT the source: `effects.base()` is exactly `(0, 0)`, so `(0 + x) - 0 === x`.)
    // The bound is six orders of magnitude under the peaks it guards — `land` moves 1.536 px on x
    // and 4.32 px on y at 1920×1080 — so the `0.01 * cmd.ax` regression this loop exists to catch
    // misses by 1.46 px, nine orders clear. Nothing a regression could hide inside.
    const ULP_PX = 1e-9;
    for (const s of running) {
      // 🔴 `s.tick - 1`, re-taken 2026-08-23 for inventory 3.1 — the same index shift as the
      // envelope check above, for the same reason: `applyShake` reads `tick - 1` so it is in phase
      // with the landing squash, and the offset a frame reporting tick `t` has DRAWN is the one for
      // index `t - 1`. The 1e-9 bound is untouched; only the index moved.
      const w = shakeOffset(SHAKE.land, s.tick - 1, GAME_WIDTH, GAME_HEIGHT);
      const err = Math.max(Math.abs(s.ox - w.x), Math.abs(s.oy - w.y));
      expect(
        err,
        `t=${s.tick}: drawn (${s.ox}, ${s.oy}) != shakeOffset(SHAKE.land, …) (${w.x}, ${w.y})`,
      ).toBeLessThan(ULP_PX);
    }
    // Exactly zero afterwards: a shake settling at 1e-17 leaves the camera permanently off target.
    // `+ 1` for the same index shift: the first frame that draws a SETTLED camera is the one
    // reporting `landTick + span + 1`, because the frame reporting `landTick + span` is still
    // drawing index `landTick + span - 1` — the last live tick.
    const settled = arc.filter((s) => s.tick >= landTick + span + 1);
    expect(settled.length, 'the tail after the shake must have been sampled').toBeGreaterThan(2);
    for (const s of settled) {
      expect(s.ox, `t=${s.tick}: ox after the shake window`).toBe(0);
      expect(s.oy, `t=${s.tick}: oy after the shake window`).toBe(0);
    }
  });
  test('the three DRAWN emitters sit strictly inside the (10, 11) depth band', async ({ page }) => {
    await bootToGame(page);
    // 🔴 The only place the APPLIED depth is observable: `effects.ts` pins `EFFECT_DEPTH` and
    // `gameEffects.ts` guards on source text, neither looks at a drawn object, and Task 5 verified a
    // scene-side `setDepth(13)` left all 2051 unit tests green. The band puts particles above the
    // player (10) and below the first `Graphics` (11) so they share one `BatchHandlerQuad` run; at 13
    // the frame gains a flush forever. Selected by TEXTURE KEY — the baked colour IS the identity.
    const drawn = await page.evaluate(() => {
      type G = { __phaserGame: { scene: { getScene(k: string): unknown } } };
      const scene = (window as unknown as G).__phaserGame.scene.getScene('Game') as {
        children: { list: { depth: number; texture?: { key: string } }[] };
      };
      return scene.children.list
        .filter((o) => (o.texture?.key ?? '').startsWith('fx-particle-'))
        .map((o) => ({ key: o.texture?.key ?? '', depth: o.depth }));
    });
    expect(Array.isArray(drawn)).toBe(true);
    expect(drawn.length, 'three emitters are added in GameScene.create()').toBe(3);
    // ⚠️ Three passes, not one loop, and the ORDER is what makes each independently red-provable:
    // band → distinct → identity. Folded together, identity shadows distinctness and distinctness
    // could never be watched failing. Split: `setDepth(13)` reds the band, `setDepth(10.5)` reds
    // distinctness, `setDepth(spec.depth + 0.4)` reds identity.
    for (const e of drawn) {
      expect(typeof e.depth, `emitter ${e.key}: depth type`).toBe('number');
      // The interval is pinned here as its own literal — the same open interval the unit test pins,
      // stated twice on purpose rather than imported as a bound that could move under both at once.
      expect(e.depth, `emitter ${e.key} depth`).toBeGreaterThan(10);
      expect(e.depth, `emitter ${e.key} depth`).toBeLessThan(11);
    }
    expect(new Set(drawn.map((e) => e.depth)).size, 'the three depths must be distinct').toBe(3);
    // And each is ITS OWN entry — one definition, asserted from the drawn side.
    for (const e of drawn) {
      const kind = e.key.replace('fx-particle-', '') as EffectKind;
      expect(EFFECT_DEPTH[kind], `no EFFECT_DEPTH entry for drawn emitter "${e.key}"`).toBeDefined();
      expect(e.depth, `drawn depth of ${kind}`).toBe(EFFECT_DEPTH[kind]);
    }
  });
});
