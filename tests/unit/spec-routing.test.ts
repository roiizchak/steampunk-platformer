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
  'phase-12-perf-gpu-delta.spec.ts',
  'phase-12-perf-cpu-delta.spec.ts',
  'phase-12-perf2.spec.ts',
  'phase-12-multitouch-drag.spec.ts',
  'phase-12-a.spec.ts',
  'phase-13-viewfill-touch.spec.ts',
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
    // 🔴 `phase-12-perf-gpu-delta.spec.ts` is named here BY NAME, not merely counted. The obvious
    // name for it — `phase-12-gpu-delta.spec.ts` — matches TOUCH_ALL_SPECS and not the perf prefix,
    // so it would have run headless in `chromium-touch`: a GPU timing spec measuring SwiftShader,
    // with an "exactly one project" assertion passing. Codex plan review, before the file existed.
    for (const name of [
      'phase-12-perf.spec.ts',
      'phase-12-perf-b.spec.ts',
      'phase-12-perf2.spec.ts',
      'phase-12-perf-gpu-delta.spec.ts',
      'phase-12-perf-cpu-delta.spec.ts',
    ]) {
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

  /**
   * 🔴 The view-fill work is split across two FILES, and the touch half must land in the touch
   * project. Its tap-zone case measures zones that are drawn only where Phaser detects touch
   * (criterion 12.7: desktop gains no hit targets) — in `chromium` it would skip itself and report
   * a green tick for a gate that never executed.
   */
  it('claims the touch half of the view-fill work, and not the desktop half', () => {
    expect(projectFor('phase-13-viewfill-touch.spec.ts')).toBe('touch');
    expect(
      TOUCH_ALL_SPECS.test('phase-13-viewfill.spec.ts'),
      'the geometry spec was claimed by the touch project — it belongs on the cheap desktop one',
    ).toBe(false);
  });
});
