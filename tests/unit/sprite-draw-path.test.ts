/**
 * 🔴 Do the two Phaser-VALUE scene files read the tables they were built for?
 *
 * ⚠️ **Two of the three files below are driven BEHAVIOURALLY now, and this file is no longer their
 * only gate.** It used to say they could not be: each named a Phaser VALUE and
 * `npm run test:sim-isolated` runs this suite with the engine uninstalled, so a value import
 * anywhere in the graph turns a boundary check into a resolution failure. `gamePlayerDraw.ts`'s
 * value import turned out to be unnecessary and `gameEffects.ts`'s two constants are pinned literals
 * in `engineLiterals.ts`, so `player-draw-behaviour.test.ts` and `effects-behaviour.test.ts` now
 * drive both against fake scenes — QA log entry 33, closed. `UIScene.ts` still names
 * `Phaser.Display` and `Phaser.Scenes.Events` and is still text-gated only.
 *
 * What stays here is the half a fake scene cannot assert: that there is ONE implementation and not
 * two, and that a shared constant is used rather than a bare number. Same idiom as before —
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
    // Two orthogonal states, so whichever was written second would erase the other.
    // `setAlpha(desc.alpha)` alone is the mutation this names.
    expect(body).toContain('iframeAlpha(world.player.iFrameCounter, IFRAME_TICKS)');
    expect(body).toMatch(/setAlpha\(\s*desc\.alpha \* flicker\s*\)/);
  });

  it('SUPPRESSES the flicker during the gate run-in, where the fade owns the alpha', () => {
    // 🔴 Found by `session-gate-entry.spec.ts`, in a browser, and by nothing else. A player who
    // reaches the exit still invulnerable had the scripted fade multiplied by a 3-on/3-off strobe:
    // the drawn alpha fell, rose and fell again, off the `1 - k/20` ramp `goalEntryAlpha` defines.
    // The run-in's alpha is a rendering claim about one scripted moment; a flicker is a claim about
    // the moment before it.
    expect(body).toMatch(/world\.goalEntryTicks === null\s*\n?\s*\?\s*iframeAlpha\(/);
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

  it('takes the touchdown from the SIM, never by comparing grounded across frames', () => {
    // 🔴 This used to assert the shape of a render-side `landedTick = tick` written inside an
    // `if (player.grounded && !wasGrounded)` — a cross-frame comparison the Phase 9 Codex
    // implementation review showed loses the whole landing whenever the touchdown and the buffered
    // jump that follows it share a render frame. `PlayerSim.landedTick` replaced it, so the claim
    // the old test made ("armed on every touchdown, not only the dusty ones") is now structural: the
    // sim stamps every touchdown and this file only reads the stamp. It is asserted BEHAVIOURALLY in
    // `effects-behaviour.test.ts` — a landing too gentle to puff still squashes — and the one claim
    // left here is the one behaviour cannot make: that no second, drifting edge detector came back.
    expect(src).toContain('player.landedTick');
    expect(
      src,
      'gameEffects is inferring the landing from grounded again — see PlayerSim.landedTick',
    ).not.toMatch(/wasGrounded/);
  });

  it('registers its own teardown, so destroy() is reachable in production at all', () => {
    // `EffectAttachment.destroy()` restores `camera.setPosition(baseX, baseY)` and had NO caller
    // anywhere outside the unit tests: `GameScene` mentions `effects` at four places and none of
    // them is a teardown. A camera left mid-shake is then captured as the next run's unshaken base,
    // and every frame afterwards carries that error — including the frames `shakeWithinEnvelope`
    // asserts are exactly at base.
    // The event NAME and the restore are both asserted behaviourally now, in
    // `effects-behaviour.test.ts`, against a fake scene that records what `events.once` was given.
    // What stays here is that the registration goes through the pinned literal rather than a bare
    // `'shutdown'` string, which is the claim the fake scene cannot make.
    expect(src).toContain('SCENE_SHUTDOWN');
    expect(src).toMatch(/SCENE_SHUTDOWN,\s*\(\)\s*=>\s*attachment\.destroy\(\)/);
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
