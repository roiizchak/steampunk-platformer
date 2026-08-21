/**
 * The impact effects, as DRAWN objects.
 *
 * Everything decided here was decided somewhere else: `src/render/effects.ts` says what particles a
 * moment is worth, `src/render/screenShake.ts` says how hard and when the camera moves, and
 * `src/sim/hitstop.ts` says which bodies are frozen. This file owns the plumbing and nothing else —
 * three emitters, one camera offset, and the tick bookkeeping that keeps a 60 Hz sim from firing a
 * 240 Hz burst.
 *
 * It follows `gameHud.ts`'s `attachHud` shape: build in `create()`, return a handle with a
 * `render()` and a `destroy()`, and let `GameScene` gain three lines.
 *
 * ## Everything is derived from sim state, every frame
 *
 * `render()` is idempotent per frame and self-correcting, in the `goalEntryAlpha` no-teardown shape
 * (`playerView.ts:115-123`). There is no "clear" call and no armed state to leak: a fresh world
 * where nothing has happened draws nothing, because every body's `hitstopUntil` is the `-1` sentinel
 * and a settled `ShakeState` returns the camera to exactly its base.
 *
 * State lives in this closure, **never in a `WeakMap<Scene, State>`**. `scene.restart()` reuses the
 * same `Scene` instance while rebuilding the display list, so a WeakMap keyed on the scene would
 * survive holding handles to destroyed emitters.
 *
 * ## Bursts fire once per sim TICK, not once per rendered frame
 *
 * At ~240 fps against a 60 Hz sim there are roughly four frames per tick, so "the player was hit" is
 * true on four consecutive frames and a burst keyed on it alone fires four times. The cursor below
 * is `UIScene.spawnCollectTweens`'s `lastGearTick` idiom, **including the part that is easy to get
 * wrong**: the cursor advances on EVERY frame, not only on the frames that emit. If it moved only
 * when something fired, the window would grow without bound and a hit from ten seconds ago would be
 * re-emitted the next time anything landed.
 *
 * The window is `(cursor, tickCount]` rather than `=== tickCount` for the other half of the same
 * problem: a frame that drains five ticks must not lose the four hits that were not the last one.
 *
 * ## The emitters are created once and never re-created
 *
 * `scene.add.particles(...)` per hit is a permanent leak on both the display list and the update
 * list — an emitter does not auto-destroy. Created once, `emitting: false`, `reserve()`d up front so
 * a burst never allocates, and cleaned up by `destroy()` (and by scene shutdown, which reaches every
 * object added the normal way).
 *
 * Depth and blend mode are a MEASURED cost decision and not a preference — `effects.ts`'s header
 * carries the argument. Every value here is read out of `EMITTER_SPECS[kind]`; nothing in this file
 * restates one.
 *
 * ## 🔴 Phaser is a TYPE-only import, and the two engine VALUES are pinned literals
 *
 * This file used to be the one Phase 9 module that imported the engine as a value, for exactly two
 * symbols: `Phaser.Scenes.Events.SHUTDOWN` and `Phaser.BlendModes.NORMAL`. The price was paid by the
 * tests, not the bundle — `npm run test:sim-isolated` runs the unit suite with Phaser uninstalled,
 * so nothing in that suite could import this module and the whole effects path was guarded as
 * **source text** instead of behaviour (QA log entry 33).
 *
 * Both are now literals beside the source line that fixes them, which is `spriteFlash.ts`'s
 * `TINT_MODE_ADD` idiom exactly, and all three are pinned against the vendored engine by
 * `engine-literals.test.ts` — in the UNIT suite, where a Phaser upgrade cannot slip past a run that
 * skipped Playwright. `effects-behaviour.test.ts` then drives `attachEffects` against a fake scene.
 *
 * ⚠️ **Keep it type-only.** If either pin ever reds, change the LITERAL, never the assertion.
 */

import type Phaser from 'phaser';
import { TICK_HZ } from '../game/constants';
import {
  EMITTER_SPECS,
  SPARK_CONE_DEG,
  deathSteam,
  hurtVent,
  impactOf,
  impactSparks,
  landSquash,
  landingDust,
  type Burst,
  type EffectKind,
  type EmitterSpec,
} from '../render/effects';
import {
  shakeFor,
  shakeOffset,
  shakeSettled,
  shakeStartTick,
  shouldPreempt,
  type ShakeState,
} from '../render/screenShake';
import { ticksToMs } from '../sim';
import type { Freezable, ImpactClass } from '../sim/hitstop';
import type { World } from '../sim/types';
import { BLEND_MODE_NORMAL, SCENE_SHUTDOWN } from './engineLiterals';
import { ensureParticleTexture } from './particleTexture';

/** What `GameScene` holds on to after attaching the effects. */
export interface EffectAttachment {
  /** Called once per rendered frame, after the sim has ticked. */
  render(world: World, camera: Phaser.Cameras.Scene2D.Camera): void;
  /** The live emitters, for the e2e perf spec's per-particle `willRender()` count. */
  emitters(): Readonly<Record<EffectKind, Phaser.GameObjects.Particles.ParticleEmitter>>;
  /**
   * The camera's UNSHAKEN position, as captured in `create()`.
   *
   * 🔴 Published for the same reason `emitters()` is: it is the only way the e2e spec can tell a
   * shake from a **constant** camera error. The spec used to take `[cam.x, cam.y]` at recorder
   * install as its zero, which is `base + whatever offset was applied on that frame` — so an error
   * constant from before install through the whole run subtracts out of every sample and is
   * invisible. `camera.setPosition(baseX + x + 5, …)` passed the whole 9.2a suite. Against this
   * pair the recorded offset IS the applied offset, and that mutation reds.
   */
  base(): { x: number; y: number };
  destroy(): void;
}

const KINDS = Object.keys(EMITTER_SPECS) as EffectKind[];

/**
 * 🔴 The ONE place ticks become Phaser's units.
 *
 * `EmitterSpec`'s `speedMin`/`speedMax` are px per TICK and `gravityY` is px per tick SQUARED,
 * because `src/render/` is not allowed to know what a second is. Phaser's emitter wants px/s and
 * px/s². `TICK_HZ` is the project's single authority for the ratio (`src/game/constants.ts`), and
 * the square is written once here rather than inline at the config, so a spec value cannot be
 * converted at the wrong order by a future edit that copies the neighbouring line.
 */
const perSecond = (pxPerTick: number): number => pxPerTick * TICK_HZ;
const perSecondSquared = (pxPerTickSquared: number): number =>
  pxPerTickSquared * TICK_HZ * TICK_HZ;

/** Enough of an enemy to spend particles on. Structural, exactly like `Freezable` itself. */
type Struck = Readonly<Freezable> & { x: number; y: number; hp: number };

/**
 * @param playerSprite the drawn player, for the landing squash.
 *
 * 🔴 **The squash is here rather than in `gamePlayerDraw.ts` because the LANDING EDGE is here.**
 * The other three sprite feedbacks (`flinchOffset`, `hitFlashAlpha`, `iframeAlpha`) are pure
 * functions of `world.player` and are applied in `gamePlayerDraw.ts`, where the drawn position they
 * offset is computed. `landSquash` is the one that needs a tick the sim does not carry — the
 * touchdown zeroes `vy` in the same tick it sets `grounded`, so "when did we land" only exists in
 * the frame-to-frame `wasGrounded` cursor this closure already keeps for the dust. Adding a second
 * copy of that cursor to the player draw path is the duplicate this project keeps paying for
 * *(vault 5.3)*; adding a counter to `PlayerSim` would push `src/sim/types.ts` past 400 lines.
 */
export function attachEffects(
  scene: Phaser.Scene,
  world: World,
  playerSprite: Phaser.GameObjects.Sprite,
): EffectAttachment {
  const built = {} as Record<EffectKind, Phaser.GameObjects.Particles.ParticleEmitter>;
  for (const kind of KINDS) {
    built[kind] = createEmitter(scene, kind, EMITTER_SPECS[kind]);
  }

  /** The last tick already emitted for. Advanced on EVERY frame — see the header. */
  let cursor = world.tickCount;
  let shake: ShakeState | null = null;
  /** Landing is the one moment with no sim field to read: `vy` is zeroed by the touchdown itself. */
  let wasGrounded = world.player.grounded;
  let lastAirVy = 0;
  /** The tick of the most recent touchdown, or `null` for none yet. Drives `landSquash`. */
  let landedTick: number | null = null;
  /**
   * The camera's unshaken position, captured before anything moves it. `destroy()` restores exactly
   * this, and `render()` writes exactly this on every settled frame — `shakeWithinEnvelope` demands
   * EXACTLY zero offset outside the shake, not approximately zero.
   */
  const baseX = scene.cameras.main.x;
  const baseY = scene.cameras.main.y;
  let alive = true;

  const emit = (burst: Burst, coneDeg: number): void => {
    const emitter = built[burst.kind];
    const half = coneDeg / 2;
    emitter.setEmitterAngle({ min: burst.angleDeg - half, max: burst.angleDeg + half });
    // `atLimit()` DROPS the request rather than evicting the oldest, which is what makes
    // `maxAliveParticles` a hard constant instead of something a sampler has to catch in the wild.
    emitter.explode(burst.count, burst.x, burst.y);
  };

  /** The cone an emitter was CREATED with — used verbatim by `steam` and `dust`. */
  const specCone = (kind: EffectKind): number =>
    EMITTER_SPECS[kind].angleMax - EMITTER_SPECS[kind].angleMin;

  const arm = (impact: ImpactClass | 'land', hitTick: number, tick: number): void => {
    const cmd = shakeFor(impact);
    // The arbitration is the feature: bigger events always win, smaller ones never truncate a bigger
    // one, and a shake most of the way through has little left to protect. `screenShake.ts`'s header
    // has the argument, and both of Phaser's own `camera.shake()` defaults are wrong for it.
    if (!shouldPreempt(shake, cmd, tick)) {
      return;
    }
    shake = { startedTick: shakeStartTick(impact, hitTick), cmd };
  };

  const attachment: EffectAttachment = {
    render(w, camera) {
      const tick = w.tickCount;
      // A new world (a restart, or the next level) starts at 0 while the cursor still holds the last
      // run's final tick. Resetting is what keeps the very first hit of the new run from falling
      // outside the window — the defect `UIScene.build()` records against `lastGearTick`.
      if (tick < cursor) {
        cursor = 0;
        wasGrounded = w.player.grounded;
        shake = null;
        landedTick = null;
      }
      const fresh = (hitTick: number): boolean => hitTick > cursor && hitTick <= tick;

      const strike = (body: Struck): void => {
        if (body.hitstopUntil < 0 || !fresh(body.lastHitTick)) {
          return;
        }
        // ⚠️ **The enemy loop is the ONLY route to a `playerHurt` spark burst.** A scavenger's claw
        // calls `freezePair(player, scavenger, 'playerHurt', …)`, so the SCAVENGER's own freeze
        // resolves to `playerHurt` here and sparks fly at the enemy for a hit the player took. That
        // is deliberate — it is what makes `SPARK_COUNT.playerHurt` reachable at all — and the hurt
        // vent below is the separate, player-side half of the same moment.
        const impact = impactOf(body, w.hitstopScale);
        if (impact === undefined) {
          return;
        }
        for (const burst of impactSparks(body.x, body.y, w.player.facing, impact)) {
          emit(burst, SPARK_CONE_DEG[impact]);
        }
        // A ruptured boiler, not a graze. `hp <= 0` bodies stay in the array as scenery
        // (`worldDamage.ts`), which is what makes the death readable from state at all.
        if (body.hp <= 0) {
          emit(deathSteam(body.x, body.y), specCone('steam'));
        }
        arm(impact, body.lastHitTick, tick);
      };
      for (const sentry of w.enemies.sentries) strike(sentry);
      for (const scavenger of w.enemies.scavengers) strike(scavenger);

      // The player is frozen by their OWN landed blows too, with that blow's impact class — so the
      // `playerHurt` test is what separates "took a hit" from "landed one", and it is why this is
      // not a second `strike()`.
      const player = w.player;
      const hurt = impactOf(player, w.hitstopScale) === 'playerHurt';
      if (player.hitstopUntil >= 0 && fresh(player.lastHitTick) && hurt) {
        emit(hurtVent(player.x, player.y, player.facing), specCone('steam'));
        arm('playerHurt', player.lastHitTick, tick);
      }

      // Landing. Sampled across frames rather than read from a field, because the sim has none: the
      // touchdown zeroes `vy` in the same tick it sets `grounded`, so the fall speed the dust is
      // worth only exists on the frame before. `landingDust` returns `null` below its threshold,
      // which is what keeps a 1 px step-down from puffing.
      if (player.grounded && !wasGrounded && fresh(tick)) {
        const dust = landingDust(lastAirVy, player.x, player.y, w.tuning.maxFallSpeed);
        if (dust !== null) {
          emit(dust, specCone('dust'));
        }
        arm('land', tick, tick);
        // 🔴 Armed on EVERY touchdown, not only the ones the dust threshold accepts. A step-down
        // too small to puff still squashes — the squash is the body's own weight arriving, and
        // gating it on `dust !== null` would make the character land differently depending on how
        // fast they happened to be falling on a 1 px drop.
        landedTick = tick;
      }
      if (!player.grounded) {
        lastAirVy = player.vy;
      }
      wasGrounded = player.grounded;

      // The landing squash, written ABSOLUTELY every frame from `(landedTick, tick)`. Nothing is
      // armed and nothing is torn down: past `LAND_SQUASH_TICKS` this is `{1, 1}` forever, which is
      // the same self-correcting shape as `applyShake`'s settled branch. `renderPlayerSprite` runs
      // earlier in the frame and never touches scale, so this is the only writer.
      const squash = landSquash(landedTick === null ? null : tick - landedTick);
      playerSprite.setScale(squash.sx, squash.sy);

      applyShake(camera, tick);
      cursor = tick;
    },

    emitters() {
      return built;
    },

    base() {
      return { x: baseX, y: baseY };
    },

    destroy() {
      if (!alive) {
        return;
      }
      alive = false;
      // 🔴 **The camera may already be gone, and on the shutdown path it always is.**
      // `CameraManager` registers `once(SCENE.SHUTDOWN, …)` from its own `start()` — before any
      // scene's `create()` runs — and its handler sets `this.main = undefined` and destroys every
      // camera. So by the time a SHUTDOWN listener registered in `create()` fires, `cameras.main` is
      // `undefined`, and the unguarded call threw *"Cannot read properties of undefined (reading
      // 'setPosition')"* **inside Phaser's own `Systems.shutdown`**, taking six e2e specs down with
      // it — including a `scene.start` in the middle of a level transition.
      //
      // Skipping the restore there is correct rather than a workaround: there is no camera left to
      // restore, and `CameraManager.start()` builds a fresh one for the next run. This call is for
      // an explicit mid-life `destroy()`, where the camera object genuinely does survive.
      scene.cameras?.main?.setPosition(baseX, baseY);
      for (const kind of KINDS) {
        built[kind].destroy();
      }
    },
  };

  // 🔴 `destroy()` had NO production caller. `GameScene` names `effects` four times — the field, this
  // attach, the per-frame render and one unrelated comment — and has no SHUTDOWN handler at all, so
  // the camera-restore branch was unreachable outside the unit tests.
  //
  // Why that matters, and why it is not merely tidy: `baseX`/`baseY` are captured ONCE from
  // `scene.cameras.main.x`, and `applyShake` writes `baseX + x` absolutely. A camera that survives a
  // `scene.restart()` mid-shake — an ESC to level select or a death-triggered reload inside the
  // 8-tick `playerHurt` window — hands the next `attachEffects` the SHAKEN x as its new base, and
  // every frame after that carries the error forever, including the frames `shakeWithinEnvelope`
  // requires to be exactly at base. `EffectAttachment.base()` exists to expose exactly this class of
  // constant error; leaving the restore uncallable was the other half of the same argument.
  //
  // Registered here rather than in `GameScene` for the reason `hudFade` and `goalLayer` register
  // theirs the same way: the teardown belongs to the thing that built the state, `GameScene.ts` sits
  // at exactly 400 lines, and a handler in the scene is one more thing the next feature forgets.
  scene.events.once(SCENE_SHUTDOWN, () => attachment.destroy());

  return attachment;

  /**
   * Write the camera's position from the pure decision — never `camera.shake()`.
   *
   * `camera.shake()` would put the timing inside Phaser and make the release edge a `SHAKE_COMPLETE`
   * event, which `Camera.reset()` and `Camera.destroy()` both skip. Game state sequenced off an
   * effect completing is exactly the failure criterion 9.2 names, so **nothing here awaits an
   * event**: the offset is recomputed from `(state, tick)` every frame and a stale state decays to
   * zero on its own.
   *
   * The viewport POSITION rather than `scrollX`/`scrollY` or `setFollowOffset`: the follow runs in
   * the camera's own pre-render, after this, so a scroll written here is overwritten within the
   * frame — and a follow offset is fed through `cameraRig`'s lerp, which would smear a four-tick
   * shake into a slow drift. `camera.x`/`camera.y` are applied outside the follow entirely.
   *
   * The three regimes mirror `shakeWithinEnvelope`'s, deliberately: exactly base before
   * `startedTick`, inside the peak box while running, exactly base once settled. 🔴 The first is the
   * one that matters — `shakeStartTick` delays an outgoing shake until the hit-stop freeze releases,
   * and a camera jittering over a still image is precisely what the delay exists to prevent.
   */
  function applyShake(camera: Phaser.Cameras.Scene2D.Camera, tick: number): void {
    // The VALUE is `shakeOffset` (`screenShake.ts`), the BRANCH is here. One definition, asserted
    // exactly by the e2e spec rather than only bounded by the peak box.
    const running = shake !== null && tick >= shake.startedTick && !shakeSettled(shake, tick);
    const { x, y } = running
      ? shakeOffset(shake!.cmd, tick, camera.width, camera.height)
      : { x: 0, y: 0 };
    camera.setPosition(baseX + x, baseY + y);
  }
}

/**
 * One emitter per `EffectKind`, every field read out of the spec.
 *
 * `emitting: false` because every one of these is an `explode()`, never a flow. `reserve()` walks
 * the particle pool up front so a burst neither allocates nor spikes GC at the exact moment the
 * frame budget is tightest.
 */
function createEmitter(
  scene: Phaser.Scene,
  kind: EffectKind,
  spec: EmitterSpec,
): Phaser.GameObjects.Particles.ParticleEmitter {
  return scene.add
    .particles(0, 0, ensureParticleTexture(scene, kind, spec), {
      lifespan: ticksToMs(spec.lifespanTicks),
      speed: { min: perSecond(spec.speedMin), max: perSecond(spec.speedMax) },
      scale: { start: spec.scaleStart, end: spec.scaleEnd },
      alpha: { start: spec.alphaStart, end: spec.alphaEnd },
      gravityY: perSecondSquared(spec.gravityY),
      angle: { min: spec.angleMin, max: spec.angleMax },
      maxAliveParticles: spec.maxAliveParticles,
      emitting: false,
    })
    .setDepth(spec.depth)
    // NORMAL, and load-bearing: a blend-mode change forces a batch flush, and the depth band exists
    // so these join the player's existing quad run for zero extra flushes. ADD would cost one flush
    // every frame, forever, and be invisible in a screenshot.
    .setBlendMode(BLEND_MODE_NORMAL)
    .reserve(spec.reserve);
}
