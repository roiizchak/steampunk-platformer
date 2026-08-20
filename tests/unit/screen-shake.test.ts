/**
 * Screen shake — the ARBITRATION, not the wobble.
 *
 * Phaser's `camera.shake()` ships with two defaults and both of them are wrong for feel:
 *
 *   - without `force`, a call while a shake is running is a **silent no-op** — a killing blow
 *     landing during a graze's shake produces no shake at all;
 *   - with unconditional `force: true`, it **restarts from zero and never blends** — a graze
 *     landing during a kill's shake truncates the bigger one.
 *
 * Neither failure throws, neither logs, and both look like "the shake is a bit inconsistent" in a
 * playtest. `shouldPreempt` is the rule that avoids both, and the two directions below are what
 * make it a gate rather than a comment — a mutation that inverts the comparison flips exactly one
 * of them, which is the mutation proof this task owes.
 *
 * The force-settle test is the other half. A shake that decays to 1e-17 instead of 0 leaves the
 * camera permanently, invisibly off its target, and every downstream assertion about a rendered
 * position inherits the error. `toBe(0)`, never `toBeCloseTo(0)`.
 */

import { describe, expect, it } from 'vitest';
import {
  SHAKE,
  shakeDurationMs,
  shakeEnergy,
  shakeFor,
  shakePeak,
  shakeSettled,
  shakeStartTick,
  shakeWithinEnvelope,
  shouldPreempt,
  type ShakeState,
} from '../../src/render/screenShake';
import { HITSTOP_TICKS, type ImpactClass } from '../../src/sim/hitstop';
import { ticksToMs } from '../../src/sim';

const IMPACTS: ImpactClass[] = ['light', 'lethal', 'playerHurt'];
const ALL: (ImpactClass | 'land')[] = [...IMPACTS, 'land'];

const running = (impact: ImpactClass | 'land', startedTick = 0): ShakeState => ({
  startedTick,
  cmd: shakeFor(impact),
});

describe('the shake table', () => {
  it('pins every amplitude and duration as a literal', () => {
    expect(SHAKE).toEqual({
      light: { durationTicks: 4, ax: 0.003, ay: 0.001 },
      lethal: { durationTicks: 7, ax: 0.005, ay: 0.004 },
      playerHurt: { durationTicks: 8, ax: 0.004, ay: 0.007 },
      land: { durationTicks: 3, ax: 0.0008, ay: 0.004 },
    });
  });

  it('keeps every amplitude far under Phaser’s 0.05 default', () => {
    // 0.05 of a 1920 x 1080 view is +-96 px horizontally. That is a whole grid cell of camera
    // travel for a spanner hitting a gear, and it is why none of these are the default.
    for (const key of ALL) {
      expect(SHAKE[key].ax).toBeLessThan(0.01);
      expect(SHAKE[key].ay).toBeLessThan(0.01);
    }
  });

  it('shakeFor returns the table entry', () => {
    for (const key of ALL) {
      expect(shakeFor(key)).toBe(SHAKE[key]);
    }
  });
});

describe('shakeStartTick', () => {
  it('starts outgoing damage AFTER the freeze, at the exact tick', () => {
    // Not "later than the hit" — the exact number. An existence assertion cannot verify a timing
    // claim, and a shake that starts one tick early is a shake under a freeze: camera noise over a
    // still image, which cancels itself.
    expect(shakeStartTick('light', 100)).toBe(100 + HITSTOP_TICKS.light);
    expect(shakeStartTick('light', 100)).toBe(104);
    expect(shakeStartTick('lethal', 100)).toBe(100 + HITSTOP_TICKS.lethal);
    expect(shakeStartTick('lethal', 100)).toBe(109);
  });

  it('starts incoming damage and landing ON the hit tick', () => {
    // There the camera is the VICTIM rather than the witness, and the ring is supposed to be
    // simultaneous with the blow.
    expect(shakeStartTick('playerHurt', 100)).toBe(100);
    expect(shakeStartTick('land', 100)).toBe(100);
  });

  it('is a pure offset — the same delta at any hit tick', () => {
    for (const key of ALL) {
      expect(shakeStartTick(key, 7) - 7).toBe(shakeStartTick(key, 9001) - 9001);
    }
  });
});

describe('shakeEnergy force-settles', () => {
  it('is exactly 0 when nothing is running', () => {
    expect(shakeEnergy(null, 0)).toBe(0);
    expect(shakeEnergy(null, 12345)).toBe(0);
  });

  it('is monotone non-increasing across the whole life of every shake', () => {
    for (const key of ALL) {
      const state = running(key, 50);
      let previous = Infinity;
      for (let tick = 50; tick <= 50 + SHAKE[key].durationTicks + 20; tick += 1) {
        const energy = shakeEnergy(state, tick);
        expect(energy).toBeLessThanOrEqual(previous);
        previous = energy;
      }
    }
  });

  it('is the peak on the starting tick and EXACTLY 0 on the end tick, for every duration', () => {
    for (const key of ALL) {
      const n = SHAKE[key].durationTicks;
      const state = running(key, 50);

      // Both sides of every threshold: N-1, N, N+1.
      expect(shakeEnergy(state, 50)).toBe(shakePeak(SHAKE[key]));
      expect(shakeEnergy(state, 50 + n - 1)).toBeGreaterThan(0);
      expect(shakeEnergy(state, 50 + n)).toBe(0);
      expect(shakeEnergy(state, 50 + n + 1)).toBe(0);
    }
  });

  it('is still exactly 0 a hundred ticks after it ended', () => {
    // Not "approximately". A residual 1e-17 is a camera permanently off its target.
    for (const key of ALL) {
      expect(shakeEnergy(running(key, 50), 50 + SHAKE[key].durationTicks + 100)).toBe(0);
    }
  });

  it('holds at the peak before the start tick — a scheduled shake has spent nothing', () => {
    const state = running('lethal', 50);
    expect(shakeEnergy(state, 40)).toBe(shakePeak(SHAKE.lethal));
  });
});

describe('shouldPreempt — both directions', () => {
  it('lets anything start when nothing is running', () => {
    expect(shouldPreemptOf(null, 'light', 0)).toBe(true);
  });

  it('lets a LETHAL command preempt a running LIGHT shake', () => {
    // Phaser default #1: without `force` this is the killing blow that produces no shake at all.
    expect(shouldPreemptOf(running('light', 0), 'lethal', 0)).toBe(true);
    expect(shouldPreemptOf(running('light', 0), 'lethal', 1)).toBe(true);
  });

  it('does NOT let a LIGHT command truncate a running LETHAL shake', () => {
    // Phaser default #2: `force: true` restarts from zero, so this is the graze that cuts the kill
    // short. Asserted at every tick the lethal shake still outweighs the light one.
    for (let tick = 0; tick <= 3; tick += 1) {
      expect(shouldPreemptOf(running('lethal', 0), 'light', tick)).toBe(false);
    }
  });

  it('DOES let a light command preempt a lethal shake that has decayed below it', () => {
    // The rule is about remaining amplitude, not about class rank. A lethal shake three quarters
    // spent has less left than a fresh light hit, and cutting it there is the right call.
    const state = running('lethal', 0);
    const lightPeak = shakePeak(SHAKE.light);
    const firstTickBelow = [0, 1, 2, 3, 4, 5, 6, 7].find(
      (tick) => shakeEnergy(state, tick) < lightPeak,
    );
    expect(firstTickBelow).toBeDefined();
    expect(shouldPreemptOf(state, 'light', firstTickBelow as number)).toBe(true);
    expect(shouldPreemptOf(state, 'light', (firstTickBelow as number) - 1)).toBe(false);
  });

  it('is inclusive at equality — an identical command always restarts its own shake', () => {
    // `>=`, not `>`. A second light hit landing on the same frame as the first must re-arm the
    // shake rather than be swallowed; otherwise a flurry shakes once.
    expect(shouldPreemptOf(running('light', 0), 'light', 0)).toBe(true);
  });

  it('always preempts a settled shake', () => {
    for (const key of ALL) {
      const state = running(key, 0);
      expect(shouldPreemptOf(state, 'land', SHAKE[key].durationTicks)).toBe(true);
    }
  });
});

describe('shakeSettled', () => {
  it('is true for nothing running, and at every duration boundary', () => {
    expect(shakeSettled(null, 0)).toBe(true);
    for (const key of ALL) {
      const n = SHAKE[key].durationTicks;
      const state = running(key, 50);
      expect(shakeSettled(state, 50 + n - 1)).toBe(false);
      expect(shakeSettled(state, 50 + n)).toBe(true);
      expect(shakeSettled(state, 50 + n + 1)).toBe(true);
    }
  });
});

describe('shakeWithinEnvelope', () => {
  const W = 1920;
  const H = 1080;

  it('demands EXACTLY zero offset when nothing is running', () => {
    expect(shakeWithinEnvelope(null, 0, 0, 0, W, H)).toBe(true);
    expect(shakeWithinEnvelope(null, 0, 0.5, 0, W, H)).toBe(false);
    expect(shakeWithinEnvelope(null, 0, 0, -0.5, W, H)).toBe(false);
  });

  it('demands exactly zero again once the shake has settled', () => {
    const state = running('lethal', 0);
    expect(shakeWithinEnvelope(state, 7, 0, 0, W, H)).toBe(true);
    expect(shakeWithinEnvelope(state, 7, 1, 0, W, H)).toBe(false);
  });

  it('accepts any offset inside the peak box while the shake runs', () => {
    const state = running('lethal', 0);
    const maxX = SHAKE.lethal.ax * W;
    const maxY = SHAKE.lethal.ay * H;
    expect(shakeWithinEnvelope(state, 3, 0, 0, W, H)).toBe(true);
    expect(shakeWithinEnvelope(state, 3, maxX, maxY, W, H)).toBe(true);
    expect(shakeWithinEnvelope(state, 3, -maxX, -maxY, W, H)).toBe(true);
  });

  it('rejects an offset outside the peak box on either axis independently', () => {
    const state = running('lethal', 0);
    const maxX = SHAKE.lethal.ax * W;
    const maxY = SHAKE.lethal.ay * H;
    expect(shakeWithinEnvelope(state, 3, maxX + 0.001, 0, W, H)).toBe(false);
    expect(shakeWithinEnvelope(state, 3, 0, maxY + 0.001, W, H)).toBe(false);
  });
});

describe('shakeDurationMs', () => {
  it('is the sim’s ticksToMs and not a second copy of it', () => {
    for (const key of ALL) {
      expect(shakeDurationMs(SHAKE[key])).toBe(ticksToMs(SHAKE[key].durationTicks));
    }
    // Pinned once as a literal too, so a change to the tick rate is visible here.
    expect(shakeDurationMs(SHAKE.lethal)).toBe(117);
  });
});

/** Small readability wrapper — `shouldPreempt` takes a command, and every case here names a class. */
function shouldPreemptOf(
  state: ShakeState | null,
  next: ImpactClass | 'land',
  tick: number,
): boolean {
  return shouldPreempt(state, shakeFor(next), tick);
}
