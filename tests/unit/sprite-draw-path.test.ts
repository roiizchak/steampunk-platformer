/**
 * 🔴 Do the two Phaser-VALUE scene files read the tables they were built for?
 *
 * `enemy-feedback.test.ts` is the behavioural half of this question and covers `enemyLayer.ts` end
 * to end. `gamePlayerDraw.ts`, `gameEffects.ts` and `UIScene.ts` cannot be driven the same way:
 * each names a Phaser VALUE (`Phaser.Display`, `Phaser.BlendModes`, `Phaser.Scenes.Events`), and
 * `npm run test:sim-isolated` runs this suite with the engine uninstalled, so a value import
 * anywhere in the graph turns a boundary check into a resolution failure.
 *
 * So these are source-text gates, in `effects-draw-path.test.ts`'s and `play-anim.test.ts`'s idiom:
 * raw source through `import.meta.glob`, sliced to the function under discussion so a match cannot
 * come from a comment, and each assertion carrying the mutation it is meant to catch.
 *
 * ## What each of these was watched failing against
 *
 * | assertion | mutation it names |
 * |---|---|
 * | the flinch is added to the drawn position | delete the `+ (flinch?.dx ?? 0)` terms |
 * | the flash reaches the sprite | delete the `applyHitFlash` call |
 * | the i-frame alpha multiplies `desc.alpha` | `setAlpha(desc.alpha)` |
 * | the squash reaches the sprite | delete `playerSprite.setScale(...)` |
 * | the contact frame is SNAPPED | delete `setCurrentFrame(frames[...])` |
 * | the gear pop is fired | delete `this.gearPop?.pop()` |
 * | shutdown destroys the pop, the flyers and the effects | delete each line |
 *
 * The last three are not decoration. Deleting `UIScene.ts`'s sole `this.gearPop?.pop()` call left
 * 2073/2073 green and `tsc` clean — criterion 9.4's chosen observable subject, with nothing anywhere
 * asserting it was wired to anything.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob(
  [
    '../../src/scenes/gamePlayerDraw.ts',
    '../../src/scenes/gameEffects.ts',
    '../../src/scenes/UIScene.ts',
    '../../src/scenes/enemyLayer.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function source(name: string): string {
  const key = Object.keys(SOURCES).find((k) => k.endsWith(`/${name}`));
  if (key === undefined) {
    throw new Error(`${name} is not in the glob — this whole file would pass vacuously`);
  }
  return SOURCES[key];
}

/**
 * The body of a function, from its declaration to end of file.
 *
 * Deliberately NOT the whole file: `effects-draw-path.test.ts` learned that a `toContain` over a
 * whole source matches the string in a comment about the code as happily as the code
 * (its own finding L2). Every slice below is checked non-empty first.
 */
function from(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `"${marker}" is gone — the slice below would be the whole file`).toBeGreaterThan(-1);
  return src.slice(at);
}

describe('gamePlayerDraw.ts draws the per-sprite feedback', () => {
  const src = source('gamePlayerDraw.ts');
  const body = from(src, 'export function renderPlayerSprite(');

  it('imports the decisions rather than restating them', () => {
    for (const name of ['flinchOffset', 'hitFlashAlpha', 'iframeAlpha', 'ticksSinceHit', 'impactOf']) {
      expect(src, `${name} is not imported — spriteFeedback.ts has no consumer again`).toContain(
        name,
      );
    }
  });

  it('adds the FLINCH to the position it draws at', () => {
    // The whole point: `interpolatedPosition` decides where the body is, `flinchOffset` decides how
    // far the blow threw it, and the sprite is drawn at the sum. A `setPosition(drawn.x, drawn.y)`
    // typechecks, draws the game correctly in every frame nobody is being hit, and silently deletes
    // the feature.
    expect(body).toMatch(/setPosition\(\s*drawn\.x \+ .*flinch/s);
    expect(body).toContain('flinchOffset(');
  });

  it('sends the FLASH to the shared applier, not to a second copy of it', () => {
    expect(body).toContain('applyHitFlash(sprite');
    expect(body).toContain('hitFlashAlpha(');
    // One definition of what a hit flash looks like. `enemyLayer.ts` calls the same function; a
    // `setTint` written inline here would be the second copy that drifts (vault 5.3).
    expect(body, 'gamePlayerDraw tints the sprite itself instead of going through spriteFlash').not.toMatch(
      /sprite\.setTint\(/,
    );
  });

  it('MULTIPLIES the i-frame flicker into the gate-entry alpha rather than replacing it', () => {
    // Two orthogonal states — a player can walk into the gate still invulnerable — so whichever was
    // written second would erase the other. `setAlpha(desc.alpha)` alone is the mutation.
    expect(body).toMatch(/setAlpha\(\s*desc\.alpha \* iframeAlpha\(/);
  });

  it('SNAPS the frozen attack pose to the contact frame', () => {
    // `sprite-feedback.test.ts` pins `ATTACK_CONTACT_FRAME_INDEX = 4` and nothing pinned the
    // behaviour the number exists for. Task 0's trace was blocking precisely because a freeze that
    // holds whatever frame was last drawn holds a mid-wind-up pose: contact lands on `combatCounter`
    // 8-9, the last two ticks of the active window, and the renderer has not reached it.
    expect(body).toContain('anims.pause()');
    expect(body).toContain('setCurrentFrame(frames[ATTACK_CONTACT_FRAME_INDEX])');
    // And the resume, UNCONDITIONALLY — that is what makes the pause self-correcting with no
    // "was frozen" flag to leak across a restart.
    expect(body).toContain('anims.resume()');
    expect(body, 'the snap is not gated on the freeze at all').toContain('frozen(world.player');
  });
});

describe('gameEffects.ts draws the landing squash and tears itself down', () => {
  const src = source('gameEffects.ts');

  it('takes the player sprite and writes the squash onto it', () => {
    expect(src).toContain('landSquash(');
    expect(src).toMatch(/playerSprite\.setScale\(\s*squash\.sx,\s*squash\.sy\s*\)/);
  });

  it('records the landing tick on EVERY touchdown, not only the dusty ones', () => {
    // `landingDust` returns null below its fall-speed threshold. Gating the squash on that would
    // make the character land differently depending on how fast they happened to be falling on a
    // 1 px step-down, which is a different feature from the one `landSquash` describes.
    const landing = from(src, 'player.grounded && !wasGrounded');
    const dustGuard = landing.indexOf('if (dust !== null)');
    const armed = landing.indexOf('landedTick = tick');
    expect(dustGuard).toBeGreaterThan(-1);
    expect(armed).toBeGreaterThan(-1);
    // Outside the `dust !== null` block: the closing brace of that block comes first.
    expect(landing.slice(dustGuard, armed)).toContain('}');
  });

  it('registers its own teardown, so destroy() is reachable in production at all', () => {
    // `EffectAttachment.destroy()` restores `camera.setPosition(baseX, baseY)` and had NO caller
    // anywhere outside the unit tests: `GameScene` mentions `effects` at four places and none of
    // them is a teardown. A camera left mid-shake is then captured as the next run's unshaken base,
    // and every frame afterwards carries that error — including the frames `shakeWithinEnvelope`
    // asserts are exactly at base.
    expect(src).toContain('Phaser.Scenes.Events.SHUTDOWN');
    expect(src).toMatch(/SHUTDOWN,\s*\(\)\s*=>\s*attachment\.destroy\(\)/);
  });
});

describe('UIScene.ts fires the gear pop and stops what it started', () => {
  const src = source('UIScene.ts');

  it('calls pop() when the drawn gear count changes', () => {
    // 🔴 Criterion 9.4's chosen observable subject. Deleting this one line left the whole suite
    // green: every settle in `hudGearPop.ts` was proven correct and nothing proved it ever ran.
    expect(src).toContain('this.gearPop?.pop()');
    const render = from(src, 'world.gearsCollected !== this.drawnGearCount');
    expect(render.slice(0, 400)).toContain('this.gearPop?.pop()');
  });

  it('destroys the gear pop AND the flyers on SHUTDOWN, and nulls the pop', () => {
    // The handler exists specifically to stop tweens before their targets are destroyed and cites
    // the Phase 6 incident three lines above. Phase 9 added two more tween owners to this scene and
    // added neither. `gearPop` must also be NULLED: `applyLayout` calls `destroy()` on it, so after
    // a re-`create()` the first layout settles a destroyed icon from the previous run's display list.
    const shutdown = from(src, 'Phaser.Scenes.Events.SHUTDOWN');
    const handler = shutdown.slice(0, shutdown.indexOf('\n  }'));
    expect(handler).toContain('this.gearPop?.destroy()');
    expect(handler).toContain('this.gearPop = undefined');
    expect(handler).toContain('this.flyers?.destroy()');
  });
});

describe('enemyLayer.ts is the behavioural half — this only checks it did not drift', () => {
  const src = source('enemyLayer.ts');

  it('routes its flash through the same shared applier as the player', () => {
    // The behaviour is asserted in `enemy-feedback.test.ts` against a fake scene. This is the one
    // claim that file cannot make: that there is ONE implementation and not two.
    expect(src).toContain('applyHitFlash(sprite');
    expect(src, 'enemyLayer tints inline instead of going through spriteFlash').not.toMatch(
      /sprite\.setTintMode\(/,
    );
  });
});
