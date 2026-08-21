/**
 * Phase 9 — the BEHAVIOURAL gate on hit-stop, screen shake and the effects depth band (9.1, 9.2).
 * Not one millisecond is measured here; the frame budget is the perf spec's job, and a spec with two
 * reasons to go red has no way to tell them apart.
 *
 * **The sampling method.** `tick` is one of the eight `window.__game` fields and it is read in the
 * **same synchronous callback** as `player` and `health` — which turns the debug surface into a
 * tick-indexed SERIES: one atomic read per animation frame, deduped by `tick` (the FIRST sample of
 * each; at ~4 frames per tick a raw series shows a six-tick freeze as twenty-four), reduced in Node.
 * ⚠️ **A wait expressed in ticks cannot bound a sampling window**, so nothing here waits N ticks and
 * then looks: Playwright waits on a positive CONDITION computed from the series, never on a sleep.
 *
 * **Why `vy` is load-bearing.** Under ordinary hitstun the player is locked horizontally but
 * **gravity still runs**, so `vy` changes every tick, and a constant NON-ZERO `vy` across six
 * consecutive ticks is impossible for a body the sim is still integrating. That one field separates
 * "the freeze works" from "hitstun happened"; `tick` rising across the same span separately rules
 * out a stalled tab and a stopped game. A grounded standing hit has `vy === 0` and satisfies the
 * identity check **vacuously**, which is why the driver bunny-hops and why the chosen hit is
 * asserted airborne first.
 *
 * **Both arms, same session.** `?hitstop=0` is a committed DEV mutation (`hitstopScaleFromSearch`,
 * `gameLevelPick.ts`): the plateau is PRESENT at scale 1 and ABSENT at scale 0, same page, same
 * build, back to back *(vault C2)*. Without arm B it is a description, not a gate.
 */

import { expect, test, type Page } from '@playwright/test';
import { bootToGame } from './gameHarness';
import { EFFECT_DEPTH, type EffectKind } from '../../src/render/effects';
import { SHAKE, shakeWithinEnvelope, type ShakeState } from '../../src/render/screenShake';
import { HITSTOP_TICKS } from '../../src/sim/hitstop';

/**
 * One deduped tick, read in a single synchronous callback in the page. `ox`/`oy` are the camera's
 * offset from its unshaken base — `gameEffects.applyShake` writes `camera.x`/`.y`.
 */
interface Sample {
  tick: number; hp: number; x: number; y: number; vx: number; vy: number;
  grounded: boolean; ox: number; oy: number;
}

/**
 * What a test waits for, as plain DATA: `page.waitForFunction` serialises its argument, so a closure
 * would have to be stringified and re-evaluated in the page — fragile, and a second copy of the rule.
 *
 * 🔴 `run` is the harness's own RESOLUTION, not a perf number. One `requestAnimationFrame` cannot
 * observe two sim ticks, so a frame that drains three leaves two ticks that were never published and
 * can never be sampled. Right after boot this harness drains ~2.7 ticks per frame (shader
 * compilation, texture upload), making "exactly six frozen ticks" not wrong but *unmeasurable*. Every
 * test waits on `run` first — a positive condition on the INSTRUMENT, never a sleep.
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
 * Install the per-frame recorder — every test's data comes out of this one array. `window.__game`
 * supplies the eight published fields; `grounded` and the camera come off `window.__phaserGame`, the
 * sanctioned route for anything the closed surface does not carry. **No ninth field was added.**
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
 *
 * Round trips are not an option — `levelDriver.ts` records 200 of them costing ~40 s of latency.
 * Genuine `KeyboardEvent`s on `window`, with `keyCode` forced on: Phaser's keyboard plugin dispatches
 * on that deprecated field, which `KeyboardEventInit` refuses to set, and a driver without it looks
 * correct and never moves the game.
 *
 * 🔴 **The hops are CUT on purpose.** A full-height jump reaches ~437 px and the scavenger's body is
 * 240 px tall, so for most of a full arc the boxes do not overlap in `y` at all and the claw — 18
 * ticks of startup — goes live at an altitude it cannot reach. A ~50 ms hold cuts the jump to about
 * a third of that, keeping the player inside the claw's reach for the whole cycle **and** airborne
 * for ~97 % of it: an airborne hit becomes ordinary rather than lucky, and it is the only kind that
 * can prove anything about `vy`.
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

/** The bodily state a freeze holds identical. Compared bit for bit, never within a tolerance. */
const still = (a: Sample, b: Sample): boolean =>
  a.x === b.x && a.y === b.y && a.vx === b.vx && a.vy === b.vy;

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

/** The first airborne hit with a full window of ticks recorded either side of it. */
function firstAirborneHit(series: Sample[]): { t0: number; byTick: Map<number, Sample> } {
  const byTick = new Map(series.map((s) => [s.tick, s]));
  for (let i = 1; i < series.length; i++) {
    const s = series[i];
    if (s.hp < series[i - 1].hp && !s.grounded && s.vy !== 0 && contiguous(byTick, s.tick, s.tick + 7))
      return { t0: s.tick, byTick };
  }
  throw new Error(`no airborne health drop with 8 contiguous ticks in ${series.length} samples`);
}

test.describe('9.1 hit-stop freezes the body, in the shipped game, at the tick it claims', () => {
  test.setTimeout(RUN_TIMEOUT * 3);
  test('a claw holds x, y, vx, vy for exactly six ticks — and ?hitstop=0 removes it', async ({ page }) => {
    // ── ARM A: the shipped behaviour ─────────────────────────────────────────────────────────────
    const { t0, byTick } = firstAirborneHit(await brawlArm(page, ''));
    const hit = byTick.get(t0)!;
    // Type before value (vault C1), every field, before anything is compared. Then the guard that
    // stops the whole assertion being vacuous: a grounded standing hit holds `vy === 0` for six
    // ticks whether or not anything is frozen.
    for (const f of ['tick', 'hp', 'x', 'y', 'vx', 'vy'] as const) {
      expect(typeof hit[f], `arm A: __game.${f} at T0`).toBe('number');
    }
    expect(typeof hit.grounded).toBe('boolean');
    expect(Math.abs(hit.vy), 'arm A: the hit must be AIRBORNE, or vy proves nothing').toBeGreaterThan(0);
    expect(hit.grounded).toBe(false);
    // The world kept running while the body did not: eight consecutive ticks were recorded.
    const win = contiguous(byTick, t0, t0 + 7);
    expect(win, 'arm A: ticks T0..T0+7 must all have been recorded').not.toBeNull();
    expect(win!.map((s) => s.tick)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => t0 + n));
    // The freeze itself: T0+1 .. T0+6 bit-identical to T0. Exactly six, asserted as a COUNT. Then it
    // ENDS — without that, the count above passes for a game that stopped simulating altogether.
    expect(
      win!.slice(1, 7).filter((s) => still(s, hit)).length,
      `arm A: frozen ticks after T0=${t0} (expected ${HITSTOP_TICKS.playerHurt})`,
    ).toBe(HITSTOP_TICKS.playerHurt);
    expect(HITSTOP_TICKS.playerHurt).toBe(6);
    expect(win![7].x, `arm A: x must move again at T0+7 (t=${t0 + 7})`).not.toBe(hit.x);

    // ── ARM B: the same driver, the same page, the freeze scaled to zero ──────────────────────────
    const b = firstAirborneHit(await brawlArm(page, '?hitstop=0'));
    const bHit = b.byTick.get(b.t0)!;
    expect(Math.abs(bHit.vy), 'arm B: the hit must be AIRBORNE too').toBeGreaterThan(0);
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
    // Every tick RECORDED inside the six a claw would have frozen. Gap-tolerant on purpose: the claim
    // is "no tick after the hit holds the body still", and a tick the harness never observed can
    // neither support nor refute it — the non-empty assertion is what stops that being vacuous. A
    // hazard is a swept rectangle, not a body; `worldDamage.ts` records the hit-stop exemption as a
    // decision, not an omission, so the body moves again on the very next tick there was one.
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
    // Three ticks is the window here most easily destroyed by a frame that drains several ticks:
    // resolve first, jump second. 🔴 And nothing awaits `SHAKE_COMPLETE` — `Camera.reset()` and
    // `Camera.destroy()` both skip that event, so a spec waiting on it would hang on precisely the
    // paths that matter. The wait is on the tick series: a landing, then a tail longer than the shake.
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

    // Reconstructed from the same table `gameEffects.arm` reads, never a second copy of the numbers;
    // `land` starts on the hit tick itself, having no freeze to wait for. 🔴 Gap-tolerant, and that
    // costs nothing: `landTick` comes from the same `world.tickCount` `arm` reads on the frame the
    // landing is seen, so a frame that drained two ticks moves BOTH by the same amount. A gap costs
    // samples, not correctness — each claim below is true of every tick that WAS observed.
    const state: ShakeState = { startedTick: landTick, cmd: SHAKE.land };
    const arc = series.filter((s) => s.tick >= landTick - 6 && s.tick <= landTick + TAIL_TICKS);
    expect(arc.length).toBeGreaterThan(SHAKE.land.durationTicks * 2);
    for (const s of arc) {
      expect([typeof s.ox, typeof s.oy]).toEqual(['number', 'number']);
      expect(
        shakeWithinEnvelope(state, s.tick, s.ox, s.oy, view.w, view.h),
        `t=${s.tick} (land=${landTick}): offset (${s.ox}, ${s.oy}) outside the envelope`,
      ).toBe(true);
    }
    // 🔴 The non-vacuity half. A camera that never moves satisfies every branch of the envelope: zero
    // is inside the peak box as well as being the required value outside it.
    const running = arc.filter((s) => s.tick >= landTick && s.tick < landTick + SHAKE.land.durationTicks);
    expect(
      running.map((s) => s.tick),
      `the shake window t=${landTick}..${landTick + SHAKE.land.durationTicks - 1} went unsampled; ` +
        `recorded ticks nearby: ${arc.map((s) => s.tick).join(',')}`,
    ).not.toEqual([]);
    const peak = Math.max(...running.map((s) => Math.max(Math.abs(s.ox), Math.abs(s.oy))));
    expect(peak, 'the camera must actually have MOVED during the shake').toBeGreaterThan(0);
    // Exactly zero afterwards, not approximately. A shake settling at 1e-17 leaves the camera
    // permanently off its target and every later assertion inherits the error.
    const settled = arc.filter((s) => s.tick >= landTick + SHAKE.land.durationTicks);
    expect(settled.length, 'the tail after the shake must have been sampled').toBeGreaterThan(2);
    for (const s of settled) {
      expect(s.ox, `t=${s.tick}: ox after the shake window`).toBe(0);
      expect(s.oy, `t=${s.tick}: oy after the shake window`).toBe(0);
    }
  });

  test('the three DRAWN emitters sit strictly inside the (10, 11) depth band', async ({ page }) => {
    await bootToGame(page);
    // 🔴 The only place the APPLIED depth is observable. `effects.ts` pins `EFFECT_DEPTH` and
    // `gameEffects.ts` carries a source-text guard that it passes `spec.depth` — neither looks at a
    // drawn object, and Task 5 verified the gap by hand: a scene-side `setDepth(13)` left all 2051
    // unit tests green. The band puts the particles above the player (10) and below the first
    // `Graphics` (11), so they join the existing `BatchHandlerQuad` run; at 13 the frame gains one
    // flush every frame, forever, and nothing else in the suite would notice. Selected by TEXTURE
    // KEY rather than Phaser's `type` string: `ensureParticleTexture` bakes each kind's colour into
    // its own `fx-particle-<kind>` texture, so the key IS the emitter's identity.
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
    for (const e of drawn) {
      expect(typeof e.depth, `emitter ${e.key}: depth type`).toBe('number');
      // The interval is pinned here as its own literal — the same open interval the unit test pins,
      // stated twice on purpose rather than imported as a bound that could move under both at once.
      expect(e.depth, `emitter ${e.key} depth`).toBeGreaterThan(10);
      expect(e.depth, `emitter ${e.key} depth`).toBeLessThan(11);
      // And each is ITS OWN entry — one definition, asserted from the drawn side.
      const kind = e.key.replace('fx-particle-', '') as EffectKind;
      expect(EFFECT_DEPTH[kind], `no EFFECT_DEPTH entry for drawn emitter "${e.key}"`).toBeDefined();
      expect(e.depth, `drawn depth of ${kind}`).toBe(EFFECT_DEPTH[kind]);
    }
    expect(new Set(drawn.map((e) => e.depth)).size, 'the three depths must be distinct').toBe(3);
  });
});
