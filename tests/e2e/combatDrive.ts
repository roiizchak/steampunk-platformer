/**
 * The PHASED combat driver behind Phase 9 debt §1a. Instrument only — nothing here asserts.
 *
 * ## Why it is phased, and what the unphased version measured
 *
 * The first two probe runs (2026-08-24, both recorded in `docs/qa/session-phase-09-debts-02-perf.md`
 * §Batch 7) drove combat continuously. Both failed, in opposite directions:
 *
 * | probe | driver | what came out |
 * |---|---|---|
 * | 1 | `brawlArm.startBrawl` — hop only, never swings | 3 events in 900 ticks, **all `playerHurt`**, no `light`, no `lethal`. A third of the combat path wearing the name of all of it. |
 * | 2 | + swing + low-hp respawn, fleet adjacent | 23 events, but the control collapsed from **2294 frames to 56** and its median rose 0.6 → 1.3 ms |
 *
 * Probe 2 is the instructive one. **As the event rate rises the control disappears into the effect**,
 * and a "far" frame that is really a decaying near frame lifts the baseline and shrinks every delta —
 * a statistic that gets *quieter* the more combat there is. It also let the driver's own `K`-spawn
 * frames into the near windows: per-event deltas of 33.5 and 43.2 ms next to a 0.9 ms median are the
 * fixture spawning twenty-two bodies, not a spark burst.
 *
 * So the run is phased instead, and both faults close at once:
 *
 * - **FIGHT** (`FIGHT_TICKS`) — swing and hop, hits land, bursts fire. Every combat event is here.
 * - **REST** (`REST_TICKS`) — every key released **and `iFrameCounter` pinned**, so the surrounding
 *   fleet cannot land a claw. No event can occur, by construction rather than by luck.
 *
 * The control is then REST frames: same page, same fleet drawn, same emitters, seconds apart from
 * the frames it is compared against. That is the closest thing to a matched arm this measurement can
 * have — see `combatFrames.ts` for why two *arms* cannot be matched here at all.
 *
 * ⚠️ **Pinning `iFrameCounter` is a harness write into the sim, and it is deliberate.**
 * `installStorm` does the same thing for the same reason and it is signed off in the QA log; the
 * difference is that this one is confined to the REST phase, so the FIGHT phase measures the shipped
 * path with nothing held. `tests/e2e/effectShake.ts` is the standing precedent for a test helper
 * writing sim state — which is exactly why the Batch 5 tween rule scans `src/` and not `tests/`.
 *
 * ⚠️ **`K` fires only during REST, and those frames are FLAGGED.** Spawning twenty-two bodies costs
 * tens of milliseconds; leaving it in the control would deflate every delta, and leaving it in a near
 * window would inflate one. `CombatFrame.spawning` takes them out of both.
 */

import type { Page } from '@playwright/test';

/** Sim ticks of live combat per cycle. Long enough for the claw's 18-tick startup to land blows. */
export const FIGHT_TICKS = 40;

/**
 * Sim ticks of enforced quiet per cycle. Longer than the longest effect lifespan (steam, 45 ticks)
 * so a control frame carries none of the previous fight's particles.
 */
export const REST_TICKS = 60;

/**
 * Drive alternating fight and rest phases from INSIDE the page.
 *
 * 🔴 Round trips are not an option — `levelDriver.ts` records 200 of them costing ~40 s of latency,
 * and here that latency would land inside the frames being timed.
 *
 * 🔴 Genuine `KeyboardEvent`s with `keyCode` forced on: Phaser's keyboard plugin dispatches on that
 * deprecated field, which `KeyboardEventInit` refuses to set, and a driver without it looks correct
 * and never moves the game. `L` (and `F`) is `attack`; `K` is the DEV low-hp scavenger fixture.
 *
 * 🔴 The hops are CUT, for `brawlArm`'s reason: a full-height jump reaches ~437 px against a 240 px
 * scavenger, so the claw goes live at an altitude it cannot reach.
 *
 * The phase is keyed on the **sim tick**, not on a frame count: this harness runs ~4 animation frames
 * per sim tick on the GPU project and ~1/3 of that under SwiftShader, so a frame-counted phase would
 * be a different experiment on each.
 */
export async function startPhasedCombat(page: Page, fight: number, rest: number): Promise<void> {
  await page.evaluate(
    ({ fightTicks, restTicks }: { fightTicks: number; restTicks: number }) => {
      type G = { __phaserGame: { scene: { getScene(k: string): unknown } }; __drive?: number; __spawning?: boolean };
      const w = window as unknown as G;
      const CODES: Record<string, number> = { Space: 32, KeyK: 75, KeyL: 76 };
      const key = (type: 'keydown' | 'keyup', code: string): void => {
        const e = new KeyboardEvent(type, {
          code,
          key: code === 'Space' ? ' ' : code.slice(3).toLowerCase(),
          bubbles: true,
        });
        Object.defineProperty(e, 'keyCode', { get: () => CODES[code] });
        window.dispatchEvent(e);
      };
      const game = window as unknown as { __game: { tick: number } };
      const scene = w.__phaserGame.scene.getScene('Game') as {
        simWorld?: { player: { vy: number; iFrameCounter: number } };
      };
      /** ~3 ticks. Long enough to leave the ground, short enough that the jump cut applies. */
      const HOLD_MS = 50;
      /** One swing per this many frames. The claw has 18 ticks of startup; spamming re-queues it. */
      const SWING_FRAMES = 24;
      /**
       * 🔴 **`0` IS the invulnerable value, and the first version of this file had it backwards.**
       *
       * `invulnerable(player)` is `windowOpen(iFrameCounter, IFRAME_TICKS)` = `counter < 45`
       * (`src/sim/combat.ts:76`, `src/sim/windows.ts:61`), so a SMALL counter is protected and a large
       * one is not. This pinned `9999` "so nothing can expire mid-REST" — which left the player fully
       * vulnerable through every REST phase and made three docstrings' *"no event can occur, by
       * construction"* simply false. `installStorm` has the correct value, `0`, twelve files away.
       *
       * Caught by the 2026-08-25 adversarial gate brief. The aggregate readings survived it only
       * because `reduceCombat` filters control frames by DISTANCE FROM AN EVENT rather than by phase
       * label — an accident, not a design, and the invariant is repaired rather than the accident
       * relied on.
       */
      const REST_IFRAMES = 0;
      /** Saturated: `45 < 45` is false, so the player is vulnerable again the instant FIGHT begins. */
      const FIGHT_IFRAMES = 45;
      const cycle = fightTicks + restTicks;
      let frame = 0;
      let holdUntil = 0;
      let swingOpen = false;
      // The phase EDGE, so FIGHT restores vulnerability once rather than clobbering the sim's own
      // i-frame countdown on every frame of the fight — which would make the player unhittable in a
      // second, subtler way.
      let wasFighting = true;
      const step = (t: number): void => {
        frame += 1;
        const phaseTick = game.__game.tick % cycle;
        const fighting = phaseTick < fightTicks;
        const p = scene.simWorld?.player;

        if (!fighting) {
          // Release everything the fight phase may have left held, then hold the phase quiet.
          if (swingOpen) { key('keyup', 'KeyL'); swingOpen = false; }
          if (holdUntil !== 0) { key('keyup', 'Space'); holdUntil = 0; }
          if (p) p.iFrameCounter = REST_IFRAMES;
          wasFighting = false;
          // The fixture spawn lives here, flagged, so its tens of milliseconds land in neither side.
          // 🔴 Relative to the REST phase's own start, not to the cycle's. The first draft compared
          // `phaseTick` (which is 40..99 during rest) against 2..5 and therefore never fired at all —
          // probe 3 reported `spawn frames 0`, which is what caught it.
          const restTick = phaseTick - fightTicks;
          const spawnWindow = restTick >= 2 && restTick < 6;
          w.__spawning = spawnWindow;
          if (spawnWindow && frame % 2 === 0) key('keydown', 'KeyK');
          if (spawnWindow && frame % 2 === 1) key('keyup', 'KeyK');
        } else {
          w.__spawning = false;
          if (p && !wasFighting) p.iFrameCounter = FIGHT_IFRAMES;
          wasFighting = true;
          const swing = frame % SWING_FRAMES;
          if (swing === 0) { key('keydown', 'KeyL'); swingOpen = true; }
          if (swing === 2) { key('keyup', 'KeyL'); swingOpen = false; }
          // `vy === 0` is the honest "feet are down" test, evaluated every frame rather than gated
          // behind the hold's own deadline.
          if (p) {
            if (holdUntil !== 0 && t >= holdUntil) { key('keyup', 'Space'); holdUntil = 0; }
            if (holdUntil === 0 && p.vy === 0) { key('keydown', 'Space'); holdUntil = t + HOLD_MS; }
          }
        }
        w.__drive = requestAnimationFrame(step);
      };
      w.__drive = requestAnimationFrame(step);
    },
    { fightTicks: fight, restTicks: rest },
  );
}
