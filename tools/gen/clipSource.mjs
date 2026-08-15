/**
 * Where a declared clip's `.mp4` lives, and how one is found.
 *
 * Split out of `build-clips.mjs` so it is importable — and its directory resolution testable — without
 * dragging in ffmpeg/ffprobe or the script's own `main()`.
 *
 * Two source directories, not one. Phase 4's five legacy bare-key clips (`idle`, `walk`, `run`,
 * `jump`, `fall`) were generated straight into `_generated/video/`. Phase 5's namespaced `slug/action`
 * clips (`brass-courier/attack`, `brass-sentry/fire`, ...) were generated into
 * `_generated/phase05/video/` instead — the presence of a slug in the action name, the same signal
 * `videoPrompt` already uses to decide whose identity clause to use, is what picks which.
 */

import { existsSync, readdirSync } from 'node:fs';

export const VIDEO_DIR = '_generated/video';
export const NAMESPACED_VIDEO_DIR = '_generated/phase05/video';

/** The directory a clip for this action lives in. */
export function videoDirFor(action) {
  return action.includes('/') ? NAMESPACED_VIDEO_DIR : VIDEO_DIR;
}

/**
 * The on-disk filename stem for an action. A filename cannot hold a `/`, so a namespaced action's
 * clip swaps it for a hyphen — `brass-courier/attack` -> `brass-courier-attack`.
 */
export function clipStemOf(action) {
  return action.replace('/', '-');
}

/**
 * EVERY `.mp4` on disk that could be this action's clip — the declared winner, its superseded
 * rounds, and anything a re-shoot has just landed. Sorted, so a caller's error message is stable.
 *
 * Extracted so the glob expression exists ONCE. `findClip` below used to carry its own copy of this
 * filter, and the adoption contract in `clipJobs.mjs` needed the same one — two definitions of
 * "which files could be this clip" is precisely the drift vault 5.3 is about, and this module has
 * already paid for that lesson once (R8, where `findClip` restated `action.replace('/','-')`
 * instead of importing the stem helper).
 */
export function clipCandidates(action, { dirExists = existsSync, listFiles = readdirSync } = {}) {
  const dir = videoDirFor(action);
  if (!dirExists(dir)) {
    return [];
  }
  const stem = clipStemOf(action);
  return listFiles(dir)
    .filter((f) => f === `${stem}.mp4` || (f.startsWith(`${stem}-`) && f.endsWith('.mp4')))
    .sort();
}

/**
 * The next filename in `dir` for `stem` that does not already exist on disk. A re-shoot's rendered
 * `--download` flag must never overwrite a paid, non-regenerable round-1 clip (vault 4.16) — this is
 * what stops `brass-courier-attack.mp4` being clobbered instead of producing `-r2`/`-r3`.
 *
 * **Moved here from `submit-clips.mjs` so it can be tested and, more importantly, so the adoption
 * contract can ask what filename a submission WOULD produce.** That question is the whole of the
 * session-6 review's blocker: `submit-clips` computed this path independently of `CLIP_JOBS`'s
 * declared `file`, and `findClip` trusts the declared `file` exactly — so six of seven paid
 * re-shoots would have downloaded correctly and then been ignored in favour of the very clips they
 * were bought to replace, silently.
 */
export function nextFreeDownloadPath(dir, stem, { fileExists = existsSync } = {}) {
  const base = `${dir}/${stem}.mp4`;
  if (!fileExists(base)) return base;
  for (let n = 2; n <= 99; n += 1) {
    const candidate = `${dir}/${stem}-r${n}.mp4`;
    if (!fileExists(candidate)) return candidate;
  }
  throw new Error(
    `submit-clips: every "${stem}[-r2..-r99].mp4" already exists in ${dir} — clear out a stale one ` +
      `before rendering another command for it.`,
  );
}

/**
 * `dirExists`/`listFiles` are injectable so `tests/unit/clip-extraction.test.ts` can exercise this
 * on synthetic directory listings — no real `_generated/`, no temp directories, and (since the test
 * lives under `tests/`, which is `tsconfig`-strict with no `@types/node`) no `node:fs` import in the
 * test file itself.
 */
export function findClip(
  action,
  { dirExists = existsSync, listFiles = readdirSync, declaredFile = null } = {},
) {
  const dir = videoDirFor(action);
  if (!dirExists(dir)) {
    throw new Error(
      `assets:clips: ${dir} does not exist. Raw model output is gitignored by design — ` +
        `re-fetch it from the request ids in docs/generations/ (indexed by ` +
        `docs/GENERATION-LOG.md). This build does NOT ` +
        `substitute a placeholder (vault 4.16).`,
    );
  }

  // `CLIP_JOBS[action].file` can declare the exact winning filename — e.g. when a re-shoot left a
  // superseded `-r2` sibling on disk (vault 4.16: paid input is deleted never, only superseded).
  // Declared, this skips the glob (and `listFiles`) entirely, so the NEXT re-shoot's `-r3` cannot
  // reintroduce the ambiguity below.
  if (declaredFile !== null) {
    const path = `${dir}/${declaredFile}`;
    if (!dirExists(path)) {
      throw new Error(
        `assets:clips: CLIP_JOBS declares "${action}" as "${declaredFile}", but ${path} does not ` +
          `exist. Fix the declared filename in CLIP_JOBS — it is never substituted (vault 4.16).`,
      );
    }
    return path;
  }

  // One definition of "which files could be this clip", shared with the adoption contract in
  // `clipJobs.mjs`. This used to be a second copy of the filter now in `clipCandidates`.
  const files = clipCandidates(action, { dirExists, listFiles });
  if (files.length === 0) {
    throw new Error(
      `assets:clips: no clip for declared animation "${action}" in ${dir}. A declared input ` +
        `that cannot be found fails the build; it is never substituted (vault 4.16).`,
    );
  }
  // An ambiguous, UNDECLARED prefix is a silent way to ship a superseded generation — the same trap
  // `raw()` in build-world.mjs hit on its first run. Refuse rather than pick, and refuse for good:
  // declare the winner in CLIP_JOBS's `file` field rather than deleting the loser (paid,
  // non-regenerable input stays on disk) — a future re-shoot's `-r3` will hit this same throw until
  // it does.
  if (files.length > 1) {
    throw new Error(
      `assets:clips: "${action}" matches ${files.length} clips in ${dir} ` +
        `(${files.join(', ')}) and CLIP_JOBS has no declared "file" for it. Declare the winner as ` +
        `CLIP_JOBS["${action}"].file instead of picking one — the next re-shoot only adds another ` +
        `candidate.`,
    );
  }
  // A plain `/` join, not `node:path`'s `join` — deterministic across platforms, and this string is
  // only ever handed to ffprobe/ffmpeg, both of which take a forward-slash path on Windows too.
  return `${dir}/${files[0]}`;
}
