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
import {
  IDLE_TICKS as SIM_IDLE_TICKS,
  deriveFps as simDeriveFps,
  strideTicks as simStrideTicks,
} from '../../src/render/animTiming';
import {
  DEATH_TICKS as SIM_DEATH_TICKS,
  ATTACK as SIM_ATTACK,
  attackTotalTicks as simAttackTotalTicks,
  HURT_TICKS as SIM_HURT_TICKS,
} from '../../src/sim/combat';
import { SENTRY_FIRE_TICKS as SIM_SENTRY_FIRE_TICKS } from '../../src/render/enemyView';
import { SCAVENGER as SIM_SCAVENGER } from '../../src/sim/enemyScavenger';
import {
  TICK_HZ as MIRROR_TICK_HZ,
  IDLE_TICKS as MIRROR_IDLE_TICKS,
  DEATH_TICKS as MIRROR_DEATH_TICKS,
  SENTRY_FIRE_TICKS as MIRROR_SENTRY_FIRE_TICKS,
  ATTACK_TOTAL_TICKS as MIRROR_ATTACK_TOTAL_TICKS,
  HURT_TICKS as MIRROR_HURT_TICKS,
  SCAVENGER_PATROL_SPEED as MIRROR_SCAVENGER_PATROL_SPEED,
  SCAVENGER_CHASE_SPEED as MIRROR_SCAVENGER_CHASE_SPEED,
  deriveFps as mirrorDeriveFps,
  strideTicks as mirrorStrideTicks,
  timingFor,
  catalogRowFor,
  hasCatalogTiming,
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

  it('strideTicks computes the same value as src/render/animTiming.ts for the same inputs', () => {
    expect(mirrorStrideTicks(180, 2.5)).toBe(simStrideTicks(180, 2.5));
    expect(mirrorStrideTicks(64, 8)).toBe(simStrideTicks(64, 8));
  });

  it('ATTACK_TOTAL_TICKS, HURT_TICKS and the scavenger speeds agree with their TS originals', () => {
    expect(MIRROR_ATTACK_TOTAL_TICKS).toBe(simAttackTotalTicks(SIM_ATTACK));
    expect(MIRROR_HURT_TICKS).toBe(SIM_HURT_TICKS);
    expect(MIRROR_SCAVENGER_PATROL_SPEED).toBe(SIM_SCAVENGER.patrolSpeed);
    expect(MIRROR_SCAVENGER_CHASE_SPEED).toBe(SIM_SCAVENGER.chaseSpeed);
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

  it('throws rather than guessing for a looping row with no cadence wired up', () => {
    // Same teeth, new required input (session 9): a declared animation with a missing input FAILS
    // and is never substituted (vault 4.16). It used to demand a stride; it now demands a cadence.
    expect(() => timingFor('rust-scavenger', 'walk')).toThrow(/needs an authored cadence/);
  });

  it('timingFor(brass-courier, attack|hurt|death) is sim-derived and does not loop', () => {
    expect(timingFor('brass-courier', 'attack')).toEqual({
      simTicks: MIRROR_ATTACK_TOTAL_TICKS,
      loop: false,
      derivedFrom: 'sim',
    });
    expect(timingFor('brass-courier', 'hurt')).toEqual({
      simTicks: MIRROR_HURT_TICKS,
      loop: false,
      derivedFrom: 'sim',
    });
    expect(timingFor('brass-courier', 'death')).toEqual({
      simTicks: MIRROR_DEATH_TICKS,
      loop: false,
      derivedFrom: 'sim',
    });
  });

  /**
   * 🔴 Session 9: these two rows take an AUTHORED cadence, not a stride.
   *
   * They were "known pair, but throws until someone measures a stride" — correctly, because a
   * guessed stride is exactly what shipped as the player's 13-17 % foot-slide. The fix was not to
   * measure harder (four methods disagree by ~20 %, vault 4.18) but to stop a LOOP needing a stride
   * at all. `chase` became packable for the first time the same afternoon.
   */
  it('timingFor(rust-scavenger, walk|chase) resolves from an authored cadence and a frame count', () => {
    expect(timingFor('rust-scavenger', 'walk', { authoredFps: 18, renderFrames: 12 })).toEqual({
      // 12 frames at 18 fps = 0.667 s = 40 ticks. Hand-computed, not via the production helper (C2).
      simTicks: 40,
      loop: true,
      derivedFrom: 'authored',
    });
    expect(timingFor('rust-scavenger', 'chase', { authoredFps: 24, renderFrames: 12 })).toEqual({
      simTicks: 30,
      loop: true,
      derivedFrom: 'authored',
    });
  });

  it('still refuses to invent a cadence when none is authored', () => {
    // The teeth that survive: a missing declared input FAILS, it is never substituted (vault 4.16).
    // Only WHICH input is required changed.
    expect(() => timingFor('rust-scavenger', 'walk', { renderFrames: 12 })).toThrow(
      /needs an authored cadence/,
    );
    expect(() => timingFor('rust-scavenger', 'chase', { authoredFps: 24 })).toThrow(
      /packed frame count/,
    );
  });

  /**
   * Coverage for every `(slug, action)` pair THIS PHASE packs — not every action `slugConfig.mjs`
   * declares. `idle/walk/run/jump/fall` already have Phase-4 catalog rows and are deliberately out
   * of scope here (this module's header).
   *
   * `hasCatalogTiming` answers "is this a KNOWN pair" — true for all nine below, including
   * rust-scavenger's walk/chase. `catalogRowFor` answers "CAN it resolve right now" — false for
   * walk/chase until a stride is measured (see `character-bounds-rust-scavenger.json`). Blurring
   * those two into one assertion would hide that a known-but-unmeasured pair still throws on
   * purpose (vault 4.16: fail on a missing declared input, never substitute).
   */
  describe('coverage: every (slug, action) pair this phase packs', () => {
    const RESOLVABLE_NOW: Array<[string, string]> = [
      ['brass-sentry', 'idle'],
      ['brass-sentry', 'fire'],
      ['brass-sentry', 'death'],
      ['rust-scavenger', 'death'],
      ['brass-courier', 'attack'],
      ['brass-courier', 'hurt'],
      ['brass-courier', 'death'],
    ];
    /**
     * 🔴 Session 9: EMPTY, and that is the headline.
     *
     * `rust-scavenger`'s `walk` and `chase` lived here for two sessions as "known pair, cannot
     * resolve — no stride measured". Authoring loop cadences dissolved the category: a loop needs
     * no stride, so there is no longer such a thing as a known-but-unresolvable locomotion row.
     * `chase` packed for the first time the same afternoon.
     *
     * Kept rather than deleted, with the loops below still asserting emptiness, because the
     * DISTINCTION it draws is real and worth keeping alive: `hasCatalogTiming` answers "is this a
     * known pair", `catalogRowFor` answers "can it resolve right now", and blurring them is how a
     * missing input would start reading as an unknown one.
     */
    const KNOWN_BUT_UNMEASURED: Array<[string, string]> = [];
    const FAKE_SHEET = {
      url: 'assets/characters/fake/sheets/fake.png',
      frameWidth: 288,
      frameHeight: 384,
      frameCount: 6,
    };

    it.each([...RESOLVABLE_NOW, ...KNOWN_BUT_UNMEASURED])(
      'hasCatalogTiming(%s, %s) is true',
      (slug, action) => {
        expect(hasCatalogTiming(slug, action)).toBe(true);
      },
    );

    it.each(RESOLVABLE_NOW)('catalogRowFor(%s, %s) resolves a catalog row now', (slug, action) => {
      expect(() => catalogRowFor(slug, action, FAKE_SHEET)).not.toThrow();
    });

    it('no locomotion row is known-but-unresolvable any more', () => {
      expect(KNOWN_BUT_UNMEASURED).toEqual([]);
    });

    it.each([['rust-scavenger', 'walk'], ['rust-scavenger', 'chase']] as Array<[string, string]>)(
      'catalogRowFor(%s, %s) resolves once its cadence is authored',
      (slug, action) => {
        expect(() =>
          catalogRowFor(slug, action, FAKE_SHEET, { authoredFps: 18, renderFrames: 6 }),
        ).not.toThrow();
      },
    );

    it('hasCatalogTiming is false for a pair nobody declared', () => {
      expect(hasCatalogTiming('brass-courier', 'idle')).toBe(false);
      expect(hasCatalogTiming('nonexistent-slug', 'idle')).toBe(false);
    });
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
