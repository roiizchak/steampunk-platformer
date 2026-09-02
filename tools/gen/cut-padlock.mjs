/**
 * **Cut the generated padlock out of its chroma field. One asset, run once, by hand.**
 *
 * Deliberately NOT an `assets:*` script in `package.json`. There is one icon; a pipeline stage for
 * it would be a build step nothing ever runs again, and `touchAtlasCli.mjs` cannot be reused here
 * because its `--cell` validates against `CELL_KEYS`.
 *
 * The cut itself is `cutFace()` — the same key-out, halo trim, speck removal, single-blob check,
 * edge-touch refusal, square crop and downscale the six touch faces went through. Reusing it is the
 * point: every one of those checks was paid for by a real defect, and a second hand-written keyer
 * would be a second set of them to get wrong.
 *
 * Usage: `node tools/gen/cut-padlock.mjs <generated.png> <out.png>`
 */

import { writeFileSync } from 'node:fs';

import { decodePng, encodePng, readBytes } from './png.mjs';
import { cutFace } from './touchPlateCut.mjs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  throw new Error('usage: node tools/gen/cut-padlock.mjs <generated.png> <out.png>');
}

const source = decodePng(readBytes(inPath));
// 🔴 The whole image is the cell. The touch plate was a 3x2 sheet split into six; this generation
// asked for ONE padlock on its own field, so there is nothing to split and `cutFace`'s edge-touch
// refusal is checking the model's margin rather than a divider.
const face = cutFace(source, 'ui-padlock');
writeFileSync(outPath, encodePng(face.width, face.height, face.data));
process.stdout.write(
  `ui-padlock: ${source.width}x${source.height} -> ${face.width}x${face.height} -> ${outPath}\n`,
);
