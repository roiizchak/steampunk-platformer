/**
 * The claim behind removing every `run:` wait from `tests/e2e/` — as a test that cannot flake.
 *
 * ## Why this is a unit test and not an e2e one
 *
 * The defect is *"this wait is satisfiable only out of the opening burst, so on a loaded box it is
 * never satisfiable at all and spends its whole 60 s timeout"*. Reproducing that **as an e2e run**
 * needs a loaded box, which is the definition of a flaky proof: it passed in isolation minutes after
 * it failed in a sweep, three separate times. So the proof is driven from the **measured gap
 * profile** instead — the numbers `polishSeries.ts` recorded with a per-frame probe on 2026-08-22 —
 * and it is deterministic.
 *
 * ⚠️ **This does not replace running the specs.** It pins the *reasoning*; the e2e sweep is still
 * what says the specs pass. What it buys is that if someone re-adds a `run` wait, or "fixes" the
 * profile numbers, a fast test says so instead of a 60 s timeout three weeks later.
 *
 * ## The predicate is duplicated here, and that is a real narrowing
 *
 * `waitFor` evaluates its condition **inside the page**: `page.waitForFunction` serialises its
 * argument, so it cannot close over an import. The predicate below is therefore a COPY of the one
 * in `polishSeries.ts`, and two definitions that agree today can drift — the exact shape this
 * project warns about elsewhere. It is accepted here because the copy is nine lines, is asserted
 * against the same `WaitSpec` type, and covers only the two kinds this file reasons about. **If a
 * third kind needs proving, extract the predicate to a string and `new Function` it in the page
 * rather than growing this copy.**
 */

import { describe, expect, it } from 'vitest';
import type { WaitSpec } from '../e2e/polishSeries';

/** The shape `installRecorder` produces, cut down to what these two predicates read. */
interface Sample {
  tick: number;
  grounded: boolean;
}

/**
 * The harness's own tick delivery, measured 2026-08-22 with a per-frame probe under SwiftShader:
 * **1 tick per frame for about the first second, then 3-4 ticks per frame indefinitely** (~18 fps).
 *
 * `burstFrames` is the opening run of 1-tick frames. On a loaded box it shrinks — that is the whole
 * failure mode — so the tests below take it as a parameter rather than a constant.
 */
function profile(burstFrames: number, steadyFrames: number, step = 3): Sample[] {
  const out: Sample[] = [];
  let tick = 0;
  for (let f = 0; f < burstFrames; f += 1) {
    tick += 1;
    out.push({ tick, grounded: tick > 4 });
  }
  for (let f = 0; f < steadyFrames; f += 1) {
    tick += step;
    out.push({ tick, grounded: true });
  }
  return out;
}

/** A copy of `waitFor`'s predicate for the two kinds this file reasons about. See the header. */
function satisfied(rec: Sample[], spec: WaitSpec): boolean {
  if (rec.length < 2) return false;
  if (spec.kind === 'grounded') return rec.some((r) => r.grounded);
  let run = 1;
  for (let i = 1; i < rec.length; i += 1) {
    run = rec[i]!.tick === rec[i - 1]!.tick + 1 ? run + 1 : 1;
    if (spec.kind === 'run' && run >= spec.n) return true;
  }
  return spec.kind === 'run' ? run >= spec.n : false;
}

describe('the run: waits depended on the opening burst — the reason all three were removed', () => {
  it('the fixture is honest: the steady phase really does deliver 3-4 ticks a frame', () => {
    // A profile that quietly produced contiguous ticks would make every assertion below vacuous.
    const steady = profile(0, 20).map((s) => s.tick);
    const gaps = steady.slice(1).map((t, i) => t - steady[i]!);
    expect([...new Set(gaps)], 'the steady phase must have NO 1-tick gaps').toEqual([3]);
  });

  it('run: 8 and run: 12 are satisfiable ONLY out of the opening burst', () => {
    // A long burst — an idle machine — satisfies both. This is why they pass in isolation.
    expect(satisfied(profile(20, 40), { kind: 'run', n: 8 })).toBe(true);
    expect(satisfied(profile(20, 40), { kind: 'run', n: 12 })).toBe(true);
  });

  it('🔴 a LOADED box shortens the burst, and then neither is EVER satisfiable', () => {
    // The failure, deterministically. Six 1-tick frames, then steady: `run: 8` can never be met,
    // no matter how long the test waits — it spends the whole 60 s RUN_TIMEOUT and reports
    // "No usable hit in 61 ticks". Adding samples does not help; that is the point.
    const loaded = profile(6, 500);
    expect(satisfied(loaded, { kind: 'run', n: 8 }), 'run: 8 must be unsatisfiable').toBe(false);
    expect(satisfied(loaded, { kind: 'run', n: 12 }), 'run: 12 must be unsatisfiable').toBe(false);
    // And it is not a matter of waiting longer.
    expect(satisfied(profile(6, 5000), { kind: 'run', n: 8 })).toBe(false);
  });

  it('run: 12 is worse than run: 8 — it needs a burst twice as long', () => {
    // `phase-09-draw.spec.ts` asked for the larger of the two, which is why it was the most exposed.
    expect(satisfied(profile(9, 100), { kind: 'run', n: 8 })).toBe(true);
    expect(satisfied(profile(9, 100), { kind: 'run', n: 12 })).toBe(false);
  });

  it('grounded IS satisfiable on the loaded profile — the replacement, proved on the failing input', () => {
    // 🔴 Both directions on the SAME input that kills `run`. A replacement that only works on the
    // easy profile would be the original defect with a new name.
    expect(satisfied(profile(6, 500), { kind: 'grounded', n: 0 })).toBe(true);
    expect(satisfied(profile(0, 500), { kind: 'grounded', n: 0 })).toBe(true);
  });

  it('grounded does NOT resolve while the player is still falling — it can go red', () => {
    // The spawn state is `grounded: false, state: 'fall'`. A predicate that returned true anyway
    // would license the Jump press this wait exists to hold back, and the `land` that follows could
    // then select the SPAWN touchdown — a landing with no jump and none of the burst under test.
    const airborne = [
      { tick: 1, grounded: false },
      { tick: 2, grounded: false },
      { tick: 5, grounded: false },
    ];
    expect(satisfied(airborne, { kind: 'grounded', n: 0 })).toBe(false);
  });

  it('a SAMPLE COUNT would have resolved on the airborne series — why that was rejected', () => {
    // The first draft of this repair replaced `run` with "n samples recorded, gaps allowed". It is
    // satisfied by the series above, in which the player cannot jump: a sleep in a positive
    // condition's clothing. Committed as evidence rather than described in a commit message.
    const airborne = [
      { tick: 1, grounded: false },
      { tick: 2, grounded: false },
      { tick: 5, grounded: false },
    ];
    expect(airborne.length >= 3, 'a count-based wait would have resolved here').toBe(true);
    expect(satisfied(airborne, { kind: 'grounded', n: 0 }), 'the condition that matters does not').toBe(false);
  });
});
