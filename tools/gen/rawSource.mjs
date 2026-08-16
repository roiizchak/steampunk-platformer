/**
 * Where a generation's raw model output lives, and the rule for resolving one.
 *
 * Split out of `build-world.mjs` in Phase 6 so `buildChrome.mjs` can share it rather than restate
 * it. The refusal below is the whole value of this module: an ambiguous input is not a resolvable
 * one, and every silent tie-break this project has tried shipped a superseded image past a green
 * gate.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { decodePng } from './png.mjs';

export const RAW = '_generated/world';

export function raw(prefix) {
  // Model output is `<prefix>-<request_id>.png`, and the request id is what makes a generation
  // citable in GENERATION-LOG.md. Matching it explicitly also excludes this script's own
  // `-preview.png` output, which lands in the same folder and is not a source.
  const files = readdirSync(RAW).filter((f) =>
    new RegExp(`^${prefix}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png$`)
      .test(f),
  );
  if (files.length === 0) {
    throw new Error(
      `assets:world: no source for "${prefix}" in ${RAW}. A declared input that cannot be found ` +
        `fails the build and is never substituted (vault 4.16).`,
    );
  }
  if (files.length > 1) {
    // `.find()` used to sit here, which silently takes whichever name readdir returns first.
    // Regenerating an asset leaves BOTH the old and the new file in place — the filename carries
    // the request_id — so the build would keep using the superseded image and every gate would
    // pass on it. That is the stale-asset failure this phase has already paid for twice, and an
    // ambiguous input is not a resolvable one: move the superseded file out of `${RAW}/`.
    throw new Error(
      `assets:world: "${prefix}" is ambiguous — ${files.length} candidates in ${RAW}:\n` +
        files.map((f) => `  ${f}`).join('\n') +
        `\nThe build refuses to guess which generation is current.`,
    );
  }
  return decodePng(readFileSync(`${RAW}/${files[0]}`));
}
