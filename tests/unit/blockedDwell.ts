/**
 * The animations whose even-dwell fix is known and blocked on the ART, shared by the two files that
 * gate dwell from opposite ends.
 *
 * `loop-dwell.test.ts` checks the shipped catalog; `one-shot-divisor.test.ts` checks the declared
 * frame count before anything is extracted. Both have to skip the same rows, and both assert that
 * this list is exactly the set of rows that fail — so the skip cannot quietly widen. It lives here
 * rather than in either file because two copies of one exception is where the exception survives its
 * own reason *(vault 5.3)*.
 *
 * Not a `*.test.ts`, so vitest does not collect it.
 *
 * ## ✅ EMPTY as of 2026-08-15 — and that makes both gates STRICTLY STRONGER
 *
 * The single entry was `brass-courier/fall`. It is gone because the art it was blocked on was
 * bought: `fall-r2.mp4` (`request_id 01a003ea-9fee-7080-9d8e-053c205f7cc4`, $1.19, first take), shot
 * from the padded 5050² courier canvas at `1:1` with `FRAME_MARGIN` on the motion record. **G6: 0 of
 * 9 frames fail**, against round 1's frames 0–4 failing on the left, the right AND the top. The
 * declared count went 8 → 9 in the same commit, so the 18-tick fall now divides at a flat 2 ticks
 * per frame and the judder the player reported is gone.
 *
 * What this empties, precisely:
 *
 * - `loop-dwell.test.ts`'s `uneven === Object.keys(BLOCKED_ON_ART)` becomes `uneven === []` — **no
 *   catalog row may be uneven at all**, where before exactly one was permitted to be.
 * - `one-shot-divisor.test.ts`'s per-row loop now covers `brass-courier/fall` for the **first time**.
 *   That is the real new coverage, and it is what would catch the count drifting off 9 again.
 *
 * ## Why this file is KEPT rather than inlined as `[]` in both importers
 *
 * Deleting it would mean writing `[]` twice, which is where the both-directions property dies: the
 * gates do not merely skip these rows, they assert the skip list **equals** the failing set, so an
 * entry that is fixed but left here is red, and a row that breaks with nothing here is red too. That
 * machinery took a session to get right and costs nothing to keep. It is also the shape a future
 * blocked row needs, and `PENDING_ART` — kept on the identical reasoning one commit before the
 * scavenger's attack landed — was needed again within the hour.
 *
 * ## What the old entry recorded, kept because it explains a real trap
 *
 * ⚠️ **The `fall` sheet that shipped before this never passed G6 either.**
 * `build-clips.mjs:300-301` writes the strip and gates it *afterwards*, so a failing extraction
 * leaves a usable strip on disk that `assets:build` will happily pack. Regenerating the old 8-cell
 * strip reproduced `fall.png` byte for byte against `HEAD`, which is how that path was confirmed
 * rather than guessed. The write-then-gate ordering is still there; the clean clip is what makes it
 * moot for this key, not a fix to the tool.
 *
 * 🔴 This is **not** the `KNOWN_UNEVEN_ONE_SHOTS` list `loop-dwell.test.ts` used to carry. That one
 * said the fix was impossible, on the belief that a one-shot's frame count is not ours to choose; it
 * is, and every row that claimed otherwise was eventually fixed by choosing it — this last one by
 * buying the art that let the count move.
 */
export const BLOCKED_ON_ART: Record<string, { slug: string; action: string; ticksPerFrame: number; wants: number }> = {};
