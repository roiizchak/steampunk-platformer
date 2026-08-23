/**
 * Impact effects — the DECISION half. Engine-free *(vault 2.12)*.
 *
 * The EMITTER half: the depth band, the particle budget, and the three burst builders. The per-sprite
 * transforms `effects.ts` re-exports from `spriteFeedback.ts` are tested in `sprite-feedback.test.ts`
 * — this file was split for the 400-line rule, along the same seam the source is split on.
 *
 * Every function under test answers "what should be drawn" from integer sim state and returns plain
 * data. Nothing here knows Phaser exists, which is why the depth band, the particle budget and every
 * burst count are reachable from a unit test in milliseconds instead of from a screenshot.
 *
 * 🔴 **The theme of this file's second pass.** Almost every gate in its first version asked whether a
 * value came back, not whether it is capable of doing anything. A `Burst` of count 0 satisfied every
 * assertion about kind, cap, position and even the required `hurtVent < deathSteam` comparison; an
 * emitter with `alphaStart: 0` satisfied every assertion about depth and budget while drawing
 * nothing; and a landing-dust ramp flattened to a constant satisfied "monotonic". Four separate
 * mutations, four fully green suites. The assertions below are written the other way round.
 *
 * Three of these tests guard a specific way this class of feature ships broken:
 *
 *   - **the depth band.** 10.1/10.2/10.3 looks arbitrary and is not: a particle emitter above the
 *     enemy `Graphics` layers costs one extra batch flush every frame forever, because particles and
 *     Graphics use different batch handlers. A "tidy" edit to 13 is invisible in a screenshot and
 *     visible only in a frame budget.
 *   - **the peak-alive budget.** Phaser's `atLimit()` DROPS emit requests rather than evicting, so
 *     the cap is what makes the worst case a constant instead of something a sampler has to catch.
 *   - **the visible start values.** Alpha 0 is how the vault's blocker shipped invisible menu cards
 *     with a fully green suite. `iframeAlpha` guards that for the player sprite; nothing guarded it
 *     for the 96 particles the frame budget is spent on until now.
 */

import { describe, expect, it } from 'vitest';
import {
  DUST_MIN_FALL_PX,
  EFFECT_DEPTH,
  EFFECT_PEAK_ALIVE,
  EMITTER_SPECS,
  SPARK_CONE_DEG,
  deathSteam,
  hurtVent,
  impactSparks,
  landingDust,
  type Burst,
  type EffectKind,
} from '../../src/render/effects';
import { type ImpactClass } from '../../src/sim/hitstop';
import { DEFAULT_TUNING } from '../../src/sim/playerTuning';

const KINDS: EffectKind[] = ['sparks', 'steam', 'dust'];
const IMPACTS: ImpactClass[] = ['light', 'lethal', 'playerHurt'];

/**
 * The sim's own terminal velocity. Landing dust is expressed against it, not an invented number.
 *
 * ⚠️ **Imported, never copied — but NOT for the reason the finding that prompted it gave.**
 *
 * A Phase 9 `qa-expert` brief (F6) flagged the old literal `51.6` as a hard-coded copy of
 * `playerTuning.ts`'s swept `maxFallSpeed` *(A6)*, and predicted a retune would leave every ramp
 * literal below "pinned against a terminal velocity the game no longer has". **That prediction is
 * false, and it was measured rather than argued** (2026-08-23): with the copy in place,
 * `maxFallSpeed: 51.6 → 40.0` left this file at 30 passed / 0 failed — and it still does WITH the
 * import. One import cannot close it, because there was nothing there to close.
 *
 * The reason is `landingDust`'s shape: `maxFall` only **clamps** `|impactVy|`, and the ramp saturates
 * at `DUST_MAX_COUNT` by `fall = 18`. Every literal below is an **absolute** vy in px/frame, well
 * under that clamp, so no value of `maxFall` above 18 can move any of them. The parameter is inert
 * across its whole plausible range.
 *
 * The import is kept anyway — three definitions of one number is worse than one — and the real gap
 * is closed separately: **the clamp-headroom assertion below** is the invariant the copied literal
 * was hiding, and it is the only way a `maxFallSpeed` retune can reach this file at all.
 */
const MAX_FALL = DEFAULT_TUNING.maxFallSpeed;

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

describe('no emitter can be neutralised into invisibility', () => {
  // A particle whose scale or alpha STARTS at zero never draws, whatever its count. Every alphaEnd
  // in the table is 0 and sparks' scaleEnd is 0 — those are correct, they are the fade-out — so the
  // START of each ramp is the field that carries the whole visual budget.
  //
  // This is the same alpha-0 class `iframeAlpha`'s docstring names as how the vault's blocker
  // shipped invisible menu cards with a fully green suite. That guard was on the player sprite; this
  // one is on the 96 particles the frame budget is spent on.
  const MIN_VISIBLE = 0.1;

  it('starts every emitter at a scale and an alpha that can actually be seen', () => {
    for (const kind of KINDS) {
      const spec = EMITTER_SPECS[kind];
      for (const field of ['scaleStart', 'alphaStart'] as const) {
        expect(
          spec[field],
          `${kind}.${field} is ${spec[field]}. Below ${MIN_VISIBLE} the emitter draws nothing a ` +
            `player can see, and every assertion about counts, caps and depths still passes — all ` +
            `${EFFECT_PEAK_ALIVE} budgeted particles would be invisible with a green suite.`,
        ).toBeGreaterThanOrEqual(MIN_VISIBLE);
      }
    }
  });

  it('gives every emitter a lifespan and a speed, so its particles both persist and travel', () => {
    for (const kind of KINDS) {
      const spec = EMITTER_SPECS[kind];
      expect(spec.lifespanTicks, `${kind} lives ${spec.lifespanTicks} ticks`).toBeGreaterThan(0);
      expect(spec.speedMax, `${kind} particles never move`).toBeGreaterThan(0);
      expect(spec.speedMin).toBeLessThanOrEqual(spec.speedMax);
      expect(spec.angleMin).toBeLessThan(spec.angleMax);
    }
  });

  it('pins every visual start value as a literal, so a retune is a visible edit', () => {
    expect(EMITTER_SPECS.sparks.scaleStart).toBe(0.9);
    expect(EMITTER_SPECS.sparks.alphaStart).toBe(1);
    expect(EMITTER_SPECS.steam.scaleStart).toBe(0.4);
    expect(EMITTER_SPECS.steam.alphaStart).toBe(0.75);
    expect(EMITTER_SPECS.dust.scaleStart).toBe(0.6);
    expect(EMITTER_SPECS.dust.alphaStart).toBe(0.55);
  });
});

describe('every burst draws something', () => {
  /** Every burst any function in this module can return, labelled. */
  const allBursts = (): [string, Burst][] => [
    ...IMPACTS.flatMap(
      (impact) =>
        impactSparks(0, 0, 1, impact).map((burst, n) => [
          `impactSparks(${impact})[${n === 0 ? 'core' : 'tail'}]`,
          burst,
        ]) as [string, Burst][],
    ),
    ['deathSteam', deathSteam(0, 0)],
    ['hurtVent(facing +1)', hurtVent(0, 0, 1)],
    ['hurtVent(facing -1)', hurtVent(0, 0, -1)],
    ['landingDust at the threshold', landingDust(DUST_MIN_FALL_PX, 0, 0, MAX_FALL) as Burst],
    ['landingDust at terminal velocity', landingDust(MAX_FALL, 0, 0, MAX_FALL) as Burst],
  ];

  it('never returns a burst of zero particles — a burst of 0 is not a burst', () => {
    // The CLASS, not three instances. A burst of count 0 satisfies every assertion that asks whether
    // a burst came back, whether its kind is right, whether it fits the cap — and even the brief's
    // required `hurtVent.count < deathSteam.count`, which passes HARDER when hurtVent is 0. Asking
    // "did a value come back" is not asking "can it do anything".
    for (const [label, burst] of allBursts()) {
      expect(
        burst.count,
        `${label} returned count ${burst.count}. It draws nothing, and every other assertion ` +
          `about it still passes.`,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps every burst inside its own emitter cap', () => {
    for (const [label, burst] of allBursts()) {
      expect(burst.count, label).toBeLessThanOrEqual(EMITTER_SPECS[burst.kind].maxAliveParticles);
    }
  });
});

describe('landingDust', () => {
  it('draws nothing below the threshold and a burst at it — both sides of DUST_MIN_FALL_PX', () => {
    expect(DUST_MIN_FALL_PX).toBe(9);
    expect(landingDust(8, 0, 0, MAX_FALL)).toBe(null);
    expect(landingDust(8.999, 0, 0, MAX_FALL)).toBe(null);
    expect(landingDust(9, 0, 0, MAX_FALL)).not.toBe(null);
    expect(landingDust(9, 0, 0, MAX_FALL)?.kind).toBe('dust');
    // 🔴 The 'on' side of a threshold has to DRAW something. Without this line the clamp could
    // return a burst of count 0 at exactly DUST_MIN_FALL_PX — indistinguishable from no dust at
    // all — and this whole test would pass on a fixture that emits nothing. That is the decoration
    // case the phase's own rules forbid, and it is what it did before the floor was added.
    expect(landingDust(9, 0, 0, MAX_FALL)?.count).toBeGreaterThan(0);
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

  it('RAMPS — pinned as literals, and STRICTLY increasing across the ramp region', () => {
    // 🔴 Monotonicity alone cannot order its own mutation: a CONSTANT count is monotonic, so a
    // `Math.max(14, …)` typo returning 14 particles for a 9 px step-down passes the sweep above
    // untouched. The comparator is what was wrong, so the statistic is replaced rather than the
    // bound moved — the ramp IS the feature, and a step-down and a terminal-velocity slam are
    // supposed to look different.
    const at = (vy: number) => landingDust(vy, 0, 0, MAX_FALL)?.count;

    // The foot of the ramp, and four separated points along it.
    expect(at(DUST_MIN_FALL_PX)).toBe(1);
    expect(at(10)).toBe(2);
    expect(at(12)).toBe(5);
    expect(at(16)).toBe(11);
    expect(at(17)).toBe(13);

    // Strict, between well-separated points. A flat or saturated ramp cannot survive this.
    expect(at(MAX_FALL) as number).toBeGreaterThan(at(17) as number);
    expect(at(17) as number).toBeGreaterThan(at(12) as number);
    expect(at(12) as number).toBeGreaterThan(at(10) as number);
    expect(at(10) as number).toBeGreaterThan(at(DUST_MIN_FALL_PX) as number);

    // The cap is reached from BELOW, so a below-cap value is pinned as well as the ceiling.
    expect(at(18)).toBe(14);
    expect(at(17) as number).toBeLessThan(14);
  });

  it('the terminal-velocity clamp stays INERT — the invariant the copied literal was hiding', () => {
    // 🔴 This is the assertion F6 was reaching for and did not find. `maxFall` clamps `|impactVy|`,
    // and the ramp saturates at DUST_MAX_COUNT well below it — so every absolute-vy literal in this
    // file is valid only while the clamp sits ABOVE the saturation point. Nothing checked that, and
    // the copied literal is why: a number that cannot change cannot be noticed going stale.
    //
    // Drop `maxFallSpeed` under the saturation point and the clamp starts biting: the top of the
    // ramp stops being reachable. That is the ONLY route by which a maxFallSpeed retune reaches this
    // file's assertions, which is also why importing the constant alone changed nothing.
    //
    // ⚠️ A red here is NOT fixed by lowering this bound. It means the sim's terminal velocity fell
    // below the dust ramp's cap, and every ramp literal above needs re-taking against the new one.
    // Found from the shipped function rather than from its private constants: the lowest fall at
    // which one more px/frame buys no more particles. Derived, so a ramp retune moves it too.
    const capped = landingDust(1e6, 0, 0, 1e6)!.count;
    let saturationVy = DUST_MIN_FALL_PX;
    while (saturationVy < 1000 && landingDust(saturationVy, 0, 0, 1e6)!.count < capped) {
      saturationVy += 1;
    }
    expect(
      MAX_FALL,
      `maxFallSpeed is ${MAX_FALL}, at or below the ${saturationVy} px/frame at which landing dust ` +
        `saturates. The clamp is no longer inert, so the absolute-vy literals in this file are ` +
        `measuring the clamp instead of the ramp.`,
    ).toBeGreaterThan(saturationVy);

    // Non-vacuity: the clamp has to be a real clamp, or the assertion above guards nothing.
    expect(landingDust(MAX_FALL * 2, 0, 0, MAX_FALL)?.count).toBe(
      landingDust(MAX_FALL, 0, 0, MAX_FALL)?.count,
    );
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

  it('pins the core/tail split, so neither side can collapse to nothing', () => {
    // The brief's reason for two bursts is a hot core and a warmer tail. With `Burst` carrying no
    // lifespan or colour field, `count` and `angleDeg` are the ONLY things that distinguish them —
    // so an unpinned split lets `SPARK_CORE_SHARE` drift to 1.0 and hand back an empty tail while
    // the totals, the kinds, the angles and the cap all still pass.
    expect(impactSparks(0, 0, 1, 'light').map((b) => b.count)).toEqual([6, 4]);
    expect(impactSparks(0, 0, 1, 'lethal').map((b) => b.count)).toEqual([11, 7]);
    expect(impactSparks(0, 0, 1, 'playerHurt').map((b) => b.count)).toEqual([8, 4]);
  });

  it('pins the playerHurt total and cone, which light and lethal alone leave open', () => {
    expect(impactSparks(0, 0, 1, 'playerHurt').reduce((sum, b) => sum + b.count, 0)).toBe(12);
    expect(SPARK_CONE_DEG.playerHurt).toBe(50);
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
    // 🔴 BOTH sides pinned as literals. `a < b` is not a gate unless both are known non-zero —
    // dropping `HURT_VENT_COUNT` to 0 makes this comparison pass *harder* while the player takes
    // damage in complete silence.
    expect(hurtVent(0, 0, 1).count).toBe(6);
    expect(deathSteam(0, 0).count).toBe(14);
    expect(hurtVent(0, 0, 1).count).toBeLessThan(deathSteam(0, 0).count);
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
