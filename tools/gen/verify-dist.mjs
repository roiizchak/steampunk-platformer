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
import { measureBundle } from './measure-bundle.mjs';

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
//
//    ## What this section CAN and CANNOT catch — measured 2026-08-23, not argued
//
//    Session inventory 5.1 recorded this as "the gate meant to stop DEV code shipping cannot fire
//    either way for module-scope code". Half right, and the wrong half is the believed one. Two
//    mutations, each rebuilt and read:
//
//      * drop the `import.meta.env.DEV` ternary in `src/game/config.ts`, registering the three dev
//        scenes in production  ->  **FAILED**: 3 scene keys, 1 symbol, 1 prose hit. Covered.
//      * drop the `import.meta.env.DEV` early-return in `src/debug/globals.ts`'s
//        `updateDebugState`  ->  **`verify-dist ok`**. NOT covered, and it ships
//        `Object.assign(state, patch)` into every tick of production play.
//
//    The difference is what the tell is made of. A scene key is a quoted string literal and esbuild
//    keeps it. A guarded body whose only tell is a module-scope identifier is renamed, so no grep
//    over a minified bundle can ever see it -- and no amount of adding symbols to the list below
//    changes that, which is why the fix is NOT here.
//
//    `tests/unit/dev-guard-census.test.ts` covers that half, in the layer where a guard is still
//    legible. **Do not delete a guard on the strength of a green build.**
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
  for (const key of ['Playground', 'ElementEditor', 'Gym']) {
    for (const quote of ['`', "'", '"']) {
      if (src.includes(`${quote}${key}${quote}`)) {
        problems.push(`${label} contains the DEV-only scene key ${quote}${key}${quote}`);
      }
    }
  }
  for (const symbol of [
    'ElementEditorScene',
    'PlaygroundScene',
    'GymScene',
    '__game',
    '__phaserGame',
    'spawnDevEnemies',
    // The pin probe's own name. `URLSearchParams` below catches the `?pin=1` read, but only while
    // the flag is how it is reached — this pins the overlay itself, which is what must never ship.
    'createPinProbe',
    'devPinProbe',
    // 🔴 **No production path in this project parses a query string**, so the constructor itself is
    // the tell. Added in Phase 9 for `?hitstop=N` (`gameLevelPick.hitstopScaleFromSearch`), and it
    // pins the four older affordances at the same time — `?perfMutation` (`audio.ts`), `?breakAsset`
    // and `?breakFilter` (`bootAssets.ts`, `BootScene.ts`), `?feel` (`feelVariants.ts`) and the dev
    // overlays (`gameDev.ts`). Every one of those is folded out today by an `import.meta.env.DEV`
    // guard at the point of use, and until now **nothing re-checked that**: the evidence was a
    // one-shot `grep` by whoever last added one. Hoist any of those reads above its guard and the
    // build now fails instead of shipping the cheat.
    //
    // ⚠️ `feelVariants.variantFromSearch` is the one that is NOT self-guarded — it is an exported
    // pure function taking `search` as an argument, guarded at both of its callers in
    // `gamePlayerDraw.ts`. That shape is deliberate (it is what lets `feel-variants.test.ts` call it
    // directly) and must not be "fixed"; this entry is what keeps its callers honest instead.
    'URLSearchParams',
  ]) {
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
  // ' gym' carries its leading space for the same reason the other two do: it is what keeps the
  // sweep off the identifier `toggleGym`, which legitimately survives as an empty method stub.
  //
  // 🔴 `'p play'` and `'o editor'` were ADDED 2026-08-26 with the dev suffix's abbreviation
  // (`P playground · O element editor` -> `P play · O editor`, so the banner could grow to 44 px
  // without a third wrapped row). Without them this sweep would still name the OLD wording and only
  // ` gym` would catch a leak of the new one — a guard quietly narrowed by a change somewhere else,
  // which is the shape this file exists to prevent. The superseded phrases stay: a leak of either
  // wording is a leak.
  for (const phrase of [' playground', 'element editor', 'p play', 'o editor', ' gym']) {
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
  // 🔴 Audio, byte for byte — criterion 7.5b. Before Phase 7 this script existence-checked only
  // `levels` and `images`, so audio could fail to reach `dist/` and the build stayed green. 7.5b as
  // originally written asked for a catalog row and a `request_id`, and neither proves DEPLOYMENT:
  // both are satisfied by a file that exists on the author's disk and nowhere else. Codex plan
  // review F6.
  //
  // Byte-equality as well as existence, matching the `.tmj` rule above. A truncated or re-encoded
  // cue is a cue whose measured dBFS is no longer the number criterion 7.2 passed on — the gate
  // would be describing a file the player never hears.
  // 🔴 `?? []` was here and made the whole check optional: a `dist/assets/index.json` that lost its
  // audio array passed with a cheerful "0 audio file(s) shipped byte-identical". An absent array is
  // the failure, not the empty case.
  if (!Array.isArray(catalog.audio) || catalog.audio.length === 0) {
    problems.push('catalog has no audio array; criterion 7.5b cannot be satisfied by zero files');
  }
  for (const entry of catalog.audio ?? []) {
    const built = join(root, 'dist', entry.url);
    if (!existsSync(built)) {
      problems.push(`catalog audio "${entry.key}" points at ${entry.url}, which is not in dist/`);
      continue;
    }
    const source = join(root, 'public', entry.url);
    if (existsSync(source) && !readFileSync(source).equals(readFileSync(built))) {
      problems.push(
        `catalog audio "${entry.key}" differs between public/ and dist/; ` +
          'its measured level is no longer the level that ships',
      );
    }
  }
  const authoredCatalog = readFileSync(join(root, 'public/assets/index.json'));
  if (!authoredCatalog.equals(readFileSync(builtCatalog))) {
    problems.push('dist/assets/index.json differs from public/assets/index.json');
  }
}

/**
 * **The emitted syntax the pinned `build.target` promises — asserted, not just recorded.**
 *
 * 🔴 `measure-bundle.mjs` had ZERO automated consumers. The three-arm A/B it produced lives in
 * `vite.config.ts`'s reversal instructions as a comment, and a comment goes stale the first time a
 * Vite upgrade moves the target — which is vault 10.1's failure exactly, one level up from the
 * thing the pinning prevents. *"A decision function with no consumer is the same defect as a burst
 * of zero particles"* (CLAUDE.md §2), applied to a measurement tool. Found by the criterion 10.4
 * gate owner (brief B, finding 15).
 *
 * Only ES2020+ syntax is asserted, and only that it is PRESENT. Those are the features the pinned
 * target (chrome111 / firefox114 / safari16.4) says survive untouched; if a target change starts
 * downlevelling them the bundle has silently grown helpers and the browser contract moved. A
 * presence check rather than a band: counts move with ordinary feature work, and a bound that
 * false-reds on ordinary work gets widened until it means nothing.
 *
 * ⚠️ **The census alone does NOT gate the contract, and saying it did was the mistake.** Raising the
 * target to `'esnext'` drops every promised browser minimum and leaves all these counts nonzero —
 * greener, if anything. Found by the Codex implementation review. Emitted syntax answers *"was
 * anything downlevelled"*; it cannot answer *"which browsers were promised"*, because that is a
 * value in the config and nowhere in the output. So the config values are pinned separately, below.
 */
{
  const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
  // The three build values criterion 10.3 says are RECORDED. Recorded is not enough on its own —
  // a document that accurately quotes a config string while the config has moved is this
  // criterion's named false green (vault 10.1), so the string is pinned where the build can see it.
  const PINNED = [
    "const BROWSER_TARGET = ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'];",
    'target: BROWSER_TARGET,',
    "minify: 'oxc',",
    'sourcemap: false,',
  ];
  for (const line of PINNED) {
    if (!config.includes(line)) {
      problems.push(
        `vite.config.ts no longer contains \`${line}\`. The browser contract, the minifier and the ` +
          'sourcemap setting are what criterion 10.3 pins, and none of them is visible in the ' +
          'emitted bundle — raising the target to esnext drops every promised browser minimum ' +
          'while leaving the syntax census greener than before. Changing any of these is a ' +
          "deliberate act: update this list, and update vite.config.ts's reversal instructions.",
      );
    }
  }
}

{
  const measured = measureBundle(join(root, 'dist'));
  const mustSurvive = measured.syntax.filter((f) => f.since >= 'ES2020');
  for (const feature of mustSurvive) {
    if (feature.count === 0) {
      problems.push(
        `no ${feature.label} in the emitted bundle. build.target pins chrome111/firefox114/` +
          `safari16.4, all of which support ${feature.since} natively, so this syntax should reach ` +
          'dist/ untouched. Zero means it was downlevelled — the browser contract moved. Run ' +
          '`node tools/gen/measure-bundle.mjs dist` and reconcile vite.config.ts.',
      );
    }
  }
}

if (problems.length > 0) {
  console.error('verify-dist FAILED:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const shippedAudio = existsSync(builtCatalog)
  ? (JSON.parse(readFileSync(builtCatalog, 'utf8')).audio ?? []).length
  : 0;


console.log(
  `verify-dist ok: ${authored.length} level(s) and ${shippedAudio} audio file(s) shipped ` +
    `byte-identical, no DEV-only scene key or debug surface in ${bundles.length} bundle(s)`,
);
