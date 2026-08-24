/**
 * The tick-indexed SERIES instrument behind `phase-09-polish.spec.ts` — the recorder, the positive
 * wait, and the read-back. **No assertions about the game live here**; they live in the spec.
 *
 * Split out when the spec crossed the 400-line rule, in the idiom `gameHarness.ts` already
 * establishes for `tests/e2e/`. The seam is instrument versus claim: everything here is *how the
 * game is observed*, and every `expect` about the observation's validity (the camera at its base,
 * the two `__phaserGame` fields typed, ticks strictly increasing) stays with it, because a reading
 * whose preconditions are unchecked is not a reading.
 *
 * 9.2's landing DRIVER (`startHopping`) and its landing SELECTOR (`coveredLanding`) joined them on
 * 2026-08-22 when the flake fix pushed the spec to 434 lines. They belong on this side of the seam
 * for the same reason the recorder does: one drives the game and the other decides which touchdown
 * the harness managed to OBSERVE. Neither says anything about what the camera did — that is the
 * spec's half, and `coveredLanding` reading `ox`/`oy` would be exactly the vacuous shape *(C2)*
 * this suite exists to prevent.
 */

import { expect, type Page } from '@playwright/test';

/** One deduped tick, read in one synchronous callback. `ox`/`oy` are the camera's offset from its
 * unshaken base — `gameEffects.applyShake` writes `camera.x`/`.y`. `frozenUntil` is the sim's live
 * freeze DEADLINE, which is why a freeze between two samples is still visible from either side. */
export interface Sample {
  tick: number; hp: number; x: number; y: number; vx: number; vy: number;
  grounded: boolean; ox: number; oy: number; frozenUntil: number;
  /**
   * 🔴 The sim's own touchdown STAMP (`PlayerSim.landedTick`), not an edge inferred from `grounded`
   * moving between two samples. Measured 2026-08-22: this harness runs 1 tick per frame for about
   * the first second after boot and then settles to **3-4 sim ticks per frame** (SwiftShader, ~18
   * fps), so the inferred edge lags the real touchdown by 1-4 ticks — and `SHAKE.land` lasts 3. The
   * inferred edge therefore pointed PAST the end of the shake roughly one run in three, which is
   * the whole of criterion 9.2's flake. Read the number `gameEffects.arm` read; do not re-derive it.
   */
  landedTick: number;
}

/**
 * What a test waits for, as plain DATA: `waitForFunction` serialises its argument, so a closure would
 * have to be stringified and re-evaluated in the page — fragile, and a second copy of the rule.
 * 🔴 `run` is the harness's own RESOLUTION, not a perf number. One `requestAnimationFrame` cannot
 * observe two sim ticks, so a frame that drains three leaves two that can never be sampled, making
 * "exactly six frozen ticks" not wrong but *unmeasurable*.
 *
 * ⚠️ **`run`'s cost was measured on 2026-08-22 and it is the opposite shape to what this paragraph
 * used to claim.** It said the harness drains ~2.7 ticks/frame *right after boot* and settles. A
 * per-frame probe says the reverse: **1 tick per frame for about the first second, then 3-4 ticks
 * per frame indefinitely** (~18 fps under SwiftShader). So the longest gap-free run available after
 * that first second is **1**, and a `{ kind: 'run', n: 12 }` is satisfiable only out of the opening
 * burst — on a loaded box, not at all, and it then spends its whole 60 s timeout. That was one of
 * criterion 9.2's two failure modes. **Do not add a `run` wait to a new test**: ask for the
 * condition the reduction actually needs. 9.2 asks `landings` + `coveredLanding` instead.
 *
 * 🔴 **2026-08-24: `run` now has NO live call site.** The three that remained were removed — two as
 * pure redundancy, one replaced by `grounded`. It is kept in the union rather than deleted because
 * it is still the honest name for a contiguity requirement, and deleting it would take this
 * paragraph — the reason nobody should ask for one — with it. `tests/e2e/waitFor.spec.ts` pins both
 * halves: `run` unsatisfiable off the measured gap profile, `grounded` satisfiable on it.
 *
 * ⚠️ **A sample COUNT is not the replacement.** "Wait for eight samples" is a sleep wearing a
 * positive condition's clothes: it establishes nothing any reduction needs. Each site was given the
 * condition it actually depends on, and two sites turned out to depend on nothing at all.
 */
export interface WaitSpec {
  kind: 'run' | 'grounded' | 'drop' | 'airborneDrop' | 'land' | 'landings';
  /**
   * For `run`, the gap-free series length required; for `landings`, how many distinct touchdown
   * STAMPS must have been recorded; otherwise ticks recorded after the event. Ignored by `grounded`.
   */
  n: number;
  /** `landings` only: ticks that must also be recorded after the LAST of them. */
  tail?: number;
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
      simWorld: { player: { grounded: boolean; hitstopUntil: number; landedTick: number } };
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
          grounded: sim.grounded, frozenUntil: sim.hitstopUntil, landedTick: sim.landedTick,
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
      // 🔴 Touchdowns counted off the SIM STAMP, so the count does not depend on the harness
      // catching the frame the `grounded` edge happens to be visible on. A stamp older than the
      // recorder (the spawn touchdown, `landedTick: 0`) is not one of ours and is excluded.
      if (s.kind === 'landings') {
        const stamps = [...new Set(rec.filter((r) => r.landedTick > rec[0].tick).map((r) => r.landedTick))];
        const last = stamps[stamps.length - 1];
        return stamps.length >= s.n && rec[rec.length - 1].tick >= last + (s.tail ?? 0);
      }
      // 🔴 The player spawns `grounded: false, state: 'fall'` (`src/sim/world.ts`), so "the game is
      // running" and "the player can jump" are different facts. Any test that presses Jump needs
      // the second one, and a sample COUNT gives neither. Gaps are irrelevant here by construction:
      // once the spawn touchdown is recorded on any frame, it stays recorded.
      if (s.kind === 'grounded') return rec.some((r) => r.grounded);
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
  expect(typeof raw[0].landedTick, 'landedTick, off __phaserGame, must be typed').toBe('number');
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

/**
 * Jump on every touchdown, forever, from INSIDE the page — the landing driver for 9.2.
 *
 * 🔴 **It replaces a single held `page.keyboard.down('Space')`, and the single hop is what made the
 * gate flaky.** Measured on 2026-08-22 with a per-frame probe: this harness runs one tick per frame
 * for roughly the first second after boot and then settles to **3-4 sim ticks per frame** (~18 fps
 * under SwiftShader). `SHAKE.land` lasts **3 ticks**. So whether any frame at all falls inside a
 * given landing's shake window is a coin toss, and one hop gave the test exactly one toss — the
 * `peak > 0` failure. Many hops turn a toss into a selection: `coveredLanding` takes the first
 * touchdown the harness actually sampled inside, and says so loudly when there is none.
 *
 * Full-height hops, released on touchdown rather than after a fixed hold, so consecutive landings
 * are ~70 ticks apart and no landing's 14-tick tail can contain the next one's shake. `keyCode` is
 * forced on for the reason `startBrawl` records.
 */
export async function startHopping(page: Page): Promise<void> {
  await page.evaluate(() => {
    type G = { __phaserGame: { scene: { getScene(k: string): unknown } }; __drive?: number };
    const w = window as unknown as G;
    const key = (type: 'keydown' | 'keyup'): void => {
      const e = new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true });
      Object.defineProperty(e, 'keyCode', { get: () => 32 });
      window.dispatchEvent(e);
    };
    const scene = w.__phaserGame.scene.getScene('Game') as {
      simWorld?: { player: { vy: number; grounded: boolean } };
    };
    let holding = false;
    let leftGround = false;
    const step = (): void => {
      const p = scene.simWorld?.player;
      if (p) {
        if (holding && !p.grounded) leftGround = true;
        if (holding && leftGround && p.grounded) {
          key('keyup');
          holding = false;
          leftGround = false;
        } else if (!holding && p.grounded && p.vy === 0) {
          key('keydown');
          holding = true;
        }
      }
      w.__drive = requestAnimationFrame(step);
    };
    w.__drive = requestAnimationFrame(step);
  });
}

/** How many touchdowns 9.2 drives before choosing one. See `coveredLanding`. */
export const HOPS = 6;

/**
 * The first touchdown STAMP the harness recorded a sample inside, with a full tail and no neighbour.
 *
 * 🔴 **The tick comes from `PlayerSim.landedTick` — the number `gameEffects.arm` itself passed to
 * `shakeStartTick` — never from `grounded` changing between two samples.** The inferred edge is the
 * defect this function exists to remove: a sample at `tickCount` reflects the ticks *before* it, so
 * the edge is visible one tick late at best, and 3-4 ticks late at this harness's steady frame rate.
 * `SHAKE.land` lasts 3, so the inferred tick routinely pointed past the end of the shake it was
 * meant to open, and every offset in the window was a legitimately settled zero. Same lesson as
 * commit 2d59d5b, one layer out: read the stamp, do not re-derive the edge.
 *
 * 🔴 **Every clause here is about TICK COVERAGE — not one of them looks at `ox` or `oy`.** That is
 * what keeps `peak > 0` falsifiable: this selects a landing the harness could see, and the test then
 * says what must have been drawn there. A selector that preferred landings where the camera moved
 * would be the vacuous shape *(C2)* this suite has already found twenty-two of.
 */
export function coveredLanding(series: Sample[], span: number): number {
  const first = series[0].tick;
  const stamps = [...new Set(series.filter((s) => s.landedTick > first).map((s) => s.landedTick))];
  // 🔴 `(L, L+span)` — OPEN at the bottom, and that is a fact about the pipeline, not a fudge.
  // `gameEffects.render` arms on the frame whose `fresh(L)` window `[cursor, tick)` contains `L`,
  // and that frame reports `tickCount >= L + 1`; the frame reporting `tickCount === L` has not run
  // index `L` yet, so no shake is armed and it draws a legitimate zero. The offset for tick `L`
  // itself is therefore never rendered — see the note beside `running` in the test.
  // 🔴 `<= L + span`, not `< L + span`, and this endpoint was fixed one review LATER than the tail
  // below. A frame REPORTING `L+span` draws index `L+span-1` — the last LIVE tick — so the spec's own
  // live set is `tick > L && tick <= L + span` (see `running` in the test). Requiring `< L + span`
  // here rejected a landing whose only sampled live frame is exactly `L+span`, which the exact-offset
  // loop accepts and can verify. Same class of defect as the tail, opposite direction: the first fix
  // corrected one endpoint and left its twin. Caught by the Codex implementation review.
  const inWindow = (L: number): number => series.filter((s) => s.tick > L && s.tick <= L + span).length;
  // 🔴 `L+span+1`, NOT `L+span`, and the `+ 1` is the whole of a latent flake found by the close
  // round's adversarial brief. `applyShake` reads `tick - 1`, so the frame REPORTING `L+span` is
  // still drawing index `L+span-1` — the last LIVE tick — and the spec's settled-tail assertion
  // starts at `L+span+1` for exactly that reason. Counting from `L+span` here promised a tail the
  // assertion would not accept: a landing with three tail samples, one of them on `L+span`, was
  // SELECTED and then FAILED "the tail after the shake must have been sampled". Unreachable at the
  // steady 3-4 tick frame gap this harness measured, reachable as soon as gaps jitter — i.e. on a
  // loaded box, which is this suite's documented failure mode. Pinned by
  // `tests/unit/covered-landing.test.ts`, which asserts the RELATION rather than the constant, so
  // the two cannot drift apart again.
  const inTail = (L: number): number =>
    series.filter((s) => s.tick >= L + span + 1 && s.tick <= L + TAIL_TICKS).length;
  const alone = (L: number): boolean => !stamps.some((o) => o > L && o <= L + TAIL_TICKS);
  const hit = stamps.find((L) => inWindow(L) > 0 && inTail(L) > 2 && alone(L));
  if (hit !== undefined) {
    return hit;
  }
  throw new Error(
    `No usable touchdown among ${stamps.length} in ${series.length} ticks. Usable = at least one ` +
      `sample inside (L, L+${span}] (an unobserved tick cannot be asserted about), more than two in ` +
      `[L+${span}+1, L+${TAIL_TICKS}] for the settled-to-zero tail, and no second touchdown inside ` +
      `that tail. Coverage: ${stamps.map((L) => `${L}:win=${inWindow(L)},tail=${inTail(L)}${alone(L) ? '' : ',crowded'}`).join(' ')}. ` +
      `All win=0 = this harness is draining more than ${span} ticks per frame throughout; raise HOPS.`,
  );
}

