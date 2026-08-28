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
// `npm test`, and only then run with `--catalog`.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { level01 } from './levels/level-01.mjs';
import { level02 } from './levels/level-02.mjs';
import { level03 } from './levels/level-03.mjs';
import { level04 } from './levels/level-04.mjs';
import { level05 } from './levels/level-05.mjs';
import { writeLevel } from './levelBuilder.mjs';
import { describeClearanceProblem } from './hazardClearance.mjs';

/** Repo root, the same way `levelBuilder.mjs` derives it. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Everything that ships, in play order.
 *
 * 🔴 The order here is the progression order AND the unlock order. `src/sim/progress.ts` takes the ids
 * from the catalog and never parses a level's name *(vault 3.3)*, and `--catalog` below writes the
 * catalog from this array — so there is exactly one place that decides what comes after what.
 */
const LEVELS = [level01, level02, level03, level04, level05];

const args = process.argv.slice(2);
const writeCatalog = args.includes('--catalog');
const requested = args.find((a) => !a.startsWith('--'));
const selected = requested ? LEVELS.filter((l) => l.id === requested) : LEVELS;

if (selected.length === 0) {
  const ids = LEVELS.map((l) => l.id).join(', ');
  throw new Error(`make-levels: no level with id "${requested}". Known ids: ${ids}`);
}

/**
 * 🔴 Every written level is re-read and checked for a place the player can be PINNED.
 *
 * The check runs here rather than inside `levelBuilder.mjs` for two reasons. That file is at exactly
 * 400 lines against a hard ceiling; and reading the bytes back is a stronger check than inspecting
 * the object that produced them — it is the same *(vault 3.1)* reasoning that makes the unit suite
 * run the real validator over the shipped file.
 *
 * The rule and the defect are in `hazardClearance.mjs`. In short: a hazard run that stops one tile
 * short of a wall leaves 96 px of floor for a 132 px player, and landing there pins you in the
 * spikes with a wall in front of you. Three shipped levels had one. **Throws rather than warns** —
 * a generator that prints a problem and writes the file anyway is how four unspiked pits shipped.
 */
function assertStandable(layout, out) {
  const map = JSON.parse(readFileSync(out, 'utf8'));
  const objects = map.layers.find((l) => l.type === 'objectgroup').objects;
  const of = (name) =>
    objects
      .filter((o) => (o.properties ?? []).some((p) => p.name === name && p.value === true))
      .map((o) => ({ x: o.x, y: o.y, w: o.width, h: o.height }));

  const problem = describeClearanceProblem({
    solids: of('solid'),
    hazards: of('hazard'),
    tileSize: map.tilewidth,
    groundTopRow: layout.groundTopRow,
    // `PLAYER_BOX.w * RENDER_SCALE`, parsed from the runtime rather than restated — the same rule
    // `build-world.mjs` follows for `TILE_SIZE`, and for the same reason.
    playerWidthPx: runtimePlayerWidth(),
  });
  if (problem !== null) {
    throw new Error(`make-levels: ${layout.id} — ${problem}`);
  }
}

/** `PLAYER_BOX.w * RENDER_SCALE`, read from the source of truth. Throws rather than defaulting. */
function runtimePlayerWidth() {
  // `[^=]*` spans the type annotation: the declaration is `PLAYER_BOX: LocalBox = { ... }`.
  const box = /export const PLAYER_BOX[^=]*=\s*\{[^}]*?\bw:\s*(\d+)/s.exec(
    readFileSync(resolve(ROOT, 'src/sim/playerTuning.ts'), 'utf8'),
  );
  const scale = /export const RENDER_SCALE = (\d+);/.exec(
    readFileSync(resolve(ROOT, 'src/game/constants.ts'), 'utf8'),
  );
  if (!box || !scale) {
    throw new Error(
      'make-levels: could not read PLAYER_BOX.w / RENDER_SCALE from the runtime. The clearance ' +
        'rule is a body width; it must not fall back to a guess.',
    );
  }
  return Number(box[1]) * Number(scale[1]);
}

for (const layout of selected) assertStandable(layout, writeLevel(layout));

/**
 * Rewrite `index.json`'s `levels` array from `LEVELS`, and nothing else in the file.
 *
 * ⚠️ **Behind a flag, deliberately.** `bootLevels.ts` collects a problem for ANY catalogued level and
 * `BootScene` then refuses to route — so catalogueing a work-in-progress level fails every Phase 1–7
 * e2e spec at once and the game will not start. That is correct fail-closed behaviour and not a bug to
 * chase. The sequence is: emit the files, run `npm test`, then `--catalog`.
 *
 * A targeted merge rather than a rewrite, matching `catalogWrite.mjs`'s rule: every other field in
 * `index.json` (`_comment`, `_sheets`, `images`, `sheets`, `audio`) is data this script does not have and
 * must survive byte-compatible. Key order inside the file is preserved because the object is mutated in
 * place rather than rebuilt.
 */
if (writeCatalog) {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/assets/index.json');
  const catalog = JSON.parse(readFileSync(path, 'utf8'));
  catalog.levels = LEVELS.map((l) => ({ key: l.id, url: `assets/levels/${l.id}.tmj` }));
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`\ncatalogued ${catalog.levels.length} level(s) in public/assets/index.json`);
}

console.log(`\n${selected.length} of ${LEVELS.length} level(s) written.`);
