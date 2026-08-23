/**
 * The lock on G6's edge-bleed exceptions.
 *
 * ## What this gate is for
 *
 * `edgeExceptions.mjs` lets two `brass-sentry` clips past G6 because what reaches the frame edge is
 * an EFFECT — a muzzle discharge and a steam plume — not the machine. That judgement was made by
 * eye at full resolution and paid for twice: two single-variable re-shoots from a larger padded
 * anchor ($2.38) failed to move either, because padding scales a subject and cannot scale an effect
 * whose purpose is to leave the scene.
 *
 * An exception like that is one keystroke away from being a rubber stamp. This file is what stops
 * it becoming one, and it goes red in **both** directions:
 *
 *  - **The art gets fixed / a new round is adopted** → the pinned `file` no longer matches the
 *    declared winner, and `every entry pins the clip that was actually examined` fails. Nobody has
 *    looked at the new round, so it must not inherit the old round's waiver.
 *  - **The exception is widened** → the pure-function tests below fail, because they assert the
 *    refusals, not only the acceptances.
 *
 * No G6 threshold was touched to make this work. `DEFAULT_MIN_ALPHA` stays 255 and
 * `DEFAULT_MARGIN_PX` is untouched — the gate still measures exactly what it always measured
 * *(the standing rule: change what a gate MEASURES, never what it TOLERATES)*.
 *
 * ## Why the "does it still fail?" half is not here
 *
 * Asserting that the real clip still fails G6 needs the `.mp4` and the extracted strip, and
 * `_generated/` is gitignored — so such a test would be red on every fresh clone, which is a
 * false-red generator in the gate written to prevent false greens (finding R7). The equivalent
 * protection that survives a clone is the `file` pin: it fails the moment the examined round stops
 * being the shipped round, which is the case that actually matters.
 */

import { describe, expect, it } from 'vitest';
import { CLIP_JOBS } from '../../tools/gen/clipJobs.mjs';
import {
  ACCEPTED_EDGE_BLEED,
  acceptedEdgeBleed,
  failedEdgesOf,
} from '../../tools/gen/edgeExceptions.mjs';

/**
 * `tools/gen/*.mjs` is outside `tsconfig`'s include, so each module carries a hand-written
 * `.d.mts` — `edgeExceptions.d.mts` here. The one local alias is `CLIP_JOBS`, whose declaration is
 * broad enough that indexing it needs narrowing.
 */
const ACCEPTED = ACCEPTED_EDGE_BLEED;
const JOBS = CLIP_JOBS as unknown as Record<string, { file: string }>;

/** A `gateEdgeBleed` value object with the given margins, at G6's real 3px margin. */
function valueWith(margins: { left: number; right: number; top: number; bottom: number }) {
  return { width: 960, height: 960, bounds: null, margins, marginPx: 3 };
}

const CLEAR = valueWith({ left: 200, right: 200, top: 200, bottom: 200 });
const RIGHT_BLED = valueWith({ left: 232, right: 0, top: 278, bottom: 244 });
const TOP_BLED = valueWith({ left: 226, right: 200, top: 0, bottom: 244 });

describe('the exception table is pinned to what was actually examined', () => {
  it('is not empty — an empty table would make every test below vacuous', () => {
    expect(Object.keys(ACCEPTED).length).toBeGreaterThan(0);
  });

  /**
   * 🔴 **The load-bearing assertion.** Adopt a different round for either key and this goes red,
   * because that round has not been looked at. It is the whole reason the exception is pinned to a
   * filename rather than to a key.
   */
  it('every entry pins the clip that is actually the declared winner', () => {
    for (const [key, entry] of Object.entries(ACCEPTED)) {
      expect(JOBS[key], `${key} must be a real CLIP_JOBS record`).toBeDefined();
      expect(
        entry.file,
        `${key}: the exception was examined on "${entry.file}" but CLIP_JOBS now declares ` +
          `"${JOBS[key].file}". A new round does not inherit the old round's waiver — look at ` +
          `it, then update or delete this entry.`,
      ).toBe(JOBS[key].file);
    }
  });

  it('every entry names at least one edge and gives a written reason', () => {
    for (const [key, entry] of Object.entries(ACCEPTED)) {
      expect(entry.edges.length, `${key} must name the edges it accepts`).toBeGreaterThan(0);
      for (const edge of entry.edges) {
        expect(['left', 'right', 'top', 'bottom']).toContain(edge);
      }
      // A reason short enough to be a label is not a reason. These are read by whoever inherits the
      // decision, and "effect not subject" without the measurement is exactly what got re-litigated.
      expect(entry.reason.length, `${key}'s reason must actually explain the judgement`).toBeGreaterThan(80);
    }
  });
});

describe('acceptedEdgeBleed — the refusals matter more than the acceptances', () => {
  it('accepts the examined failure on the examined clip', () => {
    expect(acceptedEdgeBleed('brass-sentry/death', 'brass-sentry-death-r4.mp4', TOP_BLED)).toContain(
      'steam plume',
    );
  });

  it('brass-sentry/fire has NO waiver any more, and that is the point (3.10)', () => {
    // 🔴 The `fire` entry was DELETED on 2026-08-23, and this test replaces the acceptance that used
    // to live above.
    //
    // It existed because the muzzle discharge crossed the right edge. The owner reopened the ruling
    // that had produced that situation — `DISCHARGE_MARGIN` told the model to keep the flash small
    // and inside the frame, and it obeyed by *barely firing*, which is inventory 3.10. The clause
    // now asks for a flash reaching about twice the barrel's length instead.
    //
    // ⚠️ **The bigger flash still fits.** `-r6` passes G6 outright, so the waiver has nothing to
    // waive. That resolves the contradiction in the direction the ORIGINAL ruling wanted: the effect
    // is constrained, no gate threshold moved, and no exception is carried — while the discharge is
    // now visible in 5 of 6 frames instead of 1.
    //
    // A red here means someone re-added the waiver. Ask why the flash stopped fitting first.
    expect(
      acceptedEdgeBleed('brass-sentry/fire', 'brass-sentry-fire-r6.mp4', RIGHT_BLED),
      'a fire waiver is back — the clip should pass G6 on its own since -r6',
    ).toBeNull();
  });

  it('REFUSES a different round of the same clip', () => {
    // `-r5` and `-r6` are the session-10 re-shoots. Both were rejected; neither may inherit a waiver.
    expect(acceptedEdgeBleed('brass-sentry/fire', 'brass-sentry-fire-r5.mp4', RIGHT_BLED)).toBeNull();
    expect(acceptedEdgeBleed('brass-sentry/death', 'brass-sentry-death-r6.mp4', TOP_BLED)).toBeNull();
  });

  /**
   * 🔴 This is the `death-r6` case, and it is why `edges` is pinned. The re-shoot failed the RIGHT
   * edge instead of the top — same key, same kind of clip, a different defect. A key-only exception
   * would have waved it straight through.
   */
  it('REFUSES an edge nobody examined, even on the examined clip', () => {
    expect(acceptedEdgeBleed('brass-sentry/death', 'brass-sentry-death-r4.mp4', RIGHT_BLED)).toBeNull();
    expect(acceptedEdgeBleed('brass-sentry/fire', 'brass-sentry-fire-r4.mp4', TOP_BLED)).toBeNull();
  });

  it('REFUSES a frame that fails an accepted edge AND an unexamined one', () => {
    const both = valueWith({ left: 232, right: 0, top: 0, bottom: 244 });
    expect(acceptedEdgeBleed('brass-sentry/fire', 'brass-sentry-fire-r4.mp4', both)).toBeNull();
  });

  it('REFUSES a key with no entry', () => {
    expect(acceptedEdgeBleed('brass-courier/attack', 'brass-courier-attack-r3.mp4', RIGHT_BLED)).toBeNull();
  });

  it('REFUSES when nothing actually failed — an exception is not a licence', () => {
    expect(acceptedEdgeBleed('brass-sentry/fire', 'brass-sentry-fire-r4.mp4', CLEAR)).toBeNull();
  });
});

describe('failedEdgesOf derives from the margins, never from the prose', () => {
  it('reports exactly the edges under the margin', () => {
    expect(failedEdgesOf(RIGHT_BLED)).toEqual(['right']);
    expect(failedEdgesOf(TOP_BLED)).toEqual(['top']);
    expect(failedEdgesOf(CLEAR)).toEqual([]);
  });

  it('treats a margin EQUAL to the limit as passing, matching gateEdgeBleed', () => {
    expect(failedEdgesOf(valueWith({ left: 3, right: 200, top: 200, bottom: 200 }))).toEqual([]);
    expect(failedEdgesOf(valueWith({ left: 2, right: 200, top: 200, bottom: 200 }))).toEqual(['left']);
  });

  it('survives a verdict with no value — gateEdgeBleed returns null when no mask survives keying', () => {
    expect(failedEdgesOf(null)).toEqual([]);
    expect(failedEdgesOf({ margins: undefined })).toEqual([]);
  });
});
