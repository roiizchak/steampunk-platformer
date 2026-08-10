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
 * `dirExists`/`listFiles` are injectable so `tests/unit/clip-extraction.test.ts` can exercise this
 * on synthetic directory listings — no real `_generated/`, no temp directories, and (since the test
 * lives under `tests/`, which is `tsconfig`-strict with no `@types/node`) no `node:fs` import in the
 * test file itself.
 */
export function findClip(action, { dirExists = existsSync, listFiles = readdirSync } = {}) {
  const dir = videoDirFor(action);
  if (!dirExists(dir)) {
    throw new Error(
      `assets:clips: ${dir} does not exist. Raw model output is gitignored by design — ` +
        `re-fetch it from the request ids in docs/generations/ (indexed by ` +
        `docs/GENERATION-LOG.md). This build does NOT ` +
        `substitute a placeholder (vault 4.16).`,
    );
  }
  // A namespaced action's clip is named on disk with the slash swapped for a hyphen — a filename
  // cannot hold a `/` — e.g. `brass-courier/attack` -> `brass-courier-attack.mp4`.
  const stem = action.replace('/', '-');
  const files = listFiles(dir).filter(
    (f) => f === `${stem}.mp4` || (f.startsWith(`${stem}-`) && f.endsWith('.mp4')),
  );
  if (files.length === 0) {
    throw new Error(
      `assets:clips: no clip for declared animation "${action}" in ${dir}. A declared input ` +
        `that cannot be found fails the build; it is never substituted (vault 4.16).`,
    );
  }
  // An ambiguous prefix is a silent way to ship a superseded generation — the same trap `raw()` in
  // build-world.mjs hit on its first run. Refuse rather than pick.
  if (files.length > 1) {
    throw new Error(
      `assets:clips: "${action}" matches ${files.length} clips in ${dir} ` +
        `(${files.join(', ')}). Delete the superseded ones — picking the first would silently ` +
        `ship whichever the directory happened to list first.`,
    );
  }
  // A plain `/` join, not `node:path`'s `join` — deterministic across platforms, and this string is
  // only ever handed to ffprobe/ffmpeg, both of which take a forward-slash path on Windows too.
  return `${dir}/${files[0]}`;
}
