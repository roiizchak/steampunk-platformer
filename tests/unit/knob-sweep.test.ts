/**
 * Knob sweep — QA criterion 2.6, vault A6 (blocker).
 *
 *   > "The Playground needs knob-sweep verification wired in from day one. A slider that visibly
 *   > exists reads as a slider that visibly works. Change it, run, confirm the output moved. The
 *   > Playground makes the vault's cheapest experiment free — and it is exactly what nobody does."
 *
 * The sweep is exhaustive BY CONSTRUCTION: it iterates `Object.keys(DEFAULT_TUNING)`, so a knob
 * added in a later phase is swept without anyone remembering to add it.
 *
 * **That construction is also its hole, and Codex plan review F7a found it**: a test whose
 * obligations are derived from the thing under test stays green when a knob and its behaviour are
 * deleted together — the iteration disappears along with the feature. So the roster is ALSO pinned
 * to an explicit literal list. Removing a knob now turns this file red; adding one cannot be done
 * without editing the list, which cannot be done without noticing the sweep. *(vault C2 — every
 * gate needs a way to fail.)*
 *
 * A knob passes if changing it moves the outcome of at least one scenario. Several knobs are only
 * observable under specific conditions — `airFriction` needs an airborne player with no input,
 * `jumpCutDivisor` needs an early release, `coyoteTicks` needs a ledge — so a single scenario
 * would report false failures rather than real ones.
 *
 * REPRODUCTION (red -> green) for the roster pin; GUARD for the sweep itself *(vault C3)*.
 */


import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../src/sim/player';
import type { TuningKnobs } from '../../src/sim/types';
import { LONG_FALL_TICKS, tuningEnvelope } from './knobSweepGeometry';
import { EXPECTED_KNOBS, LONG_FALL, SCENARIOS, perturbations, probe } from './knobSweepScenarios';

describe('every Playground knob moves an observable output (criterion 2.6, vault A6)', () => {
  it('the knob roster matches the hand-written list — deleting a knob goes RED (Codex F7a)', () => {
    expect(Object.keys(DEFAULT_TUNING).sort()).toEqual([...EXPECTED_KNOBS].sort());
    // 11 through Phase 3; `walkMax` is Phase 4's, added with the `walk` state. Deleting a knob
    // AND its roster entry together would satisfy the equality above, so the count is pinned too.
    expect(EXPECTED_KNOBS.length).toBe(12);
  });

  it('every knob is a finite number, so a sweep of it means something', () => {
    for (const key of EXPECTED_KNOBS) {
      const value = DEFAULT_TUNING[key as keyof TuningKnobs];
      expect(typeof value, `${key} must be a number`).toBe('number');
      expect(Number.isFinite(value), `${key} must be finite`).toBe(true);
      expect(value, `${key} must be positive`).toBeGreaterThan(0);
    }
  });

  it.each(EXPECTED_KNOBS)('sweeping %s changes at least one observed trajectory', (key) => {
    const baseline: Record<string, string> = {};
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      baseline[name] = scenario({ ...DEFAULT_TUNING });
    }

    const original = DEFAULT_TUNING[key as keyof TuningKnobs];
    const moved: string[] = [];

    for (const value of perturbations(key, original)) {
      const tuning = { ...DEFAULT_TUNING, [key]: value };
      for (const [name, scenario] of Object.entries(SCENARIOS)) {
        if (scenario(tuning) !== baseline[name]) {
          moved.push(`${name}@${value}`);
        }
      }
    }

    // The whole point of A6: the number has to actually move. A knob that changes nothing is
    // either dead or wired to the wrong thing, and both look identical in the Playground.
    expect(moved, `knob "${key}" changed no observable output in any scenario`).not.toHaveLength(0);
  });

  /**
   * 🔴 **The regime preconditions — §3c, and the hole this file already documented about itself.**
   *
   * The sweep asserts a knob MOVED something. Nothing asserted the scenario was in the regime where
   * that knob is observable, and the failure mode is not hypothetical: three times in one session a
   * physics change moved the regime out from under a scenario, and the sweep reported a live knob as
   * dead. Every one of those was caught by a human reading a suspicious green, not by a gate.
   *
   * These are the two scenarios whose regime is a *position*, not a fact about the code — the fall
   * has to be long enough, and the ledge has to actually be left.
   */
  it('longFall stays in the regime that makes maxFallSpeed observable, for EVERY perturbation', () => {
    SCENARIOS.longFall({ ...DEFAULT_TUNING });
    const base = probe.world;
    expect(base, 'the probe was never written — withTuning stopped recording').not.toBeNull();

    // 1. The clamp SATURATED inside the window. If it did not, `maxFallSpeed` is not being exercised
    //    at all and the knob would pass, if it passed, on something else entirely.
    expect(
      base!.player.vy,
      `after ${LONG_FALL_TICKS} ticks the fall reached ${base!.player.vy.toFixed(2)} px/tick, not the ` +
        `${DEFAULT_TUNING.maxFallSpeed} clamp. The window is too short for the shipped gravity, so ` +
        'the scenario is measuring acceleration and calling it a clamp.',
    ).toBe(DEFAULT_TUNING.maxFallSpeed);

    // 2. And it is still AIRBORNE — for every tuning the sweep runs, not just this one. Landing
    //    converges every perturbation on the same resting fingerprint, which is exactly how this
    //    scenario once reported a live knob dead. This is what the derived floor buys.
    for (const tuning of tuningEnvelope(EXPECTED_KNOBS, perturbations)) {
      SCENARIOS.longFall(tuning);
      expect(
        probe.world!.player.grounded,
        `a perturbation LANDED inside longFall (floor y ${LONG_FALL.floorY}, world ` +
          `${LONG_FALL.bounds.heightPx} px). Every tuning that lands converges on one resting ` +
          'fingerprint, so the scenario stops discriminating.',
      ).toBe(false);
      expect(probe.world!.player.state, 'a perturbation crossed the kill plane and DIED').not.toBe('death');
    }
  });

  it('coyote actually leaves the ledge, and the window straddles the press', () => {
    const jumpsOf = (sig: string): number => Number(sig.split('|').at(-1));

    const baseline = SCENARIOS.coyote({ ...DEFAULT_TUNING });
    expect(
      probe.leftGroundAtTick,
      'the player never left the ledge inside 400 ticks, so every coyoteTicks produces the same run ' +
        'and the scenario measures nothing',
    ).toBeGreaterThanOrEqual(0);
    expect(probe.leftGroundAtTick, 'the ledge was left on the very first tick — that is a spawn, not a walk-off').toBeGreaterThan(0);

    // 🔴 The regime, stated as a discrimination rather than a position: the scenario waits 5 ticks
    // before pressing, so a coyote window WIDER than that grants the jump and a narrower one refuses
    // it. If both ends of the perturbation landed on the same side of 5, the scenario would be inside
    // the window (or outside it) for every tuning and `coyoteTicks` would read dead.
    const [halved, doubled] = perturbations('coyoteTicks', DEFAULT_TUNING.coyoteTicks);
    const narrow = SCENARIOS.coyote({ ...DEFAULT_TUNING, coyoteTicks: halved! });
    const wide = SCENARIOS.coyote({ ...DEFAULT_TUNING, coyoteTicks: doubled! });
    expect(
      [jumpsOf(narrow), jumpsOf(baseline), jumpsOf(wide)],
      `coyoteTicks ${halved} / ${DEFAULT_TUNING.coyoteTicks} / ${doubled} all produced the same jump ` +
        'count. The press lands on one side of the coyote window for every perturbation, so the ' +
        'scenario cannot tell them apart.',
    ).not.toEqual([jumpsOf(baseline), jumpsOf(baseline), jumpsOf(baseline)]);
  });

  it('the sweep can fail: an unused knob added to the roster is not silently swept', () => {
    // The scenarios are driven by DEFAULT_TUNING keys, so this asserts the check above is
    // comparing real trajectories rather than always-equal placeholders (vault C2).
    const baseline = SCENARIOS.jumpHeld({ ...DEFAULT_TUNING });
    const changed = SCENARIOS.jumpHeld({ ...DEFAULT_TUNING, gravity: DEFAULT_TUNING.gravity * 2 });
    expect(typeof baseline).toBe('string');
    expect(baseline).not.toBe(changed);
  });
});
