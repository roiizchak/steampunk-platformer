/**
 * 🔴 `shakeOffset` — the JITTER ITSELF, pinned against absolute literals.
 *
 * `screen-shake.test.ts` had **no coverage of `shakeOffset` at all**, and its only assertion
 * anywhere in the repo was `tests/e2e/phase-09-polish.spec.ts`:
 *
 * ```ts
 * const w = shakeOffset(SHAKE.land, s.tick, view.w, view.h);
 * expect([s.ox, s.oy]).toEqual([w.x, w.y]);
 * ```
 *
 * `gameEffects.applyShake` writes the camera from **the same function with the same command**, so
 * both sides of that equality move together and it is structurally incapable of failing for any
 * change inside `screenShake.ts`. It closes *the scene diverged from `shakeOffset`* — a real
 * failure, and not this one. Three separate mutations were run against the shipped tree and all
 * three left 2073/2073 green:
 *
 *  1. `0.01 * cmd.ax` / `0.01 * cmd.ay` — the exact 100× regression the QA log recorded as CLOSED;
 *  2. `JITTER_Y_FREQ = JITTER_X_FREQ` — which defeats the two-incommensurate-frequencies argument
 *     in `screenShake.ts`'s own header and makes the two axes trace one curve;
 *  3. `Math.sin` → `Math.cos` on x — a different value at every tick.
 *
 * None of them is a magnitude question, which is why moving a bound could not have fixed any of it.
 * The function is **pure and deterministic in `(cmd, tick, viewportW, viewportH)`**, so the honest
 * gate is the boring one: name the ticks, write the numbers down, and let any change to the SHAPE
 * red. `screen-shake.test.ts`'s `shakeEnergy` block does exactly this and is why that function was
 * not on the list above.
 *
 * Its own file rather than more of `screen-shake.test.ts`, which reached 402 lines when this was
 * appended to it. This project splits rather than exempts, and the seam is real: everything there is
 * about the ARBITRATION, everything here is about the wobble.
 */

import { describe, expect, it } from 'vitest';
import { SHAKE, shakeOffset } from '../../src/render/screenShake';
import type { ImpactClass } from '../../src/sim/hitstop';

const ALL: (ImpactClass | 'land')[] = ['light', 'lethal', 'playerHurt', 'land'];

describe('shakeOffset — absolute values at named ticks', () => {
  const W = 1920;
  const H = 1080;
  // 12 significant digits: tight enough that none of the three mutations above survives, loose
  // enough not to false-red on a last-ulp difference between platforms.
  const PRECISION = 12;

  const EXPECTED: Record<'land' | 'lethal', [tick: number, x: number, y: number][]> = {
    land: [
      [0, 0, 4.32],
      [1, 0.6311260926774629, 2.5135220644224923],
      [2, 1.1507766435532794, -1.3950957553987466],
      [3, 1.4671659898597238, -4.136949825152544],
    ],
    lethal: [
      [0, 0, 4.32],
      [1, 3.944538079234143, 2.5135220644224923],
      [2, 7.192354022207995, -1.3950957553987466],
      [3, 9.169787436623274, -4.136949825152544],
    ],
  };

  for (const key of ['land', 'lethal'] as const) {
    it(`${key} is exactly these numbers at ticks 0-3`, () => {
      for (const [tick, x, y] of EXPECTED[key]) {
        const got = shakeOffset(SHAKE[key], tick, W, H);
        expect(got.x, `${key} x at t=${tick}`).toBeCloseTo(x, PRECISION);
        expect(got.y, `${key} y at t=${tick}`).toBeCloseTo(y, PRECISION);
      }
    });
  }

  it('is not a CONSTANT offset — the x term must vary tick to tick', () => {
    // The `Math.sin(tick * JITTER_X_FREQ)` → `Math.sin(1)` mutation: still non-zero, still inside
    // the peak box, still equal to whatever the scene wrote — and the camera is displaced by a
    // fixed amount for the whole window instead of shaking. Exactly the constant camera error
    // `EffectAttachment.base()` was published to expose, and nothing else could see it.
    const xs = [0, 1, 2, 3, 4].map((t) => shakeOffset(SHAKE.lethal, t, W, H).x);
    expect(new Set(xs).size, `x was ${xs[0]} on every tick`).toBe(xs.length);
  });

  it('the two axes are driven by DIFFERENT frequencies, so the jitter is not one curve', () => {
    // With a SHARED frequency k, `x / (ax·W)` is sin(kt) and `y / (ay·H)` is cos(kt), so the
    // normalised pair lies exactly on the unit circle on EVERY tick. With two incommensurate
    // frequencies it does not. That is the property `screenShake.ts:171-177` actually claims, and
    // `JITTER_Y_FREQ = JITTER_X_FREQ` is the mutation it names.
    //
    // 🔴 Tick 0 is EXCLUDED and the exclusion is load-bearing: sin(0)² + cos(0)² is 1 whatever the
    // frequencies are, so including it makes this assertion fail against the correct code. It was
    // written with tick 0 in, watched fail, and narrowed — not the other way round.
    const ticks = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const onUnitCircle = ticks.filter((t) => {
      const { x, y } = shakeOffset(SHAKE.lethal, t, W, H);
      const nx = x / (SHAKE.lethal.ax * W);
      const ny = y / (SHAKE.lethal.ay * H);
      return Math.abs(nx * nx + ny * ny - 1) < 1e-9;
    });
    expect(onUnitCircle, 'x and y trace one curve — the two axes share a frequency').toEqual([]);
  });

  it('scales linearly with the amplitude, so a 100× regression cannot hide', () => {
    // `lethal.ax` is 0.005 and `land.ax` is 0.0008 — a ratio of 6.25 at every tick. The mutation
    // this names is `0.01 * cmd.ax` inside `shakeOffset`, which drives the ratio to 1.
    for (const tick of [1, 2, 3]) {
      const a = shakeOffset(SHAKE.lethal, tick, W, H).x;
      const b = shakeOffset(SHAKE.land, tick, W, H).x;
      expect(a / b, `amplitude ratio at t=${tick}`).toBeCloseTo(0.005 / 0.0008, 9);
    }
  });

  it('scales with the VIEWPORT too — the offset is a fraction of the view, not pixels', () => {
    for (const tick of [1, 2, 3]) {
      const wide = shakeOffset(SHAKE.lethal, tick, W * 2, H);
      const base = shakeOffset(SHAKE.lethal, tick, W, H);
      expect(wide.x / base.x, `viewport ratio at t=${tick}`).toBeCloseTo(2, 9);
      expect(wide.y, `y must not depend on the WIDTH at t=${tick}`).toBeCloseTo(base.y, 12);
    }
  });

  it('is bounded by the peak box by construction, which is what regime 2 rests on', () => {
    // `shakeWithinEnvelope`'s running regime bounds the drawn offset by `ax·W` / `ay·H`. That is
    // only a legal bound if `shakeOffset` cannot leave the box — an unbounded jitter would make the
    // predicate red on correct code, which is how a gate gets weakened rather than obeyed.
    for (const key of ALL) {
      for (let tick = 0; tick < 40; tick++) {
        const { x, y } = shakeOffset(SHAKE[key], tick, W, H);
        expect(Math.abs(x)).toBeLessThanOrEqual(SHAKE[key].ax * W);
        expect(Math.abs(y)).toBeLessThanOrEqual(SHAKE[key].ay * H);
      }
    }
  });
});
