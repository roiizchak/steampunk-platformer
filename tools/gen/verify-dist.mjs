// Post-build gate. Run by `npm run build`, after `vite build`.
//
// WHY THIS EXISTS
// Vault 3.1 is a blocker: a test must load the SHIPPED `.tmj` the player loads. The Codex plan
// review (P1/P2, both blockers) caught the original plan putting levels in a root-level `levels/`,
// which Vite never copies into `dist/` — the unit sweep would have been green against a file the
// shipped build did not contain. The fix was to move levels under `public/`.
//
// But "public/ is copied verbatim" is an assumption about a build tool, and the whole lesson is
// that an unverified assumption about shipped data is how the defect happens. The qa-expert gate
// owner (brief 1) checked the triage table's claim that a post-build check had been added, found
// no such check, and said so. It was right: the property held, but nothing enforced it. This is
// the missing enforcement.
//
// It also asserts the DEV-only surfaces are absent, which Phase 10 has to prove anyway and which
// Phase 2 got wrong once already (a dev scene shipped to dist/).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const problems = [];

const shippedLevels = join(root, 'public/assets/levels');
const builtLevels = join(root, 'dist/assets/levels');

// 1. Every authored level reached dist/, byte for byte.
const authored = readdirSync(shippedLevels).filter((f) => f.endsWith('.tmj'));
if (authored.length === 0) {
  problems.push('public/assets/levels/ contains no .tmj files');
}
for (const name of authored) {
  const builtPath = join(builtLevels, name);
  if (!existsSync(builtPath)) {
    problems.push(`${name} was not copied into dist/assets/levels/ — the shipped build has no level`);
    continue;
  }
  const a = readFileSync(join(shippedLevels, name));
  const b = readFileSync(builtPath);
  if (!a.equals(b)) {
    problems.push(`${name} differs between public/ and dist/ (${a.length} vs ${b.length} bytes)`);
  }
}

// 2. The catalog shipped, and every level it names is present in dist/.
const catalogPath = join(root, 'dist/assets/index.json');
if (!existsSync(catalogPath)) {
  problems.push('dist/assets/index.json is missing');
} else {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  for (const entry of catalog.levels ?? []) {
    if (!existsSync(join(root, 'dist', entry.url))) {
      problems.push(`catalog level "${entry.key}" points at ${entry.url}, which is not in dist/`);
    }
  }
  if (!Array.isArray(catalog.levels) || catalog.levels.length === 0) {
    problems.push('dist/assets/index.json lists no levels');
  }
}

// 3. No DEV-only surface survived into the bundle. Scene KEYS are checked as string literals,
//    because the identifiers `togglePlayground`/`toggleElementEditor` legitimately remain as empty
//    method stubs once Vite folds their guarded bodies away.
const bundles = readdirSync(join(root, 'dist/assets')).filter((f) => f.endsWith('.js'));
if (bundles.length === 0) {
  problems.push('dist/assets contains no javascript bundle');
}
for (const name of bundles) {
  const src = readFileSync(join(root, 'dist/assets', name), 'utf8');
  for (const key of ['Playground', 'ElementEditor']) {
    for (const quote of ['`', "'", '"']) {
      if (src.includes(`${quote}${key}${quote}`)) {
        problems.push(`${name} contains the DEV-only scene key ${quote}${key}${quote}`);
      }
    }
  }
  for (const symbol of ['ElementEditorScene', 'PlaygroundScene', '__game', '__phaserGame']) {
    if (src.includes(symbol)) {
      problems.push(`${name} contains the DEV-only symbol ${symbol}`);
    }
  }
}

if (problems.length > 0) {
  console.error('verify-dist FAILED:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `verify-dist ok: ${authored.length} level(s) shipped byte-identical, ` +
    `no DEV-only scene key or debug surface in ${bundles.length} bundle(s)`,
);
