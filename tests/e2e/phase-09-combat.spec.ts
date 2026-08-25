/**
 * Phase 9 debt §1a — the combat path, measured. **There is deliberately NO frame-cost bound here,
 * and the reason is the whole point of the file.**
 *
 * ## What §1a asked for
 *
 * Criterion 9.5's amended sentence names the worst **steady-state** frame. Entry 43 of
 * `docs/qa/phase-09-polish.md` records why it cannot name a combat one: `installStorm` pins
 * `player.iFrameCounter = 0` on every frame of every arm, so no hit ever lands, so the measured frame
 * carries no hurt state, no hit-stop, no knockback and none of `gameEffects`' own trigger paths.
 * §1a was the debt to measure that frame.
 *
 * ## What five probe runs found, and why no bound shipped
 *
 * Full evidence in `docs/qa/session-phase-09-debts-02-perf.md` §Batch 7. Three findings, each
 * measured rather than argued:
 *
 * 1. 🔴 **The shipped emitter caps bound a combat burst at 32 sparks / ~85 particles.** An 8x
 *    spark-burst mutation planted in `src/scenes/gameEffects.ts` left the spark peak at **32 and the
 *    total at 85 — both unchanged** — because `atLimit()` drops the surplus. The combat path cannot
 *    be made to cost more from inside the game.
 * 2. 🔴 **At that population the cost is under the clock grid.** 8192 particles cost 4.1 ms on this
 *    GPU (`phase-09-perf.spec.ts`), so 85 cost ~0.04 ms — below `performance.now()`'s 0.1 ms step.
 *    The per-event median delta measured **-0.0000 / 0.0000 / 0.2000 ms** across three clean runs and
 *    **0.0000 ms** under the 8x mutation: **the statistic does not move at all.** It cannot order its
 *    own mutation, so under this project's rules it would have to be replaced rather than re-bounded.
 * 3. 🔴 **The worst combat frame is 22-39 ms and is NOT the burst.** Two to three orders of magnitude
 *    above anything 85 particles can cost, so a bound on them would be a bound on something else
 *    wearing a burst's name.
 *    ⚠️ **This entry used to attribute those spikes to "the sim's post-hit-stop tick catch-up
 *    draining through `frameClock`'s `MAX_TICKS_PER_FRAME`". That attribution was REFUTED by
 *    measurement on 2026-08-25** — see `docs/qa/session-tier5-gate-holes-02-tweens.md` §Batch 6.
 *    Across three runs and 12 625 frames, **no frame ever drained more than one sim tick**, and every
 *    one of the worst frames (55.5 / 46.0 / 37.3 / 31.5 / 28.3 / 26.1 ms) drained `ticks=1` or
 *    `ticks=0` — the same simulation work as the frames costing a fraction of a millisecond. Phaser
 *    smooths and caps `delta` over a 10-frame moving average before `GameScene.update()` sees it
 *    (`phaser.d.ts:6840-6845`, `:6866`), so the backlog `MAX_TICKS_PER_FRAME` guards against cannot
 *    build. **What those frames actually are is still unidentified** — 0.15 % of frames, in both
 *    phases, the worst one in REST.
 *
 * The project's own rule is that *a statistic which cannot order its own mutation is REPLACED, not
 * re-bounded*. There is nothing to replace it with: the only amplifier available is a storm, and a
 * storm is what entry 43 records destroying admission ordering in the first place. **So this file
 * asserts the premises that ARE measurable and states, in the open, that the cost claim is not.**
 *
 * ## What it does assert
 *
 * That the combat path still fires and is still drawn. That is a real regression guard — it goes red
 * if hits stop landing, if a burst stops being admitted, or if the driver stops connecting — and it
 * makes no claim about milliseconds.
 */

import { expect, test } from '@playwright/test';
import { FIGHT_TICKS, REST_TICKS, startPhasedCombat } from './combatDrive';
import { combatEvents, recordCombat } from './combatFrames';
import { reduceCombat } from './combatReduce';
import { particleCounts, spawnWorstCaseFleet } from './effectCounts';
import { bootToGame } from './gameHarness';
import { assertRealGpu } from './realGpu';

/** Sim ticks recorded. Twelve full fight/rest cycles at `FIGHT_TICKS + REST_TICKS`. */
const RECORD_TICKS = 1200;

/**
 * The fewest OBSERVED combat moments a run may produce and still be a measurement.
 *
 * ⚠️ Observed, not landed: several hits inside one animation frame collapse into one observation, so
 * this is a floor under an undercount. That is what makes it safe as a floor and useless as a count —
 * see `combatEvents` in `combatFrames.ts`.
 *
 * Three runs after the i-frame polarity repair (see `combatDrive.ts`) returned **15, 18, 20 and 22
 * raw** events over 1200 ticks — lower than the 44-55 the pre-repair probes saw, which is the repair
 * working: REST is genuinely quiet now, so hits only land during FIGHT. Ten is under two thirds of
 * the lowest of those — a floor against *"the driver stopped connecting"*, not a bound fitted to an
 * observation. ⚠️ It is deliberately not tightened toward 15: this gate must not go red because a
 * loaded box drained fewer ticks.
 */
const MIN_EVENTS = 10;

test.describe('Phase 9 — debt 1a, the combat path fires and is drawn', () => {
  test('a real fight lands hits, admits bursts and draws them', async ({ page }) => {
    test.setTimeout(300_000);

    await bootToGame(page);
    const renderer = await assertRealGpu(page, '1a');
    console.log(`[1a] renderer ${renderer}`);
    await spawnWorstCaseFleet(page);
    await startPhasedCombat(page, FIGHT_TICKS, REST_TICKS);

    const frames = await recordCombat(page, RECORD_TICKS);
    const raw = combatEvents(frames, true);
    const events = combatEvents(frames);
    const reading = reduceCombat(frames, events);
    const kinds = (k: string): number => raw.filter((e) => e.kind === k).length;

    for (const line of reading.table) console.log(line);
    console.log(
      `[1a] observed combat moments ${raw.length} (light ${kinds('light')}, lethal ${kinds('lethal')}, ` +
        `playerHurt ${kinds('playerHurt')}) clustered to ${events.length}`,
    );
    console.log(
      `[1a] NO BOUND ASSERTED. per-event median delta ${reading.medianOfMedianDeltas.toFixed(4)} ms, ` +
        `per-event max delta ${reading.medianDelta.toFixed(4)} ms, worst combat frame ` +
        `${reading.worstCombatFrame.toFixed(3)} ms, control ${reading.farMedian.toFixed(3)} ms — see ` +
        "this file's header for why none of these is a gate.",
    );

    // ── The premises, in the order they can fail ───────────────────────────────────────────────

    // 🔴 Type before value. A recorder that returned `undefined` would satisfy a numeric comparison
    // by coercion and report a clean run.
    expect(Array.isArray(frames), 'the recorder returned no array').toBe(true);
    expect(frames.length, 'no frames were recorded at all').toBeGreaterThan(100);

    // The fight happened. Not "a hit was possible" — hits LANDED, counted from the sim's own stamps.
    expect(
      raw.length,
      `${frames.length} frames of driven combat produced only ${raw.length} OBSERVED combat moments ` +
        '(a floor, not a count — see `combatEvents`: several hits inside one animation frame collapse ' +
        'into one observation). The driver ' +
        'stopped connecting, or the fixture stopped spawning — either way nothing below measures ' +
        'the combat path.',
    ).toBeGreaterThanOrEqual(MIN_EVENTS);

    // ⚠️ **TWO classes, not three, and that is a recorded narrowing.** `light` — an enemy hit that
    // neither kills nor coincides with the player being clawed — occurred 0 times in the clean probe
    // and 3 times under the mutation, because a scavenger's claw calls
    // `freezePair(player, scavenger, 'playerHurt', …)` and so moves BOTH stamps on the same tick
    // (`gameEffects.ts` says so at the line). Requiring three classes would make this gate flaky for
    // a reason that has nothing to do with the game. `lethal` and `playerHurt` are both reliable.
    expect(kinds('lethal'), 'no enemy died — the player never landed a killing blow').toBeGreaterThan(0);
    expect(kinds('playerHurt'), 'the player was never hurt — the fleet never reached them').toBeGreaterThan(0);

    // 🔴 The emitter this premise reads must EXIST. `recordCombat` leaves `sparks` at -1 when no
    // emitter is keyed `'sparks'`, so a rename cannot quietly turn the assertion below into a
    // permanent red that reads like the defect.
    expect(
      Math.max(...frames.map((f) => f.sparks)),
      "no emitter is keyed 'sparks' — EffectKind was renamed and this gate is measuring nothing",
    ).toBeGreaterThanOrEqual(0);

    // 🔴 **Admitted AND drawn.** A burst of zero particles satisfies every assertion about itself.
    // `peakAliveNear` is admission, read off the shipped emitters inside a hit's own window; the
    // `particleCounts` read in the second test is the drawn half, through `willRender`.
    expect(
      reading.peakSparksNear,
      "not one SPARK was alive inside any landed hit's window — the impact bursts were DROPPED, " +
        'which is the "burst of zero particles" defect this project names. ⚠️ It is the SPARK count ' +
        'and not the three-emitter total on purpose: `combatDrive` hops continuously, so landing ' +
        'dust keeps the total above zero even when no combat burst fires at all.',
    ).toBeGreaterThan(0);

    // And the control really is a control: rest frames, past every hit, in quantity.
    expect(reading.farFrames, 'the control collapsed into the effect').toBeGreaterThan(100);
  });

  test('the emitters the fight drew are the SHIPPED ones, and they render', async ({ page }) => {
    test.setTimeout(120_000);
    await bootToGame(page);
    await assertRealGpu(page, '1a');
    await spawnWorstCaseFleet(page);
    await startPhasedCombat(page, FIGHT_TICKS, REST_TICKS);
    await recordCombat(page, 240);

    // 🔴 **Retry until the sample lands in a FIGHT phase — this test was INTERMITTENT without it.**
    // `combatDrive` alternates 40 fight / 60 rest ticks, and a snapshot taken after a fixed tick count
    // can land anywhere in that cycle. Observed 2026-08-25: one run read `alive 0` mid-REST and went
    // red while the identical next run read 60. A gate that fails on the phase of the moon gets
    // deleted, so the wait is on the CONDITION (particles are up) rather than on a duration — and it
    // is bounded, so "the fight stopped producing particles" is still loud.
    let counts = await particleCounts(page);
    for (let attempt = 0; counts.alive === 0 && attempt < 12; attempt += 1) {
      await recordCombat(page, 20);
      counts = await particleCounts(page);
    }

    // ⚠️ **This one is AGGREGATE, and it passed the impact-burst mutation.** `particleCounts` returns
    // one total across the three emitters, so the landing dust `combatDrive` produces continuously
    // satisfies it even with every combat burst dropped — verified 2026-08-24, this test stayed green
    // while the test above went red. That is correct for the claim in its own title (*the emitters
    // render*) and it is stated here so nobody reads it as a second combat guard. The combat-specific
    // admission premise is the SPARK count in the test above.
    //
    // Read through `EffectAttachment.emitters()` — the handle the scene publishes — never a duplicate
    // built by the test. A fixture that re-implements the thing it measures proves nothing about the
    // shipped code.
    console.log(`[1a] drawn ${counts.drawn} of ${counts.alive} alive, in camera list ${counts.inCameraList}`);
    expect(typeof counts.alive, 'particleCounts returned a non-number').toBe('number');
    expect(counts.alive, 'the fight produced no live particles').toBeGreaterThan(0);
    expect(counts.drawn, 'particles were alive and NONE was drawn').toBeGreaterThan(0);
  });
});
