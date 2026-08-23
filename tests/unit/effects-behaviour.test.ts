/**
 * 🔴 Does `attachEffects` actually DO what `effects-draw-path.test.ts` reads in its source?
 *
 * ## The gap this closes
 *
 * QA log entry 33: `gameEffects.ts` was gated as **source text**, because it named two Phaser
 * VALUES (`Phaser.Scenes.Events.SHUTDOWN`, `Phaser.BlendModes.NORMAL`) and `npm run
 * test:sim-isolated` runs this suite with the engine uninstalled. A text gate reds when a call is
 * deleted or rewritten; it cannot tell whether the call did the right thing — so an `explode` with
 * a swapped argument order, a camera written to the wrong base, or a teardown registered on an
 * event nobody fires all read as green.
 *
 * Both values are pinned literals in `engineLiterals.ts` now, the module is `import type Phaser`,
 * and this drives it end to end against a fake scene — the `enemy-feedback.test.ts` idiom.
 *
 * The source-text gates stay: they hold the one claim no fake scene can make, which is that there is
 * ONE implementation and not two.
 *
 * ## Every assertion is written to fail if the module does nothing
 *
 * A fresh attachment draws nothing at all — no burst, no shake, a neutral squash — which is exactly
 * what a gutted `render()` also does. So every case asserts the quiet baseline FIRST and the event
 * SECOND, in one test, and the point is that the two differ.
 */

import { describe, expect, it } from 'vitest';

import {
  DUST_MIN_FALL_PX,
  EFFECT_DEPTH,
  EMITTER_SPECS,
  impactSparks,
  landSquash,
  type EffectKind,
} from '../../src/render/effects';
import { shakeFor, shakeOffset, shakeStartTick } from '../../src/render/screenShake';
import { BLEND_MODE_NORMAL, SCENE_SHUTDOWN } from '../../src/scenes/engineLiterals';
import { freezePair } from '../../src/sim/hitstop';
import { advance, createWorld } from '../../src/sim/tick';
import type { InputSnapshot } from '../../src/sim/types';
import { BASE, build } from './effects-fixtures';

describe('a landed blow reaches the emitters', () => {
  it('explodes the spark bursts the render layer decided on, and NOTHING before the hit', () => {
    const { world, sentry, explosions, render } = build();

    render();
    expect(explosions, 'a world where nothing happened drew particles').toEqual([]);

    // 🔴 **The PRODUCTION order, and it is the whole point of this fixture now.** `freezePair`
    // stamps `lastHitTick` from `world.tickCount` BEFORE step 14 increments it, and `GameScene`
    // renders AFTER `advanceSplit` returns. Writing it the other way round — bump, stamp, render —
    // is the one ordering the game never performs, and it is what hid the off-by-one in `fresh()`
    // that left every spark, every death plume and every hurt vent unfired in the shipped build.
    world.player.facing = 1;
    freezePair(world.player, sentry, 'light', world.tickCount);
    world.tickCount += 1;
    render();

    const want = impactSparks(sentry.x, sentry.y, 1, 'light');
    expect(want.length, 'the fixture itself must be a real burst').toBeGreaterThan(0);
    expect(explosions.map((e) => ({ kind: e.kind, count: e.count, x: e.x, y: e.y }))).toEqual(
      want.map((b) => ({ kind: b.kind, count: b.count, x: b.x, y: b.y })),
    );
    // Argument ORDER, which `explode(count, x, y)` gets wrong silently: a burst at the origin is
    // still a burst, and off screen.
    expect(explosions[0]!.x, 'the burst was not placed on the body it came from').toBe(sentry.x);
  });

  it('fires the burst ONCE per sim tick, not once per rendered frame', () => {
    // ~240 fps against a 60 Hz sim is four frames per tick. The cursor is what stops the same hit
    // being re-emitted on all four, and it is easy to break by advancing it only when something fired.
    const { world, sentry, explosions, render } = build();
    freezePair(world.player, sentry, 'light', world.tickCount);
    world.tickCount += 1;

    render();
    const once = explosions.length;
    expect(once).toBeGreaterThan(0);
    render();
    render();
    expect(explosions.length, 'the same hit was re-emitted on a later frame of the same tick').toBe(once);
  });
});

describe('the emit window covers the ticks the frame actually ran', () => {
  /**
   * 🔴 **Found while applying Codex finding 7, and it is the bigger defect of the two.** `fresh()`
   * asked `hitTick > cursor && hitTick <= tick`. Every stamp the sim writes — `lastHitTick`,
   * `landedTick` — is taken from `world.tickCount` BEFORE step 14 increments it, and `GameScene`
   * renders AFTER `advanceSplit` returns, so the indices that ran in a frame are `cursor … tick-1`.
   * The old window asked for `cursor+1 … tick` and therefore contained **no stamp at all** at one
   * tick per frame: not one spark, death plume or hurt vent ever fired in the shipped game.
   *
   * Nothing saw it because every fixture bumped `tickCount` BEFORE stamping — the one ordering the
   * game never performs — and because the e2e counters drive `explode()` on the emitter handles
   * directly (`installStorm`), bypassing `render()` entirely. The landing was the single burst that
   * worked, and only because it asked `fresh(tick)`, which reduces to "at least one tick ran".
   */
  it('emits for a hit stamped on the tick this frame ran, and NOT twice', () => {
    const { world, sentry, explosions, render } = build();

    // Frame 1: one ordinary tick, nothing struck.
    world.tickCount += 1;
    render();
    expect(explosions, 'a quiet frame drew particles').toEqual([]);

    // Frame 2: the hit lands during the tick, THEN step 14 runs, THEN the frame renders.
    freezePair(world.player, sentry, 'light', world.tickCount);
    world.tickCount += 1;
    render();
    expect(
      explosions.length,
      'a hit stamped by the sim never reached an emitter. The emit window is off by one against ' +
        'the pre-increment tick count every sim stamp is taken from.',
    ).toBeGreaterThan(0);

    // Frame 3: a further tick, no new hit. The same stamp must not be re-emitted.
    const once = explosions.length;
    world.tickCount += 1;
    render();
    expect(explosions.length, 'the same hit was emitted again on a later frame').toBe(once);
  });
});

describe('the camera carries the shake, and returns to EXACTLY its base', () => {
  it('offsets by shakeOffset while running and writes the captured base once settled', () => {
    const { world, sentry, camera, render } = build();

    render();
    expect([camera.x, camera.y], 'an unhit world moved the camera').toEqual([BASE.x, BASE.y]);

    // Production order: stamp with the pre-increment count, then step 14, then render.
    const hitTick = world.tickCount;
    freezePair(world.player, sentry, 'light', hitTick);
    world.tickCount += 1;
    render();

    // The shake is DELAYED until the freeze releases — a camera jittering over a still image is
    // exactly what `shakeStartTick` exists to prevent — so sample a tick inside the live window.
    const cmd = shakeFor('light');
    const startedTick = shakeStartTick('light', hitTick);
    world.tickCount = startedTick + 2;
    render();

    // 🔴 `tickCount - 1`, re-taken 2026-08-23 for inventory 3.1. `applyShake` now reads `tick - 1`
    // so it is in phase with the landing squash, which means the DRAWN offset is the one for index
    // `tick - 1`. Re-taken, not adjusted: the oracle has to name the same index the renderer does,
    // and `startedTick + 2` is chosen so that index lands inside the live window.
    const want = shakeOffset(cmd, world.tickCount - 1, camera.width, camera.height);
    expect(want.x === 0 && want.y === 0, 'the sampled tick has no offset — vacuous').toBe(false);
    expect([camera.x, camera.y]).toEqual([BASE.x + want.x, BASE.y + want.y]);

    // EXACTLY base once settled, not approximately: `shakeWithinEnvelope` asserts the same thing.
    world.tickCount = startedTick + cmd.durationTicks + 5;
    render();
    expect([camera.x, camera.y]).toEqual([BASE.x, BASE.y]);
  });
});

describe('the landing squash reaches the player sprite', () => {
  it('writes landSquash every frame, neutral at rest and squashed on the touchdown', () => {
    const { world, scales, render } = build();

    // `landedTick` is the sim's `-1` sentinel on a fresh world — nothing has touched down.
    render();
    expect(scales.at(-1), 'a body that never landed is not at rest scale').toEqual([1, 1]);

    // The sim stamps the touchdown with the pre-increment count; step 14 then runs.
    world.player.grounded = true;
    world.player.landedTick = world.tickCount;
    world.tickCount += 1;
    render();

    const want = landSquash(0);
    expect([want.sx, want.sy], 'the fixture must be a real squash').not.toEqual([1, 1]);
    expect(scales.at(-1)).toEqual([want.sx, want.sy]);
  });

  it('squashes on a touchdown too gentle to puff — the squash is not gated on the dust', () => {
    // 🔴 The behavioural half of a claim `sprite-draw-path.test.ts` used to make about the SHAPE of
    // the source. `landingDust` returns `null` below `DUST_MIN_FALL_PX`, and gating the squash on
    // that would make the character land differently depending on how fast they happened to be
    // falling off a 1 px step.
    const { world, scales, explosions, render } = build();
    world.player.grounded = true;
    world.player.landedTick = world.tickCount;
    world.player.landedFallSpeed = DUST_MIN_FALL_PX - 1;
    world.tickCount += 1;
    render();

    expect(explosions.filter((e) => e.kind === 'dust'), 'this fall must be BELOW the dust threshold')
      .toEqual([]);
    expect(scales.at(-1), 'a gentle touchdown did not squash').toEqual([
      landSquash(0).sx,
      landSquash(0).sy,
    ]);
  });
});

describe('the teardown is registered on the event Phaser actually fires', () => {
  it('restores the camera and destroys every emitter when SHUTDOWN runs', () => {
    const { camera, destroyed, listeners, sentry, world, render } = build();

    // The NAME, not merely that something was registered: a handler on an event Phaser never fires
    // is the same as no handler, and reads identically in the source.
    expect(listeners.map((l) => l.name), 'the teardown is not on Phaser’s shutdown event').toEqual([
      SCENE_SHUTDOWN,
    ]);

    // Leave the camera genuinely displaced, which is the state the restore exists for: a camera
    // captured mid-shake by the NEXT attachEffects becomes that run's base, forever.
    const hitTick = world.tickCount;
    freezePair(world.player, sentry, 'lethal', hitTick);
    world.tickCount += 1;
    render();
    world.tickCount = shakeStartTick('lethal', hitTick) + 1;
    render();
    expect([camera.x, camera.y], 'the camera was never displaced — the restore proves nothing').not.toEqual([
      BASE.x,
      BASE.y,
    ]);

    listeners[0]!.fn();

    expect([camera.x, camera.y]).toEqual([BASE.x, BASE.y]);
    expect(destroyed.sort()).toEqual((Object.keys(EMITTER_SPECS) as EffectKind[]).sort());
  });
});

describe('a landing inside a MULTI-TICK frame still reaches the emitters', () => {
  /**
   * 🔴 Codex implementation review, finding 7. A render frame can drain several sim ticks, so a
   * touchdown and the buffered jump that follows it can BOTH happen between two `render()` calls —
   * `tick.ts`'s step 13 guarantees exactly that pairing, because a buffered press fires the tick
   * AFTER touchdown and the jump clears `grounded` again at step 7. A renderer that inferred the
   * landing by comparing `grounded` across frames then saw `false -> false`, and the dust, the
   * squash and the landing shake vanished outright. Multi-tick frames get more common on slower
   * hardware, which is the Phase 10 release target.
   *
   * The control arm is the identical fall rendered one tick at a time. Both arms must land, and the
   * whole point of the test is that the two agree.
   */
  const noInput = (): InputSnapshot => ({
    left: false,
    right: false,
    jumpHeld: false,
    jumpPressed: false,
    walkHeld: false,
    attackPressed: false,
  });

  /**
   * Spawned in mid-air over the left platform, so there is a real fall to land from — the default
   * spawn sits ON the platform and is grounded after one tick, which is not a landing at all.
   */
  const DROP = { x: 470, y: 300 };

  /** The tick index the player first touches down on, from a dry run of the identical fall. */
  function touchdownTick(): number {
    const w = createWorld({ seed: 1, scale: 1, spawn: DROP });
    for (let i = 0; i < 600; i += 1) {
      advance(w, noInput(), 1);
      // `tickCount` has already been incremented past the tick that landed (step 14).
      if (w.player.grounded) return w.tickCount - 1;
    }
    throw new Error('the fixture never lands — it is not a fall');
  }

  /**
   * Fall to the tick before touchdown rendering every tick, then run the touchdown tick and the
   * one after it in frames of `batch`. `batch === 1` is the control: touchdown and the buffered
   * jump land in separate frames, so the edge is visible on the first of them.
   */
  function fallAndLand(batch: 1 | 2) {
    const h = build(DROP);
    const landsOn = touchdownTick();
    while (h.world.tickCount < landsOn) {
      advance(h.world, noInput(), 1);
      h.render();
    }
    const held = { ...noInput(), jumpPressed: true, jumpHeld: true };
    for (let done = 0; done < 2; done += batch) {
      advance(h.world, held, batch);
      h.render();
    }
    return h;
  }

  it('emits the dust and the squash whether the frame drained one tick or two', () => {
    const control = fallAndLand(1);
    expect(
      control.explosions.filter((e) => e.kind === 'dust').length,
      'the CONTROL never puffed — the fixture is not a landing at all',
    ).toBe(1);
    expect(control.scales.at(-1), 'the control never squashed').not.toEqual([1, 1]);

    const batched = fallAndLand(2);
    expect(
      batched.explosions.filter((e) => e.kind === 'dust').length,
      'the landing fell inside a two-tick frame and the dust was never emitted. The edge must ' +
        'come from the sim, which sees every tick, not from comparing `grounded` across frames.',
    ).toBe(1);
    expect(batched.scales.at(-1), 'the landing squash was lost to a two-tick frame').not.toEqual([
      1, 1,
    ]);
  });
});

describe('every emitter is built with the values the spec names', () => {
  it('writes NORMAL blend and the spec’s depth onto each one', () => {
    // 🔴 `NORMAL → ADD` was a green mutation for the whole of Phase 9, and `createEmitter`'s own
    // comment says of that line that ADD *"would cost one flush every frame, forever, and be
    // invisible in a screenshot"*. `effects-draw-path.test.ts` gated the source text; this gates
    // the number the emitter was actually handed.
    const { built } = build();
    const kinds = Object.keys(EMITTER_SPECS) as EffectKind[];
    expect(Object.keys(built).sort(), 'not every kind got an emitter').toEqual([...kinds].sort());
    for (const kind of kinds) {
      expect(built[kind]!.blend, `${kind} was not built with the NORMAL blend mode`).toBe(
        BLEND_MODE_NORMAL,
      );
      expect(built[kind]!.depth, `${kind} was not built at its spec depth`).toBe(EFFECT_DEPTH[kind]);
    }
  });
});
