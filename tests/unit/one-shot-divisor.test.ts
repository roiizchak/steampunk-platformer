/**
 * A one-shot's DECLARED frame count must divide its sim window, and the shipped sheet must have the
 * count that was declared.
 *
 * ## Why this file exists
 *
 * `tests/unit/loop-dwell.test.ts` states the invariant every animation obeys: each drawn frame is
 * held for a whole number of 60 Hz refreshes, because a display cannot do anything else. It checks
 * the **shipped catalog**, which is the right place to be certain.
 *
 * It is the wrong place to find out. A catalog row is the end of a chain — declare a frame count,
 * extract that many source frames, pack them, write the row — and by the time `loop-dwell` goes red
 * the art has already been re-cut. This file checks the **head** of the chain, so a bad count is a
 * red suite before ffmpeg is invoked, and it checks the two ends agree, which is how the drift
 * below stayed invisible.
 *
 * ## The two defects it was written for, both live on 2026-08-14
 *
 * **1. Five one-shots juddered, and one of them was created by fixing something else.** 20 ticks
 * over 8 frames (`attack`) is 2.5 refreshes each: the display serves 3,2,3,2,3,2,3,2. 45 over 10
 * (both `death` sheets) is 4.5. 45 over 8 (`brass-sentry/death`) is 5.625, the worst. `loop-dwell`
 * recorded two of them as permanent, on the belief that *"the honest fix is a frame count that
 * divides the window — which is a re-pack of the art"* and that the count was not ours to choose.
 * **It always was**: `VIDEO_MOTIONS[key].frames` is a declaration, and `build-clips.mjs:293` samples
 * exactly that many source frames. The sim window stays exactly where it is.
 *
 * **2. `fall`'s spec and its extracted strip had drifted apart.** `motion.mjs` declared 6;
 * `_generated/sheets/fall-clip.png` held 8 cells; the catalog shipped 8. `assets:build` packs
 * whatever the strip contains and never consults the spec, so re-running the packer alone could
 * not converge them, and nothing compared the two numbers. That is the assertion in the second
 * block below — it is what turns "someone re-ran one of the two build steps" into a red suite.
 */

import { describe, expect, it } from 'vitest';

import catalog from '../../public/assets/index.json';
import { BLOCKED_ON_ART } from './blockedDwell';
import { VIDEO_MOTIONS } from '../../tools/gen/motion.mjs';
import { timingFor } from '../../tools/gen/catalogTimings.mjs';
import { SLUGS, workListFor } from '../../tools/gen/slugConfig.mjs';

interface OneShot {
  slug: string;
  action: string;
  motionKey: string;
  frames: number;
  simTicks: number;
}

/**
 * Every declared `(slug, action)` whose timing is a WINDOW rather than a cadence.
 *
 * Walks `workListFor`, which is what the build scripts iterate — not `VIDEO_MOTIONS`, which also
 * carries `brass-sentry/fire-elevated`, art that was never bought and is deliberately undeclared.
 * A loop is skipped because its lever is the authored cadence, not the frame count, and
 * `loop-dwell.test.ts` covers it from the other end.
 */
const oneShots: OneShot[] = SLUGS.flatMap((slug) => workListFor(slug)).flatMap(
  ({ slug, action, motionKey }) => {
    let timing: { simTicks: number; loop: boolean };
    try {
      // An authored loop throws here without its cadence context, which is exactly the signal that
      // it is not a one-shot. Catching is the filter; nothing else is swallowed, because a windowed
      // row's timing is a constant and cannot throw.
      timing = timingFor(slug, action) as { simTicks: number; loop: boolean };
    } catch {
      return [];
    }
    if (timing.loop) return [];
    const spec = VIDEO_MOTIONS[motionKey] as { frames?: number } | undefined;
    if (!spec) {
      throw new Error(
        `one-shot-divisor: "${slug}/${action}" is declared in slugConfig and has a windowed timing, ` +
          `but VIDEO_MOTIONS has no "${motionKey}". A missing spec must fail here rather than ` +
          `silently shrinking the set this file checks.`,
      );
    }
    return [{ slug, action, motionKey, frames: spec.frames!, simTicks: timing.simTicks }];
  },
);

describe('a windowed animation declares a frame count that divides its window', () => {
  it('found the one-shots at all — an empty list would make every assertion below vacuous', () => {
    // Six today: courier jump/fall/attack/hurt/death, sentry fire/death, scavenger death. The floor
    // is deliberately below that so adding art does not fail this, but deleting the filter does.
    expect(oneShots.length).toBeGreaterThanOrEqual(6);
    expect(oneShots.map((o) => `${o.slug}/${o.action}`)).toContain('brass-courier/attack');
  });

  it('the blocked list names rows that exist here, and is exactly the set that fails', () => {
    // Both halves matter. The first stops a typo'd key from exempting nothing while looking like an
    // exemption; the second stops the list from being a place to park a new failure.
    const keys = Object.keys(BLOCKED_ON_ART);
    for (const key of keys) {
      const { slug, action } = BLOCKED_ON_ART[key]!;
      expect(
        oneShots.map((o) => `${o.slug}/${o.action}`),
        `${key} is exempted but is not a declared one-shot`,
      ).toContain(`${slug}/${action}`);
    }
    const failing = oneShots.filter((o) => o.simTicks % o.frames !== 0).map((o) => `${o.slug}-${o.action}`);
    expect(failing).toEqual(keys);
  });

  for (const { slug, action, motionKey, frames, simTicks } of oneShots.filter(
    (o) => !(`${o.slug}-${o.action}` in BLOCKED_ON_ART),
  )) {
    it(`${slug}/${action} — ${frames} frames divide the ${simTicks}-tick window`, () => {
      expect(frames).toBeGreaterThan(0);
      expect(
        simTicks % frames,
        `VIDEO_MOTIONS["${motionKey}"].frames is ${frames}, which does not divide the ` +
          `${simTicks}-tick window: each drawn frame would be held for ` +
          `${(simTicks / frames).toFixed(3)} refreshes and the display would serve a mix of long ` +
          `and short frames. Pick a divisor of ${simTicks} — ` +
          `${divisorsOf(simTicks).join(', ')} — and re-run assets:clips then assets:build. ` +
          `Do NOT round the window: it is imported from src/sim/ and rounding it is a balance ` +
          `change wearing an animation change's clothes.`,
      ).toBe(0);
    });
  }

  /**
   * Sensitivity, not an assertion about an assertion: the arithmetic above is only worth running if
   * it separates the counts that were shipping from the ones that replaced them. Every value in the
   * left column was live in the catalog this morning.
   */
  it.each([
    ['attack', 20, 8, 10],
    ['courier death', 45, 10, 9],
    ['sentry death', 45, 8, 9],
    ['fall', 18, 8, 9],
  ])('is sensitive enough to have caught %s (%i ticks): %i was red, %i is green', (_n, window, bad, good) => {
    expect(window % bad).not.toBe(0);
    expect(window % good).toBe(0);
  });
});

describe('the packed sheet has the frame count its spec declared', () => {
  /**
   * 🔴 The `fall` drift. `assets:clips` writes the strip and `assets:build` packs it, and only the
   * first reads the spec — so a frame count edited without re-extracting leaves a strip that
   * disagrees with its own declaration, and the packer copies the strip.
   */
  for (const { slug, action, frames } of oneShots) {
    it(`${slug}-${action} ships ${frames} frames`, () => {
      const row = catalog.sheets.find((s) => s.key === `${slug}-${action}`);
      expect(row, `${slug}-${action} is declared but not in the catalog`).toBeDefined();
      expect(
        row!.frameCount,
        `the catalog ships ${row!.frameCount} frames for ${slug}-${action} while VIDEO_MOTIONS ` +
          `declares ${frames}. The extracted strip is stale: re-run ` +
          `\`npm run assets:clips ${slug} ${action}\` and then \`npm run assets:build ${slug} ${action}\`. ` +
          `Packing alone cannot fix this — assets:build never reads the spec.`,
      ).toBe(frames);
    });
  }
});

/** Every divisor of `n` above 1, for the failure message. Small `n`, so trial division is fine. */
function divisorsOf(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1).filter((d) => d > 1 && n % d === 0);
}
