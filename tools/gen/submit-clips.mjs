/**
 * `node tools/gen/submit-clips.mjs [key ...]` — renders the exact `genmedia` command for each
 * `CLIP_JOBS` record and writes its prompt + params sidecars beside where the clip will land.
 *
 * **This script never calls fal, never touches the network, and spends nothing.** It is a renderer
 * of commands, not a submitter — a human reads the printed `genmedia run ...` line and decides
 * whether to run it. That split is the fix for the defect this work item exists to close: the
 * parameters that go into the command now come from `CLIP_JOBS`, a version-controlled file, instead
 * of a human retyping them per clip.
 *
 * With no arguments, renders every record in `CLIP_JOBS`. With one or more `slug/action` keys,
 * renders only those.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { styleTemplate, templateBlock } from './prompt.mjs';
import { VIDEO_MOTIONS, videoPrompt } from './motion.mjs';
import { CLIP_JOBS, PARAMS_OUT_DIR, PROMPT_OUT_DIR, VIDEO_OUT_DIR, clipStem } from './clipJobs.mjs';

/**
 * The next filename in `dir` for `stem` that does not already exist on disk. A re-shoot's rendered
 * `--download` flag must never overwrite a paid, non-regenerable round-1 clip (vault 4.16) — this is
 * what stops `brass-courier-attack.mp4` being clobbered instead of producing `-r2`/`-r3`.
 */
function nextFreeDownloadPath(dir, stem) {
  const base = `${dir}/${stem}.mp4`;
  if (!existsSync(base)) return base;
  for (let n = 2; n <= 99; n += 1) {
    const candidate = `${dir}/${stem}-r${n}.mp4`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(
    `submit-clips: every "${stem}[-r2..-r99].mp4" already exists in ${dir} — clear out a stale one ` +
      `before rendering another command for it.`,
  );
}

const requested = process.argv.slice(2);
const keys = requested.length > 0 ? requested : Object.keys(CLIP_JOBS);

const template = styleTemplate('docs/STYLE.md');
const blocks = {
  rendering: templateBlock(template, 'RENDERING'),
  forbid: templateBlock(template, 'DO NOT INCLUDE'),
};

mkdirSync(PROMPT_OUT_DIR, { recursive: true });
mkdirSync(PARAMS_OUT_DIR, { recursive: true });

for (const key of keys) {
  const job = CLIP_JOBS[key];
  if (!job) {
    console.error(`submit-clips: no CLIP_JOBS record for "${key}" — skipping.`);
    continue;
  }
  const spec = VIDEO_MOTIONS[key];
  const stem = clipStem(key);
  const prompt = videoPrompt(template, key, blocks);

  const promptPath = `${PROMPT_OUT_DIR}/${stem}.txt`;
  writeFileSync(promptPath, prompt);

  const downloadPath = nextFreeDownloadPath(VIDEO_OUT_DIR, stem);
  // A loop needs `--end_image_url` set back to the anchor (ASSET-PIPELINE.md §2); a one-shot needs
  // it omitted, because its end pose deliberately differs from its start pose.
  const endImageUrl = spec.cyclic ? job.anchorUrl : null;

  const paramsPath = `${PARAMS_OUT_DIR}/${stem}.params.json`;
  writeFileSync(
    paramsPath,
    JSON.stringify({ key, ...job, endImageUrl, promptPath, downloadPath }, null, 2),
  );

  const endFlag = endImageUrl ? `  --end_image_url "${endImageUrl}" \\\n` : '';
  console.log(
    `genmedia run ${job.endpoint} \\\n` +
      `  --image_url "${job.anchorUrl}" \\\n` +
      endFlag +
      `  --prompt "$(cat "${promptPath}")" \\\n` +
      `  --duration ${job.duration} --resolution ${job.resolution} --aspect_ratio "${job.aspectRatio}" \\\n` +
      `  --generate_audio false --download "./${downloadPath}" --json`,
  );
  console.log(`  # wrote ${promptPath} and ${paramsPath}\n`);
}
