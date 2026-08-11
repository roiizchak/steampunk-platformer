/**
 * Pins `tools/gen/catalogTimings.mjs`'s mirrored constants equal to the real TypeScript exports.
 *
 * `tools/gen/*.mjs` cannot import TypeScript anywhere in this repo (`tools/gen` is outside
 * tsconfig's include) — `tools/gen/reachGate.mjs` hit this exact wall for `PLAY_LAG_TICKS` and
 * solved it by mirroring the constant and pinning the mirror equal to the real export with a
 * dedicated test (`tests/unit/reach-gate.test.ts`). This file is that same pattern applied to
 * `catalogTimings.mjs`'s constants, so a retune of `IDLE_TICKS`, `DEATH_TICKS` or
 * `SENTRY_FIRE_TICKS` cannot silently drift from the number `build-assets.mjs` writes into the
 * catalog.
 */

import { describe, expect, it } from 'vitest';

import { TICK_HZ } from '../../src/game/constants';
import { IDLE_TICKS as SIM_IDLE_TICKS, deriveFps as simDeriveFps } from '../../src/render/animTiming';
import { DEATH_TICKS as SIM_DEATH_TICKS } from '../../src/sim/combat';
import { SENTRY_FIRE_TICKS as SIM_SENTRY_FIRE_TICKS } from '../../src/render/enemyView';
import {
  TICK_HZ as MIRROR_TICK_HZ,
  IDLE_TICKS as MIRROR_IDLE_TICKS,
  DEATH_TICKS as MIRROR_DEATH_TICKS,
  SENTRY_FIRE_TICKS as MIRROR_SENTRY_FIRE_TICKS,
  deriveFps as mirrorDeriveFps,
  timingFor,
  catalogRowFor,
  CATALOG_TIMING_SLUGS,
} from '../../tools/gen/catalogTimings.mjs';

describe('catalogTimings.mjs mirrors the real sim/render constants', () => {
  it('TICK_HZ, IDLE_TICKS, DEATH_TICKS and SENTRY_FIRE_TICKS agree with their TS originals', () => {
    expect(MIRROR_TICK_HZ).toBe(TICK_HZ);
    expect(MIRROR_IDLE_TICKS).toBe(SIM_IDLE_TICKS);
    expect(MIRROR_DEATH_TICKS).toBe(SIM_DEATH_TICKS);
    expect(MIRROR_SENTRY_FIRE_TICKS).toBe(SIM_SENTRY_FIRE_TICKS);
  });

  it('deriveFps computes the same value as src/render/animTiming.ts for the same inputs', () => {
    expect(mirrorDeriveFps(12, 90)).toBe(simDeriveFps(12, 90));
    expect(mirrorDeriveFps(6, 18)).toBe(simDeriveFps(6, 18));
  });

  it('timingFor(brass-sentry, idle) is authored at IDLE_TICKS and loops', () => {
    expect(timingFor('brass-sentry', 'idle')).toEqual({
      simTicks: MIRROR_IDLE_TICKS,
      loop: true,
      derivedFrom: 'authored',
    });
  });

  it('timingFor(brass-sentry, fire|death) and (rust-scavenger, death) are sim-derived and do not loop', () => {
    expect(timingFor('brass-sentry', 'fire')).toEqual({
      simTicks: MIRROR_SENTRY_FIRE_TICKS,
      loop: false,
      derivedFrom: 'sim',
    });
    expect(timingFor('brass-sentry', 'death')).toEqual({
      simTicks: MIRROR_DEATH_TICKS,
      loop: false,
      derivedFrom: 'sim',
    });
    expect(timingFor('rust-scavenger', 'death')).toEqual({
      simTicks: MIRROR_DEATH_TICKS,
      loop: false,
      derivedFrom: 'sim',
    });
  });

  it('throws rather than guessing for a measured (stride-based) row with no stride wired up', () => {
    expect(() => timingFor('rust-scavenger', 'walk')).toThrow(/no fixed timing/);
  });

  it('CATALOG_TIMING_SLUGS names exactly the enemy slugs, never brass-courier', () => {
    expect(CATALOG_TIMING_SLUGS).toEqual(new Set(['brass-sentry', 'rust-scavenger']));
  });

  it('catalogRowFor assembles a full SheetEntry-shaped row with fps derived, never authored', () => {
    const row = catalogRowFor('brass-sentry', 'idle', {
      url: 'assets/characters/brass-sentry/sheets/idle.png',
      frameWidth: 288,
      frameHeight: 384,
      frameCount: 8,
    });
    expect(row).toEqual({
      key: 'brass-sentry-idle',
      url: 'assets/characters/brass-sentry/sheets/idle.png',
      frameWidth: 288,
      frameHeight: 384,
      frameCount: 8,
      simTicks: MIRROR_IDLE_TICKS,
      fps: (8 * MIRROR_TICK_HZ) / MIRROR_IDLE_TICKS,
      loop: true,
      derivedFrom: 'authored',
    });
  });
});
