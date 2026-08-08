/**
 * `npm run assets:prompts` — assemble the five Seedance prompts and write them beside the clips.
 *
 * This used to live in `_generated/`, which is **gitignored**, so the one script that turns
 * `motion.mjs` + `STYLE.md` into the exact text the model was sent did not survive a clean clone.
 * That is the same failure Street-Fighter's own review caught in its art pipeline: art you cannot
 * regenerate is art you cannot correct. The prompts themselves stay in `_generated/video/` beside
 * the `.mp4` and `.job.json` they produced, because those are outputs; the *recipe* belongs in the
 * repository.
 *
 * The RENDERING and DO NOT INCLUDE blocks are quoted out of STYLE.md verbatim and never paraphrased
 * *(vault 4.3)*, which is why they are read from the file rather than copied into `motion.mjs`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { styleTemplate, templateBlock } from './prompt.mjs';
import { VIDEO_MOTIONS, videoPrompt } from './motion.mjs';

const OUT = '_generated/video';

const template = styleTemplate('docs/STYLE.md');
const blocks = {
  rendering: templateBlock(template, 'RENDERING'),
  forbid: templateBlock(template, 'DO NOT INCLUDE'),
};

mkdirSync(OUT, { recursive: true });
for (const action of Object.keys(VIDEO_MOTIONS)) {
  const prompt = videoPrompt(template, action, blocks);
  writeFileSync(`${OUT}/${action}.prompt.txt`, prompt);
  const spec = VIDEO_MOTIONS[action];
  console.log(
    `${action.padEnd(5)} ${String(prompt.length).padStart(5)} chars  ` +
      `${spec.frames} frames  cyclic=${spec.cyclic}`,
  );
}
console.log(`\nwrote ${Object.keys(VIDEO_MOTIONS).length} prompts to ${OUT}`);
