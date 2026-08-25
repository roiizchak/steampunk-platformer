/**
 * The COMBAT-FRAME instrument — Phase 9 debt §1a.
 *
 * ## What it exists to measure, and what 9.5 already covers
 *
 * Criterion 9.5's amended sentence names the worst **steady-state** frame, and the QA log's entry 43
 * says plainly why it cannot name a combat one: `installStorm` pins `player.iFrameCounter = 0` on
 * every frame of every arm, so no hit ever lands. It has to. Without it the shipped effects path
 * fires bursts that `atLimit()` **accepts** in cheap arms and **drops** in expensive ones, and the
 * sweep stops ordering — and monotonicity is the premise every bound in that file rests on.
 *
 * So this instrument does not use a storm at all. The shipped path is the only particle source, the
 * caps are whatever the game ships, and `atLimit()` is never near. **Admission stops being the
 * variable under test by removing the thing that consumed the headroom**, rather than by trying to
 * equalise it — which entry 43 is the record of not working.
 *
 * ## Why the pairs are EVENT-ALIGNED and not two arms
 *
 * ⚠️ **Two arms cannot be matched here, and saying so is the finding.** Combat changes the sim: a
 * landed hit freezes both bodies for `hitstopUntil` ticks and knocks one back. An arm with hits and
 * an arm without therefore run a different number of sim ticks over the same wall clock and put the
 * bodies in different places — they differ in far more than "the combat path", whatever the label
 * says. A paired A/B built that way measures the hit-stop as if it were the burst.
 *
 * The pairing that IS available is inside one run: frames NEAR a combat event against frames FAR
 * from every combat event, on the same page, same population, same fleet, seconds apart.
 *
 * - **near** — frames whose sim tick is within `NEAR_TICKS` of a landed hit. `EffectSpec` lifespans
 *   put the spark burst's whole life inside that span.
 * - **far**  — REST-phase frames at least `REST_MARGIN_TICKS` PAST every hit. `combatDrive.ts` pins
 *   `iFrameCounter` through REST so no event can occur there by construction; the margin only has to
 *   outlast the longest effect lifespan. Probe 2 used a plain distance rule with no rest phase and
 *   watched the control collapse to 56 frames with its median lifted 0.6 → 1.3 ms.
 *
 * Per event, the delta is `max(near work) - median(far work)`: the max on the near side because
 * §1a's question is *the worst combat frame*, the median on the far side because the control wants
 * the typical frame and not its own worst. The headline statistic is the **median of the per-event
 * deltas** — the shape `effectSweep.ts` and `effectCounts.ts` already earn, never a difference of
 * two medians taken across the whole run.
 *
 * ## Nothing here asserts
 *
 * Instrument on this side, claim on the spec side — the seam `brawlArm.ts` and `polishSeries.ts`
 * already establish. The one exception is the `throw` in `reduceCombat` for a run that produced no
 * usable event, because a reduction whose preconditions are unmet is not a reduction.
 */

import type { Page } from '@playwright/test';

/** One animation frame of the run, as recorded inside the page. */
export interface CombatFrame {
  /** `__game.tick` at the top of the frame — the sim's own counter, never a frame index. */
  tick: number;
  /** `performance.now() - frameStart`, rAF's own argument. Everything the main thread already did. */
  work: number;
  /** Live particles across all three shipped emitters. Admission, read from the emitters. */
  alive: number;
  /**
   * Live particles in the SPARK emitter alone.
   *
   * 🔴 **The three-emitter total cannot carry the admission premise and the first draft was wrong to
   * let it.** `combatDrive` hops the player continuously, so `landingDust` is emitting throughout —
   * a run in which every combat burst was DROPPED would still show `alive > 0` inside every hit
   * window and pass. Sparks come from `impactSparks` and nothing else, so this is the count that can
   * actually go to zero when the combat path stops firing.
   */
  sparks: number;
  /** The player's own `lastHitTick`. A change is a `playerHurt` event. */
  playerHitTick: number;
  /** The largest `lastHitTick` across every enemy body. A change is a `light` or `lethal` event. */
  enemyHitTick: number;
  /** How many enemy bodies are at `hp <= 0`. An increase is a `lethal` event. */
  dead: number;
  /** True on frames the driver is spawning the fixture. Excluded from BOTH sides — see `combatDrive.ts`. */
  spawning: boolean;
  /**
   * The driver's phase on this frame, as the driver itself published it.
   *
   * ⚠️ **Read, never inferred, and the difference was a real defect.** The reduction used to select
   * controls by *distance from an observed event* and then print them as "rest frames" — a claim
   * nothing checked. Worse, `startPhasedCombat` runs from a `requestAnimationFrame` callback, AFTER
   * the game loop has already drained this frame's sim ticks, and this harness drains up to 4 ticks
   * per frame: at a FIGHT→REST edge, one or more REST ticks can execute with fight inputs and
   * vulnerability still live. So REST is quiet *in practice and by a wide margin*, but **not "by
   * construction"** — and `restClean` below measures which it was on this run instead of asserting it.
   */
  phase: 'fight' | 'rest' | 'unknown';
  /** Total enemy hp. A DIAGNOSTIC: if it never falls, the player's claw never connected. */
  enemyHp: number;
}

/** A landed hit, and what it turned out to be. */
export interface CombatEvent {
  tick: number;
  kind: 'light' | 'lethal' | 'playerHurt';
}

/**
 * Record every animation frame for `ticks` sim ticks, from inside the page.
 *
 * 🔴 One round trip, not one per frame. `levelDriver.ts` records 200 round trips costing ~40 s of
 * latency, and a per-frame `page.evaluate` would put that latency *inside the thing being timed*.
 *
 * 🔴 `frameStart` is rAF's own argument, read at the TOP of the callback, so `now - frameStart` is
 * the game loop's `update()`, the sim ticks inside it, and the render submission — the same
 * definition `perfSampler.sample()` uses, so the numbers are comparable to 9.5's.
 */
export async function recordCombat(page: Page, ticks: number): Promise<CombatFrame[]> {
  return page.evaluate(
    (wantTicks) =>
      new Promise<CombatFrame[]>((resolve) => {
        interface Body {
          lastHitTick: number;
          hp: number;
        }
        const game = window as unknown as { __game: { tick: number } };
        const scene = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('Game') as unknown as {
          effects: { emitters(): Record<string, { getAliveParticleCount(): number }> };
          simWorld: {
            player: { lastHitTick: number };
            enemies: { sentries: Body[]; scavengers: Body[] };
          };
        };
        const out: CombatFrame[] = [];
        const firstTick = game.__game.tick;
        const step = (frameStart: number): void => {
          const work = performance.now() - frameStart;
          let alive = 0;
          let sparks = -1;
          for (const [kind, e] of Object.entries(scene.effects.emitters())) {
            const n = e.getAliveParticleCount();
            alive += n;
            // 🔴 `'sparks'`, plural — `EffectKind` in `src/render/effects.ts:32`. The first draft
            // read `'spark'` and would have left this at 0 on every frame: a permanent false red
            // that looks exactly like the defect it is meant to catch. `-1` when the key is absent
            // makes a renamed emitter a LOUD failure rather than a silent zero.
            if (kind === 'sparks') sparks = n;
          }
          const w = scene.simWorld;
          let enemyHitTick = -1;
          let dead = 0;
          let enemyHp = 0;
          for (const body of [...w.enemies.sentries, ...w.enemies.scavengers]) {
            if (body.lastHitTick > enemyHitTick) enemyHitTick = body.lastHitTick;
            if (body.hp <= 0) dead += 1;
            enemyHp += body.hp;
          }
          out.push({
            tick: game.__game.tick,
            work,
            alive,
            sparks,
            playerHitTick: w.player.lastHitTick,
            enemyHitTick,
            dead,
            spawning: (window as unknown as { __spawning?: boolean }).__spawning === true,
            phase: ((window as unknown as { __phase?: string }).__phase ?? 'unknown') as
              | 'fight'
              | 'rest'
              | 'unknown',
            enemyHp,
          });
          if (game.__game.tick - firstTick < wantTicks) {
            requestAnimationFrame(step);
          } else {
            resolve(out);
          }
        };
        requestAnimationFrame(step);
      }),
    ticks,
  );
}

/**
 * The landed hits in a recording, classified from state.
 *
 * ⚠️ **`impactOf` is not reachable from the page**, so the class is re-derived from the two facts
 * that *are* on the sim: whose `lastHitTick` moved, and whether an enemy crossed to `hp <= 0` on the
 * same frame. That is a narrowing and it is stated rather than implied — a hit that kills is reported
 * `lethal` and not also `light`, which is how `gameEffects` treats it too (the death steam is emitted
 * *in addition to* the sparks, under the same `arm(impact)`).
 *
 * 🔴 **One tick is one combat MOMENT, and the probe run is why.** A scavenger's claw calls
 * `freezePair(player, scavenger, 'playerHurt', …)`, so the same blow moves the *enemy's*
 * `lastHitTick` and the *player's* on the same tick — `gameEffects.ts` says so at the line, and the
 * probe of 2026-08-24 duly reported 6 events at 3 distinct ticks. Counting both would pair the same
 * 18-tick window twice and halve the apparent variance for free. They collapse to the highest-ranked
 * kind: `playerHurt` over `lethal` over `light`. ⚠️ A genuine simultaneous land-and-take collapses
 * too; that is a narrowing, it is stated here rather than implied, and the honest reading of a tick
 * is *"one combat moment"*.
 *
 * ⚠️ **These are OBSERVED STAMP CHANGES, not landed hits, and the difference is a real undercount.**
 * The recorder samples once per animation frame and keeps only the `lastHitTick` visible in that
 * snapshot. This harness drains up to 4 sim ticks per frame, so when several hits land inside one
 * frame the intermediate stamps are overwritten and **vanish** — and `dropped` cannot count them,
 * because it only sees events already discovered. A `lethal` can likewise attach a death observed
 * over an interval to that interval's latest hit tick. Raised by the Codex implementation review
 * (2026-08-25).
 *
 * **Renamed rather than fixed**, deliberately: counting every hit exactly needs a tick-level event
 * queue on `window.__game`, and that surface is **closed at eight fields** by a Phase 1 Codex ruling —
 * a ninth is a STOP-and-ask, which is more than a floor assertion is worth. So the gate asserts
 * *"at least N combat moments were observed"*, which is true of an undercount, and no caller claims
 * an exact count.
 *
 * 🔴 A hit is detected by its **stamp changing**, never by a boolean being true on consecutive
 * frames. `gameEffects.ts`'s header records the version of this bug that shipped: a burst keyed on a
 * `frozen` flag fires once per frame it is true, four times for one blow.
 */
export function combatEvents(frames: CombatFrame[], raw = false): CombatEvent[] {
  const byTick = new Map<number, CombatEvent['kind']>();
  const rank: Record<CombatEvent['kind'], number> = { light: 0, lethal: 1, playerHurt: 2 };
  const put = (tick: number, kind: CombatEvent['kind']): void => {
    const had = byTick.get(tick);
    if (had === undefined || rank[kind] > rank[had]) byTick.set(tick, kind);
  };
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1]!;
    const cur = frames[i]!;
    if (cur.enemyHitTick > prev.enemyHitTick) {
      put(cur.enemyHitTick, cur.dead > prev.dead ? 'lethal' : 'light');
    }
    if (cur.playerHitTick > prev.playerHitTick) {
      put(cur.playerHitTick, 'playerHurt');
    }
  }
  const ordered = [...byTick.entries()]
    .map(([tick, kind]) => ({ tick, kind }))
    .sort((a, b) => a.tick - b.tick);
  // 🔴 **Events closer together than one burst window are ONE measurement moment.** Probe 3
  // (2026-08-24) recorded `playerHurt` on seven consecutive ticks, 262-268, and every one of those
  // near windows shared the same worst frame — so a single 41.9 ms spike was counted seven times and
  // walked straight into the median of the per-event deltas. Whatever that median then ordered, it
  // was not the cost of a burst. Collapsing to the FIRST tick of a cluster keeps one window per
  // overlapping group, and the kind kept is the cluster's highest-ranked.
  if (raw) return ordered;
  const clustered: CombatEvent[] = [];
  for (const e of ordered) {
    const last = clustered.at(-1);
    if (last !== undefined && e.tick - last.tick < NEAR_TICKS) {
      if (rank[e.kind] > rank[last.kind]) last.kind = e.kind;
      continue;
    }
    clustered.push({ ...e });
  }
  return clustered;
}

/**
 * How near a frame must be to a hit to carry its burst. Sparks live 18 ticks, dust 22, steam 45 —
 * and the frame this measurement is about is the one the burst is *constructed and first drawn* on,
 * which is inside the first few. 18 covers the spark burst end to end without reaching into the
 * steam tail, where the cost has already decayed into the baseline.
 */
export const NEAR_TICKS = 18;
