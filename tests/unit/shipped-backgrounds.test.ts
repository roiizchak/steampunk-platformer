/**
 * The parallax layers, gated against the SHIPPED bytes — because nothing was.
 *
 * ## Why this file was written
 *
 * The three background PNGs are the largest assets in the game (18 MB of a 26 MB boot payload) and
 * had **zero unit coverage**: before 2026-08-14 no test under `tests/` so much as mentioned
 * `backgrounds`. That was found the honest way, during W10's red-proof — deliberately corrupting
 * `encodePng` and re-running `assets:world` **exited 0 and wrote three broken layers**, and the only
 * tests that noticed were `art-gates.test.ts`'s in-process synthetic self-tests. Nothing was checking
 * the files that actually ship.
 *
 * ## The loop invariant, moved from build time to always
 *
 * `tools/gen/build-world.mjs` now throws when a mirrored loop is under `MIN_LOOP_VIEWS` view widths
 * — the 2026-08-13 crop that put the same three-dial gauge panel on screen twice at once. But a
 * build-time gate only fires when somebody re-runs the build. A layer hand-edited, re-exported from
 * an image editor, or restored from a bad backup reaches `dist/` with nothing objecting.
 *
 * Asserting it here makes it a property of the **committed bytes** instead, checked on every
 * `npm test`. Same invariant, two consumers, one definition of the threshold — the
 * `viewFits`/`tracksTarget` precedent from Phase 3.
 *
 * ⚠️ This deliberately does NOT re-derive the layers from `_generated/world/`. Those sources are
 * gitignored, so such a test would pass locally and be unrunnable in a fresh clone — which is the
 * shape of a gate that quietly stops gating.
 */

import { describe, expect, it } from 'vitest';

import { readPng } from '../../tools/gen/png.mjs';
import { GAME_WIDTH } from '../../src/game/constants';
import catalog from '../../public/assets/index.json';

/**
 * Mirrors `MIN_LOOP_VIEWS` in `tools/gen/build-world.mjs`. `tools/gen/*.mjs` sits outside tsconfig's
 * `include` so the build script cannot import a TypeScript constant, and this file cannot import the
 * build script's internals — so the number is restated, and the test below pins the two together by
 * reading the build script's source, the same way `sheet-gates.test.ts` pins `ATTACK_STARTUP_TICKS`.
 */
const MIN_LOOP_VIEWS = 2;

const LAYER_KEYS = ['bg-far', 'bg-mid', 'bg-near'] as const;

const urlFor = (key: string): string | undefined =>
  (catalog.images as { key: string; url: string }[]).find((i) => i.key === key)?.url;

/** Resolved from the catalog's own `url`, never rebuilt from the key (`shipped-sheets.test.ts:50-53`). */
function layer(key: string): { width: number; height: number } {
  const url = urlFor(key);
  expect(url, `${key} is not in index.json's images`).toBeDefined();
  return readPng(`public/${url}`);
}

describe('the shipped parallax layers', () => {
  it('are all in the catalog and decode as real PNGs', () => {
    for (const key of LAYER_KEYS) {
      const img = layer(key);
      expect(img.width, `${key} decoded to zero width`).toBeGreaterThan(0);
      expect(img.height, `${key} decoded to zero height`).toBeGreaterThan(0);
    }
  });

  it.each(LAYER_KEYS)(
    "%s's mirrored loop spans at least two view widths — the 2026-08-13 crop invariant",
    (key) => {
      const { width } = layer(key);
      const loopViews = width / GAME_WIDTH;

      expect(
        loopViews,
        `${key} is ${width}px = ${loopViews.toFixed(2)} view widths. Under ${MIN_LOOP_VIEWS} the ` +
          'unique half AND its mirror are on screen in every frame, so a duplicated feature is ' +
          'permanently visible — this is the 2026-08-13 crop, which shipped the same gauge panel ' +
          'twice at once and was reverted the same day. Cropping the SOURCE removes not one DRAWN ' +
          'pixel, so it does not buy frame rate either.',
      ).toBeGreaterThanOrEqual(MIN_LOOP_VIEWS);
    },
  );

  it('all three layers share one height, or they do not scroll as one background', () => {
    const heights = LAYER_KEYS.map((key) => layer(key).height);
    expect(new Set(heights).size, `layer heights differ: ${heights.join(', ')}`).toBe(1);
  });

  /**
   * Non-vacuity, and the thing that stops the two `MIN_LOOP_VIEWS` copies drifting apart. If the
   * build script's threshold were raised and this file's were not, the shipped layers could satisfy
   * the weaker test while the build refused to reproduce them.
   */
  it("agrees with build-world.mjs's own threshold, which is the other half of this rule", async () => {
    const source = (await import('../../tools/gen/build-world.mjs?raw')).default as string;
    const match = /const MIN_LOOP_VIEWS = (\d+);/.exec(source);
    expect(match, 'build-world.mjs no longer declares MIN_LOOP_VIEWS').not.toBeNull();
    expect(Number(match![1])).toBe(MIN_LOOP_VIEWS);
  });
});
