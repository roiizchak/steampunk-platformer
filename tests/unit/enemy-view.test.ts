/**
 * Enemy animation keys and frame rates — criteria 5.4 and 5.4d, decided in engine-free code
 * *(vault 2.12)*.
 *
 * The health-bar half of this file (criterion 5.7) moved to `enemy-health-bar.test.ts` on
 * 2026-08-14, when this file crossed the 400-line rule. The two halves share no fixture; the seam
 * is the criterion boundary.
 */

import { describe, expect, it } from 'vitest';

import { enemyAnimTimings } from '../../src/render/animTiming';
import { SENTRY_FIRE_TICKS, enemyAnimKeys, scavengerAnim, sentryAnim } from '../../src/render/enemyView';
import { createScavenger, createSentry, scavengerFooting, stepScavenger } from '../../src/sim/enemies';

describe('enemy animation keys come from sim state (criterion 5.4, guard G2)', () => {
  it('the sentry plays fire only inside the window after a shot, then returns to idle', () => {
    const sentry = createSentry({ x: 0, y: 0 });
    sentry.cooldownCounter = 0; // just fired
    expect(sentryAnim(sentry)).toBe('fire');

    sentry.cooldownCounter = SENTRY_FIRE_TICKS - 1;
    expect(sentryAnim(sentry)).toBe('fire');

    sentry.cooldownCounter = SENTRY_FIRE_TICKS;
    expect(sentryAnim(sentry)).toBe('idle');

    sentry.hp = 0;
    expect(sentryAnim(sentry)).toBe('death');
  });

  it('the scavenger walks while patrolling and chases while committed', () => {
    const scavenger = createScavenger({ x: 0, y: 0, patrolMin: -100, patrolMax: 100 });
    expect(scavengerAnim(scavenger)).toBe('walk');

    scavenger.chasing = true;
    expect(scavengerAnim(scavenger)).toBe('chase');

    scavenger.hp = 0;
    expect(scavengerAnim(scavenger)).toBe('death');
  });

  /**
   * Death outranks everything. A corpse still playing `chase` is the frame-0 bug's cousin: the
   * animation and the state disagree, and only one of them is on screen.
   */
  it('death wins over every other state', () => {
    const scavenger = createScavenger({ x: 0, y: 0, patrolMin: -100, patrolMax: 100 });
    scavenger.chasing = true;
    scavenger.hp = 0;
    expect(scavengerAnim(scavenger)).toBe('death');
  });

  /**
   * 🔴 The animation follows the MOTION, not the intent — criterion 5.3, gate finding B3.
   *
   * These drive the REAL `stepScavenger` rather than setting `moving` by hand, because the claim
   * under test is not *"`scavengerAnim` reads a boolean"* — it is *"the boolean is true exactly when
   * the body travelled"*. Setting the field directly would pass against an implementation that never
   * writes it, which is the whole defect: `chase` played over zero travel, violating the foot-plant
   * invariant by 17.5 px a frame, and permanent aggro means it never ends.
   *
   * `EVERYWHERE_HERE` is ground under everything; `NO_GROUND_AHEAD` is a single platform the
   * scavenger stands on whose right edge it cannot step past — the ledge probe's veto.
   */
  describe('a scavenger that cannot move plays idle, not its gait', () => {
    const EVERYWHERE_HERE = scavengerFooting([{ x: -1e6, y: -1e6, w: 2e6, h: 2e6 }], 6);

    it('holds idle inside the dead zone, where it deliberately does not close', () => {
      const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
      s.chasing = true;
      // Strictly inside `deadZone` (96), so the movement block is skipped entirely.
      stepScavenger(s, { playerX: 40, playerY: 0 }, EVERYWHERE_HERE);
      expect(s.x, 'the dead zone means it did not travel').toBe(0);
      expect(scavengerAnim(s)).toBe('idle');
    });

    it('holds idle when the ledge probe vetoes the step', () => {
      // One platform. The scavenger stands at its right edge; the leading edge of the next step is
      // over the void, so `groundUnder` refuses it.
      const footing = scavengerFooting([{ x: -500, y: 10, w: 500, h: 100 }], 6);
      const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
      s.chasing = true;
      stepScavenger(s, { playerX: 5000, playerY: 0 }, footing);
      expect(s.x, 'the ledge veto means it did not travel').toBe(0);
      expect(scavengerAnim(s)).toBe('idle');
      expect(s.facing, 'but it still LOOKS at the player it cannot reach').toBe(1);
    });

    it('plays chase when it is genuinely closing', () => {
      const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
      s.chasing = true;
      stepScavenger(s, { playerX: 5000, playerY: 0 }, EVERYWHERE_HERE);
      expect(s.x).toBeGreaterThan(0);
      expect(scavengerAnim(s)).toBe('chase');
    });

    it('plays walk while actually patrolling', () => {
      const s = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
      stepScavenger(s, { playerX: 99999, playerY: 0 }, EVERYWHERE_HERE);
      expect(s.x).not.toBe(0);
      expect(scavengerAnim(s)).toBe('walk');
    });

    /**
     * The path nobody enumerated. A patrol pinned to a single point covers zero px per tick and is
     * not a chase, so neither veto describes it — which is exactly why `moving` is derived by
     * comparing `x` rather than written at each site that declines to move.
     */
    it('plays idle when its patrol bounds pin it to one spot', () => {
      const s = createScavenger({ x: 50, y: 0, patrolMin: 50, patrolMax: 50 });
      stepScavenger(s, { playerX: 99999, playerY: 0 }, EVERYWHERE_HERE);
      expect(s.x).toBe(50);
      expect(scavengerAnim(s)).toBe('idle');
    });

    it('death still outranks a stalled body', () => {
      const s = createScavenger({ x: 0, y: 0, patrolMin: 0, patrolMax: 0 });
      stepScavenger(s, { playerX: 99999, playerY: 0 }, EVERYWHERE_HERE);
      s.hp = 0;
      expect(scavengerAnim(s)).toBe('death');
    });
  });

  it('no key is declared twice — a repeat means two subjects fighting over one animation', () => {
    const keys = enemyAnimKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * 🔴 **Every key a subject can ask for IS declared — enumerated, not spot-checked.**
   *
   * ⚠️ This test used to be named exactly that and did not check it. It asserted
   * `toContain('brass-sentry-fire')` and `toContain('rust-scavenger-chase')` and rejected
   * duplicates — so when `scavengerAnim` gained `'idle'`, `rust-scavenger-idle` became askable while
   * undeclared and **nothing went red**. A name that states the behaviour over a body that checks
   * something adjacent: the shape this project keeps paying for, in the test written to prevent it.
   *
   * It is enumerated now. `askableKeys()` drives the REAL selector functions over states the sim can
   * actually reach, and the difference against `enemyAnimKeys()` must equal `PENDING_ART` exactly.
   * That covers both enemies, so a future undeclared **sentry** key fails here too — which the
   * previous single-key lock would have missed.
   *
   * ## `PENDING_ART` is now EMPTY, and the machinery is kept anyway
   *
   * It held `rust-scavenger-idle` for exactly as long as that sheet was unbought. The sim state
   * landed first, at $0, so it could be reviewed before the money moved; the art landed 2026-08-14
   * (`request_id 01a003ac-ba90-7fd1-acf6-ec8e8c32a81d`) and the key is declared, so the list is
   * empty.
   *
   * **Emptying it is the point.** While it was non-empty this test asserted a known gap on purpose;
   * empty, the first assertion below becomes strictly stronger — NO askable key may be undeclared,
   * at all.
   *
   * The list is kept rather than inlined as `[]` for the same reason `BLOCKED_ON_ART` is kept in
   * `blockedDwell.ts`: the next action bought ahead of its sheet needs this machinery, and
   * rebuilding it from scratch is how the both-directions property gets lost.
   *
   * Both directions, so it cannot rot: red if a key becomes askable without being listed here, and
   * red if a listed key is declared without being removed from the list.
   */
  const PENDING_ART: readonly string[] = [];

  /** Every key the REAL selectors can return, over states the sim can actually reach. */
  function askableKeys(): string[] {
    const everywhere = scavengerFooting([{ x: -1e6, y: -1e6, w: 2e6, h: 2e6 }], 6);

    const patrolling = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
    stepScavenger(patrolling, { playerX: 99999, playerY: 0 }, everywhere);

    const chasing = createScavenger({ x: 0, y: 0, patrolMin: -1000, patrolMax: 1000 });
    chasing.chasing = true;
    stepScavenger(chasing, { playerX: 5000, playerY: 0 }, everywhere);

    const stalled = createScavenger({ x: 0, y: 0, patrolMin: 0, patrolMax: 0 });
    stepScavenger(stalled, { playerX: 99999, playerY: 0 }, everywhere);

    const deadScavenger = createScavenger({ x: 0, y: 0, patrolMin: -100, patrolMax: 100 });
    deadScavenger.hp = 0;

    const firing = createSentry({ x: 0, y: 0 });
    firing.cooldownCounter = 0;
    const waiting = createSentry({ x: 0, y: 0 });
    waiting.cooldownCounter = waiting.cooldown;
    const deadSentry = createSentry({ x: 0, y: 0 });
    deadSentry.hp = 0;

    return [
      ...[patrolling, chasing, stalled, deadScavenger].map((s) => `rust-scavenger-${scavengerAnim(s)}`),
      ...[firing, waiting, deadSentry].map((s) => `brass-sentry-${sentryAnim(s)}`),
    ];
  }

  it('every key a subject can ask for is declared, except the art not yet bought', () => {
    const askable = [...new Set(askableKeys())].sort();
    const declared = new Set(enemyAnimKeys());

    // Non-vacuity: the fixtures must actually reach every state, or "nothing undeclared" is trivial.
    expect(askable.length, 'the fixtures stopped reaching some states').toBe(7);

    const undeclared = askable.filter((k) => !declared.has(k));
    expect(undeclared, 'a key became askable without being declared or listed as pending art').toEqual(
      [...PENDING_ART].sort(),
    );
  });

  it('nothing listed as pending art is already declared — empty the list when the sheet lands', () => {
    const declared = new Set(enemyAnimKeys());
    const alreadyThere = PENDING_ART.filter((k) => declared.has(k));
    expect(alreadyThere, 'the art landed — remove it from PENDING_ART').toEqual([]);
  });
});

/**
 * Guard **G2** extended to the enemies — criterion 5.4d, before a single enemy sheet exists.
 *
 * Codex C4 on 5.4d: *"reacting to a changed input proves the algebra runs, not that it is right."*
 * So both halves are here — a hand-computed expected value, AND the non-vacuity check that a
 * different `simTicks` yields a different fps.
 */
describe('enemy frame rates are derived, never authored (5.4d, guard G2)', () => {
  /**
   * The shipped cadences (`character-bounds-rust-scavenger.json`), in FPS.
   *
   * ⚠️ This fixture was `{ walk: 60, chase: 96 }` and named `strides` — left over from when these
   * rows divided a measured stride by a speed. Read as a cadence those are 60 and 96 FPS, which both
   * quantise to one tick per frame, so `chase.simTicks < walk.simTicks` was comparing 8 against 8
   * and the suite only noticed once `cadenceTicks` started rounding. A stale fixture under a stale
   * name passed for a whole session; the values below are the ones the game actually ships.
   */
  const cadence = { walk: 18, chase: 30 };

  it('matches a fps computed by hand from the sim durations', () => {
    const rows = enemyAnimTimings('brass-sentry', { idle: 6, fire: 4, death: 9 }, cadence);
    const fire = rows.find((row) => row.name === 'fire')!;

    // 4 frames over SENTRY_FIRE_TICKS ticks at 60 Hz. Written out rather than recomputed with the
    // production formula, which would agree with itself whatever it did (vault C2).
    expect(fire.simTicks).toBe(SENTRY_FIRE_TICKS);
    expect(fire.fps).toBeCloseTo((4 * 60) / 18, 9);
    expect(fire.derivedFrom).toBe('sim');
  });

  it('keeps chase quicker than the patrol, on its own cadence rather than a reused one', () => {
    const rows = enemyAnimTimings('rust-scavenger', { walk: 8, chase: 8, death: 9 }, cadence);
    const walk = rows.find((row) => row.name === 'walk')!;
    const chase = rows.find((row) => row.name === 'chase')!;

    // Same frame count, quicker cadence — so a chase cycle MUST be shorter in ticks and faster in
    // fps. Reusing walk's number is exactly how a sprint ends up flip-booking at walking pace, and
    // it is a live hazard now that cadences QUANTISE: an authored 24 rounds to the same 3 ticks per
    // frame as an authored 18, which is why the shipped chase is 30 and not 24.
    expect(chase.simTicks).toBeLessThan(walk.simTicks);
    expect(chase.fps).toBeGreaterThan(walk.fps);
  });

  it('every drawn frame is held for a whole number of ticks, so playback cannot judder', () => {
    // The session-9 defect: a cycle that does not divide by its frame count is served as a mix of
    // long and short frames, and that hitch is what the user reported as ghosting. Asserted here on
    // the enemies too, because `loop-dwell.test.ts` reads the CATALOG and an enemy sheet that is not
    // packed yet would never reach it.
    const rows = enemyAnimTimings('rust-scavenger', { walk: 12, chase: 12, death: 10 }, cadence);
    for (const name of ['walk', 'chase'] as const) {
      const row = rows.find((r) => r.name === name)!;
      expect(Number.isInteger(row.simTicks / row.renderFrames), `${name} judders`).toBe(true);
    }
  });

  it('a different cadence yields a different fps — the derivation is not decorative', () => {
    const base = enemyAnimTimings('rust-scavenger', { walk: 8, chase: 8, death: 9 }, cadence);
    const slower = enemyAnimTimings('rust-scavenger', { walk: 8, chase: 8, death: 9 }, { walk: 10, chase: 30 });

    const before = base.find((row) => row.name === 'walk')!.fps;
    const after = slower.find((row) => row.name === 'walk')!.fps;
    expect(after).not.toBe(before);
    // Directional, not just different: quantisation means a small nudge can round to the same tick
    // count, so a bare `not.toBe` would pass on a helper that ignored its input in one direction.
    expect(after).toBeLessThan(before);
  });

  it('refuses to invent a frame count for a sheet that has not been built', () => {
    expect(() => enemyAnimTimings('brass-sentry', { idle: 6, fire: 4 }, cadence)).toThrow(/death/);
  });
});
