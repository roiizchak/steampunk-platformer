// Emits every shipped level into public/assets/levels/.
//
// Run: node tools/gen/make-levels.mjs            — all levels
//      node tools/gen/make-levels.mjs level-01   — one, by id
//
// This file was `make-greybox-level.mjs`, a single-target script at 399 of the 400 permitted lines.
// Phase 8 needs five levels, so it split three ways and kept its history through the rename:
//   - `tools/gen/levelBuilder.mjs`  — the shared builder, and every comment explaining the model
//   - `tools/gen/levels/level-0N.mjs` — one layout per level, stated in tiles
//   - this file — the CLI, and the list of what ships
//
// 🔴 **A level appears in `public/assets/index.json` only once it validates.** `bootLevels.ts`
// collects a problem for ANY catalogued level and `BootScene` then refuses to route, so a
// work-in-progress level-04 in the catalog fails every Phase 1-7 e2e spec at once — the game will not
// start. That is correct fail-closed behaviour and it is not a bug to chase. Emit the file, run
// `npm test`, and only then add the catalog entry.

import { level01 } from './levels/level-01.mjs';
import { writeLevel } from './levelBuilder.mjs';

/**
 * Everything that ships, in play order.
 *
 * The order here is the progression order and the unlock order — `src/sim/progress.ts` takes the ids
 * from the catalog, which `build-assets.mjs` writes from this list, so there is one place that decides
 * what comes after what.
 */
const LEVELS = [level01];

const requested = process.argv[2];
const selected = requested ? LEVELS.filter((l) => l.id === requested) : LEVELS;

if (selected.length === 0) {
  const ids = LEVELS.map((l) => l.id).join(', ');
  throw new Error(`make-levels: no level with id "${requested}". Known ids: ${ids}`);
}

for (const layout of selected) writeLevel(layout);

console.log(`\n${selected.length} of ${LEVELS.length} level(s) written.`);
