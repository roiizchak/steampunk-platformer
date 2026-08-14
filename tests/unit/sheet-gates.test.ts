/**
 * **G4/G5 CLI runner.** `tools/gen/sheetGates.mjs` is the piece a handoff once told a session to
 * "run G4" as though it existed — it did not, and neither gate had a CLI or an `import.meta.url`
 * main guard before this. This suite drives the exported callable CORE directly (never spawns the
 * CLI as a subprocess — a vitest spawned from a Node parent loses its runner context and every
 * suite dies at import, vault: non-zero exit is not evidence).
 *
 * Fixtures are built in code with `blank`/`fill`, the same synthetic-fixture convention
 * `drift-gate.test.ts` and `reach-gate.test.ts` already use (vault 4.21) — a chroma-green field and
 * an opaque grey block whose bottom row IS the baseline, so every FAIL/PASS here is chosen, not
 * measured off real art.
 */

import { describe, expect, it } from 'vitest';

import { ATTACK, attackTotalTicks } from '../../src/sim/combat';
import { fill } from '../../tools/gen/gates.mjs';
import { blank, decodePng, readBytes } from '../../tools/gen/png.mjs';
import { sliceFrame } from '../../tools/gen/assetSources.mjs';
import { PLAY_LAG_TICKS, gateReachWindow } from '../../tools/gen/reachGate.mjs';
import catalog from '../../public/assets/index.json';
import liftProfile from '../../public/assets/config/lift-profile.json';
import type { RgbaImage } from '../../tools/gen/png.d.mts';
import {
  ATTACK_ACTIVE_TICKS,
  ATTACK_STARTUP_TICKS,
  attackWindowFor,
  driftAllowanceFor,
  runGates,
  runSheetGates,
} from '../../tools/gen/sheetGates.mjs';

const W = 40;
const H = 100;
const TOP = 20;

/** A synthetic G4 frame: chroma-green field, grey subject whose lowest row is `baseline`. */
function frame(baseline: number): RgbaImage {
  const image = blank(W, H, [0, 255, 0, 255]);
  fill(image, 0, TOP, W, baseline - TOP + 1, [90, 90, 90, 255]);
  return image;
}

describe('sheetGates mirrors ATTACK against the real sim constant', () => {
  it('pins startup and active — tools/gen/*.mjs cannot import TypeScript, so this is the tie', () => {
    expect(ATTACK_STARTUP_TICKS).toBe(ATTACK.startup);
    expect(ATTACK_ACTIVE_TICKS).toBe(ATTACK.active);
  });
});

describe('attackWindowFor is data-driven, never a hardcoded action list', () => {
  it('brass-courier/attack has a declared window matching combat.ts', () => {
    const window = attackWindowFor('brass-courier', 'attack');
    expect(window).not.toBeNull();
    expect(window!.startup).toBe(ATTACK.startup);
    expect(window!.active).toBe(ATTACK.active);
    expect(window!.simTicks).toBe(attackTotalTicks(ATTACK));
  });

  it('an action with no strike window reports null, not a guessed window', () => {
    expect(attackWindowFor('brass-sentry', 'idle')).toBeNull();
  });
});

describe('driftAllowanceFor reads the pipeline\'s own recorded numbers, never invents one', () => {
  it('a grounded (feet-anchored) action gets zero allowance', () => {
    expect(driftAllowanceFor('brass-courier', 'idle')).toBe(0);
  });

  it('a centroid-anchored (airborne) action gets the recorded liftPx spread as its allowance', () => {
    // Read off `public/assets/config/lift-profile.json`'s jump frames, and RE-PINNED 54 -> 18 on
    // 2026-08-14 when every courier sheet repacked at the widened 336px cell. The allowance is the
    // recorded liftPx spread and nothing else, so re-pinning it after a deliberate repack is the
    // gate working; inventing a number here, or widening it to cover both, is what it exists to
    // prevent. Derived from the file rather than retyped, so the next repack cannot leave a stale
    // literal behind.
    const jumpLifts = liftProfile.animations.jump.frames.map((f) => f.liftPx);
    const spread = Math.max(...jumpLifts) - Math.min(...jumpLifts);
    expect(driftAllowanceFor('brass-courier', 'jump')).toBe(spread);
    // Non-vacuity: an allowance of 0 would make this indistinguishable from the grounded case
    // above, and would silently disable G4's drift check for every airborne action.
    expect(spread).toBeGreaterThan(0);
  });
});

describe("runGates — the CLI's callable core — over a committed FAILING fixture and a clean one", () => {
  it('a 40px baseline climb FAILs G4 with no allowance (the shape a foot-slide defect makes)', () => {
    const frames = [50, 58, 66, 74, 82, 90].map(frame);
    const { g4, g5 } = runGates(frames, { g4Opts: {}, g5Opts: null });
    expect(g4.verdict).toBe('FAIL');
    expect(g5).toBeNull();
  });

  it('a 1px wobble PASSes G4 clean', () => {
    const frames = [70, 70, 71, 70, 70, 71].map(frame);
    const { g4 } = runGates(frames, { g4Opts: {}, g5Opts: null });
    expect(g4.verdict).toBe('PASS');
  });

  it('G5 FAILs a peak drawn at the last frame, and PASSes one landing in the window', () => {
    const armY = 60;
    const torso: [number, number, number, number] = [10, 40, 10, 30];
    const attackFrame = (armX?: number): RgbaImage => {
      const image = blank(80, 100, [0, 255, 0, 255]);
      fill(image, ...torso, [90, 90, 90, 255]);
      if (armX !== undefined) fill(image, armX, armY, 20, 20, [200, 180, 60, 255]);
      return image;
    };
    const window = attackWindowFor('brass-courier', 'attack')!;
    // N=10 frames (matches reach-gate.test.ts's shape), so peakTick = round(frame*20/10) + 1.

    // Monotonic reach, peak at the LAST frame -> misses the active window -> FAIL.
    const failing = [undefined, 5, 10, 15, 20, 25, 30, 35, 40, 60].map(attackFrame);
    const failResult = runGates(failing, { g4Opts: {}, g5Opts: window });
    expect(failResult.g5!.verdict).toBe('FAIL');

    // Peak at frame 3 -> tick 7, inside ATTACK's real [6, 10) window -> PASS.
    const passing = [undefined, 10, 20, 40, 15, 5, 12, 8, 18, 22].map(attackFrame);
    const passResult = runGates(passing, { g4Opts: {}, g5Opts: window });
    expect(passResult.g5!.peakFrame).toBe(3);
    expect(passResult.g5!.verdict).toBe('PASS');
  });
});

describe('runSheetGates — real run against a packed sheet already in the catalog', () => {
  it('brass-sentry/idle runs G4 and reports G5 as explicitly not-applicable, never a guessed verdict', () => {
    const { lines, exitCode, g4, g5 } = runSheetGates('brass-sentry', 'idle');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^(PASS|FAIL|INDETERMINATE)\tbrass-sentry\/idle\tG4/);
    expect(lines[1]).toMatch(/^N\/A\tbrass-sentry\/idle\tG5/);
    expect(g5).toBeNull();
    expect(g4.verdict === 'PASS' || g4.verdict === 'FAIL' || g4.verdict === 'INDETERMINATE').toBe(true);
    expect(exitCode).toBe(g4.verdict === 'FAIL' ? 1 : 0);
  });

  it('an unknown slug throws rather than substituting a placeholder verdict (vault 4.16)', () => {
    expect(() => runSheetGates('not-a-real-slug', 'idle')).toThrow();
  });
});

/**
 * 🔴 **G5 against the SHIPPED sheet — the hole that let a stale measurement read as PASS.**
 *
 * G5 had exactly one real-sheet caller above, `brass-sentry/idle`, and that action has no attack
 * window, so it reports `N/A`. **`brass-courier/attack` is the only pair in `ATTACK_WINDOWS`, and
 * nobody ever wrote the line that runs it.** The gate therefore existed, was unit-tested against
 * synthetic fixtures, was runnable from the CLI — and never once ran against the bytes that ship.
 * Session 10's criterion 5.4e was recorded from a hand-run of the CLI, which is a measurement, not
 * a gate: it cannot go stale loudly. This closes that.
 *
 * ## Why the verdict alone is not enough to assert
 *
 * `peakTick` is **9** against a window that closes at **10**. One tick of margin. A verdict-only
 * assertion sees `PASS` whether the margin is 1 tick or 4, so an art re-shoot that walked the peak
 * one frame later would flip this from PASS to FAIL with no prior warning. Pinning `peakFrame` and
 * `peakTick` makes the erosion visible while it is still green.
 *
 * ## The plateau is load-bearing, and that is not obvious
 *
 * The shipped reach profile ties at its maximum across **three** frames — 4, 5 and 6 all measure
 * 293 px. `gateReachWindow` documents that the FIRST of a tie wins ("the moment contact begins, not
 * the moment it ends"), which is why `peakFrame` is 4. That rule is not a formality here:
 *
 * | tie-break | peakFrame | peakTick | inside [6, 10)? |
 * |---|---|---|---|
 * | **first (shipped)** | 4 | **9** | ✅ |
 * | second | 5 | 11 | ❌ |
 * | last | 6 | 13 | ❌ |
 *
 * **This sheet passes G5 only because of the tie-break.** Flip it and the shipped art fails. So the
 * rule is pinned below against the real profile rather than left to a synthetic fixture that could
 * agree with it by accident.
 */
describe('G5 runs against the shipped brass-courier/attack, not only synthetic fixtures', () => {
  it('reports a REAL G5 verdict, never the N/A that every other shipped sheet gets', () => {
    const { lines, exitCode, g4, g5 } = runSheetGates('brass-courier', 'attack');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^PASS\tbrass-courier\/attack\tG4/);
    // The specific hole: this must NOT be the `N/A` line brass-sentry/idle produces.
    expect(lines[1]).toMatch(/^PASS\tbrass-courier\/attack\tG5/);
    expect(lines[1]).not.toMatch(/N\/A/);

    expect(g5, 'g5 is null — the window lookup stopped resolving').not.toBeNull();
    expect(g4.verdict).toBe('PASS');
    expect(g5!.verdict).toBe('PASS');
    expect(exitCode).toBe(0);
  });

  it('the strike lands on frame 4 / tick 9, with exactly ONE tick of margin left in the window', () => {
    const { g5 } = runSheetGates('brass-courier', 'attack');

    expect(g5!.peakFrame).toBe(4);
    expect(g5!.peakTick).toBe(9);
    expect(g5!.window.openTick).toBe(ATTACK.startup);
    expect(g5!.window.closeTick).toBe(ATTACK.startup + ATTACK.active);

    // The margin, asserted as a quantity rather than left implicit in a PASS. Derived from the
    // window so re-balancing ATTACK re-states it here instead of silently widening the headroom.
    expect(
      g5!.window.closeTick - g5!.peakTick!,
      'the strike has drifted within its window — still PASS, but the margin is changing and that ' +
        'is the warning a verdict-only assertion cannot give',
    ).toBe(1);
  });

  it('passes only because the plateau tie-break takes the FIRST tied frame', () => {
    const { g5 } = runSheetGates('brass-courier', 'attack');

    const peakReach = Math.max(...g5!.profile.filter((p) => p.reach !== null).map((p) => p.reach!));
    const tied = g5!.profile.filter((p) => p.reach === peakReach).map((p) => p.frame);

    // Non-vacuity: if the profile stopped tying, the rest of this test would prove nothing.
    expect(tied.length, 'the shipped profile no longer plateaus — this test is now vacuous').toBe(3);
    expect(tied).toEqual([4, 5, 6]);
    expect(g5!.peakFrame).toBe(tied[0]);

    // ...and the other two tied frames would both MISS the window, which is what makes the
    // documented "first wins" rule load-bearing for the shipped art rather than a formality.
    const tickFor = (frame: number): number =>
      Math.round((frame * attackTotalTicks(ATTACK)) / g5!.profile.length) + PLAY_LAG_TICKS;
    for (const frame of tied.slice(1)) {
      const tick = tickFor(frame);
      expect(tick >= ATTACK.startup && tick < ATTACK.startup + ATTACK.active).toBe(false);
    }
  });

  /**
   * `facing` is never supplied by `sheetGates.mjs`, so `gateReachWindow` falls back to `'right'`
   * (`tools/gen/reachGate.mjs:124`). That default is CORRECT for this sheet rather than merely
   * untested — the courier's source clip strikes to the right — and this pins it so the default
   * stays a deliberate choice. Measuring the same sheet as `'left'` must not reproduce the same
   * answer, or `facing` would be doing nothing and the gate would be direction-blind.
   */
  it("the unsupplied `facing` default of 'right' is deliberate, and the sheet is not direction-blind", () => {
    const { g5 } = runSheetGates('brass-courier', 'attack');
    const entry = (catalog.sheets as { key: string; url: string; frameWidth: number; frameHeight: number; frameCount: number }[])
      .find((s) => s.key === 'brass-courier-attack')!;
    const decoded = decodePng(readBytes(`public/${entry.url}`));
    const frames = Array.from({ length: entry.frameCount }, (_, i) =>
      sliceFrame(decoded, i, entry.frameWidth, entry.frameHeight),
    );

    const mirrored = gateReachWindow(frames, {
      ...attackWindowFor('brass-courier', 'attack')!,
      facing: 'left',
    });

    expect(
      mirrored.peakFrame,
      'measuring left-facing reach gives the same peak as right-facing — `facing` is inert, so ' +
        'G5 cannot tell a strike from a recoil and the unsupplied default is not load-bearing',
    ).not.toBe(g5!.peakFrame);
  });
});
