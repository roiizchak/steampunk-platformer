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
const assetsDir = join(root, 'dist/assets');
if (!existsSync(assetsDir)) {
  // Reading a missing directory would throw and kill the build with a stack trace instead of the
  // intended message — a false RED. Raised by the code-reviewer gate owner (brief 2).
  problems.push('dist/assets does not exist — did vite build run?');
}
const bundles = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith('.js')) : [];
if (existsSync(assetsDir) && bundles.length === 0) {
  problems.push('dist/assets contains no javascript bundle');
}

// index.html is scanned too: it is shipped, and nothing else was looking at it.
const scanned = [
  ...bundles.map((name) => ['assets/' + name, join(assetsDir, name)]),
  ...(existsSync(join(root, 'dist/index.html')) ? [['index.html', join(root, 'dist/index.html')]] : []),
];

for (const [label, path] of scanned) {
  const src = readFileSync(path, 'utf8');
  // Scene KEYS as quoted literals — the identifiers `togglePlayground`/`toggleElementEditor`
  // legitimately survive as empty method stubs, so matching the bare word would cry wolf.
  for (const key of ['Playground', 'ElementEditor']) {
    for (const quote of ['`', "'", '"']) {
      if (src.includes(`${quote}${key}${quote}`)) {
        problems.push(`${label} contains the DEV-only scene key ${quote}${key}${quote}`);
      }
    }
  }
  for (const symbol of ['ElementEditorScene', 'PlaygroundScene', '__game', '__phaserGame']) {
    if (src.includes(symbol)) {
      problems.push(`${label} contains the DEV-only symbol ${symbol}`);
    }
  }
  // Case-INSENSITIVE sweep for USER-FACING prose naming a dev scene. The help text shipped
  // "P playground · O element editor" to production past the quoted-key check above, because it is
  // lowercase and sits inside a longer string.
  //
  // Each phrase carries a space, which is what keeps it off the identifiers `togglePlayground` and
  // `toggleElementEditor` — those legitimately survive as empty method stubs, and a bare
  // case-insensitive "playground" matches them and cries wolf. It did, on the first run.
  for (const phrase of [' playground', 'element editor']) {
    if (src.toLowerCase().includes(phrase)) {
      problems.push(`${label} mentions the DEV-only scene "${phrase.trim()}" in shipped text`);
    }
  }
}

// Every image the catalog names must also have shipped, not only the levels.
const builtCatalog = join(root, 'dist/assets/index.json');
if (existsSync(builtCatalog)) {
  const catalog = JSON.parse(readFileSync(builtCatalog, 'utf8'));
  for (const entry of catalog.images ?? []) {
    if (!existsSync(join(root, 'dist', entry.url))) {
      problems.push(`catalog image "${entry.key}" points at ${entry.url}, which is not in dist/`);
    }
  }
  const authoredCatalog = readFileSync(join(root, 'public/assets/index.json'));
  if (!authoredCatalog.equals(readFileSync(builtCatalog))) {
    problems.push('dist/assets/index.json differs from public/assets/index.json');
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
