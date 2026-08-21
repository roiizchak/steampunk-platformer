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

import type Phaser from 'phaser';

import {
  EFFECT_DEPTH,
  EMITTER_SPECS,
  impactSparks,
  landSquash,
  type EffectKind,
} from '../../src/render/effects';
import { shakeFor, shakeOffset, shakeStartTick } from '../../src/render/screenShake';
import { BLEND_MODE_NORMAL, SCENE_SHUTDOWN } from '../../src/scenes/engineLiterals';
import { attachEffects } from '../../src/scenes/gameEffects';
import { freezePair } from '../../src/sim/hitstop';
import { createWorld } from '../../src/sim/tick';

interface Explosion {
  kind: EffectKind;
  count: number;
  x: number;
  y: number;
}

const BASE = { x: 40, y: 25 };

function build() {
  const explosions: Explosion[] = [];
  const destroyed: EffectKind[] = [];
  const scales: [number, number][] = [];
  const listeners: { name: string; fn: () => void }[] = [];

  const built: Record<string, { depth: number | null; blend: number | null }> = {};

  const emitter = (kind: EffectKind) => {
    const seen = { depth: null as number | null, blend: null as number | null };
    built[kind] = seen;
    const e = {
      setDepth: (d: number) => {
        seen.depth = d;
        return e;
      },
      setBlendMode: (m: number) => {
        seen.blend = m;
        return e;
      },
      reserve: () => e,
      setEmitterAngle: () => e,
      explode: (count: number, x: number, y: number) => {
        explosions.push({ kind, count, x, y });
      },
      destroy: () => destroyed.push(kind),
    };
    return e;
  };

  const camera = {
    x: BASE.x,
    y: BASE.y,
    width: 1920,
    height: 1080,
    setPosition(x: number, y: number) {
      camera.x = x;
      camera.y = y;
      return camera;
    },
  };

  // Keyed off the texture key `ensureParticleTexture` returns, which encodes the kind — the only
  // route from `scene.add.particles(...)` back to which emitter is being built.
  const scene = {
    add: { particles: (_x: number, _y: number, key: string) => emitter(key.split('-').pop() as EffectKind) },
    textures: { exists: () => true },
    cameras: { main: camera },
    events: { once: (name: string, fn: () => void) => listeners.push({ name, fn }) },
  };

  const playerSprite = { setScale: (sx: number, sy: number) => scales.push([sx, sy]) };
  const world = createWorld({
    seed: 1,
    scale: 1,
    enemies: [{ slug: 'brass-sentry', x: 400, y: 0, patrolMin: 400, patrolMax: 400 }],
  });
  const effects = attachEffects(
    scene as unknown as Phaser.Scene,
    world,
    playerSprite as unknown as Phaser.GameObjects.Sprite,
  );
  return {
    effects,
    world,
    camera,
    explosions,
    destroyed,
    scales,
    built,
    listeners,
    sentry: world.enemies.sentries[0]!,
    render: () => effects.render(world, camera as unknown as Phaser.Cameras.Scene2D.Camera),
  };
}

describe('a landed blow reaches the emitters', () => {
  it('explodes the spark bursts the render layer decided on, and NOTHING before the hit', () => {
    const { world, sentry, explosions, render } = build();

    render();
    expect(explosions, 'a world where nothing happened drew particles').toEqual([]);

    // The cursor is `(cursor, tickCount]`, so the hit has to land on a tick after the attach.
    world.tickCount += 1;
    world.player.facing = 1;
    freezePair(world.player, sentry, 'light', world.tickCount);
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
    world.tickCount += 1;
    freezePair(world.player, sentry, 'light', world.tickCount);

    render();
    const once = explosions.length;
    expect(once).toBeGreaterThan(0);
    render();
    render();
    expect(explosions.length, 'the same hit was re-emitted on a later frame of the same tick').toBe(once);
  });
});

describe('the camera carries the shake, and returns to EXACTLY its base', () => {
  it('offsets by shakeOffset while running and writes the captured base once settled', () => {
    const { world, sentry, camera, render } = build();

    render();
    expect([camera.x, camera.y], 'an unhit world moved the camera').toEqual([BASE.x, BASE.y]);

    world.tickCount += 1;
    const hitTick = world.tickCount;
    freezePair(world.player, sentry, 'light', hitTick);
    render();

    // The shake is DELAYED until the freeze releases — a camera jittering over a still image is
    // exactly what `shakeStartTick` exists to prevent — so sample a tick inside the live window.
    const cmd = shakeFor('light');
    const startedTick = shakeStartTick('light', hitTick);
    world.tickCount = startedTick + 1;
    render();

    const want = shakeOffset(cmd, world.tickCount, camera.width, camera.height);
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

    world.player.grounded = false;
    render();
    expect(scales.at(-1), 'a body that never landed is not at rest scale').toEqual([1, 1]);

    world.tickCount += 1;
    world.player.grounded = true;
    render();

    const want = landSquash(0);
    expect([want.sx, want.sy], 'the fixture must be a real squash').not.toEqual([1, 1]);
    expect(scales.at(-1)).toEqual([want.sx, want.sy]);
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
    world.tickCount += 1;
    freezePair(world.player, sentry, 'lethal', world.tickCount);
    render();
    world.tickCount = shakeStartTick('lethal', world.tickCount) + 1;
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
