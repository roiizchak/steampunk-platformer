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
import { blank } from '../../tools/gen/png.mjs';
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
    // public/assets/config/lift-profile.json's jump frames: liftPx 27,54,41,7,35,0 -> spread 54.
    expect(driftAllowanceFor('brass-courier', 'jump')).toBe(54);
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
