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
   * ✅ **`jump` is off the debt ledger as of 2026-08-23** *(session inventory 2.1)*. `jump-r4.mp4` is
   * declared in `CLIP_FILES` and is **the first jump take in this project's history to pass G6.**
   * The three below are its predecessors, kept and never deleted — paid, non-regenerable input, and
   * the before-column for the comparison.
   *
   * The four takes, and the axis each failed on. This is the record that made the fix findable:
   *
   * | take | anchor / ratio | G6 margins L/R/T/B | verdict |
   * |---|---|---|---|
   * | `jump.mp4` | unpadded 9:16 | 64 / **0** / 24 / 336 | cut RIGHT. Shipped since Phase 4 anyway — it predates G6 |
   * | `jump-r2.mp4` | padded 1:1 | 252 / 204 / **0** / 58 | cut TOP. The only take with real side room |
   * | `jump-r3.mp4` | unpadded 9:16 + size clause | 74 / **0** / 96 / 246 | cut RIGHT. The clause fixed the vertical; the frame was still too narrow |
   * | **`jump-r4.mp4`** | **padded 1:1 + size clause** | — | **PASS** |
   *
   * **A standing figure is narrow; a jump is wide.** 9:16 suits idle, walk and run and cuts a jump
   * at the sides every time it was tried. r2 proved the square canvas gives the horizontal room and
   * failed on the vertical instead; the size clause in `motionAirborne.mjs` is what closed that half.
   * Neither change works alone, which is why three takes read as random before the axes were tabled.
   *
   * Round 1's cost was not only the crop: it drew the figure at **69.3 % of idle height** with a head
   * **1.65× too wide**. r4 draws at 82.9 %, beside `fall`'s 80.0 %, from the same padded anchor and
   * the same `scale: 0.6` that `attack`, `death` and `fall` already pack at.
   */
  jump: Object.freeze(['jump.mp4', 'jump-r2.mp4', 'jump-r3.mp4']),

  /**
   * Round 1 of `fall`: `9:16` from the unpadded courier anchor, cut left, right and top. Superseded
   * by `fall-r2.mp4` (see `CLIP_FILES` for the request_id and what changed). Kept, never deleted —
   * paid, non-regenerable input, and the before-column for the framing comparison.
   *
   * Note this is the **opposite** disposition to `jump` directly above, from the same Phase 4 pair:
   * `jump-r2` traded a horizontal crop for a vertical one and was rejected, so `jump.mp4` is still
   * the declared file. Newest does not win; a human says which, and that is the whole point of this
   * table.
   */
  fall: Object.freeze(['fall.mp4', 'fall-r3.mp4']),

  /**
   * Round 1 everywhere below: shot `9:16` from a `1:1` anchor — session 1's parameter error, and the
   * reframe defect that cut 7 of 7 reframed clips. Superseded by the `1:1` round, kept on disk.
   */
  /**
   * 🔴 `-r3` is a **DISCARD**, not a supersession by a better round — `-r2` is still the winner.
   *
   * Shot 2026-08-25 to close the `0.0138` wrap waiver, on a prompt **byte-identical** to `-r2`'s. It
   * **fails G6**: frame 5 of 8, top margin **0 px** (left 70, right 120, bottom 120). `-r2` passed
   * the same words, so this is variance on an axis nothing constrains — `FRAME_MARGIN`
   * (`motionClauses.mjs:37`) governs the middle 70 % of the frame **WIDTH** and says nothing about
   * top or bottom. $1.19 spent, nothing adopted; `docs/GENERATION-LOG.md` carries the entry.
   *
   * It is listed here rather than deleted from disk because a discarded round is evidence: the next
   * attempt should change the **geometry** (a padded anchor — `-r3`'s params record
   * `"anchorPadded": false`) rather than the wording, since the wording experiment already cost
   * $4.76 and came back a coin flip.
   *
   * ✅ **THAT ADVICE WAS TAKEN AND IT WORKED — `-r4` is declared as of 2026-08-26.** Same prompt
   * again, byte-identical to `-r3` and therefore to `-r2`; the ONLY change was the anchor, padded
   * with `padAnchor --fill 0.55` to a 2560² canvas that lifts the top margin 18.8 % → 25.0 %.
   * `request_id 01a03c8d-72ac-7cc1-8287-5a2b36ae1241`, seed 321260100.
   *
   * **It passes G6, and it passes `gateLoopWrap` OUTRIGHT** — wrap 0.02068 within a budget of
   * 0.02273, where `-r2` failed at 0.01371 against 0.01143. The `0.0138` waiver in
   * `every-slug-loop-gate.test.ts` is deleted, which is what its own `owed` line asked for.
   *
   * ⚠️ **`-r2` moves to this list, and it is a real supersession this time** — unlike `-r3`,
   * which sits here as a discard. Three takes, one axis each, and the table is the record:
   *
   * | take | anchor | verdict |
   * |---|---|---|
   * | `brass-sentry-idle.mp4` | unpadded, wrong ratio | superseded in session 5 |
   * | `brass-sentry-idle-r2.mp4` | unpadded 2048² | passed G6, **FAILED the loop gate** at 0.01371/0.01143 — shipped under a waiver for three days |
   * | `brass-sentry-idle-r3.mp4` | unpadded 2048², same words | **failed G6**, top 0 px — a discard |
   * | **`brass-sentry-idle-r4.mp4`** | **padded 2560², same words** | **passes both** |
   *
   * 🔴 The slug `scale` moved with it — 0.28915663 → 0.36022514 — because a padded anchor
   * makes the machine fewer source pixels tall. **`fire` and `death` did NOT need re-deriving**:
   * measured after repacking, the tripod base spans 205 px in all three sheets, exactly as before.
   * See `character-bounds-brass-sentry.json`'s `_scale` for why a ratio change leaves the rendered
   * size alone, and why that is not the `3.10` situation repeating.
   */
  'brass-sentry/idle': Object.freeze([
    'brass-sentry-idle.mp4',
    'brass-sentry-idle-r2.mp4',
    'brass-sentry-idle-r3.mp4',
  ]),
  'brass-sentry/death': Object.freeze([
    'brass-sentry-death.mp4',
    'brass-sentry-death-r2.mp4',
    'brass-sentry-death-r3.mp4',
    'brass-sentry-death-r5.mp4',
    'brass-sentry-death-r6.mp4',
  ]),
  'rust-scavenger/walk': Object.freeze(['rust-scavenger-walk.mp4', 'rust-scavenger-walk-r2.mp4']),
  'rust-scavenger/chase': Object.freeze(['rust-scavenger-chase.mp4', 'rust-scavenger-chase-r2.mp4']),
  'rust-scavenger/death': Object.freeze([
    'rust-scavenger-death.mp4',
    'rust-scavenger-death-r2.mp4',
    'rust-scavenger-death-r3.mp4',
    'rust-scavenger-death-r4.mp4',
  ]),
  /**
   * REVERSED 2026-08-12 (D2). `-r3` is the PADDED round: passed G6 cleanly and is now the winner
   * (`clipJobs.mjs`'s `CLIP_FILES`) now that `scale` resolves per `(slug, action)` instead of one
   * number per slug. `-r4` was the UNPADDED 9:16 re-shoot ordered on the premise that a per-slug
   * scale could not serve both — it never fixed the crop (`L188 R0`, unmoved across three prompt
   * clauses) and is superseded here alongside `-r5`, a further unpadded retry with the same result.
   */
  'brass-courier/attack': Object.freeze([
    'brass-courier-attack.mp4',
    'brass-courier-attack-r2.mp4',
    'brass-courier-attack-r4.mp4',
    'brass-courier-attack-r5.mp4',
  ]),
  /** REVERSED 2026-08-12 (D2), same reasoning as `attack` above: `-r2` is the padded winner. */
  'brass-courier/death': Object.freeze([
    'brass-courier-death.mp4',
    'brass-courier-death-r3.mp4',
    'brass-courier-death-r4.mp4',
  ]),
  'brass-courier/hurt': Object.freeze(['brass-courier-hurt.mp4']),

  /**
   * `fire` has THREE superseded rounds — the most re-shot clip in the project. Round 1 at `9:16`;
   * `-r2`, the ratio-matched control for the padding probe; and `-r3`, the padding probe itself
   * (3130² anchor), which took G6 from 5-of-6 failing to 1-of-6 and was the best fire this project
   * had until session 6. `-r4` is the declared winner: same padded anchor, plus session 5's
   * `DISCHARGE_MARGIN` clause.
   *
   * ⚠️ **`-r4`'s discharge is nearly absent** — see `docs/generations/`. The margin clause was
   * satisfied by the model very largely not firing, which is the `SPAN_CLIP` failure shape (a
   * constraint describing a SHAPE, met by not performing the action). It is declared because it is
   * the round the gates must now judge, **not** because it is agreed to be better art.
   */
  /**
   * `-r5` (session 10) is the SECOND padding step: a 4024² anchor at `--fill 0.35`, single-variable
   * against `-r4`'s 3130². It **refuted the treatment** and is superseded on two counts.
   *
   * The machine gained margin on every edge (`L232→276 T278→308 B244→296`) and the right edge stayed
   * at 0, because what crosses it is the **departing bolt**, drawn to leave the scene — a bigger
   * canvas gives it more room to travel rather than pulling it inside. Padding shrinks a subject; it
   * cannot shrink a projectile whose purpose is to exit the frame.
   *
   * And `-r5` is worse art: a smoke cloud plus a small bolt, where `-r4` has a large bright muzzle
   * flash, which reads better across an 18-tick `fire` window. `request_id
   * 019fff77-93ab-7f92-b2c6-49cffe2d6ab2`, $1.19, full log in
   * `docs/generations/phase-05-fire-repad.md`. The paired `death` generation was rendered and
   * **never submitted** — the stop rule fired first, so it cost $0.
   */
  'brass-sentry/fire': Object.freeze([
    'brass-sentry-fire.mp4',
    'brass-sentry-fire-r2.mp4',
    'brass-sentry-fire-r3.mp4',
    'brass-sentry-fire-r5.mp4',
    'brass-sentry-fire-r4.mp4',
  ]),
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
