/**
 * 🔴 Does `spriteFeedback.ts` actually reach a drawn object? The ENEMY half.
 *
 * ## The defect this exists for
 *
 * `src/render/spriteFeedback.ts` shipped Phase 9 with **zero production consumers**. `flinchOffset`,
 * `hitFlashAlpha`, `landSquash`, `iframeAlpha` and `ticksSinceHit` were referenced only by their own
 * 306-line test file; the single symbol any scene imported through the re-export was the constant
 * `ATTACK_CONTACT_FRAME_INDEX`. Blanking all four function bodies to neutral values would have left
 * the game byte-identical on screen with 2073 unit tests green.
 *
 * That is exactly the defect the phase had already written down one module over —
 * *"a table nobody reads is the same defect as a burst of zero particles: it satisfies every
 * assertion and draws the wrong thing"* (`effects-draw-path.test.ts:10`) — which was built as the
 * draw-path half for `EMITTER_SPECS`. **No draw-path half was built for `spriteFeedback.ts`.** This
 * file and `sprite-draw-path.test.ts` are it.
 *
 * ## Why this one is behavioural and its sibling is a source scan
 *
 * `enemyLayer.ts` takes Phaser as a TYPE-only import, so it can be driven end to end against a fake
 * scene — the `enemy-layer-catalog.test.ts` idiom — and a behavioural assertion beats a text one
 * every time. `gamePlayerDraw.ts` and `gameEffects.ts` genuinely name Phaser VALUES
 * (`Phaser.BlendModes`, `Phaser.Scenes.Events`), and `npm run test:sim-isolated` runs this suite with
 * the engine uninstalled — so those two are guarded as source text in `sprite-draw-path.test.ts`,
 * the idiom `effects-draw-path.test.ts` and `play-anim.test.ts` already use.
 *
 * ## Every assertion here is written to fail if the module does nothing
 *
 * The un-hit baseline is asserted FIRST, in the same test, so "the sprite is at the sim position"
 * cannot be satisfied by a flinch that is always zero: the point is that the two differ.
 */

import { describe, expect, it } from 'vitest';

import type Phaser from 'phaser';

import { EnemyLayer } from '../../src/scenes/enemyLayer';
import { TINT_MODE_ADD } from '../../src/scenes/spriteFlash';
import { enemyAnimKeys } from '../../src/render/enemyView';
import { flinchOffset, hitFlashAlpha, ticksSinceHit } from '../../src/render/spriteFeedback';
import { HITSTOP_TICKS, freezePair } from '../../src/sim/hitstop';
import { createWorld } from '../../src/sim/tick';

interface Recorder {
  positions: [number, number][];
  tint: number | null;
  tintMode: number | null;
  animKey: string;
}

function makeSprite(key: string, scene: unknown): Recorder & Record<string, unknown> {
  const sprite = {
    positions: [] as [number, number][],
    tint: null as number | null,
    tintMode: null as number | null,
    animKey: key,
    scene,
    anims: { getName: () => sprite.animKey, isPlaying: false },
    setOrigin: () => sprite,
    setDepth: () => sprite,
    setFlipX: () => sprite,
    setAlpha: () => sprite,
    setPosition: (x: number, y: number) => {
      sprite.positions.push([x, y]);
      return sprite;
    },
    play: (k: string) => {
      sprite.animKey = k;
      return sprite;
    },
    setTint: (v: number) => {
      sprite.tint = v;
      return sprite;
    },
    setTintMode: (m: number) => {
      sprite.tintMode = m;
      return sprite;
    },
    clearTint: () => {
      sprite.tint = null;
      sprite.tintMode = null;
      return sprite;
    },
  };
  return sprite as unknown as Recorder & Record<string, unknown>;
}

/** Every enemy animation key exists, so every body is a Sprite and the tint branch is reachable. */
function build() {
  const sprites: (Recorder & Record<string, unknown>)[] = [];
  const keys = new Set<string>(enemyAnimKeys());
  const graphics = {
    setDepth: () => graphics,
    clear: () => graphics,
    fillStyle: () => graphics,
    fillRect: () => graphics,
    fillCircle: () => graphics,
  };
  const scene = {
    anims: { exists: (key: string) => keys.has(key) },
    add: {
      rectangle: () => {
        throw new Error('every key exists, so nothing should fall back to a Rectangle');
      },
      sprite: (_x: number, _y: number, key: string) => {
        const s = makeSprite(key, scene);
        sprites.push(s);
        return s;
      },
      graphics: () => graphics,
    },
  };
  const world = createWorld({
    seed: 1,
    scale: 1,
    enemies: [{ slug: 'brass-sentry', x: 400, y: 0, patrolMin: 400, patrolMax: 400 }],
  });
  const layer = new EnemyLayer(scene as unknown as Phaser.Scene, world);
  layer.create();
  return { layer, world, sentry: world.enemies.sentries[0], sprite: sprites[0] };
}

/** `alpha` 1 with no snapshot means "draw at the current sim position", per `interpolatedPosition`. */
const NOW = 1;

describe('the enemy draw path applies flinchOffset', () => {
  it('displaces the drawn body by exactly flinchOffset, and by NOTHING before the hit', () => {
    const { layer, world, sentry, sprite } = build();

    // 1. Baseline. Nothing has hit this sentry, so `hitstopUntil` is the -1 sentinel.
    layer.sync(NOW);
    const [restX, restY] = sprite.positions.at(-1)!;

    // 2. A light hit from the player, landed on the current tick.
    world.player.facing = 1;
    freezePair(world.player, sentry, 'light', world.tickCount);
    layer.sync(NOW);
    const [hitX, hitY] = sprite.positions.at(-1)!;

    // 🔴 Non-vacuity first: the two MUST differ, or every equality below is satisfied by a
    // `flinchOffset` that returns the neutral offset for everything.
    expect([hitX, hitY], 'the hit drew the enemy in exactly the same place').not.toEqual([
      restX,
      restY,
    ]);

    // And the displacement is the render layer's decision, not a second copy of it.
    const want = flinchOffset(ticksSinceHit(sentry, world.tickCount), 'light', world.player.facing);
    expect(want.dx, 'the fixture itself must be a real displacement').not.toBe(0);
    expect(hitX - restX).toBeCloseTo(want.dx, 12);
    expect(hitY - restY).toBeCloseTo(want.dy, 12);
  });

  it('follows the PLAYER’s facing, so a blow from the left throws the enemy left', () => {
    const { layer, world, sentry, sprite } = build();
    layer.sync(NOW);
    const restX = sprite.positions.at(-1)![0];

    world.player.facing = -1;
    freezePair(world.player, sentry, 'light', world.tickCount);
    layer.sync(NOW);

    expect(sprite.positions.at(-1)![0] - restX).toBeLessThan(0);
  });

  it('returns EXACTLY to rest once the flinch is over — no 1e-17 residue', () => {
    const { layer, world, sentry, sprite } = build();
    layer.sync(NOW);
    const rest = sprite.positions.at(-1)!;

    freezePair(world.player, sentry, 'light', world.tickCount);
    // `flinchOffset` settles at `freeze + FLINCH_RETURN_TICKS`; walk well past it. The sentry does
    // not move (patrolMin === patrolMax), so its sim position is the same on every one of these.
    world.tickCount += HITSTOP_TICKS.light + 20;
    layer.sync(NOW);

    expect(sprite.positions.at(-1)).toEqual(rest);
  });
});

describe('the enemy draw path applies hitFlashAlpha', () => {
  it('tints on the hit tick, in ADD mode, and clears itself afterwards', () => {
    const { layer, world, sentry, sprite } = build();

    layer.sync(NOW);
    expect(sprite.tint, 'an un-hit enemy must carry no tint').toBeNull();

    freezePair(world.player, sentry, 'light', world.tickCount);
    layer.sync(NOW);

    const flash = hitFlashAlpha(ticksSinceHit(sentry, world.tickCount), 'light');
    expect(flash, 'the fixture must be inside the flash window').toBeGreaterThan(0);
    expect(sprite.tint, 'no tint was applied on the hit tick').not.toBeNull();
    // ADD, not MULTIPLY and not FILL: a multiply tint cannot brighten, and FILL replaces the pixel
    // so the decay would read as the body turning to stone. `spriteFlash.ts` carries the argument.
    expect(sprite.tintMode).toBe(TINT_MODE_ADD);

    // Cleared unconditionally once the window closes — nothing armed, nothing to tear down.
    world.tickCount += HITSTOP_TICKS.light + 1;
    layer.sync(NOW);
    expect(sprite.tint, 'the flash never cleared').toBeNull();
    expect(sprite.tintMode).toBeNull();
  });

  it('brightens with the flash value rather than being a single on/off colour', () => {
    // `light` DECAYS (`spriteFeedback.ts`); `lethal` and `playerHurt` hold. So a light hit sampled
    // on two different ticks inside its window must produce two different tints, and a mutation
    // that hard-codes 0xffffff satisfies "a tint was applied" while erasing the ramp entirely.
    const { layer, world, sentry, sprite } = build();
    freezePair(world.player, sentry, 'light', world.tickCount);

    layer.sync(NOW);
    const first = sprite.tint;
    world.tickCount += 2;
    layer.sync(NOW);
    const later = sprite.tint;

    expect(first).not.toBeNull();
    expect(later).not.toBeNull();
    expect(later, `tint was ${first} on both ticks — the decay is not drawn`).not.toBe(first);
    expect(later!).toBeLessThan(first!);
  });
});

describe('the attacker is not drawn as the victim', () => {
  it('a playerHurt freeze on an enemy draws NEITHER a flinch NOR a flash', () => {
    // A scavenger that claws the player calls `freezePair(player, scavenger, 'playerHurt', …)`, so
    // the enemy carries a `playerHurt` freeze of its own while being the one that landed the blow.
    // Flinching it would draw the exchange backwards.
    const { layer, world, sentry, sprite } = build();
    layer.sync(NOW);
    const rest = sprite.positions.at(-1)!;

    freezePair(world.player, sentry, 'playerHurt', world.tickCount);
    layer.sync(NOW);

    expect(sprite.positions.at(-1)).toEqual(rest);
    expect(sprite.tint).toBeNull();
  });
});
