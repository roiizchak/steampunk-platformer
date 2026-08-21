/**
 * 🔴 Does `renderPlayerSprite` actually DO what `sprite-draw-path.test.ts` reads in its source?
 *
 * ## The gap this closes
 *
 * QA log entry 33: `gamePlayerDraw.ts` was gated as **source text** because the module carried a
 * VALUE import of Phaser, and `npm run test:sim-isolated` runs this suite with the engine
 * uninstalled. The import turned out to be unnecessary — every occurrence of the name in that file
 * is a type position — so it is `import type` now and the whole draw path can be driven, in the
 * `enemy-feedback.test.ts` idiom, against a fake sprite that records what was written to it.
 *
 * A text gate reds when a call is deleted. It cannot tell a `flinchOffset` applied to the wrong axis
 * from one applied to the right one, an alpha multiplied from one replaced, or a frozen attack
 * snapped to the contact frame from one snapped to frame 0. Those are the four cases below.
 *
 * The source-text gate stays: it holds the one claim no fake sprite can make — that the flash goes
 * through the shared `applyHitFlash` rather than a second inline `setTint` *(vault 5.3)*.
 *
 * ## Every assertion is written to fail if the module does nothing
 *
 * The un-hit, un-frozen baseline is taken FIRST in each test, so "the sprite is at the sim position"
 * and "the alpha is `desc.alpha`" cannot be satisfied by feedback functions that always return
 * neutral. The point in each case is that the two differ.
 */

import { describe, expect, it } from 'vitest';

import type Phaser from 'phaser';

import {
  ATTACK_CONTACT_FRAME_INDEX,
  flinchOffset,
  hitFlashAlpha,
  iframeAlpha,
  ticksSinceHit,
} from '../../src/render/effects';
import { animKeyFor } from '../../src/render/playerView';
import { TINT_MODE_ADD } from '../../src/scenes/engineLiterals';
import { renderPlayerSprite } from '../../src/scenes/gamePlayerDraw';
import { IFRAME_TICKS } from '../../src/sim';
import { HITSTOP_TICKS, freezePair } from '../../src/sim/hitstop';
import { createWorld } from '../../src/sim/tick';

/** More frames than the contact index, so the snap has somewhere wrong to land as well as right. */
const FRAMES = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6'];

function build() {
  const paused: boolean[] = [];
  const sprite = {
    x: 0,
    y: 0,
    alpha: 1,
    flipX: false,
    tint: null as number | null,
    tintMode: null as number | null,
    animKey: '',
    currentFrame: null as string | null,
    scene: { anims: { exists: () => true } },
    anims: {
      getName: () => sprite.animKey,
      isPlaying: true,
      currentAnim: { frames: FRAMES },
      pause: () => paused.push(true),
      resume: () => paused.push(false),
      setCurrentFrame: (f: string) => {
        sprite.currentFrame = f;
      },
    },
    play: (k: string) => {
      sprite.animKey = k;
      return sprite;
    },
    setPosition: (x: number, y: number) => {
      sprite.x = x;
      sprite.y = y;
      return sprite;
    },
    setFlipX: (v: boolean) => {
      sprite.flipX = v;
      return sprite;
    },
    setAlpha: (a: number) => {
      sprite.alpha = a;
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
  const world = createWorld({ seed: 1, scale: 1 });
  // `prevPlayer: null` with `accumulatorMs: 0` means "draw at the current sim position" — the
  // interpolation is `interpolate.ts`'s subject and is not what this file is asking about.
  const draw = () =>
    renderPlayerSprite(sprite as unknown as Phaser.GameObjects.Sprite, world, null, 0);
  return { sprite, world, draw, paused };
}

describe('the player draw path applies the flinch and the flash', () => {
  it('displaces the drawn body by exactly flinchOffset, and by NOTHING before the hit', () => {
    const { sprite, world, draw } = build();

    draw();
    const [restX, restY] = [sprite.x, sprite.y];

    world.player.facing = 1;
    // `playerHurt`, not `light`: the player is frozen by their OWN landed blows too, and flinching
    // them away from a hit they dealt would draw the exchange backwards.
    freezePair(world.player, world.player, 'playerHurt', world.tickCount);
    draw();

    const want = flinchOffset(
      ticksSinceHit(world.player, world.tickCount),
      'playerHurt',
      world.player.facing,
    );
    expect(want.dx, 'the fixture itself must be a real displacement').not.toBe(0);
    expect([sprite.x, sprite.y], 'the hit drew the player in exactly the same place').not.toEqual([
      restX,
      restY,
    ]);
    expect(sprite.x - restX).toBeCloseTo(want.dx, 12);
    expect(sprite.y - restY).toBeCloseTo(want.dy, 12);
  });

  it('does NOT flinch the player for a blow they LANDED', () => {
    const { sprite, world, draw } = build();
    draw();
    const rest = [sprite.x, sprite.y];

    freezePair(world.player, world.player, 'light', world.tickCount);
    draw();

    expect([sprite.x, sprite.y]).toEqual(rest);
    expect(sprite.tint, 'the player flashed for their own swing').toBeNull();
  });

  it('tints in ADD mode on a hit and clears itself when the window closes', () => {
    const { sprite, world, draw } = build();
    draw();
    expect(sprite.tint, 'an un-hit player carries a tint').toBeNull();

    freezePair(world.player, world.player, 'playerHurt', world.tickCount);
    draw();

    expect(hitFlashAlpha(ticksSinceHit(world.player, world.tickCount), 'playerHurt')).toBeGreaterThan(0);
    expect(sprite.tint, 'no tint was applied on the hit tick').not.toBeNull();
    expect(sprite.tintMode).toBe(TINT_MODE_ADD);

    world.tickCount += HITSTOP_TICKS.playerHurt + 20;
    draw();
    expect(sprite.tint, 'the flash never cleared').toBeNull();
  });
});

describe('the i-frame flicker MULTIPLIES the gate-entry alpha', () => {
  /** The first counter value inside the window that actually dims — found, never assumed. */
  const flickerAt = (() => {
    for (let i = 0; i < IFRAME_TICKS; i += 1) {
      if (iframeAlpha(i, IFRAME_TICKS) !== 1) return i;
    }
    throw new Error('iframeAlpha never dims — this whole describe would be vacuous');
  })();

  it('multiplies rather than replaces, so neither state erases the other', () => {
    const { sprite, world, draw } = build();

    draw();
    const opaque = sprite.alpha;
    expect(opaque, 'a settled player is not fully opaque').toBe(1);

    world.player.iFrameCounter = flickerAt;
    draw();
    const flickered = sprite.alpha;
    expect(flickered, 'the flicker never reached the sprite').toBe(iframeAlpha(flickerAt, IFRAME_TICKS));

    expect(flickered, 'a flicker that does not dim makes the rest of this vacuous').toBeLessThan(1);

    // Now the gate run-in. Between them the two assertions below name both mutations:
    // `setAlpha(flicker)` alone deletes the scripted fade and reds the first; `setAlpha(desc.alpha)`
    // alone deletes the flicker and reds the assertion above.
    world.goalEntryTicks = 5;
    world.player.iFrameCounter = 0;
    draw();
    const fadeOnly = sprite.alpha;
    expect(fadeOnly, 'the run-in fade never reached the sprite').toBeLessThan(1);

    // 🔴 And the flicker is SUPPRESSED there, not multiplied in: a fade multiplied by a 3-on/3-off
    // strobe falls, rises and falls again, off the ramp `goalEntryAlpha` defines. Found in a browser
    // by `session-gate-entry.spec.ts` and by nothing else.
    world.player.iFrameCounter = flickerAt;
    draw();
    expect(sprite.alpha, 'the flicker is not suppressed during the run-in').toBe(fadeOnly);
  });
});

describe('a frozen attack snaps to the contact frame', () => {
  it('pauses on the contact frame while frozen and resumes unconditionally after', () => {
    const { sprite, world, draw, paused } = build();

    world.player.state = 'attack';
    draw();
    expect(sprite.animKey, 'the fixture never reached the attack clip').toBe(animKeyFor('attack'));
    expect(paused.at(-1), 'an unfrozen player was paused').toBe(false);
    expect(sprite.currentFrame, 'an unfrozen player was snapped').toBeNull();

    freezePair(world.player, world.player, 'light', world.tickCount);
    draw();

    expect(paused.at(-1), 'the freeze did not pause the animation').toBe(true);
    // The number is pinned in `sprite-feedback.test.ts`; what is pinned HERE is that the frame the
    // sprite ends up on is that one. A snap to `frames[0]` holds a mid-wind-up pose and reads
    // identically in the source.
    expect(sprite.currentFrame).toBe(FRAMES[ATTACK_CONTACT_FRAME_INDEX]);

    world.tickCount += HITSTOP_TICKS.light + 1;
    draw();
    expect(paused.at(-1), 'the animation never resumed — no “was frozen” flag exists to fix it').toBe(
      false,
    );
  });

  it('does NOT snap a clip that is not the attack, and never indexes past its frames', () => {
    // The bounds check is not defensive noise: a regenerated sheet with fewer frames must draw the
    // wrong pose for a few ticks, never take the scene down inside a render loop.
    const { sprite, world, draw } = build();
    world.player.state = 'idle';
    freezePair(world.player, world.player, 'light', world.tickCount);
    draw();
    expect(sprite.currentFrame, 'a non-attack clip was snapped to the attack contact frame').toBeNull();

    sprite.anims.currentAnim = { frames: ['only-one'] };
    world.player.state = 'attack';
    expect(() => draw()).not.toThrow();
    expect(sprite.currentFrame).toBeNull();
  });
});
