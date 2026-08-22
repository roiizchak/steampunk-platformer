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
 * PERF_MUTATION=storm8192      …   # 9.5's absolute bound
 * PERF_MUTATION=scale0         …   # the emitter gate — reds BOTH tests, see the spec's 9.5 note
 * PERF_MUTATION=particlescale0 …   # the per-particle gate, which `scale0` never reaches
 * PERF_MUTATION=fleetscale0    …   # 9.5's twenty enemies, drawn
 * PERF_MUTATION=noshake        …   # 9.5's THIRD load — the shake, see `effectShake.ts`
 * PERF_MUTATION=stall          …   # the sampling window never closes — see `sampleArm`'s stall guard
 * ```
 *
 * Anything else `PERF_MUTATION` is set to **throws** — see `namedMutation`. A proof that silently
 * did not run is worse than no proof, because it comes with a green suite as evidence.
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

import { EMITTER_SPECS, type EffectKind } from '../../src/render/effects';
import { EFFECT_KINDS, SHIPPED_PEAK_ALIVE } from './effectBudget';

type Page = import('@playwright/test').Page;

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
 * 9.6's SECOND red proof, and it exists because the first one never reaches the code it is for.
 *
 * 🔴 `setEmitterScale(0)` is caught at the **emitter** gate — `emitter.willRender(camera)` — which
 * is the very predicate `perfSampler.counts().opaque` already had. The *per-particle* half of the
 * transcription, the `continue` on `alpha * emitter.alpha <= 0 || scaleX === 0 || scaleY === 0`,
 * never executes under it (`emittersDrawing` reads 0 and the loop is skipped), and in a clean run it
 * excludes nothing at all — `drawn 96 = alive 96`. By vault C2 that branch was decoration.
 *
 * This drives the emitter's scale **ops** rather than its transform, so the emitter still renders,
 * `willRender` still says yes, every particle stays alive and visible — and every one of them takes
 * the per-particle `continue`. It is the only route that reaches the second half of the predicate.
 *
 * ## 🔴 Two wrong levers were tried first, and both went GREEN — which is why this is written down
 *
 * **`ParticleEmitter.setParticleScale(0)`** (`ParticleEmitter.js:1593`) delegates to
 * `EmitterOp.onChange`, and for an eased `{ start, end }` op — which `EMITTER_SPECS` uses for all
 * three kinds — `onChange` sets only `op.current` (`EmitterOp.js:343-347`). Live particles never
 * read `current`: `Particle.update` recomputes `this.scaleX = ops.scaleX.onUpdate(...)`
 * unconditionally every frame (`Particle.js:636`). The run reported `drawn 96` and passed.
 *
 * **`loadConfig` alone** is the right lever but not the whole answer: a constant op is **emit-only**.
 * `setMethods` leaves `onUpdate` as `defaultUpdate`, which returns the particle's existing value
 * (`EmitterOp.js:453,624-627`), so a scale op set to 0 governs particles emitted AFTER it and never
 * touches the ones already flying. With the cap already full, almost nothing new is emitted — and
 * the run reported `drawn 96` and passed a second time.
 *
 * So the caller must apply this **before** `setStorm` builds the population, and the spec does, with
 * the ordering commented at the call site. Two mutations that did nothing, both of which would have
 * been pasted into a report as proofs *(vault C1: watch the gate fail, and check it failed for the
 * reason you think)*.
 *
 * Restoring feeds `EMITTER_SPECS` back in rather than a remembered literal.
 */
export async function setParticleScale(page: Page, scale: number | null): Promise<void> {
  await page.evaluate(
    (specs: Record<string, { start: number; end: number } | number>) => {
      interface Op {
        propertyKey: string;
        loadConfig(config: Record<string, unknown>): void;
      }
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as {
        effects: { emitters(): Record<string, { ops: { scaleX: Op } }> };
      };
      for (const [kind, emitter] of Object.entries(scene.effects.emitters())) {
        // 🔴 Keyed by the op's OWN `propertyKey`, not by "scaleX". `setConfig`'s special `scale`
        // override loads this op under the key **`scale`** and switches `ops.scaleY` off entirely
        // (`ParticleEmitter.js:1035-1038`), so `loadConfig({ scaleX: 0 })` looks up a key that is not
        // there, falls through to `GetFastValue`'s default of 1, and changes nothing — the third of
        // three wrong levers, and the third green run. Reading the key off the op cannot drift.
        // `scaleY` is deliberately untouched: it is inactive, and `Particle.update` mirrors scaleX
        // into it (`Particle.js:638-644`).
        emitter.ops.scaleX.loadConfig({ [emitter.ops.scaleX.propertyKey]: specs[kind] });
      }
      // Two frames, so the update that rewrites every live particle's `scaleX` from the new op has
      // certainly run before anything is read. A positive wait on the harness, never a sleep — and
      // never a wait on the quantity being asserted.
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    },
    Object.fromEntries(
      EFFECT_KINDS.map((kind) => [
        kind,
        scale === null
          ? { start: EMITTER_SPECS[kind].scaleStart, end: EMITTER_SPECS[kind].scaleEnd }
          : scale,
      ]),
    ) as Record<string, { start: number; end: number } | number>,
  );
}

/**
 * 9.5's ENEMY-arm red proof: scale every drawn enemy body to zero, or back to one.
 *
 * 🔴 **The gate's headline assertion names twenty enemies and nothing checked they were drawn.**
 * `spawnWorstCaseFleet` asserts `bodies` and `sprites`, and `sprites` is `isSprite` — a flag set
 * once at creation and never re-derived, recorded verbatim as standing blind spot **T14** in
 * `perfSampler.ts:137-141`: *"a body made invisible, zero-alpha or scrolled off-camera would still
 * be counted as a drawn Sprite — while making the frame CHEAPER and the ratio easier to pass."*
 *
 * `counts().opaque` is the `willRender(camera)` guard built for exactly that on Codex 5.14 blocker
 * 1, and it was being called only in the test that runs with **two** enemies. This is the mutation
 * that makes the fleet arm's version of it go red: same route, same engine predicate, applied to the
 * twenty bodies the absolute bound is asserted on top of.
 */
export async function setEnemyScale(page: Page, scale: number): Promise<void> {
  await page.evaluate((s) => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as {
      enemies: { bodies: { setScale(v: number): unknown }[] };
    };
    for (const body of scene.enemies.bodies) {
      body.setScale(s);
    }
  }, scale);
}

/**
 * Read the storm size out of `PERF_MUTATION`, e.g. `storm8192`. Zero when unset or not a storm.
 *
 * The amplification IS the mutation the 9.5 bound names: same emitters, same specs, same code path,
 * more of them. If the measured work moves, the only thing that moved is how many particles the
 * frame carried — which is the quantity the bound is about.
 */
export function stormCount(mutation: string): number {
  const match = /^storm(\d+)$/.exec(mutation);
  return match === null ? 0 : Number(match[1]);
}

/**
 * The five non-storm mutations, by exact name. `''` is a clean run.
 *
 * This array is the REGISTRY, not the implementation: `noshake` is applied by `effectShake.ts` and
 * `stall` by `effectCounts.ts`, each beside the thing it breaks, exactly as the three above sit
 * beside the emitters and bodies they scale. `namedMutation` below is what makes a typo loud, and it
 * only needs the names.
 */
export const NAMED_MUTATIONS = ['scale0', 'particlescale0', 'fleetscale0', 'noshake', 'stall'] as const;

export type NamedMutation = (typeof NAMED_MUTATIONS)[number];

/**
 * Recognise `PERF_MUTATION`, and **throw on anything it does not recognise**.
 *
 * 🔴 An unknown value used to fall through both parsers to "no mutation", so `PERF_MUTATION=scale-0`,
 * `Scale0`, `storm 8192` or a stray trailing space ran **clean and reported `2 passed`** — and an
 * operator in a hurry reads that as the proof having been run. A red proof that silently did not run
 * is worse than no red proof, because it comes with evidence.
 *
 * This is also the other half of the "one typo from always-on" question: the fixtures are inert with
 * `PERF_MUTATION` unset, and now a typo is loud rather than inert.
 */
export function namedMutation(mutation: string): NamedMutation | '' {
  if (mutation === '' || stormCount(mutation) > 0) {
    return '';
  }
  if (!(NAMED_MUTATIONS as readonly string[]).includes(mutation)) {
    throw new Error(
      `PERF_MUTATION="${mutation}" is not a mutation this spec knows. Expected one of ` +
        `${NAMED_MUTATIONS.join(', ')}, or storm<N>. Refusing to run clean and report green under a ` +
        'name that looks like a proof.',
    );
  }
  return mutation as NamedMutation;
}
