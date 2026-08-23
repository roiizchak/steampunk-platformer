import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SLUGS } from './slugConfig.mjs';

/**
 * Run `build-assets.mjs` once per shipped slug.
 *
 * ## Why this exists
 *
 * `build-assets.mjs:69` is `process.argv[2] ?? 'brass-courier'` — one slug per run, defaulting to
 * the player. So `npm run assets:build` with no argument builds the courier and **nothing else**,
 * and `brass-sentry`'s and `rust-scavenger`'s gates run only when somebody types the slug by hand.
 *
 * That is how `brass-sentry/idle` shipped failing its own loop gate without anyone seeing it: the
 * gate was correct, ran, printed FAIL, and the command nobody runs is the only one that prints it.
 * `tests/unit/every-slug-loop-gate.test.ts` closes the QA half — every slug's looping sheets are now
 * judged by the unit suite regardless of what was typed. This closes the ergonomic half.
 *
 * ⚠️ **The slug list is `slugConfig.mjs`'s `SLUGS`, never a copy.** A hardcoded list in a package
 * script is a second definition that drifts, and drifting second definitions are what let the
 * original defect exist. Adding a slug there is all that is needed here.
 *
 * ⚠️ **This is a wrapper, not a rewiring.** `build-assets.mjs` keeps its module-scope single-slug
 * shape — making it loop internally is a real refactor its own header calls out of scope. A
 * subprocess per slug also means one slug's failure cannot corrupt the next one's module state.
 *
 * Every argument after the script name is forwarded to each run, so
 * `node tools/gen/build-assets-all.mjs --derive-scale` works the way the single-slug form does.
 */

const here = dirname(fileURLToPath(import.meta.url));
const forwarded = process.argv.slice(2);
const failures = [];

for (const slug of SLUGS) {
  console.log(`\n=== ${slug} ===`);
  const run = spawnSync(process.execPath, [join(here, 'build-assets.mjs'), slug, ...forwarded], {
    stdio: 'inherit',
  });
  if (run.status !== 0) {
    failures.push(`${slug} (exit ${run.status})`);
  }
}

// Every slug is attempted before exiting: stopping at the first failure would hide the state of the
// ones after it, which is the same "a check that never ran" problem in a different shape.
if (failures.length > 0) {
  console.error(`\nFAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${SLUGS.length} slugs built.`);
