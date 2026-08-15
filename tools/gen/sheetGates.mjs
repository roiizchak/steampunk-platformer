/**
 * **The G4/G5 CLI.** `node tools/gen/sheetGates.mjs <slug> <action>` runs both measurement gates
 * against an already-packed sheet in `public/assets/index.json` and prints one status line per gate.
 *
 * ## Why this exists
 *
 * `gateVerticalDrift` (`driftGate.mjs`, "G4") and `gateReachWindow` (`reachGate.mjs`, "G5") were built
 * in an earlier session and never run against a real packed sheet: neither had a CLI or an
 * `import.meta.url` main guard, and their only callers were their own unit fixtures. A handoff
 * document once said to "run G4" as though it were runnable. This module is that CLI, following the
 * shape `anchorGate.mjs` (guard G1) already established when IT gained one: `import.meta.url` main
 * guard, tab-separated `STATUS\tpath\tdetail` lines, non-zero exit on any FAIL.
 *
 * The gate-running core (`runGates`) is exported separately from the disk-reading core
 * (`runSheetGates`) so a test can drive the gate logic in-process without spawning a process — a
 * vitest spawned from a Node parent loses its runner context and every suite dies at import.
 *
 * ## The two inputs the gates need but do not know how to find themselves
 *
 * **G4's airborne allowance** must be caller-supplied (`driftGate.mjs`'s own header: "never a name
 * string and never a hardcoded action list"). It is derived here from data already committed by the
 * build pipeline: `character-bounds-<slug>.json`'s `verticalAnchor` says whether an action is
 * `centroid`-anchored (airborne — the sim owns altitude, so the ART is allowed to rise and fall in
 * its own pose) or `feet`-anchored (grounded — no allowance). For a centroid-anchored action the
 * allowance is the actual recorded `liftPx` spread in `lift-profile-<slug>.json` — the number the
 * pipeline itself measured when it packed the sheet, not a guessed constant.
 *
 * **G5's active window** only exists for moves with a startup/active/recovery struct — today that is
 * `brass-courier/attack` **and `rust-scavenger/attack`**. The scavenger row was missing for a full
 * session after its sheet shipped, and the consequence is worth stating: `attackWindowFor` returns
 * `null` for an undeclared pair and `runSheetGates` then reports G5 as `N/A` and folds that into a
 * PASSING exit code. So the one attack sheet the session actually bought was exempt from the gate
 * criterion 5.4c names — **by omission, not by a documented exception** — and 5.4c read as satisfied.
 * Found independently by both criterion 5.4c gate-owner briefs. A criterion that says "every attack
 * sheet" against a table with one row is a criterion measuring one sheet. `ATTACK_STARTUP_TICKS`/`ATTACK_ACTIVE_TICKS` mirror `src/sim/combat.ts`'s
 * `ATTACK` the same way `reachGate.mjs` mirrors `PLAY_LAG_TICKS`: `tools/gen/*.mjs` cannot import
 * TypeScript (`tools/gen` sits outside tsconfig's `include`), so the constant is restated here and
 * pinned equal to the real export by `tests/unit/sheet-gates.test.ts`. An action with no declared
 * window reports G5 as `N/A`, explicitly, rather than a guessed verdict.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ATTACK_TOTAL_TICKS, SCAVENGER_ATTACK_TOTAL_TICKS } from './catalogTimings.mjs';
import { configFor } from './slugConfig.mjs';
import { sliceFrame } from './assetSources.mjs';
import { decodePng, readBytes } from './png.mjs';
import { gateVerticalDrift } from './driftGate.mjs';
import { gateReachWindow } from './reachGate.mjs';
import { FAIL } from './gates.mjs';

/** Mirrors `ATTACK.startup` (`src/sim/combat.ts`). Pinned by `tests/unit/sheet-gates.test.ts`. */
export const ATTACK_STARTUP_TICKS = 6;
/** Mirrors `SCAVENGER_ATTACK.startup` (`src/sim/scavengerAttack.ts`). Pinned by `sheet-gates.test.ts`. */
export const SCAVENGER_ATTACK_STARTUP_TICKS = 18;
/** Mirrors `SCAVENGER_ATTACK.active` (`src/sim/scavengerAttack.ts`). Pinned by `sheet-gates.test.ts`. */
export const SCAVENGER_ATTACK_ACTIVE_TICKS = 6;
/** Mirrors `ATTACK.active` (`src/sim/combat.ts`). */
export const ATTACK_ACTIVE_TICKS = 4;

const CATALOG_PATH = 'public/assets/index.json';

/** `slug/action` -> the move's active-window contract. Only pairs that HAVE one, declared. */
const ATTACK_WINDOWS = {
  'brass-courier/attack': {
    startup: ATTACK_STARTUP_TICKS,
    active: ATTACK_ACTIVE_TICKS,
    simTicks: ATTACK_TOTAL_TICKS,
  },
  'rust-scavenger/attack': {
    startup: SCAVENGER_ATTACK_STARTUP_TICKS,
    active: SCAVENGER_ATTACK_ACTIVE_TICKS,
    simTicks: SCAVENGER_ATTACK_TOTAL_TICKS,
  },
};

/** G5's window for `(slug, action)`, or `null` if this action has no strike to align against. */
export function attackWindowFor(slug, action) {
  return ATTACK_WINDOWS[`${slug}/${action}`] ?? null;
}

/**
 * G4's airborne allowance for `(slug, action)`, read off the pipeline's own committed measurements
 * (see this module's header). Zero for a grounded or undeclared action — the safe direction.
 */
export function driftAllowanceFor(slug, action) {
  const { config, liftProfile } = configFor(slug);
  const bounds = JSON.parse(readFileSync(config, 'utf8'));
  const anchor = bounds.animations?.[action]?.verticalAnchor;
  if (anchor !== 'centroid') {
    return 0;
  }
  const lift = JSON.parse(readFileSync(liftProfile, 'utf8'));
  const frames = lift.animations?.[action]?.frames;
  if (!frames || frames.length === 0) {
    throw new Error(
      `sheetGates: "${slug}/${action}" is centroid-anchored (airborne) but ${liftProfile} has no ` +
        `recorded liftPx frames to derive an allowance from — a guessed number is exactly what ` +
        `this function exists to avoid.`,
    );
  }
  const values = frames.map((f) => f.liftPx);
  return Math.max(...values) - Math.min(...values);
}

/**
 * Run G4 (always) and G5 (only when `g5Opts` is supplied) over one sheet's already-decoded frames.
 * The callable core: takes frame arrays directly, touches no disk, so a test drives it in-process.
 */
export function runGates(frames, { g4Opts = {}, g5Opts = null } = {}) {
  const g4 = gateVerticalDrift(frames, g4Opts);
  const g5 = g5Opts ? gateReachWindow(frames, g5Opts) : null;
  return { g4, g5 };
}

function findCatalogEntry(slug, action) {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const key = `${slug}-${action}`;
  const entry = catalog.sheets.find((s) => s.key === key);
  if (!entry) {
    throw new Error(
      `sheetGates: no packed sheet "${key}" in ${CATALOG_PATH}. Run \`npm run assets:build\` first, ` +
        `or check the slug/action spelling — this never substitutes a placeholder (vault 4.16).`,
    );
  }
  return entry;
}

/** Cut a packed sheet's frames back out, using the same slicer `build-assets.mjs` gates itself with. */
function loadSheetFrames(entry) {
  const decoded = decodePng(readBytes(join('public', entry.url)));
  const frames = [];
  for (let i = 0; i < entry.frameCount; i += 1) {
    frames.push(sliceFrame(decoded, i, entry.frameWidth, entry.frameHeight));
  }
  return frames;
}

function formatLine(status, label, gate, detail) {
  return `${status}\t${label}\t${gate}\t${detail}`;
}

/**
 * The CLI's disk-reading core: resolve `(slug, action)` against the catalog, run both gates, format
 * both status lines. Returns `{ lines, exitCode, g4, g5 }` — `exitCode` is 1 iff either gate FAILed.
 */
export function runSheetGates(slug, action) {
  const label = `${slug}/${action}`;
  const entry = findCatalogEntry(slug, action);
  const frames = loadSheetFrames(entry);
  const g5Opts = attackWindowFor(slug, action);
  const { g4, g5 } = runGates(frames, { g4Opts: { allowancePx: driftAllowanceFor(slug, action) }, g5Opts });

  const lines = [
    formatLine(g4.verdict, label, 'G4', g4.reason),
    g5Opts
      ? formatLine(g5.verdict, label, 'G5', g5.reason)
      : formatLine('N/A', label, 'G5', 'no declared attack window for this action'),
  ];
  const exitCode = g4.verdict === FAIL || (g5 && g5.verdict === FAIL) ? 1 : 0;
  return { lines, exitCode, g4, g5 };
}

/**
 * CLI: `node tools/gen/sheetGates.mjs <slug> <action>`. Not exercised by the unit suite (that drives
 * `runGates`/`runSheetGates` directly); this is the piece the handoff assumed already existed.
 */
function main(argv) {
  const [slug, action] = argv;
  if (!slug || !action) {
    console.error('usage: node tools/gen/sheetGates.mjs <slug> <action>');
    process.exit(1);
  }
  try {
    const { lines, exitCode } = runSheetGates(slug, action);
    for (const line of lines) {
      console.log(line);
    }
    process.exit(exitCode);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
