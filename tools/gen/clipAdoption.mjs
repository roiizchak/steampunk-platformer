/**
 * Which clip on disk is the WINNER, and which are knowingly superseded.
 *
 * ## The defect this closes — the session-6 Codex plan review's blocker
 *
 * `submit-clips.mjs` picks a re-shoot's download filename from what is already on disk
 * (`nextFreeDownloadPath`), while `findClip` resolves the clip to extract from `CLIP_FILES`.
 * **Nothing connected the two.** Measured against the tree the moment before an $8.33 batch was to
 * be submitted: six of the seven keys would have downloaded a new `-rN` and then gone on extracting
 * the PREVIOUS round — silently, and looking exactly like success — and the seventh
 * (`brass-courier/death`, declared `null`) would have thrown on an ambiguous glob.
 *
 * ## Why an allowlist rather than "newest wins"
 *
 * Because newest does NOT always win here, and the counter-example is already on disk. `jump-r2.mp4`
 * sits beside `jump.mp4`; the re-shoot fixed a horizontal crop and introduced a **vertical** one, so
 * it is **kept as evidence and deliberately NOT adopted** (HANDOFF §9). A rule that preferred the
 * later round would silently adopt a clip a human had rejected.
 *
 * So the invariant is explicitness, which is the fix this failure class has now received four times
 * — `aspect_ratio` typed into a command line, the winning clip inferred from a directory listing,
 * the padded anchor URL living only in a gitignored sidecar, and now this: **write the decision down
 * where it can be reviewed, diffed and tested.** Every `.mp4` on disk for a key must be either the
 * declared winner or listed here as knowingly superseded. A newly landed round is neither, so it
 * turns `tests/unit/clip-adoption.test.ts` red until a human says which it is.
 *
 * Split out of `clipJobs.mjs` because that file reached 469 lines adding this — the eleventh
 * over-limit file, which the session-6 review predicted before it happened.
 */

/** Clips on disk that are DELIBERATELY not adopted, per key. */
export const SUPERSEDED_CLIPS = Object.freeze({
  /**
   * The `1:1` re-shoot of Phase 4's `jump` (`request_id 019fecbf-9ad4-7f93-a134-003e743b0a82`,
   * $1.19). It fixed the horizontal crop and replaced it with a vertical one — top edge 0 on five of
   * six frames. **Neither clip passes G6**; `jump` stays on the Phase 4 debt ledger and `jump.mp4`
   * remains declared. Kept, never deleted: paid, non-regenerable input.
   */
  jump: Object.freeze(['jump-r2.mp4']),

  /**
   * Round 1 everywhere below: shot `9:16` from a `1:1` anchor — session 1's parameter error, and the
   * reframe defect that cut 7 of 7 reframed clips. Superseded by the `1:1` round, kept on disk.
   */
  'brass-sentry/idle': Object.freeze(['brass-sentry-idle.mp4']),
  'brass-sentry/death': Object.freeze(['brass-sentry-death.mp4']),
  'rust-scavenger/walk': Object.freeze(['rust-scavenger-walk.mp4']),
  'rust-scavenger/chase': Object.freeze(['rust-scavenger-chase.mp4']),
  'rust-scavenger/death': Object.freeze(['rust-scavenger-death.mp4']),
  'brass-courier/attack': Object.freeze(['brass-courier-attack.mp4']),
  'brass-courier/hurt': Object.freeze(['brass-courier-hurt.mp4']),

  /**
   * `fire` has two superseded rounds, not one: round 1 at `9:16`, then `-r2`, the ratio-matched
   * control for the padding probe. `-r3` (padded anchor, 3130²) is the declared winner and the best
   * fire this project has.
   */
  'brass-sentry/fire': Object.freeze(['brass-sentry-fire.mp4', 'brass-sentry-fire-r2.mp4']),
});

/**
 * Problems with one key's adoption state, as an array of strings — empty means every clip on disk
 * for that key is accounted for.
 *
 * Pure: the caller supplies the candidate list, so the unit suite can exercise **both** directions
 * on synthetic listings without a real `_generated/` *(vault C2 — a gate that cannot go red is
 * decoration)*.
 */
export function adoptionProblems(key, { declaredFile, superseded = [], candidates }) {
  if (candidates.length === 0) {
    // Nothing on disk. `_generated/` is gitignored, so this is the normal state of a fresh clone and
    // is not a defect — `findClip` is what fails, loudly, if a build actually needs the file. Being
    // quiet here is deliberate: finding R7 recorded a test that went red merely because a directory
    // was absent, which is a false-red generator in the gate written to prevent false greens.
    return [];
  }

  const accounted = new Set(superseded);
  if (declaredFile !== null) {
    accounted.add(declaredFile);
  }
  const problems = [];
  const unaccounted = candidates.filter((f) => !accounted.has(f));

  if (declaredFile === null && unaccounted.length > 1) {
    problems.push(
      `${key}: ${unaccounted.length} clips on disk (${unaccounted.join(', ')}) and no declared ` +
        `file. findClip refuses an ambiguous glob rather than picking — declare the winner in ` +
        `CLIP_FILES["${key}"] and list the rest in SUPERSEDED_CLIPS["${key}"].`,
    );
  } else if (declaredFile !== null && unaccounted.length > 0) {
    problems.push(
      `${key}: ${unaccounted.join(', ')} ${unaccounted.length === 1 ? 'is' : 'are'} on disk but ` +
        `neither declared nor knowingly superseded. CLIP_FILES declares "${declaredFile}", so the ` +
        `build is extracting THAT and ignoring the newer round. If the new clip is the winner, ` +
        `declare it and supersede the old one; if it is not, list it in SUPERSEDED_CLIPS["${key}"].`,
    );
  }

  if (declaredFile !== null && !candidates.includes(declaredFile)) {
    problems.push(
      `${key}: CLIP_FILES declares "${declaredFile}", which is not on disk. A declared input is ` +
        `never substituted (vault 4.16).`,
    );
  }

  for (const f of superseded) {
    if (!candidates.includes(f)) {
      problems.push(
        `${key}: SUPERSEDED_CLIPS lists "${f}", which is not on disk. A stale entry hides a real ` +
          `unaccounted clip behind a name that no longer exists.`,
      );
    }
  }

  return problems;
}
