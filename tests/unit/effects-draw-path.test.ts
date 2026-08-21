/**
 * Does the emitter table actually reach the drawn object?
 *
 * `effects.test.ts` asserts what `src/render/effects.ts` DECIDES. Every one of those assertions is
 * that module making a claim about itself, and 🔴 **that turned out to be the hole**: Task 5 ran the
 * mutation the depth band's own failure message names — `setDepth(13)` in
 * `src/scenes/gameEffects.ts` — and the entire 2051-test suite stayed green. `EFFECT_DEPTH` and
 * `EMITTER_SPECS[kind].depth` agreed with each other perfectly while nothing on earth observed
 * whether the scene that builds the emitters honours either. A table nobody reads is the same defect
 * as a burst of zero particles: it satisfies every assertion and draws the wrong thing.
 *
 * So this file is the other half — the two things about the emitters that are only true if the
 * SCENE cooperates:
 *
 *   1. **the depth**, guarded as source text, in `play-anim.test.ts:60-81`'s idiom (which asserts
 *      that `enemyLayer.ts` and `gamePlayerDraw.ts` route through `playIfChanged` and never call
 *      `sprite.play()` themselves). Raw source through `import.meta.glob`, the pattern
 *      `docs-contract.test.ts` and `file-size.test.ts` already use — this project's tests do not
 *      reach the filesystem with `node:fs`.
 *   2. **the tint**, which is a field the scene has to read and a value that has to be able to
 *      differ from every other one.
 *
 * The `willRender`-level version of (1) — each live emitter's `depth` read off
 * `window.__phaserGame` — is a later task's e2e spec. This is the unit-level half, and it costs
 * milliseconds instead of a browser.
 *
 * Its own file rather than more of `effects.test.ts` because that file hit 422 lines when these were
 * appended to it, and this project splits rather than exempts. The seam is real: everything there is
 * engine-free plain data, and everything here is a claim about `src/scenes/`.
 */

import { describe, expect, it } from 'vitest';
import { EMITTER_SPECS, type EffectKind } from '../../src/render/effects';

const KINDS: EffectKind[] = ['sparks', 'steam', 'dust'];

const SCENE_SOURCES = import.meta.glob(['../../src/scenes/gameEffects.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('the scene applies the band rather than restating it', () => {
  const src = Object.values(SCENE_SOURCES)[0];
  // Sliced to `createEmitter` rather than scanned whole, so the containment check is about the draw
  // path and not about a string that happens to appear in a comment.
  const start = src.indexOf('function createEmitter(');
  const createEmitter = src.slice(start);

  it('finds createEmitter at all, so the slice below is not empty', () => {
    expect(start).toBeGreaterThan(-1);
    expect(createEmitter).toContain('scene.add');
  });

  it('takes its depth from the spec', () => {
    expect(createEmitter).toContain('setDepth(spec.depth)');
  });

  it('passes NO numeric literal to setDepth, anywhere in the file', () => {
    expect(
      src,
      `src/scenes/gameEffects.ts hands setDepth a number of its own. Every emitter must take ` +
        `EMITTER_SPECS[kind].depth, or the 10.1/10.2/10.3 band is a table nobody reads — a "tidy" ` +
        `edit to 13 costs one batch flush every frame forever and is invisible in a screenshot.`,
    ).not.toMatch(/setDepth\(\s*[\d.]/);
  });

  it('bakes the spec tint into the particle it draws', () => {
    expect(
      src,
      `src/scenes/gameEffects.ts never reads spec.tint, so EmitterSpec.tint is a field nothing ` +
        `draws — the same defect class as a burst of zero particles.`,
    ).toContain('spec.tint');
  });
});

describe('every emitter is a colour a player can tell from the others', () => {
  // Grey-box tints, in the direction STYLE.md §1 locks — the foreground warm and brass-capped, the
  // background cool and shadowed — and in the shape `playerView.ts`'s `STATE_COLOURS` and
  // `enemyView.ts`'s `SENTRY_COLOUR`/`SCAVENGER_COLOUR` already established: colour is plain data in
  // `src/render/`, decided there and applied by the scene.
  it('is neither white nor black', () => {
    for (const kind of KINDS) {
      const tint = EMITTER_SPECS[kind].tint;
      expect(
        tint === 0xffffff || tint === 0x000000,
        `${kind}.tint is 0x${tint.toString(16)}. A tint every emitter sets to white satisfies ` +
          `"a tint was applied" while being indistinguishable from no tint at all — the same ` +
          `defect as an emitter with scaleStart 0.`,
      ).toBe(false);
    }
  });

  it('differs between all three, so sparks, steam and dust are three reads and not one', () => {
    const tints = KINDS.map((kind) => EMITTER_SPECS[kind].tint);
    expect(new Set(tints).size).toBe(KINDS.length);
  });
});
