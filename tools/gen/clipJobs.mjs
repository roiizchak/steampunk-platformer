/**
 * The fal submission parameters for every clip this project generates — Phase 5 combat/enemy AND
 * the five legacy Phase 4 bare-key motions — checked into version control, one record per key,
 * keyed exactly as `VIDEO_MOTIONS` keys them (`slug/action` or a bare `idle`/`walk`/`run`/`jump`/`fall`).
 *
 * ## Why this file exists
 *
 * Every clip Phase 5 generated came back cropped at the left and right edges.
 * `docs/ASSET-PIPELINE.md` prescribes `--aspect_ratio "1:1"` for
 * `bytedance/seedance-2.0/image-to-video` — the sentry's anchor is square — and the session that
 * shot these clips typed `"9:16"` instead. That value existed in no file: it was typed into a
 * `genmedia` command line by a human and never recorded anywhere reviewable, diffable or testable.
 * `CLIP_JOBS` is that missing record. `submit-clips.mjs` reads it and prints the command; nothing
 * here calls fal or spends money.
 *
 * ## Why the five legacy bare keys are covered too
 *
 * The shipped `jump.mp4` has the identical defect (a square anchor forced into 9:16, sheared left
 * and right — see `docs/HANDOFF.md` §8), and it was submitted with **no CLIP_JOBS record at all**:
 * the legacy keys were out of scope for the first version of this file. That gap is exactly why
 * nothing caught the bad aspect ratio before it shipped. Covering every `VIDEO_MOTIONS` key, not
 * only the namespaced combat ones, closes it.
 *
 * ## Why `ASPECT_RATIO` is parsed out of the doc rather than retyped
 *
 * Two definitions of one concept is where the bug lives (vault 5.3) — the exact failure mode that
 * put `"9:16"` into a real submission while the doc said `"1:1"`. `readPrescribedAspectRatio` reads
 * the doc's own fenced command block, so this module and the doc cannot drift apart again.
 *
 * ## Why `CLIP_JOBS` is built FROM the motion keys, not typed out separately
 *
 * A second concurrent session is adding `brass-sentry/fire-elevated` to `COMBAT_MOTIONS`. Deriving
 * `CLIP_JOBS` from the declared motion keys means it is always exactly in sync with whatever motions
 * are declared — never one entry ahead or behind — rather than a second hand-maintained list that
 * could disagree with the first. Those keys are read off `VIDEO_MOTIONS` rather than
 * `COMBAT_MOTIONS` directly — see `allMotionKeys` below for why that specific choice matters.
 */

import { existsSync, readFileSync } from 'node:fs';
import { VIDEO_MOTIONS } from './motion.mjs';
import { NAMESPACED_VIDEO_DIR, videoDirFor } from './clipSource.mjs';
import {
  ANCHOR_RATIOS,
  ANCHOR_URLS,
  PADDED_ANCHORS,
  expectedAspectRatio,
} from './clipAnchors.mjs';

/**
 * Every generated-clip key: the ten namespaced `slug/action` combat/enemy ones AND the five legacy
 * bare ones (`idle`, `walk`, `run`, `jump`, `fall`). Read off `VIDEO_MOTIONS` rather than importing
 * `COMBAT_MOTIONS` from `motionCombat.mjs` directly, because `motion.mjs` and `motionCombat.mjs`
 * import each other — `motion.mjs` spreads `COMBAT_MOTIONS` into `VIDEO_MOTIONS` at its own module
 * top level, and `motionCombat.mjs` calls `poseSpan` (a hoisted function, safe) from `motion.mjs` at
 * ITS top level. Whichever of the two is touched FIRST by an importer evaluates correctly; touching
 * `motionCombat.mjs` first makes `motion.mjs`'s own `...COMBAT_MOTIONS` spread run while
 * `COMBAT_MOTIONS` is still in its temporal dead zone, silently producing an incomplete
 * `VIDEO_MOTIONS`. Every existing consumer (`write-prompts.mjs`, `build-clips.mjs`) already imports
 * `motion.mjs` first for this reason; this file does the same rather than opening a second, riskier
 * entry point into the cycle.
 */
function allMotionKeys() {
  return Object.keys(VIDEO_MOTIONS);
}

/** The one endpoint this project uses for character animation. */
export const ENDPOINT_ID = 'bytedance/seedance-2.0/image-to-video';

/** Recorded known-good values from the clips that were actually shot and downloaded. */
export const RESOLUTION = '720p';
export const DURATION = '4';

const ASSET_PIPELINE_DOC = 'docs/ASSET-PIPELINE.md';

/**
 * Reads `docs/ASSET-PIPELINE.md`'s fenced `genmedia run bytedance/seedance-2.0/image-to-video`
 * command block and pulls the `--aspect_ratio "..."` value out of it. Throws rather than guessing
 * if the block moves or is reworded — a silent `undefined` here is worse than a loud failure.
 */
export function readPrescribedAspectRatio(docText = readFileSync(ASSET_PIPELINE_DOC, 'utf8')) {
  const anchor = docText.indexOf(ENDPOINT_ID);
  if (anchor === -1) {
    throw new Error(
      `clipJobs: "${ENDPOINT_ID}" was not found in ${ASSET_PIPELINE_DOC} — the prescribed command ` +
        'block moved or was reworded; update this parser rather than hardcoding a value.',
    );
  }
  const fenceOpen = docText.lastIndexOf('```', anchor);
  const fenceClose = docText.indexOf('```', anchor);
  if (fenceOpen === -1 || fenceClose === -1) {
    throw new Error(
      `clipJobs: could not find the fenced code block around "${ENDPOINT_ID}" in ${ASSET_PIPELINE_DOC}.`,
    );
  }
  const block = docText.slice(fenceOpen, fenceClose);
  const match = block.match(/--aspect_ratio\s+"([^"]+)"/);
  if (!match) {
    throw new Error(
      `clipJobs: no --aspect_ratio flag found in the ${ENDPOINT_ID} command block in ${ASSET_PIPELINE_DOC}.`,
    );
  }
  return match[1];
}

/** The prescribed value, read once at module load — the single source both code and tests use. */
export const ASPECT_RATIO = readPrescribedAspectRatio();

/**
 * The winning filename for every key, declared as data rather than picked by `findClip`'s glob
 * (vault 4.16). `brass-courier/attack` and `brass-courier/hurt` were actually re-shot — round 1's
 * `brass-courier-attack.mp4`/`-hurt.mp4` are paid, non-regenerable input and stay on disk,
 * superseded but never deleted — this is what lets `findClip` return the winner without them being
 * ambiguous. The five legacy bare keys have exactly one clip on disk today, but are declared here
 * too rather than left to fall back to `null`+glob: `jump` is about to be re-shot (W2c), and once
 * `jump-r2.mp4` lands beside it, an undeclared `file` would make the glob ambiguous exactly the same
 * way. `idle`/`walk`/`run`/`fall` are declared now for the same reason, pre-emptively.
 */
const CLIP_FILES = Object.freeze({
  'brass-courier/attack': 'brass-courier-attack-r5.mp4',
  'brass-courier/death': 'brass-courier-death-r4.mp4',
  'brass-courier/hurt': 'brass-courier-hurt-r2.mp4',
  /**
   * The ratio-match re-shoot (`request_id 019fef56-67bf-7922-943c-417809ed8ba0`).
   *
   * Round 1 was submitted at `9:16` from a `1:1` anchor and every frame was cut at BOTH sides
   * (G6: 6 of 6 fail, `left 0 / right 0`). This round changed **only** the aspect ratio, to the
   * `1:1` that `ASSET-PIPELINE.md` already prescribed and `CLIP_JOBS` already reads — so anchor
   * ratio equals output ratio and no reframing happens. G6: **0 of 6 fail**, margins 84-180px on
   * all four edges. See `docs/generations/phase-05-ratio-match.md`.
   */
  'brass-sentry/idle': 'brass-sentry-idle-r2.mp4',

  /**
   * The rest of the `1:1` re-shoot round (session 4). Each names the **best candidate measured so
   * far**, not necessarily a passing one — the record's job is to say which file a build should
   * resolve, and G6 remains the arbiter of whether it may be packed.
   *
   * Ratio-matching is **necessary but not sufficient**, and the residual tracks motion magnitude:
   *
   *   brass-sentry/idle    -r2  lowest motion       6/6 fail -> 0/6   PACKS
   *   rust-scavenger/walk  -r2  moderate cyclic     cut L,R  -> 0/6   PACKS
   *   rust-scavenger/chase -r2  fast cyclic         cut L,R  -> 1/6   still gated
   *   brass-sentry/fire    -r3  discharge at peak   6/6 -> 5/6 -> 1/6 with a PADDED anchor
   *   brass-sentry/death   -r2  wreckage spread     4/6 fail
   *   rust-scavenger/death -r2  debris spans frame  4/6 fail
   *
   * `fire` is `-r3`, the padding probe: same `1:1`, same prompt, only the anchor padded to 3130²
   * (`request_id 019ff0db-0597-7490-ae69-921c125fed29`). It is the best fire this project has, and
   * its one remaining failure is the muzzle blast leaving frame, not the turret.
   */
  'brass-sentry/fire': 'brass-sentry-fire-r4.mp4',
  'brass-sentry/death': 'brass-sentry-death-r4.mp4',
  'rust-scavenger/walk': 'rust-scavenger-walk-r3.mp4',
  'rust-scavenger/chase': 'rust-scavenger-chase-r3.mp4',
  'rust-scavenger/death': 'rust-scavenger-death-r5.mp4',
  idle: 'idle.mp4',
  walk: 'walk.mp4',
  run: 'run.mp4',
  jump: 'jump.mp4',
  fall: 'fall.mp4',
});

/**
 * `brass-courier/attack` -> `brass-courier` — a filename/URL lookup key never carries a `/`. The
 * five legacy bare keys (`idle`, `walk`, `run`, `jump`, `fall`) are also the brass-courier character
 * — Phase 4 shot them before the `slug/action` naming convention existed — so a bare key resolves to
 * that same slug rather than to itself.
 */
function slugOf(key) {
  return key.includes('/') ? key.split('/')[0] : 'brass-courier';
}

/** `brass-courier/attack` -> `brass-courier-attack` — the on-disk stem, matching `clipSource.mjs`. */
export function clipStem(key) {
  return key.replace('/', '-');
}

/**
 * Checks one job record against the values that caused the defect and the values this project
 * actually knows are good. Returns an array of problem strings — empty means valid. Exported so
 * `tests/unit/clip-jobs.test.ts` can exercise it directly on a fixture without polluting
 * `CLIP_JOBS` (vault C2: a gate that cannot go red is decoration).
 */
export function validateClipJob(key, job) {
  const problems = [];
  /**
   * **The defect is a REFRAME, not a string.**
   *
   * This used to reject the literal `"9:16"` as *"the specific defect"*. That was right about the
   * evidence and wrong about the rule, and session 6 found the difference the expensive way.
   *
   * What the 17-clip framing report actually measured is that a clip is cut whenever the OUTPUT
   * ratio differs from its ANCHOR's ratio — **7 of 7, two subjects, both directions of mismatch.**
   * `9:16` was the defect for `brass-sentry` and `rust-scavenger` because their anchors are square.
   * For `brass-courier` it is the opposite: that anchor is **1536 × 2752 = 0.558**, which IS 9:16,
   * so `9:16` is the ratio-MATCHED choice and `1:1` is the reframe. Every clean courier sheet the
   * project ships — `idle`, `walk`, `run`, `jump`, `fall`, `hurt` — was shot at `9:16`.
   *
   * A blanket ban therefore forbade the only correct ratio for one of the three subjects, and would
   * have forced its re-shoots through the very reframe the ban exists to prevent.
   *
   * So the guard now measures **anchor ratio vs submitted ratio**, which is the thing that was
   * always meant. This is the same correction G6 has had twice: change what it MEASURES, never what
   * it TOLERATES. `ASPECT_RATIO` from `ASSET-PIPELINE.md` remains the prescribed default and is what
   * a square anchor resolves to; it is no longer treated as the only legal value for every subject.
   */
  /**
   * `anchorRatio` is checked for SHAPE before it is used, and a bad one is a problem string rather
   * than a throw.
   *
   * `validateClipJob` takes a `ClipJobCandidate`, which is deliberately looser than `ClipJob` — the
   * committed failing fixtures are hand-written partial objects, and that looseness is what keeps
   * the negative half of this gate writable at all *(vault C2)*. The first version of this check
   * called `job.anchorRatio.toFixed(4)` unguarded and threw `TypeError: Cannot read properties of
   * undefined` on five existing fixtures — turning a gate that reports problems into one that
   * crashes, which reports nothing.
   */
  if (typeof job.anchorRatio !== 'number' || !(job.anchorRatio > 0)) {
    problems.push(
      `${key}: anchorRatio must be a positive number (got ${JSON.stringify(job.anchorRatio)}). ` +
        'Without it there is no way to tell whether the submitted aspect_ratio reframes the anchor.',
    );
  } else {
    const expected = expectedAspectRatio(job.anchorRatio);
    if (job.aspectRatio !== expected) {
      problems.push(
        `${key}: aspect_ratio "${job.aspectRatio}" REFRAMES its anchor. The anchor's ratio is ` +
          `${job.anchorRatio.toFixed(4)}, so it must be shot at "${expected}". Reframing cut 7 of 7 ` +
          `measured clips — it is the one deterministic cause of the crop, and no prompt clause ` +
          `overrides it.`,
      );
    }
  }
  if (job.resolution !== RESOLUTION) {
    problems.push(`${key}: resolution "${job.resolution}" does not match the known-good "${RESOLUTION}".`);
  }
  if (job.duration !== DURATION) {
    problems.push(`${key}: duration "${job.duration}" does not match the known-good "${DURATION}".`);
  }
  if (job.endpoint !== ENDPOINT_ID) {
    problems.push(`${key}: endpoint "${job.endpoint}" does not match "${ENDPOINT_ID}".`);
  }
  if (!job.anchorUrl) {
    problems.push(`${key}: no anchorUrl set.`);
  }
  /**
   * A padded record must carry a real digest. Without one, `anchorPadded: true` is a claim nobody
   * can check — and the whole point of the override is that "which canvas did this come from" stops
   * being something a session has to remember.
   */
  if (job.anchorPadded && !/^[0-9a-f]{64}$/.test(String(job.anchorSha256))) {
    problems.push(
      `${key}: declares a padded anchor but its anchorSha256 is not a 64-character hex digest ` +
        `("${job.anchorSha256}"). A padded anchor whose bytes cannot be verified is the assumption ` +
        'that already cost this project a probe.',
    );
  }
  // `?? null` on purpose: a record that simply omits the field is an ordinary unpadded record, not
  // a malformed one. Only a digest that is actually PRESENT without padding is a lie about origin.
  if (!job.anchorPadded && (job.anchorSha256 ?? null) !== null) {
    problems.push(
      `${key}: carries an anchorSha256 without declaring anchorPadded — the digest would describe ` +
        'bytes that were never submitted.',
    );
  }
  return problems;
}

/**
 * One record per `VIDEO_MOTIONS` key — every combat key AND every legacy bare key — self-validated
 * at build time so a bad value can never live in `CLIP_JOBS` even transiently — the module throws on
 * import instead.
 *
 * The legacy bare keys' `aspectRatio`/`resolution`/`duration` here are the currently-**prescribed**
 * pipeline values (`ASPECT_RATIO`/`RESOLUTION`/`DURATION`), not a reconstruction of what was
 * actually submitted for `idle`/`walk`/`run`/`fall` — no machine-readable record of those four's
 * real submission parameters exists (`_generated/video/{idle,walk,run,fall}.submit.json` carry only
 * a `request_id`, no `aspect_ratio`). `docs/generations/phase-04-video.md:330-331` documents in
 * prose that all five were actually shot at `9:16` from the Phase 4 "levelled anchor" — but
 * `validateClipJob` forbids `"9:16"` by design (that IS the fix this file exists to make), so that
 * historical value can never legitimately be a `CLIP_JOBS` entry. None of the four are being
 * re-shot by this change, so their record is declarative (what the pipeline now prescribes), not
 * historical — that gap is deliberate, not an oversight. `jump` is the one key where this matters
 * for real: it IS being re-shot at the prescribed `1:1`, which is why it alone gets a fresh anchor
 * URL and an as-yet-nonexistent `-r2` output rather than reusing Phase 4's history.
 */
export const CLIP_JOBS = Object.freeze(
  Object.fromEntries(
    allMotionKeys().map((key) => {
      const slug = slugOf(key);
      const slugAnchor = ANCHOR_URLS[slug];
      if (!slugAnchor) {
        throw new Error(
          `clipJobs: no anchor URL recorded for slug "${slug}" (from "${key}"). Add it to ANCHOR_URLS.`,
        );
      }
      const padded = PADDED_ANCHORS[key] ?? null;
      /**
       * The guard that makes the override worth having. Pasting the slug's own URL into
       * `PADDED_ANCHORS` yields a record that *claims* padding and submits the original — the exact
       * silent-wrong-input class as R8's `declaredFile` copy-paste, and it would look correct in
       * every log. Throw at import rather than let it reach a paid request.
       */
      if (padded && padded.url === slugAnchor) {
        throw new Error(
          `clipJobs: "${key}" declares a padded anchor whose URL is identical to the unpadded ` +
            `"${slug}" anchor. That record would submit the original canvas while claiming the ` +
            'padded one — the treatment would be tested by not applying it.',
        );
      }
      const job = Object.freeze({
        endpoint: ENDPOINT_ID,
        // A padded canvas is square by construction; an unpadded one keeps its own measured
        // ratio. The submitted ratio is then whatever does NOT reframe it.
        anchorRatio: padded ? 1 : ANCHOR_RATIOS[slug],
        aspectRatio: expectedAspectRatio(padded ? 1 : ANCHOR_RATIOS[slug]),
        resolution: RESOLUTION,
        duration: DURATION,
        anchorUrl: padded ? padded.url : slugAnchor,
        anchorPadded: padded !== null,
        anchorSha256: padded ? padded.sha256 : null,
        anchorSource: padded ? padded.source : null,
        file: CLIP_FILES[key] ?? null,
      });
      const problems = validateClipJob(key, job);
      if (problems.length > 0) {
        throw new Error(`clipJobs: "${key}" failed validation:\n${problems.join('\n')}`);
      }
      return [key, job];
    }),
  ),
);

/**
 * Where `submit-clips.mjs` writes prompt/params sidecars. The clip itself downloads to
 * `videoDirFor(key)` (`clipSource.mjs`) instead — a single directory here would be wrong for the
 * five legacy bare keys, which live in `_generated/video`, not `_generated/phase05/video`.
 */
export const PROMPT_OUT_DIR = '_generated/phase05/prompts';
export const PARAMS_OUT_DIR = '_generated/phase05/params';

/**
 * Whether `_generated/phase05/video/` exists on this machine. `_generated/` is gitignored by
 * design (vault 4.16), so it is absent on a fresh clone — callers use this to skip disk-dependent
 * assertions there rather than failing on the expected absence.
 */
export function videoDirExists() {
  return existsSync(NAMESPACED_VIDEO_DIR);
}

/**
 * Every declared `CLIP_JOBS[key].file` that is not actually present on disk. Checked in
 * `videoDirFor(key)` — `_generated/video` for the five legacy bare keys, `_generated/phase05/video`
 * for namespaced combat keys — the same split `findClip` uses, not a single hardcoded directory.
 */
export function missingClipFiles() {
  return Object.entries(CLIP_JOBS)
    .filter(([key, job]) => job.file !== null && !existsSync(`${videoDirFor(key)}/${job.file}`))
    .map(([, job]) => job.file);
}
