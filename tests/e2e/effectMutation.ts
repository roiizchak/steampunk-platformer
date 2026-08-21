/**
 * Criteria 9.5 and 9.6's proving mutations, **committed** — a sustained particle storm driven
 * through the game's own emitters, and the `setScale(0)` that makes a storm draw nothing.
 *
 * ## Why it lives here and not in `src/`
 *
 * `scrimMutation.ts`'s header draws the line and this side of it is the same side: the thing being
 * amplified is a RENDERING cost, and it can be added to the running game from the page without
 * touching a shipped file. Phase 7's cue stall could not be — a per-cue stall has to sit inside
 * `playCues` — so that one is a DEV-only query flag in `src/game/audio.ts`. This one has no such
 * need, and a mutation that never enters `src/` cannot leak into `dist/` however `verify-dist.mjs`
 * is written. It also keeps `?storm=` out of the bundle, which matters more than usual now that
 * `verify-dist.mjs` fails the build on `URLSearchParams` reaching it.
 *
 * ## Why it is committed at all
 *
 * *"A gate that cannot go red is decoration, and so is one whose red proof has to be reinvented."*
 * 6.9's floor was **bracketed rather than measured** — one scrim invisible, five reading 2.688,
 * nothing between them ever run — because re-creating the mutation by hand is a ritual nobody
 * repeats. Both proofs here are one shell variable:
 *
 * ```
 * PERF_MUTATION=storm8192   npm run test:e2e -- tests/e2e/phase-09-perf.spec.ts   # 9.5 red
 * PERF_MUTATION=scale0      npm run test:e2e -- tests/e2e/phase-09-perf.spec.ts   # 9.6 red
 * ```
 *
 * ## 🔴 The REAL emitters, never a duplicate
 *
 * Everything below reaches `window.__phaserGame` → `scene.getScene('Game')` →
 * `EffectAttachment.emitters()`, the handle the scene publishes for exactly this. The particles are
 * therefore the shipped ones: the shipped lifespans, speeds, gravity, scale and alpha ramps, the
 * shipped depth band, the shipped NORMAL blend, `explode()` through the shipped code path. A fixture
 * that stands up its own emitter would measure a fixture.
 *
 * ## What the storm is, and why it is a top-up rather than a burst
 *
 * `EMITTER_SPECS` caps each emitter at a `maxAliveParticles` that `atLimit()` enforces by DROPPING
 * emit requests, so a single `explode()` cannot hold a population — the particles expire on their
 * own 18/45/22-tick lifespans and the frame after is cheap again. A window sampled over that
 * measures the decay, not the load.
 *
 * So the storm raises each cap and then, once per animation frame, tops each emitter back up to it:
 * the population is **held at N**, and the creation rate is set by the particles' own death rate
 * rather than by the frame rate. Per-kind caps are scaled from the shipped ones, so a storm of N is
 * a scaled-up version of the shipped worst case and not a different mix of it.
 */

import { expect, type Page } from '@playwright/test';

import { EMITTER_SPECS, type EffectKind } from '../../src/render/effects';
import { EFFECT_KINDS, EFFECT_SAMPLE_TICKS, SHIPPED_PEAK_ALIVE } from './effectBudget';
import { DEV_FLEET_COUNT, MIN_SAMPLES } from './perfBudget';
import { counts, sample, waitForBodyCount, type Sample } from './perfSampler';

/**
 * The per-kind population for a storm of `alive` particles, in the shipped 32 : 48 : 16 proportion.
 *
 * Exported and pure so the spec can assert the split lands, rather than trusting that it did. Every
 * value in `SWEEP_ALIVE` divides this way exactly — the rounding sums back to `alive` at each of
 * them, which the spec checks rather than this comment claiming it.
 */
export function stormCaps(alive: number): Record<EffectKind, number> {
  const caps = {} as Record<EffectKind, number>;
  for (const kind of EFFECT_KINDS) {
    caps[kind] = Math.round((EMITTER_SPECS[kind].maxAliveParticles * alive) / SHIPPED_PEAK_ALIVE);
  }
  return caps;
}

/**
 * Install the harness loop: one `requestAnimationFrame` that tops the emitters up to their caps and
 * holds the player out of combat. Call once per page, before any arm.
 *
 * ## One loop, always running, even in the zero arm
 *
 * The loop runs in EVERY arm including `N = 0`, so whatever it costs divides out of the comparison.
 * A loop installed only for the storm would be part of the difference it is measuring — *an A/B
 * toggle bounds only what differs between its arms*, and this is that mistake in reverse.
 *
 * ## 🔴 The player is held invulnerable, and that is what makes the sweep ORDER
 *
 * `player.iFrameCounter = 0` reopens the grace window `combat.invulnerable()` reads, so
 * `damagePlayer` refuses every hit and no `freezePair` runs. Without it the shipped effects path
 * fires its own bursts whenever a sentry lands a bolt — and because `atLimit()` DROPS rather than
 * evicts, those bursts succeed in the cheap arms and are dropped in the expensive ones. That is an
 * inversion built into the measurement: a low-N window would carry combat particles a high-N window
 * refused, and the sweep would be measuring which arm the game was allowed to interrupt.
 *
 * It reaches into `scene.simWorld`, which is the same latitude `phase-08-gate-perf.spec.ts`'s
 * `parkAtExit` takes for the same reason (*"`costLevelSize` already sets the precedent for editing
 * `scene.world` to shape a perf window"*) and strictly less invasive than its answer, which was to
 * delete every enemy. Here the twenty stay, and they are the point: they are the declared worst-case
 * enemy load this measurement is taken on top of.
 *
 * The enemies still decide, still walk, still fire, and their bolts still fly and expire. The only
 * thing suppressed is damage TO the player, applied identically in every arm.
 */
export async function installStorm(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface E {
      getAliveParticleCount(): number;
      explode(count: number, x: number, y: number): unknown;
    }
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as {
      effects: { emitters(): Record<string, E> };
      simWorld: { player: { iFrameCounter: number } };
      cameras: { main: { worldView: { x: number; y: number; width: number; height: number } } };
    };
    const w = window as unknown as { __fxStorm?: { caps: Record<string, number>; raf: number } };
    if (w.__fxStorm !== undefined) {
      return;
    }
    const emitters = scene.effects.emitters();
    const handle: { caps: Record<string, number>; raf: number } = { caps: {}, raf: 0 };
    w.__fxStorm = handle;
    const step = (): void => {
      scene.simWorld.player.iFrameCounter = 0;
      const view = scene.cameras.main.worldView;
      const x = view.x + view.width / 2;
      const y = view.y + view.height / 2;
      for (const [kind, emitter] of Object.entries(emitters)) {
        const deficit = (handle.caps[kind] ?? 0) - emitter.getAliveParticleCount();
        if (deficit > 0) {
          // The shipped `explode`, the same call `gameEffects.emit` makes. `emitParticle` breaks at
          // the cap on its own, so asking for the deficit can never overshoot it.
          emitter.explode(deficit, x, y);
        }
      }
      handle.raf = requestAnimationFrame(step);
    };
    handle.raf = requestAnimationFrame(step);
  });
}

/**
 * Hold `alive` particles on screen from the next frame on. `0` empties the emitters and restores the
 * shipped ceilings.
 *
 * 🔴 **Every call kills the live population first**, and that is not tidiness. Dropping from 1024 to
 * 64 without it leaves 1024 particles decaying over their own 18/45/22-tick lifespans — a third of
 * the next window would be measuring the previous arm. Killing first makes each window start from an
 * empty pool and reach its cap within a frame, so the window measures its own arm and only its own.
 *
 * The emit point is the camera's world-view centre rather than the player's body: the body moves and
 * the camera does not have to, which keeps the population inside the view for the whole window
 * without any arm having to steer. Nothing about the COST depends on where they are — Phaser's
 * particle renderer has no per-particle cull — but a storm the camera cannot see would make
 * `particleCounts().inView` a lie, and 9.6 is about exactly that class of lie.
 */
export async function setStorm(page: Page, alive: number): Promise<void> {
  await page.evaluate(
    ({ caps, shipped }: { caps: Record<string, number>; shipped: Record<string, number> }) => {
      interface E {
        maxAliveParticles: number;
        getParticleCount(): number;
        reserve(n: number): unknown;
        killAll(): unknown;
      }
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as {
        effects: { emitters(): Record<string, E> };
      };
      const w = window as unknown as { __fxStorm?: { caps: Record<string, number> } };
      if (w.__fxStorm === undefined) {
        throw new Error('setStorm before installStorm — the top-up loop is not running');
      }
      w.__fxStorm.caps = caps;
      for (const [kind, emitter] of Object.entries(scene.effects.emitters())) {
        const cap = caps[kind]!;
        emitter.killAll();
        emitter.maxAliveParticles = cap > 0 ? cap : shipped[kind]!;
        // `reserve` up front, exactly as `createEmitter` does at attach time: a burst that has to
        // allocate is a GC spike at the moment the budget is tightest, and it would be attributed to
        // whichever arm happened to grow the pool first.
        const shortfall = cap - emitter.getParticleCount();
        if (shortfall > 0) {
          emitter.reserve(shortfall);
        }
      }
    },
    {
      caps: stormCaps(alive) as Record<string, number>,
      shipped: Object.fromEntries(
        EFFECT_KINDS.map((kind) => [kind, EMITTER_SPECS[kind].maxAliveParticles]),
      ),
    },
  );
  // 🔴 A POSITIVE terminal condition on the population, never a sleep and never a tick count. The
  // top-up runs on the next animation frame, so the arm is not the arm it says it is until this
  // holds — and a wait expressed in ticks cannot bound it: `waitTicks` guarantees *at least* N, and
  // this suite has produced a false green and a false red that way.
  //
  // It waits on ALIVE rather than on `particleCounts().drawn`, deliberately: `setScale(0)` leaves
  // every particle alive and draws none, so a wait on `drawn` would time out under the very
  // mutation the 9.6 assertion has to survive long enough to fail.
  await page.waitForFunction(
    (target: number) => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as {
        effects: { emitters(): Record<string, { getAliveParticleCount(): number }> };
      };
      let live = 0;
      for (const emitter of Object.values(scene.effects.emitters())) {
        live += emitter.getAliveParticleCount();
      }
      return target === 0 ? live === 0 : live >= target;
    },
    alive,
    { timeout: 20_000 },
  );
}

/**
 * 9.6's red proof: scale the three emitters to zero, or back to one.
 *
 * 🔴 **This is the mutation the 9.6 assertion NAMES, not a convenient one.** Its whole argument is
 * that an alive count proves emitter state and not draw submission, and `setScale(0)` is the
 * counter-example the argument is built on: every particle stays alive, `visible` stays true, alpha
 * stays 1, positions stay valid, and Phaser clears the emitter's transform render flag so
 * `renderWebGL` is never called for it. The frame gets CHEAPER and draws nothing.
 *
 * A gate that survives this is measuring emitter bookkeeping. `perfSampler.ts:212-224` records the
 * same mutation defeating the same class of assertion one layer down, on enemy bodies, as Codex 5.14
 * blocker 1.
 */
export async function setEmitterScale(page: Page, scale: number): Promise<void> {
  await page.evaluate((s) => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as {
      effects: { emitters(): Record<string, { setScale(v: number): unknown }> };
    };
    for (const emitter of Object.values(scene.effects.emitters())) {
      emitter.setScale(s);
    }
  }, scale);
}

/**
 * Read the storm size out of `PERF_MUTATION`, e.g. `storm4096`. Zero when unset or not a storm.
 *
 * The amplification IS the mutation the 9.5 bound names: same emitters, same specs, same code path,
 * more of them. If the measured work moves, the only thing that moved is how many particles the
 * frame carried — which is the quantity the bound is about.
 */
export function stormCount(mutation: string): number {
  const match = /^storm(\d+)$/.exec(mutation);
  return match === null ? 0 : Number(match[1]);
}

/** True for `PERF_MUTATION=scale0`, the 9.6 proof. */
export function wantsZeroScale(mutation: string): boolean {
  return mutation === 'scale0';
}

/**
 * Put the declared worst-case ENEMY load on screen, and assert it landed.
 *
 * The delta rather than an absolute, exactly as `phase-05-perf.spec.ts` takes it: the level's own
 * enemies satisfy an absolute count on their own, and *"fast because nothing new was drawn"* is the
 * failure this excludes.
 *
 * ⚠️ `DEV_FLEET_COUNT` is a **declared** worst case, not a bound. Finding S5 in
 * `docs/qa/phase-05-combat-08-gate-10.md:121` is still open — nothing in `src/sim/` or the level
 * format caps concurrent enemies, so "max enemies" here means *the largest fleet this project
 * measures*. The particles beside them are different in kind: `atLimit()` drops rather than evicts,
 * so `SHIPPED_PEAK_ALIVE` is a ceiling by construction.
 */
export async function spawnWorstCaseFleet(page: Page): Promise<void> {
  const before = await counts(page);
  await page.keyboard.press('n');
  await waitForBodyCount(page, before.bodies + DEV_FLEET_COUNT);
  const after = await counts(page);
  expect(typeof after.sprites, 'body counts must be typed before they are compared').toBe('number');
  expect(after.bodies - before.bodies, 'the dev fleet did not spawn').toBe(DEV_FLEET_COUNT);
  // Type before value, and the vault 9.4 guard: twenty bodies swapped for the cheaper Rectangle
  // fallback still satisfies the body count, and makes every number in the spec LOOK better.
  expect(after.sprites - before.sprites, 'the fleet drew as Rectangles, not Sprites').toBe(
    DEV_FLEET_COUNT,
  );
}

/**
 * Put the page into one arm and take one window from it, with the two guards
 * `phase-07-perf.spec.ts` puts on every arm of its pair loop.
 *
 * Here rather than in the spec for the seam `polishSeries.ts` states: everything about *how the game
 * is observed* travels with the instrument, and *"a reading whose preconditions are unchecked is not
 * a reading"* — so the frame-count and tick-span guards live beside the call that produces them.
 * The spec keeps the claims. It is also what holds that file under the 400-line rule.
 */
export async function sampleArm(page: Page, alive: number, label: string): Promise<Sample> {
  await setStorm(page, alive);
  const measured = await sample(page, EFFECT_SAMPLE_TICKS);
  expect(measured.frames, `${label}: too few frames to reduce`).toBeGreaterThan(MIN_SAMPLES);
  expect(measured.ticks, `${label}: short window`).toBeGreaterThanOrEqual(EFFECT_SAMPLE_TICKS);
  return measured;
}
