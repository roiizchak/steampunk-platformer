/**
 * The fal submission parameters for every Phase 5 combat/enemy clip — checked into version
 * control, one record per generated clip, keyed exactly as `VIDEO_MOTIONS` keys them (`slug/action`).
 *
 * ## Why this file exists
 *
 * Every clip this phase generated came back cropped at the left and right edges.
 * `docs/ASSET-PIPELINE.md` prescribes `--aspect_ratio "1:1"` for
 * `bytedance/seedance-2.0/image-to-video` — the sentry's anchor is square — and the session that
 * shot these clips typed `"9:16"` instead. That value existed in no file: it was typed into a
 * `genmedia` command line by a human and never recorded anywhere reviewable, diffable or testable.
 * `CLIP_JOBS` is that missing record. `submit-clips.mjs` reads it and prints the command; nothing
 * here calls fal or spends money.
 *
 * ## Why `ASPECT_RATIO` is parsed out of the doc rather than retyped
 *
 * Two definitions of one concept is where the bug lives (vault 5.3) — the exact failure mode that
 * put `"9:16"` into a real submission while the doc said `"1:1"`. `readPrescribedAspectRatio` reads
 * the doc's own fenced command block, so this module and the doc cannot drift apart again.
 *
 * ## Why `CLIP_JOBS` is built FROM the combat motion keys, not typed out separately
 *
 * A second concurrent session is adding `brass-sentry/fire-elevated` to `COMBAT_MOTIONS`. Deriving
 * `CLIP_JOBS` from the declared combat/enemy keys means it is always exactly in sync with whatever
 * motions are declared — never one entry ahead or behind — rather than a second hand-maintained
 * list that could disagree with the first. Those keys are read off `VIDEO_MOTIONS` rather than
 * `COMBAT_MOTIONS` directly — see `combatKeys` below for why that specific choice matters.
 */

import { existsSync, readFileSync } from 'node:fs';
import { VIDEO_MOTIONS } from './motion.mjs';
import { NAMESPACED_VIDEO_DIR } from './clipSource.mjs';

/**
 * Combat/enemy keys only, derived from `VIDEO_MOTIONS` rather than importing `COMBAT_MOTIONS` from
 * `motionCombat.mjs` directly. `motion.mjs` and `motionCombat.mjs` import each other — `motion.mjs`
 * spreads `COMBAT_MOTIONS` into `VIDEO_MOTIONS` at its own module top level, and `motionCombat.mjs`
 * calls `poseSpan` (a hoisted function, safe) from `motion.mjs` at ITS top level. Whichever of the
 * two is touched FIRST by an importer evaluates correctly; touching `motionCombat.mjs` first makes
 * `motion.mjs`'s own `...COMBAT_MOTIONS` spread run while `COMBAT_MOTIONS` is still in its
 * temporal dead zone, silently producing an incomplete `VIDEO_MOTIONS`. Every existing consumer
 * (`write-prompts.mjs`, `build-clips.mjs`) already imports `motion.mjs` first for this reason; this
 * file does the same rather than opening a second, riskier entry point into the cycle. The
 * `slug/action` naming convention (`videoPrompt`'s own `namespaced` check) is what tells combat
 * keys apart from the five legacy bare ones.
 */
function combatKeys() {
  return Object.keys(VIDEO_MOTIONS).filter((key) => key.includes('/'));
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
 * The winning filename for a key whose round-1 clip was re-shot, declared as data rather than
 * picked by `findClip`'s glob (vault 4.16). Round 1's `brass-courier-attack.mp4` and
 * `brass-courier-hurt.mp4` are paid, non-regenerable input and stay on disk, superseded but never
 * deleted — this is what lets `findClip` return the winner without them being ambiguous. Every
 * other key has exactly one clip on disk, so it is absent here (`file` falls back to `null` below).
 */
const CLIP_FILES = Object.freeze({
  'brass-courier/attack': 'brass-courier-attack-r2.mp4',
  'brass-courier/hurt': 'brass-courier-hurt-r2.mp4',
});

/** `brass-courier/attack` -> `brass-courier` — a filename/URL lookup key never carries a `/`. */
function slugOf(key) {
  return key.split('/')[0];
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
 * One record per `COMBAT_MOTIONS` key, self-validated at build time so a bad value can never live
 * in `CLIP_JOBS` even transiently — the module throws on import instead.
 */
export const CLIP_JOBS = Object.freeze(
  Object.fromEntries(
    combatKeys().map((key) => {
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

/** Where `submit-clips.mjs` writes sidecars and where the resulting clip is expected to land. */
export const VIDEO_OUT_DIR = NAMESPACED_VIDEO_DIR;
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

/** Every declared `CLIP_JOBS[key].file` that is not actually present in `NAMESPACED_VIDEO_DIR`. */
export function missingClipFiles() {
  return Object.values(CLIP_JOBS)
    .map((job) => job.file)
    .filter((file) => file !== null && !existsSync(`${NAMESPACED_VIDEO_DIR}/${file}`));
}
