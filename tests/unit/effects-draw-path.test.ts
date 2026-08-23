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

// ⚠️ TWO files, and the second one is not optional. `ensureParticleTexture` moved to
// `particleTexture.ts` when `gameEffects.ts` crossed 400 lines under the gate round's fixes; a glob
// that still named one file would have left the `spec.tint` assertion scanning a source the function
// is no longer in — silently green, which is the exact failure this file exists to catch. The gate
// follows the FUNCTION, not the filename: `sliceFrom` below finds it in whichever source has it.
// ⚠️ **Vitest caches `?raw` glob results, and this gate is red-proved by editing its own fixture.**
// Phase 9 `qa-expert` finding F8, applied 2026-08-23. Every mutation that proves this file works —
// changing a `setDepth`, removing a `spec.tint` — is an edit to `gameEffects.ts`, which is not the
// test file but IS the fixture. Vitest resolves `import.meta.glob` at transform time and caches it,
// so a landed source change can be scanned as its PREVIOUS text: the mutation reports green and
// reads exactly like a gate that does not work. This project has already lost a `.tmj` mutation to
// it. **Touch this file as well as the source before re-running any mutation here.**
const SCENE_SOURCES = import.meta.glob(
  [
    '../../src/scenes/gameEffects.ts',
    // Added 2026-08-23: `createEmitter` moved to `gameEmitters.ts` when `gameEffects.ts` hit the
    // 400-line ceiling. **This gate is what noticed** — it threw "is in none of the globbed scene
    // sources", by design, rather than passing on an empty scan. That is the whole reason line 41
    // says the gate follows the FUNCTION and not the filename, and it is the T13 defect (a split
    // moving code out of its coverage) being caught instead of shipped.
    '../../src/scenes/gameEmitters.ts',
    '../../src/scenes/particleTexture.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** The body of `marker`'s declaration, found across every globbed source. Throws if it is nowhere. */
function sliceFrom(marker: string): string {
  for (const src of Object.values(SCENE_SOURCES)) {
    const at = src.indexOf(marker);
    if (at > -1) return src.slice(at);
  }
  throw new Error(`"${marker}" is in none of the globbed scene sources — this gate scans nothing`);
}

describe('the scene applies the band rather than restating it', () => {
  // Sliced to `createEmitter` rather than scanned whole, so the containment check is about the draw
  // path and not about a string that happens to appear in a comment.
  const createEmitter = sliceFrom('export function createEmitter(');
  const src = Object.values(SCENE_SOURCES).join('\n');

  it('finds createEmitter at all, so the slice below is not empty', () => {
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
      // ⚠️ The `-?` is not decoration: without it `setDepth(-1)` — a perfectly plausible "put it
      // behind everything" edit — slipped the pattern entirely. Caught only by the sibling
      // `toContain('setDepth(spec.depth)')` above, which is a different claim.
    ).not.toMatch(/setDepth\(\s*-?[\d.]/);
  });

  it('generates ONE particle texture per kind, and no second generator came back', () => {
    // 🔴 **This used to assert that the source of `ensureParticleTexture` contains `spec.tint`, and
    // that assertion was worse than nothing.** `pen.fillStyle(spec.tint, 1)` ->
    // `pen.fillStyle(spec.tint, 0)` still contains the string, makes every particle in the game
    // invisible, and left the whole suite green — 9.6 included, on a real GPU, at `drawn 96
    // inView 96`. Codex named it as the next green mutation (Phase 9 implementation review, finding
    // 2) and the integrator ran it.
    //
    // The colour is now read out of the GENERATED TEXTURE'S PIXELS by
    // `phase-09-draw.spec.ts`'s "every generated dot is opaque at its centre and carries its spec
    // tint", against both an alpha-0 and a wrong-colour mutation. A text gate standing beside a real
    // one is noise, so what is left here is the one claim pixels cannot make: that there is exactly
    // ONE place a particle texture is generated, so a second, tint-less generator cannot appear
    // beside the gated one.
    expect(sliceFrom('export function ensureParticleTexture(')).toContain('generateTexture(');
    expect(
      src.match(/generateTexture\(/g)?.length,
      'a second generateTexture call appeared — the pixel gate covers only the one it samples',
    ).toBe(1);
  });

  it('keeps the NORMAL blend mode — the depth band’s twin, and ungated until now', () => {
    // 🔴 `NORMAL → ADD` was a green mutation. `createEmitter`'s own comment says of that exact line
    // that ADD *"would cost one flush every frame, forever, and be invisible in a screenshot"* —
    // which is verbatim the `setDepth(13)` argument this whole file was created to close. Depth got
    // a gate, tint got a gate, and the third field in the same argument did not.
    // The VALUE is now asserted behaviourally in `effects-behaviour.test.ts`, against what
    // `setBlendMode` was actually called with — `Phaser.BlendModes.NORMAL` became the pinned literal
    // `BLEND_MODE_NORMAL` (`engineLiterals.ts`) so that file could be driven at all. What is left
    // here is the claim behaviour cannot make: that the mode comes from the shared constant rather
    // than from a bare number nobody would recognise as wrong.
    expect(createEmitter).toContain('setBlendMode(BLEND_MODE_NORMAL)');
    expect(
      src,
      `a non-NORMAL blend mode forces a batch flush every frame and is invisible in a screenshot`,
    ).not.toMatch(/BlendModes\.(ADD|MULTIPLY|SCREEN|ERASE)/);
  });

  it('takes every emitter field from the spec rather than from a literal', () => {
    // `reserve → 0` and `maxAliveParticles → 10000` were both green mutations. `effects.test.ts`
    // pins them as facts about the TABLE, which is the "table nobody reads" failure, and the e2e
    // cannot see them either: `effectMutation.ts` overwrites `maxAliveParticles` and re-`reserve`s
    // before it measures anything, so 9.5/9.6 observe the storm's values and never the shipped ones.
    for (const field of [
      'lifespan: ticksToMs(spec.lifespanTicks)',
      'maxAliveParticles: spec.maxAliveParticles',
      '.reserve(spec.reserve)',
      'perSecond(spec.speedMin)',
      'perSecond(spec.speedMax)',
      'gravityY: perSecondSquared(spec.gravityY)',
      'min: spec.angleMin',
      'start: spec.scaleStart',
      'start: spec.alphaStart',
    ]) {
      expect(createEmitter, `createEmitter no longer reads ${field}`).toContain(field);
    }
  });

  it('creates every emitter with emitting:false — these are explosions, never fountains', () => {
    // `emitting: false → true` was green: every emitter becomes a continuous fountain at (0, 0),
    // spraying particles into the corner of the world on every frame of the game, forever.
    expect(createEmitter).toContain('emitting: false');
  });

  it('converts px/tick to px/s at the right ORDER for each quantity', () => {
    // Dropping the square in `perSecondSquared` was green — gravity 60× too weak, which reads as
    // "the dust floats a bit" and nothing else. The helper's own docstring says it exists *"so a
    // spec value cannot be converted at the wrong order by a future edit that copies the
    // neighbouring line"*, and nothing checked the order it converts at.
    const speed = src.slice(src.indexOf('const perSecond ='), src.indexOf('const perSecond =') + 400);
    expect(speed).toMatch(/perSecond\s*=\s*\(pxPerTick: number\): number =>\s*pxPerTick \* TICK_HZ;/);
    expect(speed).toMatch(/pxPerTickSquared \* TICK_HZ \* TICK_HZ/);
  });
});

/**
 * 🔴 A `Burst` decided by `effects.ts` must reach Phaser with its own COUNT.
 *
 * `gameEffects.ts:188` mutated to `emitter.explode(0, burst.x, burst.y)` — **every in-game spark,
 * steam and dust burst drawing nothing at all** — left 2073/2073 green and `tsc` clean. Deleting
 * `strike()`'s spark loop outright was also green.
 *
 * The e2e could not see it either, and that is a mechanism rather than an inference: `installStorm`
 * (`tests/e2e/effectMutation.ts`) calls `emitter.explode(deficit, x, y)` on handles taken from
 * `scene.effects.emitters()` and **never routes through `gameEffects.emit`**, so criteria 9.5 and
 * 9.6 measure the storm and not the game.
 *
 * `effects.test.ts:12-17` names *"a burst of count 0 satisfied every assertion"* as this phase's
 * theme, and it was unguarded at the one line that turns a `Burst` into pixels. The behavioural
 * version of this — a real landing producing real particles in a real browser — is
 * `tests/e2e/phase-09-draw.spec.ts`'s game-event test; this is the millisecond-cost half.
 */
describe('the burst count survives the trip to the emitter', () => {
  // Found by function, never by glob index — `Object.values(...)[0]` would silently point at
  // whichever source Vite happened to order first the day a second file joined the glob.
  const fromEmit = sliceFrom('const emit =');
  const emit = fromEmit.slice(0, fromEmit.indexOf('const specCone ='));
  const src = Object.values(SCENE_SOURCES).join('\n');

  it('slices to `emit` and finds something', () => {
    expect(emit.length).toBeGreaterThan(50);
    expect(emit).toContain('emitter.explode(');
  });

  it('passes burst.count, burst.x and burst.y — never a literal', () => {
    expect(
      emit,
      `gameEffects.emit hands Phaser a count of its own. A burst of 0 satisfies every assertion in ` +
        `effects.test.ts, every depth and tint check in this file, and every particle budget in the ` +
        `e2e — while the game draws nothing.`,
    ).toContain('emitter.explode(burst.count, burst.x, burst.y)');
    expect(emit).not.toMatch(/explode\(\s*[\d.]/);
  });

  it('and the four trigger paths still call it', () => {
    // Deleting any one of these is a whole class of effect that never fires: the spark loop, the
    // death steam, the hurt vent, the landing dust. Each is one `emit(...)` call and nothing else
    // in the repo observes any of them.
    for (const call of [
      'for (const burst of impactSparks(',
      "emit(deathSteam(body.x, body.y), specCone('steam'))",
      "emit(hurtVent(player.x, player.y, player.facing), specCone('steam'))",
      "emit(dust, specCone('dust'))",
    ]) {
      expect(src, `the trigger path \`${call}\` is gone`).toContain(call);
    }
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
