/**
 * **G5 — does the contact frame land inside the active window?** Criterion 5.4c.
 *
 * See `tools/gen/reachGate.mjs`'s header for why this is not a wrapper around `gateReachBand`: no
 * per-frame profile, no component isolation, no left-facing handling and no tick alignment there.
 *
 * Fixtures are built in code with `blank`/`fill` (vault 4.21, the same pattern `drift-gate.test.ts`
 * and `gates.mjs`'s own `selfTest()` use): a chroma-green field, a torso block that never moves
 * (identical in every frame, so it contributes zero diff), and an "arm" block whose position per
 * frame is chosen by hand so every expected reach and tick number here is CHOSEN, not measured off
 * real art.
 *
 * `W=140, TORSO=[40,40,30,80]` (grey, unmoving), `ARM=20x20` at `y=60`, moved per frame. `N=10`
 * frames, `simTicks=20` — `ATTACK`'s own total (`attackTotalTicks`) — so `peakTick = round(frame*2) +
 * PLAY_LAG_TICKS`.
 */

import { describe, expect, it } from 'vitest';

import { ATTACK, PLAY_LAG_TICKS as SIM_PLAY_LAG_TICKS, attackTotalTicks } from '../../src/sim/combat';
import { fill } from '../../tools/gen/gates.mjs';
import { PLAY_LAG_TICKS, gateReachWindow } from '../../tools/gen/reachGate.mjs';
import { blank } from '../../tools/gen/png.mjs';
import type { RgbaImage } from '../../tools/gen/png.d.mts';

const W = 140;
const H = 160;
const TORSO: [number, number, number, number] = [40, 40, 30, 80];
const ARM_Y = 60;
const ARM_SIZE = 20; // 400px — clears CHROMA.MIN_COMPONENT_PX (256)

/** A frame: chroma-green field, a fixed torso, and (if `armX` is given) a 20x20 arm block. */
function frame(armX?: number): RgbaImage {
  const image = blank(W, H, [0, 255, 0, 255]);
  fill(image, ...TORSO, [90, 90, 90, 255]);
  if (armX !== undefined) {
    fill(image, armX, ARM_Y, ARM_SIZE, ARM_SIZE, [200, 180, 60, 255]);
  }
  return image;
}

const SIM_TICKS = attackTotalTicks(ATTACK); // 20
const REAL_WINDOW = { simTicks: SIM_TICKS, startup: ATTACK.startup, active: ATTACK.active };

/** rightward arm positions (left edge), frames 1..9 — peak reach (maxX) is uniquely frame 3. */
const RIGHT_ARM_X = [undefined, 10, 20, 40, 15, 5, 12, 8, 18, 22];
/** leftward mirror: minimal armX (max leftward reach) is uniquely frame 3, same shape idea. */
const LEFT_ARM_X = [undefined, 40, 25, 5, 30, 45, 20, 35, 15, 28];

describe('G5 pins PLAY_LAG_TICKS against the real sim constant', () => {
  it('mirrors src/sim/combat.ts — tools/gen/*.mjs cannot import TypeScript, so this is the tie', () => {
    expect(PLAY_LAG_TICKS).toBe(SIM_PLAY_LAG_TICKS);
  });
});

describe('G5 sees a flat profile as INDETERMINATE, never a guess', () => {
  it('no arm ever drawn -> INDETERMINATE', () => {
    const frames = [frame(), frame(), frame(), frame(), frame()];
    const result = gateReachWindow(frames, REAL_WINDOW);
    expect(result.verdict).toBe('INDETERMINATE');
    expect(result.peakFrame).toBeNull();
  });
});

describe('G5 measures a peak that lands inside the active window', () => {
  it('a peak at frame 3 (tick 7) PASSes against ATTACK\'s real window [6,10)', () => {
    const frames = RIGHT_ARM_X.map(frame);
    const result = gateReachWindow(frames, REAL_WINDOW);
    expect(result.peakFrame).toBe(3);
    expect(result.peakTick).toBe(7);
    expect(result.verdict).toBe('PASS');
  });
});

describe('G5 fails the exact shape criterion 5.4c is bought for', () => {
  it('a peak at the LAST frame FAILs', () => {
    // N=6: frames 1..5, reach grows monotonically to the last frame.
    const armX = [undefined, 5, 15, 30, 45, 60];
    const frames = armX.map(frame);
    const result = gateReachWindow(frames, REAL_WINDOW);
    expect(result.peakFrame).toBe(5);
    expect(result.peakTick).toBe(Math.round((5 * SIM_TICKS) / 6) + PLAY_LAG_TICKS);
    expect(result.verdict).toBe('FAIL');
  });

  it('a peak at 90% of the animation FAILs — the real brass-courier/attack shape', () => {
    // N=10, peak at index 8 (90% through a 0-indexed 10-frame clip), reach recedes after.
    const armX = [undefined, 5, 10, 15, 20, 25, 30, 35, 90, 40];
    const frames = armX.map(frame);
    const result = gateReachWindow(frames, REAL_WINDOW);
    expect(result.peakFrame).toBe(8);
    expect(result.peakTick).toBe(Math.round((8 * SIM_TICKS) / 10) + PLAY_LAG_TICKS);
    expect(result.verdict).toBe('FAIL');
  });
});

describe('G5 resolves a multi-frame plateau to the FIRST frame reaching it', () => {
  it('frames 3, 4 and 5 tie for the peak -> peakFrame is 3, the moment contact begins', () => {
    const armX = [undefined, 10, 20, 40, 40, 40, 12, 8, 18, 22];
    const frames = armX.map(frame);
    const result = gateReachWindow(frames, REAL_WINDOW);
    expect(result.peakFrame).toBe(3);
  });
});

describe('G5 exercises the tick mapping, not just the frame data', () => {
  it('the SAME peak frame (and tick) PASSes under one window and FAILs under another', () => {
    const frames = RIGHT_ARM_X.map(frame);
    const wide = gateReachWindow(frames, { simTicks: SIM_TICKS, startup: 6, active: 4 });
    const narrow = gateReachWindow(frames, { simTicks: SIM_TICKS, startup: 1, active: 2 });

    expect(wide.peakFrame).toBe(narrow.peakFrame);
    expect(wide.peakTick).toBe(narrow.peakTick);
    expect(wide.verdict).toBe('PASS');
    expect(narrow.verdict).toBe('FAIL');
  });
});

describe('G5 takes facing as an input and measures in the correct direction', () => {
  it('a left-facing peak PASSes; reading the SAME frames as right-facing FAILs', () => {
    const frames = LEFT_ARM_X.map(frame);
    const left = gateReachWindow(frames, { ...REAL_WINDOW, facing: 'left' });
    const right = gateReachWindow(frames, { ...REAL_WINDOW, facing: 'right' });

    expect(left.peakFrame).toBe(3);
    expect(left.verdict).toBe('PASS');
    // Same bytes, facing ignored/wrong: a different frame wins the "peak" and lands outside the
    // window — proof that facing is load-bearing, not decoration.
    expect(right.peakFrame).not.toBe(3);
    expect(right.verdict).toBe('FAIL');
  });
});

describe('G5 attributes reach to the limb, not the largest changed pixel anywhere', () => {
  it('a bigger, less-forward arm wins over a smaller, more-forward "cape" blob', () => {
    const base = frame();
    const attack = blank(W, H, [0, 255, 0, 255]);
    fill(attack, ...TORSO, [90, 90, 90, 255]);
    fill(attack, 30, ARM_Y, 20, 20, [200, 180, 60, 255]); // arm: 400px, maxX 49
    fill(attack, 90, ARM_Y, 17, 17, [180, 60, 200, 255]); // cape: 289px, maxX 106 — further forward,
    // but smaller — must NOT win.
    const result = gateReachWindow([base, attack], REAL_WINDOW);
    expect(result.profile[1].componentPx).toBe(400);
    expect(result.profile[1].edgeX).toBe(49);
    expect(result.profile[1].reach).toBe(49);
  });
});

describe('G5 needs at least two frames', () => {
  it('a single frame is INDETERMINATE, not FAIL', () => {
    const result = gateReachWindow([frame()], REAL_WINDOW);
    expect(result.verdict).toBe('INDETERMINATE');
  });
});
