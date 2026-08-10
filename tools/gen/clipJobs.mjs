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
 * One anchor URL per slug, uploaded once and reused for every action that slug performs. These are
 * fal submission parameters too, and belonged in no file before this one — see
 * `_generated/phase05/anchor-urls.txt`, which is gitignored and cannot be this project's copy of
 * record.
 */
const ANCHOR_URLS = Object.freeze({
  'brass-courier': 'https://v3b.fal.media/files/b/0aa5ad06/h1egp0r8ncH7dws0WSNQM_anchor.png',
  'brass-sentry': 'https://v3b.fal.media/files/b/0aa5ad07/eTruVD1130OxBEzbPfi0G_anchor.png',
  'rust-scavenger': 'https://v3b.fal.media/files/b/0aa5ad07/nJzWf6JtlGVoDoXkLfuYV_anchor.png',
});

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
  'brass-courier/attack': 'brass-courier-attack-r2.mp4',
  'brass-courier/hurt': 'brass-courier-hurt-r2.mp4',
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
  if (job.aspectRatio === '9:16') {
    problems.push(
      `${key}: aspect_ratio "9:16" is the specific defect that cropped every generated sentry ` +
        'clip left and right — the square anchor forced into a 9:16 frame. Never submit it again.',
    );
  }
  if (job.aspectRatio !== ASPECT_RATIO) {
    problems.push(
      `${key}: aspect_ratio "${job.aspectRatio}" does not match ASSET-PIPELINE.md's prescribed ` +
        `"${ASPECT_RATIO}" for ${ENDPOINT_ID}.`,
    );
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
      const anchorUrl = ANCHOR_URLS[slug];
      if (!anchorUrl) {
        throw new Error(
          `clipJobs: no anchor URL recorded for slug "${slug}" (from "${key}"). Add it to ANCHOR_URLS.`,
        );
      }
      const job = Object.freeze({
        endpoint: ENDPOINT_ID,
        aspectRatio: ASPECT_RATIO,
        resolution: RESOLUTION,
        duration: DURATION,
        anchorUrl,
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
