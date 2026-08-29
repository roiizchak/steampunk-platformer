import { describe, expect, it } from 'vitest';

import { TOUCH_ALL_SPECS, TOUCH_PERF_SPECS } from '../e2e/specRouting';

/**
 * **The partition, against filenames that do not exist yet.**
 *
 * 🔴 `playwright.config.ts` warns twice that *"a file that matches neither runs nowhere and reports
 * `0 passed`"* — a false green that looks exactly like a clean pass. The Phase 12 routing recreated
 * that hole on its first draft (`(?!perf)` plus an exact perf filename leaves
 * `phase-12-perf-b.spec.ts` in neither project) and the Codex plan review caught it before any file
 * existed to notice.
 *
 * The repair is that behaviour is *everything minus perf*, so the two sets cannot both miss. This
 * file is what keeps that true when someone adds a spec — the future names below are the point of
 * it, not padding.
 */

const FUTURE_NAMES = [
  'phase-12-touch.spec.ts',
  'phase-12-journey.spec.ts',
  'phase-12-viewport.spec.ts',
  'phase-12-perf.spec.ts',
  'phase-12-perf-b.spec.ts',
  'phase-12-perf2.spec.ts',
  'phase-12-multitouch-drag.spec.ts',
  'phase-12-a.spec.ts',
];

/** Which project a file lands in, by the same two rules the config applies. */
function projectFor(name: string): 'touch' | 'touch-gpu' | 'other' {
  if (!TOUCH_ALL_SPECS.test(name)) return 'other';
  return TOUCH_PERF_SPECS.test(name) ? 'touch-gpu' : 'touch';
}

describe('the Phase 12 Playwright partition', () => {
  it('puts every Phase 12 spec, present and future, in exactly one project', () => {
    for (const name of FUTURE_NAMES) {
      expect(projectFor(name), `${name} runs nowhere or twice`).not.toBe('other');
    }
  });

  it('routes every perf-prefixed name to the GPU project, not only the exact one', () => {
    // The named regression: an exact `phase-12-perf.spec.ts` pattern would send `-b` to the
    // headless project, where a millisecond figure is a measurement of SwiftShader.
    for (const name of ['phase-12-perf.spec.ts', 'phase-12-perf-b.spec.ts', 'phase-12-perf2.spec.ts']) {
      expect(projectFor(name), name).toBe('touch-gpu');
    }
  });

  it('routes behaviour specs to the headless touch project', () => {
    for (const name of ['phase-12-touch.spec.ts', 'phase-12-journey.spec.ts', 'phase-12-a.spec.ts']) {
      expect(projectFor(name), name).toBe('touch');
    }
  });

  it('claims nothing that is not a Phase 12 spec', () => {
    // The base `chromium` project ignores TOUCH_ALL_SPECS. Too wide a pattern there would silently
    // stop running somebody else's suite.
    for (const name of [
      'phase-09-polish.spec.ts',
      'phase-10-production.spec.ts',
      'phase-1-touch.spec.ts',
      'phase-120-touch.spec.ts',
      'specRouting.ts',
    ]) {
      expect(TOUCH_ALL_SPECS.test(name), `${name} was claimed by the touch projects`).toBe(false);
    }
  });

  it('is a real partition: perf is a strict subset of all', () => {
    for (const name of FUTURE_NAMES) {
      if (TOUCH_PERF_SPECS.test(name)) {
        expect(TOUCH_ALL_SPECS.test(name), `${name} is perf but not "all"`).toBe(true);
      }
    }
  });
});
