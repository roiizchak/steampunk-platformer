/**
 * The animations whose even-dwell fix is known and blocked on the ART, shared by the two files that
 * gate dwell from opposite ends.
 *
 * `loop-dwell.test.ts` checks the shipped catalog; `one-shot-divisor.test.ts` checks the declared
 * frame count before anything is extracted. Both have to skip the same row, and both assert that
 * this list is exactly the set of rows that fail — so the skip cannot quietly widen. It lives here
 * rather than in either file because two copies of one exception is where the exception survives
 * its own reason *(vault 5.3)*.
 *
 * Not a `*.test.ts`, so vitest does not collect it.
 *
 * ## The one entry
 *
 * `brass-courier/fall` needs **9** frames to divide its 18-tick rise at 2 refreshes each. Getting
 * them means re-extracting, and re-extraction runs G6 on the source clip, where **frames 0-4 of
 * `_generated/video/fall.mp4` fail on the left, right and top edges** — frame 0 measures
 * `left 0, right 0, top 0, bottom 76`, with contiguous edge runs of 138, 60 and 50 px.
 * `windowIndices` starts every sampling at the measured motion onset, so frame 0 is the same source
 * frame whether 6, 8 or 9 frames are asked for, and all three fail identically.
 *
 * ⚠️ **Which means the sheet that ships today never passed G6 either.** `build-clips.mjs:300-301`
 * writes the strip and gates it afterwards, so a failing extraction leaves a usable strip on disk
 * that `assets:build` will pack. Regenerating the 8-cell strip reproduces `fall.png` byte for byte
 * against `HEAD`, which is how that path was confirmed rather than guessed.
 *
 * The unblock is a decision about the clip — a keying tolerance, an `ACCEPTED_EDGE_BLEED` entry
 * with a reason someone can state, or a re-shoot — and every one of those is a STOP-and-ask. Full
 * measurement in `docs/qa/phase-05-combat.md`.
 *
 * 🔴 This is **not** the `KNOWN_UNEVEN_ONE_SHOTS` list `loop-dwell.test.ts` used to carry. That one
 * said the fix was impossible, on the belief that a one-shot's frame count is not ours to choose;
 * it is, and four other rows were fixed by choosing it. This one names the fix, names what is
 * standing in front of it, and is asserted in both directions.
 */
export const BLOCKED_ON_ART: Record<string, { slug: string; action: string; ticksPerFrame: number; wants: number }> = {
  'brass-courier-fall': { slug: 'brass-courier', action: 'fall', ticksPerFrame: 2.25, wants: 9 },
};
