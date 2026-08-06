/**
 * The real-time -> tick conversion.
 *
 * This file exists because **adversarial review brief 2** found that the backlog-drop branch had no
 * test and could not have one: it lived inside a `Phaser.Scene.update()`, where a unit test cannot
 * reach it and an e2e spec cannot reliably provoke it. Vault 2.12's rule is exactly this — *"if a
 * scene rule has an edge case, that's the move, not a browser test"* — so the arithmetic moved to
 * `src/game/frameClock.ts` and the edge cases are asserted here in milliseconds instead of by
 * trying to stall a browser.
 *
 * The drop branch is a REPRODUCTION (it had zero coverage); the rest are GUARDS *(vault C3)*.
 */

import { describe, expect, it } from 'vitest';
import { MAX_TICKS_PER_FRAME, MS_PER_TICK } from '../../src/game/constants';
import { drainTicks } from '../../src/game/frameClock';

describe('drainTicks', () => {
  it('produces whole ticks and carries the remainder', () => {
    const result = drainTicks(0, MS_PER_TICK * 2.5);
    expect(typeof result.ticks).toBe('number');
    expect(result.ticks).toBe(2);
    expect(result.remainderMs).toBeCloseTo(MS_PER_TICK * 0.5, 10);
    expect(result.dropped).toBe(0);
  });

  it('runs no tick when the frame is shorter than one', () => {
    const result = drainTicks(0, MS_PER_TICK * 0.4);
    expect(result.ticks).toBe(0);
    expect(result.remainderMs).toBeCloseTo(MS_PER_TICK * 0.4, 10);
  });

  /** Simulate `seconds` of steady `hz` frames and return how many ticks were drained. */
  function ticksOver(hz: number, seconds: number): number {
    let acc = 0;
    let total = 0;
    for (let i = 0; i < hz * seconds; i += 1) {
      const drain = drainTicks(acc, 1000 / hz);
      acc = drain.remainderMs;
      total += drain.ticks;
      expect(drain.dropped).toBe(0);
    }
    return total;
  }

  it('does not DRIFT: the error stays bounded over a minute at every refresh rate', () => {
    // The failure this rules out is discarding the remainder each frame, which makes a 144 Hz
    // monitor run the game measurably slower than a 60 Hz one — "it feels different on my laptop".
    //
    // MEASURED over 60 seconds: 30/60/240 Hz land exactly on 3600 ticks; 75 and 144 Hz land on
    // 3599. That single tick is a floating-point boundary artifact, not accumulation — it is still
    // exactly one after a minute, where real drift would grow with time. The assertion is
    // therefore a window, and the window is what catches drift: a leak of even 0.1 ms per frame
    // would be ~9 ticks off after a minute and fail this.
    for (const hz of [30, 60, 75, 144, 240]) {
      const total = ticksOver(hz, 60);
      expect(total, `${hz}Hz`).toBeGreaterThanOrEqual(3599);
      expect(total, `${hz}Hz`).toBeLessThanOrEqual(3600);
    }
  });

  it('is frame-rate independent: every refresh rate agrees to within one tick', () => {
    const results = [30, 60, 75, 144, 240].map((hz) => ticksOver(hz, 10));
    expect(Math.max(...results) - Math.min(...results)).toBeLessThanOrEqual(1);
    for (const total of results) {
      expect(total).toBeGreaterThanOrEqual(599);
      expect(total).toBeLessThanOrEqual(600);
    }
  });

  it('DROPS a backlog beyond the cap and reports how much — no spiral of death', () => {
    // A two-second stall: a breakpoint, a GC pause, a slow first paint, a restored tab.
    const drain = drainTicks(0, 2000);

    expect(drain.ticks).toBe(MAX_TICKS_PER_FRAME);
    // The backlog is thrown away, not queued. Queueing guarantees the next frame is later still.
    expect(drain.remainderMs).toBe(0);
    // And the loss is reported rather than hidden — a silent cap reads as "we simulated
    // everything" when we did not (vault C11: say what you did not do).
    expect(drain.dropped).toBe(Math.floor(2000 / MS_PER_TICK) - MAX_TICKS_PER_FRAME);
    expect(drain.dropped).toBeGreaterThan(100);
  });

  it('never returns more than the cap, however long the stall', () => {
    for (const stallMs of [200, 1_000, 60_000, 3_600_000]) {
      const drain = drainTicks(0, stallMs);
      expect(drain.ticks).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
      expect(drain.ticks).toBeGreaterThan(0);
    }
  });

  it('caps at exactly the boundary, not one either side', () => {
    const atCap = drainTicks(0, MS_PER_TICK * MAX_TICKS_PER_FRAME);
    expect(atCap.ticks).toBe(MAX_TICKS_PER_FRAME);
    expect(atCap.dropped).toBe(0);

    const overCap = drainTicks(0, MS_PER_TICK * (MAX_TICKS_PER_FRAME + 1));
    expect(overCap.ticks).toBe(MAX_TICKS_PER_FRAME);
    expect(overCap.dropped).toBe(1);
  });

  it('treats a NaN, infinite or negative delta as zero elapsed time', () => {
    // Phaser can hand out a garbage delta on the first frame after a stall or a tab restore. NaN
    // is the dangerous one: it makes `ticks` NaN, every comparison false, and the loop silently
    // stops running for the rest of the session.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -50, -0.001]) {
      const drain = drainTicks(8, bad);
      expect(Number.isFinite(drain.ticks)).toBe(true);
      expect(Number.isFinite(drain.remainderMs)).toBe(true);
      expect(drain.ticks).toBe(0);
      expect(drain.remainderMs).toBe(8);
    }
  });
});
