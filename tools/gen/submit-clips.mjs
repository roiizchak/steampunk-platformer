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

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { styleTemplate, templateBlock } from './prompt.mjs';
import { VIDEO_MOTIONS, videoPrompt } from './motion.mjs';
import { CLIP_JOBS, PARAMS_OUT_DIR, PROMPT_OUT_DIR, clipStem } from './clipJobs.mjs';
import { nextFreeDownloadPath, videoDirFor } from './clipSource.mjs';
import { auditOrThrow } from './anchorAudit.mjs';

/**
 * 🔴 **The spend point.** This script renders the `genmedia run` command a human pays for, and the
 * padded anchors ARE the bytes it submits. Criterion 4.27 says the geometry is measured *before
 * generating from it* — anywhere later is a post-mortem.
 *
 * 🔴 `requirePresent` is EXPLICIT, and the comment here used to claim it was implicit *"if
 * `_generated/` exists at all (and it must, for anchors to be submitted)"*. **It need not, and on a
 * clean clone it does not** — this script `mkdirSync`s the tree itself a few lines below. So the
 * `generatedRoot` heuristic stood aside on the one path where standing aside means printing a paid
 * generation command having measured zero bytes. Found by the Codex implementation review. You
 * cannot submit an anchor you do not have; absence here is never context.
 */
auditOrThrow({ label: 'anchor audit (pre-submission)', requirePresent: true });

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

  // Legacy bare keys (`jump`, ...) live in `_generated/video`; namespaced combat keys live in
  // `_generated/phase05/video` — the same split `findClip` (clipSource.mjs) reads clips back from,
  // so a rendered download path is never written somewhere the build can't find it.
  const videoDir = videoDirFor(key);
  mkdirSync(videoDir, { recursive: true });
  const downloadPath = nextFreeDownloadPath(videoDir, stem);

  /**
   * The sidecars are versioned WITH the download, not with the key (finding R5).
   *
   * `nextFreeDownloadPath` already refuses to clobber a paid `.mp4`, but the prompt and params were
   * written to `${stem}.txt` / `${stem}.params.json` regardless — so rendering a re-shoot silently
   * overwrote the provenance of the round that was actually paid for, which is the exact record
   * `CLIP_JOBS` exists to create. A round's clip, its prompt and its parameters now share one stem.
   */
  const roundStem = basename(downloadPath, '.mp4');

  const promptPath = `${PROMPT_OUT_DIR}/${roundStem}.txt`;
  writeFileSync(promptPath, prompt);

  // A loop needs `--end_image_url` set back to the anchor (ASSET-PIPELINE.md §2); a one-shot needs
  // it omitted, because its end pose deliberately differs from its start pose.
  const endImageUrl = spec.cyclic ? job.anchorUrl : null;

  const paramsPath = `${PARAMS_OUT_DIR}/${roundStem}.params.json`;
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
  console.log(`  # wrote ${promptPath} and ${paramsPath}`);

  /**
   * 🔴 The adoption reminder, printed where a human can still act on it.
   *
   * `nextFreeDownloadPath` picks the download filename from what is on disk; `findClip` resolves the
   * clip to extract from `CLIP_JOBS[key].file`. **Nothing connected the two.** Every re-shoot
   * therefore lands a new `-rN` that the build ignores, and the previous round keeps being packed —
   * silently, and looking exactly like success. The session-6 Codex plan review measured this at six
   * of seven keys for a batch about to be paid for.
   *
   * `tests/unit/clip-adoption.test.ts` is the gate; this line is the courtesy that stops you
   * discovering it there.
   */
  const declared = job.file;
  const willLand = basename(downloadPath);
  if (declared !== willLand) {
    console.log(
      `  # ⚠️  ADOPTION: this command lands "${willLand}", but CLIP_JOBS declares ` +
        `${declared === null ? 'no file (glob)' : `"${declared}"`}.\n` +
        `  #     If you run it and keep the result, set CLIP_FILES["${key}"] = '${willLand}'\n` +
        `  #     and move the old name into SUPERSEDED_CLIPS["${key}"]. Until you do, the build\n` +
        `  #     keeps extracting the OLD clip and nothing tells you.\n`,
    );
  } else {
    console.log('');
  }
}
