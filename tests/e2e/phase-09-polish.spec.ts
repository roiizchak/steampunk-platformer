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

/** One deduped tick, read in one synchronous callback. `ox`/`oy` are the camera's offset from its
 * unshaken base — `gameEffects.applyShake` writes `camera.x`/`.y`. */
interface Sample {
  tick: number; hp: number; x: number; y: number; vx: number; vy: number;
  grounded: boolean; ox: number; oy: number;
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
interface WaitSpec {
  kind: 'run' | 'drop' | 'airborneDrop' | 'land';
  /** For `run`, the gap-free series length required; otherwise ticks recorded after the event. */
  n: number;
}

/** Generous: a real hang still fails as a timeout rather than passing as a long-enough sleep. */
const RUN_TIMEOUT = 60_000;
/** Ticks recorded after the event a test reduces. Longer than the 6-tick freeze, with slack. */
const TAIL_TICKS = 14;

/**
 * Install the per-frame recorder — every test's data comes from this one array. `window.__game` gives
 * the eight published fields; `grounded` and the camera come off `window.__phaserGame`, the sanctioned
 * route for anything the closed surface does not carry. **No ninth field was added.**
 */
async function installRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    type G = { __phaserGame: { scene: { getScene(k: string): unknown } } };
    const w = window as unknown as G & { __rec?: unknown[]; __view?: unknown; __recRaf?: number };
    const scene = w.__phaserGame.scene.getScene('Game') as {
      simWorld: { player: { grounded: boolean } };
      cameras: { main: { x: number; y: number; width: number; height: number } };
    };
    const cam = scene.cameras.main;
    // The unshaken base, captured while quiescent — boot's own landing shake settled long before
    // `bootToGame` returned — so it is the same pair `attachEffects` captured in `create()`.
    const [baseX, baseY] = [cam.x, cam.y];
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
        const gr = scene.simWorld.player.grounded;
        rec.push({ tick: g.tick, hp: g.health, x, y, vx, vy, grounded: gr, ox: cam.x - baseX, oy: cam.y - baseY });
      }
      w.__recRaf = requestAnimationFrame(step);
    };
    w.__recRaf = requestAnimationFrame(step);
  });
}

/** Wait on a POSITIVE terminal condition computed from the recorded series. Never a sleep. */
async function waitFor(page: Page, spec: WaitSpec): Promise<void> {
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

async function readSeries(page: Page): Promise<Sample[]> {
  const raw = await page.evaluate(() => (window as unknown as { __rec: Sample[] }).__rec);
  expect(Array.isArray(raw)).toBe(true);
  expect(raw.length).toBeGreaterThan(10);
  // 🔴 The camera base assumes a QUIESCENT camera at install — CHECKED here rather than asserted
  // away in a comment. A shake in flight when the base was captured biases every offset in the
  // series and false-REDs every "settled to exactly zero" for a reason unrelated to the game. The
  // first line also types `grounded`, the one field off the untyped `__phaserGame` route *(C1)*.
  expect(typeof raw[0].grounded, 'grounded, off __phaserGame, must be typed').toBe('boolean');
  expect([raw[0].ox, raw[0].oy], 'the camera was not quiescent at install').toEqual([0, 0]);
  // Deduped at record time; asserted here, so a broken dedupe cannot inflate a span.
  for (let i = 1; i < raw.length; i++) expect(raw[i].tick).toBeGreaterThan(raw[i - 1].tick);
  return raw;
}

async function stopDriving(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __drive?: number; __recRaf?: number };
    if (w.__drive !== undefined) cancelAnimationFrame(w.__drive);
    if (w.__recRaf !== undefined) cancelAnimationFrame(w.__recRaf);
  });
}

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
    // Every tick RECORDED inside the six a claw would have frozen. Gap-tolerant: an unobserved tick
    // can neither support nor refute the claim, and the non-empty assertion is what stops that being
    // vacuous. A hazard is a swept rectangle, not a body — `worldDamage.ts` records the exemption.
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
    await waitFor(page, { kind: 'run', n: 12 });
    await page.keyboard.down('Space');
    await waitFor(page, { kind: 'land', n: TAIL_TICKS });
    await page.keyboard.up('Space');
    const series = await readSeries(page);
    const view = await page.evaluate(
      () => (window as unknown as { __view: { w: number; h: number } }).__view,
    );
    await stopDriving(page);
    expect([typeof view.w, typeof view.h]).toEqual(['number', 'number']);
    const landAt = series.findIndex((s, i) => i > 0 && s.grounded && !series[i - 1].grounded);
    expect(landAt, 'a landing must have been recorded').toBeGreaterThan(0);
    const landTick = series[landAt].tick;
    const span = SHAKE.land.durationTicks;
    // From the same table `gameEffects.arm` reads, never a second copy; `land` starts on the hit tick,
    // having no freeze to wait for. 🔴 `landTick` comes from the same `world.tickCount` `arm` reads on
    // the frame the landing is seen, so a drained frame moves BOTH — a gap costs samples, not truth.
    const state: ShakeState = { startedTick: landTick, cmd: SHAKE.land };
    const arc = series.filter((s) => s.tick >= landTick - 6 && s.tick <= landTick + TAIL_TICKS);
    for (const s of arc) {
      expect([typeof s.ox, typeof s.oy]).toEqual(['number', 'number']);
      expect(
        shakeWithinEnvelope(state, s.tick, s.ox, s.oy, view.w, view.h),
        `t=${s.tick} (land=${landTick}): offset (${s.ox}, ${s.oy}) outside the envelope`,
      ).toBe(true);
    }
    // 🔴 Non-vacuity: a camera that never moves satisfies EVERY branch of the envelope — zero is
    // inside the peak box as well as being the required value outside it.
    const running = arc.filter((s) => s.tick >= landTick && s.tick < landTick + span);
    expect(
      running.map((s) => s.tick),
      `shake window t=${landTick}..${landTick + span - 1} went unsampled; nearby: ${arc.map((s) => s.tick)}`,
    ).not.toEqual([]);
    const peak = Math.max(...running.map((s) => Math.max(Math.abs(s.ox), Math.abs(s.oy))));
    expect(peak, 'the camera must actually have MOVED during the shake').toBeGreaterThan(0);
    // 🔴 And the EXACT value: `peak > 0` plus a peak box is not an amplitude claim — a 100×
    // regression (`0.01 * cmd.ax`) is non-zero and inside the box. `shakeOffset` is the same function
    // `applyShake` writes from, deterministic in `(cmd, tick, w, h)`; nothing here need be loose.
    for (const s of running) {
      const w = shakeOffset(SHAKE.land, s.tick, view.w, view.h);
      expect([s.ox, s.oy], `t=${s.tick}: drawn offset != shakeOffset(SHAKE.land, …)`).toEqual([w.x, w.y]);
    }
    // Exactly zero afterwards: a shake settling at 1e-17 leaves the camera permanently off target.
    const settled = arc.filter((s) => s.tick >= landTick + span);
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
