/**
 * Impact effects — the DECISION half. Engine-free *(vault 2.12)*.
 *
 * Every function under test answers "what should be drawn" from integer sim state and returns plain
 * data. Nothing here knows Phaser exists, which is why the depth band, the particle budget, the
 * flinch curve and the i-frame flicker are all reachable from a unit test in milliseconds instead of
 * from a screenshot.
 *
 * Three of these tests are guarding against a specific way this class of feature ships broken:
 *
 *   - **the depth band.** 10.1/10.2/10.3 looks arbitrary and is not: a particle emitter above the
 *     enemy `Graphics` layers costs one extra batch flush every frame forever, because particles and
 *     Graphics use different batch handlers. A "tidy" edit to 13 is invisible in a screenshot and
 *     visible only in a frame budget. The mutation proof for this task drives exactly that edit.
 *   - **the peak-alive budget.** Phaser's `atLimit()` DROPS emit requests rather than evicting, so
 *     the cap is what makes the worst case a constant instead of something a sampler has to catch.
 *   - **`iframeAlpha` never returning 0.** Alpha 0 is how the vault's blocker shipped invisible menu
 *     cards with a fully green suite, and 45 ticks of an invisible player loses positional tracking.
 *
 * The force-settle tests (`flinchOffset`, `landSquash`) are `toBe`, never `toBeCloseTo`. A transform
 * that settles at 1e-17 instead of 0 leaves the sprite permanently, invisibly displaced, and nothing
 * downstream can tell that apart from correct.
 */

import { describe, expect, it } from 'vitest';
import {
  ATTACK_CONTACT_FRAME_INDEX,
  DUST_MIN_FALL_PX,
  EFFECT_DEPTH,
  EFFECT_PEAK_ALIVE,
  EMITTER_SPECS,
  SPARK_CONE_DEG,
  deathSteam,
  flinchOffset,
  hitFlashAlpha,
  hurtVent,
  iframeAlpha,
  impactSparks,
  landSquash,
  landingDust,
  ticksSinceHit,
  type EffectKind,
} from '../../src/render/effects';
import { HITSTOP_TICKS, type Freezable, type ImpactClass } from '../../src/sim/hitstop';
import { IFRAME_TICKS } from '../../src/sim/combat';

const KINDS: EffectKind[] = ['sparks', 'steam', 'dust'];
const IMPACTS: ImpactClass[] = ['light', 'lethal', 'playerHurt'];

/** The sim's own terminal velocity. Landing dust is expressed against it, not an invented number. */
const MAX_FALL = 51.6;

const neverHit = (): Freezable => ({ hitstopUntil: -1, lastHitTick: -1 });

describe('the depth band', () => {
  it('puts every emitter STRICTLY inside (10, 11)', () => {
    for (const kind of KINDS) {
      expect(
        EFFECT_DEPTH[kind] > 10 && EFFECT_DEPTH[kind] < 11,
        `${kind} sits at depth ${EFFECT_DEPTH[kind]}. Every emitter must be strictly between the ` +
          `player (10) and the enemy shot Graphics (11). Particles batch on BatchHandlerQuad and ` +
          `Graphics on BatchHandlerTriFlat, so an emitter above 11 forces one extra batch flush ` +
          `EVERY FRAME, forever, to sit above two 3px health bars.`,
      ).toBe(true);
    }
  });

  it('gives every emitter its own depth, so the draw order is deterministic', () => {
    expect(new Set(Object.values(EFFECT_DEPTH)).size).toBe(KINDS.length);
  });

  it('is the same number the emitter spec carries', () => {
    for (const kind of KINDS) {
      expect(EMITTER_SPECS[kind].depth).toBe(EFFECT_DEPTH[kind]);
    }
  });
});

describe('the particle budget', () => {
  it('sums to EFFECT_PEAK_ALIVE, pinned as the literal 96', () => {
    const sum = KINDS.reduce((total, kind) => total + EMITTER_SPECS[kind].maxAliveParticles, 0);
    expect(sum).toBe(EFFECT_PEAK_ALIVE);
    expect(EFFECT_PEAK_ALIVE).toBe(96);
  });

  it('pins each emitter cap as a literal', () => {
    expect(EMITTER_SPECS.sparks.maxAliveParticles).toBe(32);
    expect(EMITTER_SPECS.steam.maxAliveParticles).toBe(48);
    expect(EMITTER_SPECS.dust.maxAliveParticles).toBe(16);
  });

  it('pre-allocates its whole cap, so a burst never allocates', () => {
    for (const kind of KINDS) {
      expect(EMITTER_SPECS[kind].reserve).toBe(EMITTER_SPECS[kind].maxAliveParticles);
    }
  });

  it('keeps every duration an integer tick count', () => {
    for (const kind of KINDS) {
      expect(Number.isInteger(EMITTER_SPECS[kind].lifespanTicks)).toBe(true);
    }
  });
});

describe('the attack contact frame', () => {
  it('is the measured texture frame 4, inside the 12-frame clip', () => {
    // A measurement traced on 2026-08-20 against the shipped sheet, not a preference. If the clip is
    // ever regenerated at a different frame count this assertion is the thing that has to be
    // re-measured — sheetGates.mjs's G5 will still pass, because it only asks whether contact falls
    // inside the active window, and a mid-wind-up frame inside the window is exactly the defect.
    expect(ATTACK_CONTACT_FRAME_INDEX).toBe(4);
    expect(Number.isInteger(ATTACK_CONTACT_FRAME_INDEX)).toBe(true);
    expect(ATTACK_CONTACT_FRAME_INDEX).toBeGreaterThanOrEqual(0);
    expect(ATTACK_CONTACT_FRAME_INDEX).toBeLessThan(12);
  });
});

describe('landingDust', () => {
  it('draws nothing below the threshold and a burst at it — both sides of DUST_MIN_FALL_PX', () => {
    expect(DUST_MIN_FALL_PX).toBe(9);
    expect(landingDust(8, 0, 0, MAX_FALL)).toBe(null);
    expect(landingDust(8.999, 0, 0, MAX_FALL)).toBe(null);
    expect(landingDust(9, 0, 0, MAX_FALL)).not.toBe(null);
    expect(landingDust(9, 0, 0, MAX_FALL)?.kind).toBe('dust');
  });

  it('is monotonic in |vy| across a sweep, not at three convenient points', () => {
    let previous = -1;
    for (let vy = DUST_MIN_FALL_PX; vy <= MAX_FALL; vy += 0.1) {
      const count = landingDust(vy, 0, 0, MAX_FALL)?.count ?? 0;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    expect(previous).toBeGreaterThan(0);
  });

  it('treats a fall and an equal-magnitude rise identically — it reads |vy|', () => {
    expect(landingDust(-20, 0, 0, MAX_FALL)?.count).toBe(landingDust(20, 0, 0, MAX_FALL)?.count);
  });

  it('caps at 14 particles, well inside the dust emitter’s 16-particle budget', () => {
    expect(landingDust(MAX_FALL, 0, 0, MAX_FALL)?.count).toBe(14);
    expect(landingDust(9999, 0, 0, MAX_FALL)?.count).toBe(14);
    expect(landingDust(MAX_FALL, 0, 0, MAX_FALL)?.count).toBeLessThanOrEqual(
      EMITTER_SPECS.dust.maxAliveParticles,
    );
  });

  it('clamps the fall speed at maxFall, so an out-of-range vy cannot outrun the ramp', () => {
    expect(landingDust(MAX_FALL * 4, 0, 0, MAX_FALL)?.count).toBe(
      landingDust(MAX_FALL, 0, 0, MAX_FALL)?.count,
    );
  });

  it('places the burst where it was told, and nowhere else', () => {
    const burst = landingDust(30, 640, 1920, MAX_FALL);
    expect(burst?.x).toBe(640);
    expect(burst?.y).toBe(1920);
  });
});

describe('impactSparks', () => {
  it('returns a core and a tail — two bursts, one emitter', () => {
    for (const impact of IMPACTS) {
      const bursts = impactSparks(0, 0, 1, impact);
      expect(bursts).toHaveLength(2);
      expect(bursts.every((b) => b.kind === 'sparks')).toBe(true);
    }
  });

  it('spends exactly the specified total: light 10, lethal 18', () => {
    const total = (impact: ImpactClass) =>
      impactSparks(0, 0, 1, impact).reduce((sum, b) => sum + b.count, 0);
    expect(total('light')).toBe(10);
    expect(total('lethal')).toBe(18);
  });

  it('fires BACK along the swing, mirrored by facing', () => {
    // Centred on `-facing`: a spanner on brass throws sparks toward the attacker, not away.
    expect(impactSparks(0, 0, 1, 'light')[0].angleDeg).toBe(180);
    expect(impactSparks(0, 0, -1, 'light')[0].angleDeg).toBe(0);
    // The tail kicks upward from there, on the same side.
    expect(impactSparks(0, 0, 1, 'light')[1].angleDeg).toBe(210);
    expect(impactSparks(0, 0, -1, 'light')[1].angleDeg).toBe(-30);
  });

  it('widens the cone for a kill: 50 degrees light, 90 lethal', () => {
    expect(SPARK_CONE_DEG.light).toBe(50);
    expect(SPARK_CONE_DEG.lethal).toBe(90);
  });

  it('fits every single impact inside the sparks emitter’s 32-particle cap', () => {
    for (const impact of IMPACTS) {
      const total = impactSparks(0, 0, 1, impact).reduce((sum, b) => sum + b.count, 0);
      expect(total).toBeLessThanOrEqual(EMITTER_SPECS.sparks.maxAliveParticles);
    }
  });
});

describe('steam — deathSteam and hurtVent share one emitter', () => {
  it('uses the same kind, so it costs no extra emitter and no extra depth slot', () => {
    expect(deathSteam(0, 0).kind).toBe('steam');
    expect(hurtVent(0, 0, 1).kind).toBe('steam');
  });

  it('is distinguishable at play speed: the vent is strictly smaller than the plume', () => {
    // A vent the player survives and a plume that ends an enemy are the same picture otherwise.
    expect(hurtVent(0, 0, 1).count).toBeLessThan(deathSteam(0, 0).count);
    expect(deathSteam(0, 0).count).toBe(14);
  });

  it('fits both together inside the steam emitter’s 48-particle budget', () => {
    expect(deathSteam(0, 0).count + hurtVent(0, 0, 1).count).toBeLessThanOrEqual(
      EMITTER_SPECS.steam.maxAliveParticles,
    );
  });

  it('sends the plume straight up and leans the vent away from facing', () => {
    expect(deathSteam(0, 0).angleDeg).toBe(270);
    expect(hurtVent(0, 0, 1).angleDeg).toBe(250);
    expect(hurtVent(0, 0, -1).angleDeg).toBe(290);
  });
});

describe('ticksSinceHit', () => {
  it('is null for a body that was never hit — the -1 sentinel', () => {
    expect(ticksSinceHit(neverHit(), 0)).toBe(null);
    expect(ticksSinceHit(neverHit(), 5000)).toBe(null);
  });

  it('counts from the hit tick, and keeps counting past the end of the freeze', () => {
    const body: Freezable = { hitstopUntil: 100 + HITSTOP_TICKS.lethal, lastHitTick: 100 };
    expect(ticksSinceHit(body, 100)).toBe(0);
    expect(ticksSinceHit(body, 109)).toBe(9);
    expect(ticksSinceHit(body, 400)).toBe(300);
  });
});

describe('flinchOffset force-settles', () => {
  it('is neutral for a body that was never hit', () => {
    expect(flinchOffset(null, 'light', 1)).toEqual({ dx: 0, dy: 0 });
  });

  it('holds a STEP for the whole freeze, mirrored by facing', () => {
    for (const impact of IMPACTS) {
      const held = flinchOffset(0, impact, 1);
      expect(held.dx).toBeGreaterThan(0);
      for (let t = 0; t <= HITSTOP_TICKS[impact]; t += 1) {
        expect(flinchOffset(t, impact, 1)).toEqual(held);
      }
      expect(flinchOffset(0, impact, -1).dx).toBe(-held.dx);
    }
  });

  it('overshoots past zero on the way back — a small one', () => {
    const step = flinchOffset(0, 'lethal', 1).dx;
    const past = [];
    for (let t = HITSTOP_TICKS.lethal + 1; t < HITSTOP_TICKS.lethal + 20; t += 1) {
      past.push(flinchOffset(t, 'lethal', 1).dx);
    }
    expect(past.some((dx) => dx < 0)).toBe(true);
    expect(Math.min(...past)).toBeGreaterThan(-step * 0.3);
  });

  it('returns to EXACTLY 0 and STAYS 0, for every impact class and both facings', () => {
    // The force-settle property applied to the one thing this phase animates in the world.
    for (const impact of IMPACTS) {
      for (const facing of [1, -1] as const) {
        let settledAt: number | null = null;
        for (let t = 0; t <= 600; t += 1) {
          const { dx, dy } = flinchOffset(t, impact, facing);
          if (settledAt !== null) {
            expect(dx).toBe(0);
            expect(dy).toBe(0);
          } else if (dx === 0 && dy === 0 && t > HITSTOP_TICKS[impact]) {
            settledAt = t;
          }
        }
        expect(settledAt).not.toBe(null);
        expect(settledAt as number).toBeLessThan(HITSTOP_TICKS[impact] + 12);
      }
    }
  });
});

describe('hitFlashAlpha', () => {
  it('is 0 for a body that was never hit', () => {
    for (const impact of IMPACTS) {
      expect(hitFlashAlpha(null, impact)).toBe(0);
    }
  });

  it('DECAYS a light hit to exactly 0, and stays there', () => {
    expect(hitFlashAlpha(0, 'light')).toBe(1);
    expect(hitFlashAlpha(1, 'light')).toBeLessThan(1);
    expect(hitFlashAlpha(2, 'light')).toBeLessThan(hitFlashAlpha(1, 'light'));
    expect(hitFlashAlpha(HITSTOP_TICKS.light, 'light')).toBe(0);
    expect(hitFlashAlpha(HITSTOP_TICKS.light + 50, 'light')).toBe(0);
  });

  it('HOLDS a lethal or playerHurt flash blown out for the whole freeze', () => {
    for (const impact of ['lethal', 'playerHurt'] as const) {
      for (let t = 0; t < HITSTOP_TICKS[impact]; t += 1) {
        expect(hitFlashAlpha(t, impact)).toBe(1);
      }
      expect(hitFlashAlpha(HITSTOP_TICKS[impact], impact)).toBe(0);
      expect(hitFlashAlpha(HITSTOP_TICKS[impact] + 1, impact)).toBe(0);
    }
  });
});

describe('landSquash', () => {
  it('is neutral when nothing landed', () => {
    expect(landSquash(null)).toEqual({ sx: 1, sy: 1 });
  });

  it('squashes on the landing tick and is roughly area-preserving throughout', () => {
    const first = landSquash(0);
    expect(first.sx).toBeGreaterThan(1);
    expect(first.sy).toBeLessThan(1);
    for (let t = 0; t <= 5; t += 1) {
      const { sx, sy } = landSquash(t);
      expect(sx * sy).toBeCloseTo(1, 10);
    }
  });

  it('runs for 3 ticks and returns to EXACTLY 1 — both sides of the boundary', () => {
    // 2 ticks reads as a glitch at 60 Hz; this is the reason the boundary is where it is.
    expect(landSquash(2).sx).toBeGreaterThan(1);
    expect(landSquash(3)).toEqual({ sx: 1, sy: 1 });
    expect(landSquash(4)).toEqual({ sx: 1, sy: 1 });
    expect(landSquash(900)).toEqual({ sx: 1, sy: 1 });
  });

  it('relaxes monotonically back toward 1', () => {
    expect(landSquash(0).sx).toBeGreaterThan(landSquash(1).sx);
    expect(landSquash(1).sx).toBeGreaterThan(landSquash(2).sx);
  });
});

describe('iframeAlpha', () => {
  it('NEVER returns 0 across the whole 45-tick i-frame window', () => {
    // Alpha 0 is exactly how the vault's blocker shipped invisible menu cards with a fully green
    // suite. 45 ticks of an invisible player is three quarters of a second of lost positional
    // tracking, and the flicker is supposed to say "invulnerable", not "gone".
    for (let counter = 0; counter < IFRAME_TICKS; counter += 1) {
      expect(
        iframeAlpha(counter, IFRAME_TICKS),
        `iframeAlpha returned 0 at counter ${counter}. The floor is 0.35 and never 0.`,
      ).toBeGreaterThanOrEqual(0.35);
    }
  });

  it('alternates on a 6-tick period, 3 on and 3 off — asserted at every phase boundary', () => {
    expect(iframeAlpha(0, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(2, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(3, IFRAME_TICKS)).toBe(0.35);
    expect(iframeAlpha(5, IFRAME_TICKS)).toBe(0.35);
    expect(iframeAlpha(6, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(8, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(9, IFRAME_TICKS)).toBe(0.35);
  });

  it('is fully opaque once the window has lapsed — both sides of the boundary', () => {
    // 41 is the last DIM tick inside the window; 47 has the same phase and is outside it. If the
    // window guard were missing, 47 would come back at 0.35 — so this pair is the boundary.
    expect(iframeAlpha(41, IFRAME_TICKS)).toBe(0.35);
    expect(iframeAlpha(IFRAME_TICKS - 1, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(IFRAME_TICKS, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(IFRAME_TICKS + 1, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(47, IFRAME_TICKS)).toBe(1);
    expect(iframeAlpha(9999, IFRAME_TICKS)).toBe(1);
  });

  it('never strobes faster than the period, whatever the window length', () => {
    // A zero-length window is the branch a `<=` typo makes unreachable (vault 5.5).
    expect(iframeAlpha(0, 0)).toBe(1);
  });
});

describe('a state that never happened draws nothing', () => {
  it('is neutral end to end for a body that was never hit', () => {
    const body = neverHit();
    const since = ticksSinceHit(body, 1234);
    expect(since).toBe(null);
    expect(flinchOffset(since, 'lethal', 1)).toEqual({ dx: 0, dy: 0 });
    expect(hitFlashAlpha(since, 'lethal')).toBe(0);
    expect(landSquash(null)).toEqual({ sx: 1, sy: 1 });
    expect(landingDust(0, 0, 0, MAX_FALL)).toBe(null);
  });
});
