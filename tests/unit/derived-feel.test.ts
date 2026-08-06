/**
 * Every knob moves a number the PLAYER CAN SEE — vault A6, the half `knob-sweep.test.ts` misses.
 *
 * The sweep proves each knob changes some internal trajectory fingerprint. That is a mechanical
 * satisfaction of criterion 2.6 and it is not what the vault item is about:
 *
 *   > "**A slider that visibly exists reads as a slider that visibly works.**"
 *
 * This came directly from playing it. Several knobs could be turned with no visible result —
 * `coyoteTicks` and `jumpBufferTicks` are forgiveness windows you only notice at the exact edge of
 * a ledge, `airFriction` acts only while airborne with nothing held, `jumpCutDivisor` only if you
 * tap rather than hold. Turning one of those and seeing nothing is indistinguishable from turning a
 * dead knob, which is precisely the failure A6 names.
 *
 * So the Playground now displays derived numbers, and this file holds them to the standard the
 * sweep cannot: **for every knob, at least one DISPLAYED number must move.** An internal
 * fingerprint change is no longer sufficient.
 *
 * To be precise about what was and was not broken: the knob's own value always updated on screen.
 * What was missing was any way to see the knob's EFFECT — so a working knob and a dead one looked
 * the same from the player's chair, which is the gap that matters.
 *
 * GUARD (green -> green) for the sweep itself; the four named knobs at the end are the
 * REPRODUCTION *(vault C3)*, since nothing displayed their effect before `derived.ts` existed.
 */

import { describe, expect, it } from 'vitest';
import { ticksToMs } from '../../src/sim';
import { derivedFeel } from '../../src/sim/derived';
import { DEFAULT_TUNING } from '../../src/sim/player';
import type { DerivedFeel } from '../../src/sim/derived';
import type { TuningKnobs } from '../../src/sim/types';

const KNOBS = Object.keys(DEFAULT_TUNING) as (keyof TuningKnobs)[];

function feelWith(overrides: Partial<TuningKnobs>): DerivedFeel {
  return derivedFeel({ ...DEFAULT_TUNING, ...overrides }, ticksToMs);
}

/** Which displayed fields differ between two readouts. */
function changedFields(a: DerivedFeel, b: DerivedFeel): string[] {
  return (Object.keys(a) as (keyof DerivedFeel)[]).filter((k) => a[k] !== b[k]).map(String);
}

describe('the Playground shows a number for every knob (vault A6)', () => {
  const baseline = feelWith({});

  it('reports plausible values for the shipped tuning', () => {
    // Types before values (vault C1), then a sanity range on each — a readout of NaN or zero would
    // otherwise "differ" happily in the sweep below and tell the player nothing.
    for (const [key, value] of Object.entries(baseline)) {
      expect(typeof value, key).toBe('number');
      expect(Number.isFinite(value), key).toBe(true);
    }
    expect(baseline.apexPx).toBeGreaterThan(0);
    expect(baseline.airtimeTicks).toBeGreaterThan(0);
    expect(baseline.topSpeed).toBeCloseTo(DEFAULT_TUNING.runMax, 1);
    expect(baseline.terminalFallSpeed).toBeCloseTo(DEFAULT_TUNING.maxFallSpeed, 1);
    expect(baseline.coyoteMs).toBe(ticksToMs(DEFAULT_TUNING.coyoteTicks));
    expect(baseline.bufferMs).toBe(ticksToMs(DEFAULT_TUNING.jumpBufferTicks));
    // A short hop must be a real hop and genuinely shorter than a full jump.
    expect(baseline.shortHopPx).toBeGreaterThan(0);
    expect(baseline.shortHopPx).toBeLessThan(baseline.apexPx);
  });

  it.each(KNOBS)('turning %s moves at least one displayed number', (key) => {
    const original = DEFAULT_TUNING[key];
    const isTickCount = key === 'coyoteTicks' || key === 'jumpBufferTicks';
    const candidates = isTickCount
      ? [Math.max(1, Math.floor(original / 2)), original * 2]
      : key === 'jumpCutDivisor'
        ? [1, original * 3]
        : [original / 2, original * 2];

    const moved = new Set<string>();
    for (const value of candidates) {
      for (const field of changedFields(baseline, feelWith({ [key]: value }))) {
        moved.add(field);
      }
    }

    expect(
      [...moved],
      `knob "${key}" changed no number the Playground displays — a player turning it sees nothing`,
    ).not.toHaveLength(0);
  });

  it('the four knobs that motivated this each move their own specific number', () => {
    // Named explicitly rather than left to the generic sweep, because these are the four that were
    // invisible while playing. If one of them regresses, the failure should say which.
    expect(feelWith({ coyoteTicks: 14 }).coyoteMs).not.toBe(baseline.coyoteMs);
    expect(feelWith({ jumpBufferTicks: 16 }).bufferMs).not.toBe(baseline.bufferMs);
    expect(feelWith({ airFriction: 0.9 }).airDriftPx).not.toBe(baseline.airDriftPx);
    expect(feelWith({ jumpCutDivisor: 1 }).shortHopPx).not.toBe(baseline.shortHopPx);
  });

  it('is derived from the real simulation, not a formula that could drift from it', () => {
    // Doubling gravity must shorten the jump and the airtime together, the way running the game
    // would. A closed form maintained by hand could satisfy one and not the other.
    const heavy = feelWith({ gravity: DEFAULT_TUNING.gravity * 2 });
    expect(heavy.apexPx).toBeLessThan(baseline.apexPx);
    expect(heavy.airtimeTicks).toBeLessThan(baseline.airtimeTicks);

    const floaty = feelWith({ gravity: DEFAULT_TUNING.gravity / 2 });
    expect(floaty.apexPx).toBeGreaterThan(baseline.apexPx);
    expect(floaty.airtimeTicks).toBeGreaterThan(baseline.airtimeTicks);
  });
});
