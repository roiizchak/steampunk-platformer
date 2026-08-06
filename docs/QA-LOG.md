# QA-LOG.md

Every recorded decision, measurement and deliberate non-fix, one section per phase.
Created in Phase 1.

---

## Phase 1 — Boot

**Branch:** `phase-01-boot` · **Date:** 2026-08-05

### Toolchain, as actually resolved

| Package | Declared | Installed | Note |
|---|---|---|---|
| `phaser` | `4.2.1` (exact) | 4.2.1 | Pinned exactly. `npm i phaser@4.2.1` re-writes this to `^4.2.1`; it was corrected back by hand, because `^` would admit 4.3.x and the Global Constraints freeze the version. |
| `vite` | `^8.2.0` | 8.2.0 | |
| `typescript` | `^7.0.2` | 7.0.2 | |
| `vitest` | `^4.1.10` | 4.1.10 | |
| `@playwright/test` | `^1.62.1` | 1.62.1 | Chromium browser installed separately. |

**No dependency was added beyond the frozen list.** Two places wanted `@types/node`; both were
solved without it rather than by asking for an exception — see *What was rejected* below.

### Decisions recorded

**TypeScript 7, not 6.** PRD.md §Vault-out anticipated "TS 6". **No stable TypeScript 6 was ever
published** — the only 6.x on npm is `6.0.0-beta`; `latest` is 7.0.2, the native Go compiler (tsgo).
The planned fallback to an exact 5.9 patch was **not needed**: `tsc --noEmit` is clean against
Phaser 4.2.1's bundled `types/phaser.d.ts`, including `Phaser.Types.Core.GameConfig` and
`Phaser.Textures.FilterMode`. PRD.md corrected.

**Loader timeout: none — deliberate, matching the vault (item 1.4).** A request that never resolves
hangs boot forever. That is the safer failure direction: a timeout that routes onward is exactly the
silent fallback item 1.3 exists to prevent. The cost is that a hang must be distinguishable from
success, which is what `ready` / `bootError` are for.

**`loader.maxRetries` left at Phaser 4's default of 2** (raised from 0 in early v3). A failing file
is attempted three times before the loader gives up. Consistent with the no-timeout decision. The
consequence is recorded in the e2e spec: `REFUSAL_TIMEOUT` is 20 s, because a tighter budget makes a
*correct* refusal fail as a timeout and read as a hang.

**Base canvas 1920×1080, `TILE_SIZE` 32.** User decision. 60 × 33.75 tiles visible.

**⚠️ Open obligation for Phase 3.** At camera zoom 1 the locked 96–128px character reads
**8.9 %–11.9 %** of screen height, against STYLE.md §9's stated ~20 %. The repair belongs in **Phase
3's camera zoom**, not a larger sprite — enlarging the sprite would contradict the locked "96–128px
character on a 32px grid" and invalidate Phase 4's art spend. No zoom figure is committed here: the
correct value differs by nearly 2× between a 96px and a 128px character, so Phase 3 must set it
against the real sprite height. *(Codex plan-review F9 corrected an earlier "~1.7×" claim, which was
right only for 128px.)*

**`window.__game` surface extended, in the phase where the PRD says it is fixed.** Added
`ready: boolean` and `bootError: string | null`. Codex reviewed the surface against Phases 5, 6 and 8
and ruled both necessary and no others justified. Rationale in `docs/reviews/phase-01-plan.md` F1/F12.
PRD.md updated to match.

**C12 — marked N/A for Phase 1, with a reason.** C12 is "confirm a mutation actually applied". Phase 1
runs no mutation testing; the item binds Phase 2's gate 2.5. A root `.gitattributes`
(`* text=auto eol=lf`) was added on its own merits — it removes the live CRLF hazard that is C12's
*precondition* — but it is **not** a satisfaction of C12, and the plan's original claim that it was
has been withdrawn. *(Codex plan-review F3.)*

### API notes this design is built on *(vault C10)*

Skills invoked: `game-setup-and-config`, `scenes`, `scale-and-responsive`, `e2e-playwright-testing`,
`v4-new-features`, `superpowers:executing-plans`.

- **Phaser's default `scale.mode` is `NONE`, not `FIT`.** Set explicitly, or 1920×1080 renders
  unscaled and overflows.
- **The ScaleManager owns `canvas.style`.** No project CSS targets the canvas element — that second
  writer is the mechanism behind vault 1.5's "CSS silently contradicted the engine on every phone".
  The parent `#game` div carries explicit dimensions instead, because an unsized parent breaks
  centering.
- **`Phaser.AUTO`, never `Phaser.WEBGL`** — the latter has no Canvas fallback and fails *silently*.
- **`create()` runs even when files failed to load.** This is what makes a `create()`-level refusal
  gate possible at all.
- **Scene ops are queued, not immediate; `init()` runs on every start, the constructor only once.**
  Confirms vault 1.7; BootScene resets its state in `init()`.

### Measurements — things that were checked rather than assumed

**1. Phaser's filter constants are inverted, and the obvious assertion is still wrong.**
`Phaser.ScaleModes.LINEAR = 0` (also `DEFAULT`), `NEAREST = 1` — the vault's warning holds for 4.2.1.
But `TextureSource.scaleMode` is hardcoded to `ScaleModes.DEFAULT` (= 0 = LINEAR) at construction and
is **never derived from `pixelArt`**. Asserting `texture.source[0].scaleMode === NEAREST` therefore
**fails on a correctly configured pixel-art game**. What actually selects sampling is, in the WebGL
renderer: `if (scaleMode === ScaleModes.LINEAR && this.config.antialias) { …gl.LINEAR… }` — GL filters
default to NEAREST and are only *upgraded* when antialias is on. So `config.antialias === false` is
the pinned decision, and that is what BootScene asserts. Note also that **two unrelated things are
called "scale mode"**: `Phaser.ScaleModes` (texture filtering) and `Phaser.Scale.ScaleModes` (canvas
fitting).

**2. Phaser 4.2.1 drops an undecodable image completely silently.** An image whose bytes will not
decode fails at the PROCESS stage, not the LOAD stage. `File.onProcessError()` writes a
`console.error`, sets `FILE_ERRORED`, and calls `fileProcessComplete()`. **It emits no event** — there
is no `FILE_PROCESS_ERROR` in 4.2.1 — and `totalFailed` is only incremented on the load path, so it
does not move either. Vault 1.3's own sentence, "a silent fallback for a missing input is the bug",
describes the loader itself. This is why the refusal gate verifies the *outcome* (is there a usable
texture with non-zero dimensions?) rather than trusting any completion signal.

**3. Vite's dev server returns HTTP 200 with `text/html` for every missing file**, never a 404
(measured: `GET /assets/does-not-exist.png` → `200 text/html`). Consequence: pointing the loader at a
nonexistent path tests the **corrupt-200** path, *not* the 404 path. The two cases criterion 1.5
requires would have silently collapsed into one test claiming to be two. The 404 case now forces a
real 404 through Playwright route interception.

**4. Which signal fires for which failure — the reason all three checks exist.**

| Failure mode | `loaderror` | texture verification | catalog shape check |
|---|---|---|---|
| genuine HTTP 404 | fires | catches | — |
| corrupt 200 (HTML served as PNG) | **silent** | catches | — |
| catalog missing / malformed | **silent** | — | catches |
| duplicate or Phaser-reserved key | **silent** | — | catches |

**Corrected after review.** An earlier version of this section claimed "no check is redundant, and
none is dead code". That was wrong on both counts and both reviews caught it:

- `loaderror` fires for **exactly one** mode — a genuine HTTP 404 — and the texture verification
  catches that one too. There is no failure it alone detects, so it is **defence in depth, not an
  independent signal**. It is kept for its message (it names the URL) and because a real static host,
  unlike Vite's dev server, does return 404s. Deleting it would leave every test green.
- The claim rested on the `?breakAsset=catalog` case, which was believed to exercise it. Measured, it
  does not: Vite answers the missing `.json` with 200 + HTML, so the XHR succeeds and `JSON.parse`
  fails at the process stage — silently, exactly like an image. Three comments and one test name
  asserted the opposite and have been corrected *(vault C9)*.

The load-bearing checks are the **texture verification** and the **catalog shape check**.

**5. A missing catalog originally booted clean.** Found while testing measurement 3: if
`assets/index.json` fails, no images are queued, so "nothing failed" — and boot succeeded with zero
assets. Fixed by verifying the catalog in `create()` rather than only inside the `filecomplete`
callback, which never runs when the catalog itself fails. Zero expected assets must never be mistaken
for zero failures.

**6. No Vite config-loader warning appeared** (vault A8 / item 1.2). `vite.config.ts` keeps the `.ts`
extension. Nothing to silence, and nothing was silenced.

### Mutation evidence — every gate watched going red *(vault C1, C2, C3)*

Each is a **guard** (green→green), not a reproduction, except #5 which was a genuine red→green fix.

| # | Mutation applied | Result | Restored |
|---|---|---|---|
| 1 | `Math.random` rule regex neutered to `/$^ZZZNEVER/` | 1 test red — the bad-fixture test | ✅ verified absent |
| 2 | `export const cheat = Math.random()` appended to `src/sim/index.ts` | 2 tests red | ✅ verified absent |
| 3 | `import Phaser` added to `src/sim/index.ts`, Phaser uninstalled | 2 red — scan **and** import-evaluation (`Cannot find package 'phaser'`) fired independently | ✅ verified absent |
| 4 | `if (problems.length > 0)` → `if (false)` in BootScene | exactly the 3 refusal e2e tests red, the 3 success tests stayed green | ✅ verified absent |
| 5 | *(not a mutation — a real defect)* missing catalog booted clean | test red, code fixed, now green | n/a |

Mutation #4 is the one that matters: it demonstrates the refusal tests fail **for the right reason**
and that success and refusal are genuinely distinguishable, which is Codex finding F1/F6.

Every mutation's removal was confirmed by `grep -c` returning 0 before proceeding — the CRLF-style
false-green C12 warns about.

### QA gate results

| # | Criterion | Result |
|---|---|---|
| 1.1 | `npm run build` succeeds; `tsc --noEmit` clean | ✅ `TypeScript: No errors found`; `✓ built in 652ms` |
| 1.2 | `vitest run` green | ✅ 5 passed |
| 1.3 | Sim suite passes with **Phaser uninstalled** | ✅ 5 passed with `node_modules/phaser` absent; proven non-vacuous by mutation #3 |
| 1.4 | Canvas mounts at 1920×1080; `sceneKey === 'Boot'`; `ready === true`; `bootError === null`; zero console errors | ✅ |
| 1.5 | Genuine 404 blocks boot; corrupt 200 blocks; missing catalog blocks; clean run still boots | ✅ 4 e2e cases |
| 1.6 | Filtering asserted at runtime with a comment explaining the inverted constants; `?breakFilter=1` proves the assertion fires | ✅ |
| 1.7 | No source file > 400 lines | ✅ largest is `BootScene.ts` at 362 |
| 1.8 | Diff reviewed | ✅ `voltagent-qa-sec:code-reviewer` — 12 findings, triaged below |
| 1.9 | Adversarial pass | ✅ separate brief — 15 findings, triaged below |
| 1.10 | Codex **plan** review ran; every finding applied or recorded | ✅ `docs/reviews/phase-01-plan.md` — 11 applied, 1 rejected with a reason |
| 1.11 | Codex **implementation** review ran on the diff; every finding applied or recorded | ✅ `docs/reviews/phase-01-impl.md` — 8 findings (2 blockers), **all 8 applied, 0 rejected** |

*(Criteria 1.5 and 1.6 were assessed **Fail** by the implementation review and were genuinely
failing at that point. Both now pass, each with its own mutation evidence — see below.)*

**Looked at in a browser, not only tested** *(vault C4)*: all four states screenshotted and viewed —
clean boot (letterboxed, centered, correct colour, "Boot OK"), 404 refusal, corrupt-200 refusal,
filtering refusal. Refusal text is legible on the canvas, not only in `bootError`.

**Servers killed by port before reporting done** *(vault C13)*. `playwright.config.ts` launches
`node ./node_modules/vite/bin/vite.js` directly, never `npm run dev`, because on Windows the package
script is a shell wrapper and killing the wrapper orphans the real process.

### Criteria 1.8 and 1.9 — the two review briefs, and what they found

**A7 held again, on its first real test.** The standard correctness review (1.8) measured every
refusal path in a live browser and concluded: *"No path was found where boot succeeds with a missing
or unusable asset."* The adversarial review (1.9), running the separate *how could this be wrong?*
brief, then found **three** such paths. Had only the first review run, all three would have shipped —
which is exactly the 8/8-PASS-then-three-defects pattern A7 records. **Both briefs are worth their
cost; the second is where the blockers came from.**

Both reviews independently verified the Phaser-internals comments against
`node_modules/phaser/dist/phaser.esm.js` and found all of them accurate — so the C9 risk was in the
*loader-signal* claims, not the engine claims.

#### The three ways boot could succeed with an asset missing (adversarial HIGH 3)

All three route through the same root cause: **`LoaderPlugin.addFile` silently skips any key already
present in the TextureManager** — no warning, no error — after which an existence check passes for a
file that was never fetched.

1. **A catalog key colliding with a Phaser built-in.** `__DEFAULT`, `__MISSING`, `__WHITE` and
   `__NORMAL` are registered at boot as real textures with non-zero dimensions (`__NORMAL` is 1×1, the
   rest 32×32). Existence passes, dimensions pass,
   file never requested.
2. **A duplicate key in the catalog.** The second entry is never loaded; the loop checked the same
   key twice and passed both times.
3. **⚠️ Any second entry into Boot** — `scene.restart()`, or Phase 2+ returning to Boot. Textures
   from the first boot are still in the game-global manager, so nothing is re-requested and **the
   entire gate becomes a no-op**. This is the apparatus all nine later phases inherit, and it would
   have silently weakened the moment a second scene existed.

**Fixed by:** a `describeCatalogProblem()` shape validator that rejects reserved keys, duplicate keys,
non-object entries, and empty key/url; plus `queueCatalog()` dropping each expected key from the
TextureManager before loading, so a texture present at verification time really was fetched during
*this* boot. Five new e2e cases cover them.

#### Other findings applied

| # | Finding | Sev | Disposition |
|---|---|---|---|
| R1 | Three comments and one test claimed the `loaderror` listener fires for the missing catalog. It does not — Vite answers the missing `.json` with 200 + HTML, so `JSON.parse` fails at the *process* stage, silently, exactly like an image. The file contradicted its own measurement table. | **High** | **Applied.** Comments and the test name corrected to describe what was measured. The listener is kept and now honestly labelled defence-in-depth for a real static host's 404, not a uniquely necessary signal. |
| R2 | Sim boundary enforced only one directory deep. `src/sim/index.ts` already imports `../game/constants`, so a `Date.now()` one hop out would evade the scan, import-evaluation *and* the Phaser-uninstalled run. | **High** | **Applied.** The scanner now walks the **transitive source closure** from the sim entry point. Proven with a mutation: `Date.now()` added to `src/game/constants.ts` turns it red. |
| R3 | Five scanner evasions: lazy `await import('phaser')`; bracket access `Date['now']`; bare `document` without a trailing dot; `globalThis`; and non-`.ts` extensions. | **High** | **Applied.** All five rules added or widened, plus a `describe('the scanner itself')` block that proves each evasion is caught. |
| R4 | `stripComments` truncated at `//` inside string literals, so `const u = 'https://x'; const r = Math.random();` hid a real violation. Block-comment removal also shifted every reported line number. | **High** | **Applied.** Replaced with a small state machine that blanks comments and strings **while preserving line structure**. Rules now declare which view they see, because the `'phaser'` specifier and `Date['now']` *are* strings. Three regression tests cover it. |
| R5 | A malformed catalog entry (`{"images":[null]}`) threw inside the `filecomplete` handler, which propagates through the loader so `complete` never fires — boot **hangs** at `ready=false, bootError=null`. The one state the gate cannot distinguish from a slow boot, produced by exactly the input class the gate exists to police. | **High** | **Applied.** Queueing is wrapped; any throw becomes a refusal. e2e case added. |
| R6 | `updateDebugState` was not DEV-guarded, so the debug state machine shipped to production even though `window.__game` did not — a Phase 10 grep for `__game` would have passed while the internals remained. | Medium | **Applied.** Guarded. Verified: `dist/` contains zero occurrences of `__game`, `bootError`, `breakAsset`, `breakFilter` **and** `updateDebugState`. |
| R7 | The "live and read-only" test read `ready` twice, both after boot — a once-assigned stale snapshot passes identically, which is the exact regression the getter exists to prevent. | Medium | **Applied.** Split into a genuine liveness test (value before boot vs after) and a read-only test covering field write, whole-property assignment **and** `defineProperty` redefinition. |
| R8 | `window.__game` was `configurable: true`, so the QA oracle could be replaced wholesale via `defineProperty` even though assignment was blocked. | Low | **Applied.** `configurable: false`, asserted. |
| R9 | Both 1.5 refusal tests asserted only "some non-empty bootError", so they stayed green if the wrong detector fired. | Medium | **Applied.** Each now asserts its distinguishing substring — `load error` for the 404, `not registered` **and** `not.toContain('load error')` for the corrupt 200. |
| R10 | `applyBreakAsset` rewrote **every** catalog entry despite a docstring saying "one" — harmless with one asset, wrong from Phase 2 on, and it retires the "one bad asset among many still blocks boot" case. | Medium | **Applied.** Scoped to `index === 0`. |
| R11 | `?breakAsset=404` produced a corrupt 200, not a 404, and no test used it. | Low | **Applied — removed.** The e2e suite forces a real 404 via route interception; the misnamed knob is gone rather than kept and documented. |
| R12 | Fault injection (`applyBreakFilter`) was called from inside `assertFilteringPinned`, so an `assert*` function mutated what it inspected. | Low | **Applied.** Moved to `create()` before the assertion. |
| R13 | Two hand-maintained `image-rendering` accept-lists; the e2e copy omitted `-moz-crisp-edges` and `optimizeSpeed`, a latent Firefox false red. | Low | **Applied.** Single exported `CRISP_IMAGE_RENDERING`, imported by both. |
| R14 | No npm script ran criterion 1.3, so `npm test` alone could never go red for a transitive Phaser import. | Medium | **Applied.** `npm run test:sim-isolated`. *(Note: the `;` separator does not work in npm scripts on Windows cmd — it leaked `--save-exact` into vitest's argv. Uses `&&`; a failing run therefore leaves Phaser uninstalled, which is loud and intended.)* |
| R15 | The zero-dimensions branch is unreachable in 4.2.1 — a failed decode leaves the key *unregistered* — but the comment asserted it as measured fact. | Low | **Applied.** Comment now says "defensive, not observed"; the branch is kept as cheap insurance against a future loader change. |
| R16 | `src/sim/index.ts` hardcoded `/60` instead of the `TICK_HZ` it exports four lines above. | Low | **Applied.** |
| R17 | QA-LOG recorded `BootScene.ts` at 264 lines; it was 294. | Low | **Applied.** Line counts re-measured after every change; current largest is 362. |
| R18 | Duplicate near-identical clause in `bootError` when the catalog parses but lists no images. | Low | **Applied.** Deduplicated in `create()`. |
| R19 | The "filtering is pinned on a clean boot" e2e test would pass even if `assertFilteringPinned()` were deleted — it observes Phaser's own `setCrisp` output. | Low | **Rejected as stated, kept deliberately.** It is not redundant: it fails if the *config* regresses (`pixelArt: false` means `setCrisp` is never called). The assertion itself is covered by `?breakFilter=1`. Coverage naming, not a hole — the reviewer said as much. |
| R20 | No e2e runs against a production build. | Medium | **Rejected for this phase.** Structurally impossible here: the harness reads a dev-only global by design *(vault 1.6)*. **Phase 10 owns it**, and this is recorded as its obligation. |
| R21 | The catalog carries no size or hash, so a *replaced* or wrong-sized asset boots clean. | Medium | **Rejected for this phase, recorded.** Content verification is a real gap but belongs with the asset pipeline in **Phase 4**, which is where generated assets and their recorded dimensions first exist. Vault 1.3 requires blocking *missing* and *corrupt*, both of which are covered. |

**Applied: 18. Rejected with a reason: 3.**

#### Additional mutation evidence, after the fixes

| # | Mutation applied | Result | Restored |
|---|---|---|---|
| 6 | `Date.now()` added to `src/game/constants.ts` — one hop OUTSIDE `src/sim/` | closure scan red, naming `../../src/game/constants.ts` | ✅ verified absent |
| 7 | reserved-key and duplicate-key checks both replaced with `if (false)` | exactly the 2 corresponding e2e tests red; the other 10 stayed green | ✅ verified absent |

Mutation 6 is the proof that R2's fix is real rather than cosmetic. Mutation 7 confirms the new
catalog cases fail for their own reasons, not incidentally.

Two of the scanner's own new regression tests **failed on first run** and caught genuine bugs in the
rewritten scanner (blanking string literals had also blanked the `'phaser'` import specifier and
`Date['now']`, silently disabling three rules). Recorded because it is the clearest evidence in this
phase that a test which cannot fail is worth nothing: the rules looked correct and were dead.

### Criterion 1.11 — the Codex implementation review

Full report and triage: [`reviews/phase-01-impl.md`](reviews/phase-01-impl.md).
**8 findings, 2 of them blockers. All 8 applied, none rejected.**

**Two blockers survived the correctness review AND the adversarial review.** Both are the same shape
the vault keeps naming: *a check that verifies the config rather than the outcome, and so passes while
the outcome is wrong.*

1. **The restart path.** Three prior passes all reasoned about a *fresh page load*. Phaser's JSON
   cache is game-global just like the TextureManager, and `File.hasCacheConflict()` is literally
   `this.cache.exists(this.key)` — so on a second entry to Boot the catalog load is skipped, the
   `filecomplete` callback never fires, neither cache is cleared, and `create()` validates stale cache
   against stale cache. **Phase 2 onwards re-enters Boot**, so the entire refuse-to-route apparatus
   this phase exists to build would have become a silent no-op, with nothing in the QA gate ever
   going red. Fixed by dropping the cached catalog in `preload()`, mirroring the texture fix one level
   up; regression test added, which needed a dev-only `window.__phaserGame` handle because the case is
   untestable from outside without one.
2. **The Canvas filtering hole.** `pixelArt: true` does not make Canvas rendering crisp. Canvas draws
   with `ctx.imageSmoothingEnabled = !frame.source.scaleMode`, and `scaleMode` defaults to `0`, so
   `!0 === true` — smoothed. WebGL was correct only by accident of its own branch. `Phaser.AUTO` can
   fall back to Canvas, so this was reachable in production, **with the runtime assertion actively
   reporting that filtering was pinned.** Fixed by setting `setFilter(NEAREST)` explicitly on every
   loaded texture and asserting the per-texture `scaleMode` alongside `config.antialias`.

Finding 2 is worth dwelling on: it means the original design pinned filtering by *relying on
derivation*, and the fix was to stop relying on it. As a side effect, `scaleMode === NEAREST` is now a
*correct* assertion — which the code comment had previously (correctly, at the time) warned it was
not. The comment has been rewritten to explain both halves rather than deleted.

**Setting `reuseExistingServer: false`** immediately paid for itself: a dev server left running from
an earlier measurement made the suite silently run **zero** tests. Killed by port *(vault C13)*.

#### Mutation evidence for the implementation-review fixes

| # | Mutation applied | Result | Restored |
|---|---|---|---|
| 8 | both cache-clearing fixes removed (`this.cache.json.remove` and `this.textures.remove`) | exactly the scene-RESTART e2e test red; the other 12 stayed green | ✅ verified 0 |
| 9 | unreferenced `src/sim/orphan-scratch.ts` containing `Date.now()` | boundary scan red, naming the orphan | ✅ file removed |

#### File split, not a justification

Applying these fixes pushed `BootScene.ts` to **405 lines**, over the Global Constraints limit. The
constraint permits a written justification; **none was written.** Catalog validation moved to
`src/game/assetCatalog.ts` instead — it is pure and engine-free while the scene is neither, so it was
the natural seam anyway. `BootScene.ts` is now 355 lines and nothing exceeds 400.

### What was rejected, and why *(vault C10 — silence reads as skipping)*

- **`@types/node`** — rejected rather than requested as a dependency exception. Two needs, two
  substitutions: the unit test reads files with Vite's `import.meta.glob(..., { query: '?raw' })`
  instead of `node:fs` (which also keeps it runnable with Phaser uninstalled), and
  `playwright.config.ts` drops its `process.env.CI` branches in favour of fixed values.
- **A scene `pack` for the asset catalog** — rejected. Phaser 4's `PackFileSection` types require a
  `cache` field on each entry, which a JSON pack entry has no meaningful value for. Replaced by a
  loader chain (`load.json` → `filecomplete` → `load.image`), which needs no type workaround.
- **`Phaser.HEADLESS` for unit tests** — rejected. It still requires the DOM, and criterion 1.3's
  "runs with Phaser uninstalled" is a strictly stronger guarantee.
- **`smoothPixelArt`** — rejected. WebGL-only, and it sets `pixelArt: false`, contradicting the
  vault 1.5 decision to pick one filtering mode and pin it.
- **`scale.zoom`** — not set. Camera zoom is Phase 3's decision; setting it here would pre-empt it.
- **A fourth e2e case for a truncated PNG** — rejected. It exercises the same code path as the
  committed corrupt-200 fixture.
- **`e2e-playwright-testing`'s locator, auth and form rules** — do not apply; the game is a single
  canvas with no accessibility tree. Only `rel-no-wait-for-timeout` (no fixed sleeps; every wait is
  on `window.__game`) and the config template carried over.
- **`v4-new-features`** — consulted; nothing in it touches boot. Filters, RenderNodes, SpriteGPULayer,
  CaptureFrame, Gradient/Noise, Lighting and the new tint modes are Phase 5/6/9 concerns. Its one
  Phase 1-relevant line was the `maxRetries` default change.

### Deliberately not fixed *(vault C11)*

- **Bundle size.** `dist/assets/index-*.js` is 1.38 MB (359 kB gzipped); Vite warns above 500 kB.
  That is Phaser itself. Not addressed here — **Phase 10** owns build and ship.
- **`console.error('Failed to process file: …')` from Phaser on the refusal paths.** Cannot be
  suppressed without patching the engine, and it is genuinely informative. Criterion 1.4's
  zero-console-errors assertion applies to the *clean* boot only, where it does not appear.
- **No e2e runs against a production build.** Structurally impossible in this phase: the harness
  reads `window.__game`, which is dev-only by design *(vault 1.6)*. **Phase 10 obligation.**
- **The catalog carries no size or content hash**, so a *replaced* or wrong-sized asset boots clean.
  Vault 1.3 requires blocking *missing* and *corrupt*, both of which are covered. Content
  verification belongs with the asset pipeline in **Phase 4**, which is where generated assets and
  their recorded dimensions first exist. **Phase 4 obligation.**
- **Only Chromium is configured** in `playwright.config.ts`. The `image-rendering` assertion is
  membership over the shared `CRISP_IMAGE_RENDERING` list precisely so a Firefox/WebKit run would not
  be a false red, but that is untested until a second browser project exists.

---

## Vault-out — Phase 1

What this phase learned that the vault did not already say, worth carrying forward.

**1. Phaser 4.2.1 silently drops an undecodable image.** `File.onProcessError()` writes a
`console.error`, sets `FILE_ERRORED`, and returns. No event — there is no `FILE_PROCESS_ERROR` — and
`totalFailed` does not move, because it is only incremented on the load path. Vault 1.3's own
sentence, *"a silent fallback for a missing input is the bug"*, describes the engine's loader. Any
future asset gate must verify the **outcome**, never a completion signal.

**2. `pixelArt: true` does not pin filtering on the Canvas renderer.** `TextureSource.scaleMode` is
hardcoded to `DEFAULT` (=LINEAR=0) and is never derived from `pixelArt`. Canvas draws with
`ctx.imageSmoothingEnabled = !frame.source.scaleMode` → `!0` → smoothed. WebGL is correct only by
accident of its own branch (`scaleMode === LINEAR && config.antialias`). **Set `setFilter(NEAREST)`
explicitly.** The vault's Phaser 3-era note that "the scale-mode constants are reversed" is true but
incomplete — the constants being inverted is not the real trap; the real trap is that the property
they name is never set from the config at all. Two unrelated things are called "scale mode":
`Phaser.ScaleModes` (texture filtering) and `Phaser.Scale.ScaleModes` (canvas fitting).

**3. Phaser's caches are game-global and survive a scene restart, and `LoaderPlugin.addFile` silently
skips any already-cached key.** This makes *any* load-and-verify gate a no-op on the second entry to
the scene. Applies to textures **and** to the JSON catalog. Drop the key before loading. This is the
single most transferable lesson of the phase, because it converts a working gate into a decorative one
without changing a line of the gate.

**4. Vite's dev server never returns 404** — a missing file gets 200 + SPA-fallback HTML. So "point
the loader at a nonexistent path" tests the corrupt-200 path, not the 404 path, and a suite claiming
to cover both may cover one twice. Force a real 404 with Playwright route interception.

**5. Toolchain.** Vite 8.2.0 + TypeScript 7.0.2 (the native Go compiler) + Phaser 4.2.1 compile clean
together with `moduleResolution: bundler`; no fallback was needed. **No stable TypeScript 6 was ever
published** — PRD.md's expectation of "TS 6" was unsatisfiable and has been corrected. `@types/node`
was avoided twice (Vite's `import.meta.glob(..., { query: '?raw' })` for file reading; fixed values
instead of `process.env` in the Playwright config), so the frozen dependency list held exactly.

**6. The Codex protocol's real failure mode, and its limit.** The `CreateProcessAsUserW failed: 5`
error is **permanent, not transient** — PRD.md's previous "a retry succeeded" was luck. Root cause:
the sandbox spawns `pwsh.exe` resolved to a Microsoft Store execution alias, which a restricted token
cannot launch. The `node_repl` instruction restores **file reading but not command execution**, so
review 2 cannot run the test suite and its findings are file-evidence only. That is a division of
labour, not a defect — but **every Codex finding must be re-verified by running something locally**,
which is how all four of its source-level claims were confirmed here.

**7. On the review protocol itself — the evidence this phase produces.** Three independent passes, in
order, each finding what the previous missed:

| Pass | Found |
|---|---|
| Codex **plan** review | the QA gate could not distinguish a successful boot from an infinite hang (`ready`/`bootError`) |
| `code-reviewer` (1.8) | comments describing loader mechanisms that do not fire; concluded **no path exists** where boot succeeds with a missing asset |
| **adversarial** (1.9) | **three** such paths — reserved keys, duplicate keys, scene restart |
| Codex **implementation** review | **two blockers the other two missed** — the JSON-cache half of the restart path, and Canvas-renderer filtering |

**A7 is confirmed at model scale.** The correctness review explicitly concluded there were no
asset-missing paths; the adversarial brief, run separately with only the question *how could this be
wrong?*, then found three. Running one brief and not the other would have shipped all of them. The
cost of the fourth pass was justified twice over: both of Codex's findings were blockers, and neither
was visible to any earlier reader.

**8. Every gate in this phase was watched failing before being trusted** — nine mutations, each
confirmed reverted by `grep -c` returning 0 *(C1, C12)*. Two of the scanner's own regression tests
failed on first run and exposed genuinely dead rules (blanking string literals had also blanked the
`'phaser'` specifier and `Date['now']`). That is the clearest evidence in the phase for C2: those
rules looked correct, read correctly, and detected nothing.

---

## Phase 2 — Player controller + Character Playground

**Branch:** `phase-02-player` · **Date:** 2026-08-06

Grey-box movement — run, jump, coyote time, jump buffering — built engine-free under `src/sim/`,
plus the `GameScene` Boot finally routes to and a dev-only `PlaygroundScene` for live tuning.
No art. Primitives only.

### Toolchain, as actually resolved

Unchanged from Phase 1. **No dependency was added.** The frozen list held: `phaser@4.2.1` exact,
plus `vite`, `typescript`, `vitest`, `@playwright/test`. Arcade Physics was considered and rejected
for reasons recorded below, which also meant no `physics` block was added to `gameConfig`.

### Decisions recorded

1. **Boot now routes to Game, and `ready` moved with it.** Phase 1 deliberately terminated in Boot
   and set `ready: true` itself, because there was nowhere to go. Now "the gate passed" and "the game
   is running" are different facts, so `BootScene.create()` ends in `this.scene.start('Game')` and
   `GameScene.create()` sets `ready`. The consequence is deliberate: if `GameScene` fails to
   construct, `ready` stays false with `bootError` null — the third state, a hang, distinguishable
   from both a clean boot and a refusal. Setting `ready` in Boot would report a broken game as good.
2. **`refuseToRoute()` now stops `Game` and `Playground`.** Only observable on a scene RESTART, which
   Phase 1 criterion 1.5 exercises: re-entering Boot while Game is running would otherwise leave a
   refused boot with a game still ticking behind the error screen, still publishing `player` and
   `tick`. A refusal that does not stop the game is cosmetic.
3. **Collision is a static rect list in sim world state** — floor plus two platforms with a gap.
   The gap is load-bearing, not scenery: coyote time can only be observed by walking off something,
   and a world with no ledge makes criterion 2.3 testable only through a "force ungrounded" hook,
   which fakes the precondition it is supposed to prove. Phase 3 replaces the SOURCE of the rects
   with Tiled data; the resolver is untouched.
4. **The Playground uses Q/E and Z/X, not the arrows** — a deliberate deviation from the execution
   plan, which said arrows. The whole point is retuning the feel *while running and jumping*, and the
   arrows are how you run. Rebinding movement to tune movement makes the scene useless for its one job.
5. **The player is `this.add.rectangle`, not a tinted texture.** Tint is WebGL-only in Phaser 4 and
   `gameConfig.type` is `Phaser.AUTO` with a live Canvas fallback, where a tinted `__WHITE` renders
   plain white and the feel check goes silently colourless.
6. **The `window.__game` surface was NOT extended.** It is closed at nine fields by a Phase 1 Codex
   ruling. `tick` and `player` went live; nothing was added. Where a test wanted a value the surface
   does not carry (the Playground's selected knob, the rendered rectangle's position), the test was
   rewritten to measure behaviour instead — see criterion 2.6 below.
7. **`src/render/cameraRig.ts` was deliberately not built.** Phase 2 §5 does not list it, and Phase 1
   deferred camera zoom to Phase 3; committing a zoom here would pre-empt that decision.
8. **A shared `tests/e2e/debugView.ts`.** A second e2e spec declaring `Window.__game` is a hard
   `TS2717` build failure the moment the two shapes differ, and two hand-maintained copies of one
   contract drift. Phase 1's spec now imports the type instead of declaring it.

### API notes this design is built on *(vault C10)*

Five facts below came from **invoking** the skills `phase-02-player.md` §2 names — `physics-arcade`,
`input-keyboard-mouse-touch`, `game-object-components`, `time-and-timers`,
`superpowers:test-driven-development` — before the plan was finalised, not from assuming. Each
replaced a choice that would otherwise have been made wrong. Silence would have read as skipping.

1. **Arcade Physics is rejected for the player, for a citable reason.** `Body.velocity` is
   px/**second**, integrated by `World.step` with its own `fps`, `fixedStep` and `timeScale`. Every
   one of those is a `deltaTime` multiply of exactly the kind vault 2.1 forbids, and
   `Phaser.Physics.Arcade` lives in `phaser`, which vault 1.1 forbids `src/sim/` importing at all.
   Phase 1's `gameConfig` has no `physics` block, so `this.physics` was never registered — rejecting
   it cost zero lines.
2. **The jump edge comes from the keyboard event, not `JustDown` polling.**
   `Phaser.Input.Keyboard.JustDown(key)` is a *consuming read* that resets when checked, so two
   readers in one frame lose the edge; polling `isDown` misses a press-and-release that happens
   entirely between two render frames. Both are the loss half of vault 2.4, arriving before the
   snapshot ever sees the press. Keys are registered with **`emitOnRepeat: false`** — the OS repeats
   a held key ~30x/second, and with repeats enabled every one would latch a fresh jump edge and
   holding the button would auto-bunny-hop through the buffer.
3. **`Rectangle` has no `setFlipX`.** Phaser 4's Flip component is mixed into Sprite and Image but
   **not** into Shape. The typechecker caught this, not a test. `desc.flipX` is still computed and
   unit-tested; the scene draws facing as a nose on the leading edge, so the decision stays exercised
   and visible instead of being parked until Phase 4 — where a mirrored hitbox first shows up as art
   that does not match its collision.
4. **Game Objects default to origin `0.5, 0.5`.** Vault 2.10's "+y up from the feet" is therefore not
   free: `playerRenderDesc` returns the origin explicitly and the scene applies `setOrigin(0.5, 1)`
   in one place, or the box floats half its height above the ground it is standing on.
5. **No `TimerEvent` or `Clock` anywhere near movement.** They run on wall-clock ms, honour
   `clock.timeScale`, and `addEvent` is deferred to the next frame's `preUpdate`. The accumulator
   uses only the `delta` argument of `update(time, delta)`, and it lives in the scene, never in
   `src/sim/`.

Sixth, operational: `addCapture('SPACE,LEFT,RIGHT,UP,DOWN,W,A,D')` — without it the browser scrolls
the page on arrows and space, which corrupts a Playwright key drive as well as the player's session.

### Measurements — things that were checked rather than assumed

| What | Measured | Note |
|---|---|---|
| Discrete-integrator apex | **150.30 px** (4.70 tiles) | from `jumpVelocity 16`, `gravity 0.9`, semi-implicit Euler |
| Apex measured in the browser | **150.3 px** | matches the prediction exactly; tolerance was ±2 px |
| Continuous `v²/2g` | 142.22 px | **8.08 px wrong** — vault 2.14's recorded error was 7.4 px |
| Full jump airtime | 65 ticks (1083 ms) | jump held |
| Short hop apex (released after 2 ticks) | 42.8 px (1.3 tiles) | `jumpCutDivisor: 3` |
| Ticks to top speed | 6 ticks (100 ms) | `runAccel 1.1`, `runMax 5.2` |
| Coyote window | 7 ticks (117 ms) | both endpoints asserted against the live knob |
| Jump-buffer window | 8 ticks (133 ms) | same mechanism, same assertions |
| Largest source file | `BootScene.ts` 362 lines | limit is 400; `tick.ts` is 260, `GameScene.ts` 199 |
| `dist/` occurrences of `__game` | **0** | the debug seam is still stripped from the production build |
| Sim suite with Phaser uninstalled | **64/64 pass** | criterion 2.7, via `npm run test:sim-isolated` |
| Character height on screen at zoom 1 | 46 px = **4.3 %** of 1080 | STYLE.md wants ~20 %; camera zoom is Phase 3's decision, unchanged |

**The apex number is the one worth carrying.** Substituting `v²/2g` for the discrete integrator would
have produced an 8.08 px error at a ±2 px tolerance — so the criterion would have failed, and the
temptation would have been to widen the tolerance. `player-movement.test.ts` therefore asserts the gap
still exceeds the tolerance, which means retuning cannot silently make the apex check vacuous.

**Headless visibility (vault B5) was checked, not assumed.** A headless browser can report itself
hidden and pause the engine loop, which would make every e2e movement assertion pass vacuously
against a frozen world. The first test in `phase-02-movement.spec.ts` asserts the tick count advances
before anything else runs. It does; no `disableVisibilityChange` was needed.

### Mutation evidence — every gate watched going red *(vault C1, C2, C3, C12)*

Phase 1 ran no mutation testing and explicitly deferred **C12** to this gate. Thirteen mutations,
each applied to source, run, and restored, with the apply AND the restore confirmed by counting the
exact string both ways.

| # | Mutation applied | Result | Restored |
|---|---|---|---|
| M1 | coyote window guard deleted — the window spends its own arming tick *(Codex F5)* | **RED** — 2 failed / 5 passed | confirmed |
| M2 | landing guard deleted — the jump buffer loses its last tick | **RED** — 2 failed / 5 passed | confirmed |
| M3 | jump-buffer latch condition deleted — a stale press jumps forever | **RED** — 7 specs failed | confirmed |
| M4 | coyote latch condition deleted — no jump after leaving the ground | **RED** — 3 failed / 4 passed | confirmed |
| M5 | edge not cleared on consumption — vault 2.4 **REPLAY** | **RED** — 2 failed / 6 passed | confirmed |
| M6 | edge cleared because a frame ENDED, not because a tick took it — vault 2.4 **DROP** | **RED** — 1 failed / 7 passed | confirmed |
| M7 | per-tick RNG sample removed — vault 2.3 absent, helpers still fine *(Codex F3/F7b)* | **RED** — 2 failed / 7 passed | confirmed |
| M8 | a knob deleted together with its behaviour — the roster tripwire *(Codex F7a)* | **RED** — 3 failed / 11 passed | confirmed |
| M9 | `chance > 0` early-return deleted | **SURVIVED — see below** | confirmed |
| M10 | gravity nudged 5% — the discrete apex prediction must notice *(2.14)* | **RED** — 1 failed / 10 passed | confirmed |
| M11 | feet origin replaced by Phaser's centred default | **RED** — 1 failed / 6 passed | confirmed |
| M12 | flip derived from velocity instead of facing | **RED** — 1 failed / 6 passed | confirmed |
| M13 | `rollChance` PULLS from the stream instead of reading the tick sample | **RED** — 1 failed / 8 passed | confirmed |

**M9 survived, and is recorded rather than hidden *(vault C11)*.** Deleting the `chance > 0`
early-return from `rollChance` leaves `rng.test.ts` fully green. It is redundant *by construction*
here: a roll reads `world.tickRoll` instead of pulling from the stream, so `tickRoll < 0` already
returns false and nothing was going to advance anyway. It stays for two reasons — vault 2.3 states
the gate as a blocker and contradicting a blocker is a STOP-and-ask, not a cleanup; and the property
it protects **is** enforceable, which M13 proves. The line is untested; the guarantee is not.

#### The harness itself was the phase's clearest demonstration of C12

The first mutation harness verified "the mutation applied" by counting the ORIGINAL string and
requiring zero. That check is wrong when the mutant **contains** the original (M6: inserting a line
before `return total;`) and meaningless when the replacement is the **empty string** (M8: deleting a
knob). Both exits happened *after* the write, so the run reported M6 and M8 as "REFUSED" while both
were sitting applied in the working tree — `airFriction` stayed deleted from `DEFAULT_TUNING` and a
stray `input.jumpPressed = false` stayed in `advance()`. **The suite was green at that moment.** Had
the report been trusted, two mutations would have been recorded as cleared while the source was still
mutated. This is exactly the failure C12 names, reproduced without trying.

Two further harness defects, both of which would have manufactured false evidence:

- **Every mutation reported RED for the wrong reason.** A vitest spawned from a Node parent loses its
  runner context: every suite died at import with `TypeError: Cannot read properties of undefined
  (reading 'config')`, printing `Tests  no tests` and exiting non-zero. **A non-zero exit is not
  evidence a gate caught anything.** The fix is vault C13's lesson in a new place — drive the loop
  from the shell that works, and detect redness *positively* from `Tests N failed` plus named failing
  specs, never from an exit code.
- The corrected harness records `loadfail=0` for all thirteen runs, so every RED above is an
  assertion failure with a named failing spec.

The apply/restore check now is: **the file content changed, AND the original string count dropped by
exactly one** — verified in both directions.

Final proof that nothing survived: after all thirteen mutations, `git diff --stat` against the staged
tree reports **only `docs/QA-LOG.md` changed**. Every source file is byte-identical to its pre-mutation
state, and the full suite is 64/64 green.

#### Three more mutations, after the review briefs

| # | Mutation applied | Result | Restored |
|---|---|---|---|
| M14 | `MAX_TICKS_PER_FRAME` cap removed from `drainTicks` | **RED** — 3 failed / 5 passed | confirmed |
| M15 | accumulator remainder discarded instead of carried | **RED** — 5 failed / 3 passed | confirmed |
| M16 | `emitOnRepeat: false` → `true` on every key | **RED** — 1 failed, at full parallelism | confirmed |

### Criteria 2.9 — the two review briefs, and what they found

Both ran on the staged diff, separately, with different questions *(vault A7)*.

**Brief 1 (verify the stated criteria)** returned **PASS on all six** it was assigned — 2.1, 2.2,
2.3, 2.4, 2.6, 2.7 — and re-ran each locally rather than reading it. It also confirmed the four
Global Constraints hold: no float-of-seconds duration in `src/sim/`, no frame-delta multiply inside
it, no file over 400 lines, and `scale` required / validated / never applied to velocity. Five
non-blocking notes; three applied, two accepted:

| Note | Disposition |
|---|---|
| `ticksToMs` in `src/sim/index.ts` is a dead export | **Applied** — now used by `PlaygroundScene` to show tick-count knobs in ms as well as ticks. Nobody has an intuition for "7 ticks" while tuning by hand; 117 ms is comparable to your own thumb. |
| `maxFallSpeed`'s upward perturbation contributes nothing — `longFall` ended before the clamp saturated | **Applied** — the scenario's floor moved to y=2400 and its length to 26 ticks, so the default clamp is reached around tick 19 and BOTH the halved and doubled cases are observable. Re-measured: both now move. |
| The apex oracle is a parallel re-implementation, not an independent one | **Accepted, recorded.** True, and the reason the `v²/2g` guard exists — it asserts the two integrators are still 8.08 px apart, so a shared misconception about the integrator would have to also survive that. A genuinely independent oracle would be a second integrator, which is the same code again. |
| The browser proof of 2.6 covers one knob (`runMax`); the other ten rest on a structural argument | **Accepted, recorded.** The unit sweep covers all eleven exhaustively, and `PlaygroundScene` builds its rows from `Object.keys(tuning)`, so the row list and the swept list cannot diverge. Measuring all eleven through the browser would be eleven times the runtime for no new failure mode. |
| `docs/QA-LOG.md` was unstaged, so a reviewer working from the staged diff could not see it | **Applied** — staged. |

**Brief 2 (how could this be wrong?)** returned **one MEDIUM finding**, three hypotheses it traced
and explicitly ruled out, and three things it could not check. The ruled-out traces are recorded
because they cost real effort and the next reviewer should not repeat them: the buffer/landing
boundary is uniform and correct at every `before` value; `discreteApexRise` does not compare code to
itself in the way the vault's root rule warns about; and no double-jump, stuck state or re-opening
coyote window could be constructed.

| Finding | Disposition |
|---|---|
| **MEDIUM** — the `MAX_TICKS_PER_FRAME` backlog-drop branch has no test and cannot have one inside a `Phaser.Scene` method | **Applied**, and it is the most valuable finding of either brief. The arithmetic moved to `src/game/frameClock.ts` — vault 2.12's own prescription, *"if a scene rule has an edge case, that's the move, not a browser test"* — and `tests/unit/frame-clock.test.ts` now covers the drop branch, the remainder carry, the boundary at exactly the cap, and a NaN/negative/infinite delta. M14 and M15 prove it can go red. It also surfaced a defect the finding did not name: a garbage `delta` (Phaser can emit one after a tab restore) made `ticks` NaN and would have silently stopped the loop for the rest of the session. |
| Could not check: whether Playwright emits OS-style key repeat | **Measured, and it does not** — see below. This one changed a test from decoration into a real gate. |
| Could not check: multi-solid tunnelling in `resolveCollisions` under solids narrower than one tick of travel | **Accepted as a known ceiling** — see *Deliberately not fixed*. |

#### The auto-repeat test was decoration, and the measurement is what showed it

Brief 2 could not verify whether Playwright's `page.keyboard.down()` produces key repeats. Measured:
**a three-second hold emits exactly ONE keydown.** So the test named *"holding jump does not
auto-repeat into a second jump"* could never have failed from the cause it was named for — vault
**C2** exactly, a gate that cannot go red. Phaser's own guard is real (`Key.onDown` emits `DOWN`
only when `!isDown`, or when `emitOnRepeat`), and instrumenting the live Key proved it: during a
synthetic burst, `key.repeats` climbed to 21 while `DOWN` emissions stayed at **1**.

The test now dispatches real repeat events and asserts the guard, and M16 proves it goes red.

#### A parallel-worker false green — vault B5 and C12 in the same failure

The rewritten test **still passed with the mutation applied**, and only on the first attempt. Run
serially it failed correctly. Reproduced deterministically:

| Workers | M16 applied | Result |
|---|---|---|
| 6 (default `fullyParallel`) | yes | **6 passed** — false green |
| 1 (`--workers=1`) | yes | 1 failed — correct |

Cause: the test waited `waitTicks(30)` after the repeat burst and then read the player's position
once. `waitTicks` guarantees *at least* N ticks, not exactly N — and under six workers each
cold-booting Phaser, the poll interval let the tick counter overshoot the entire 65-tick jump arc.
The player jumped, landed, and was back at rest before the assertion read anything.

This is vault **B5**'s *"a new spec broke three unrelated ones is usually contention, not a
regression"* meeting **C12**'s *"a mutation you have not confirmed applied is a false green"* — and
it is worse than either alone, because the mutation **was** confirmed applied, on disk and in the
served bundle. The confirmation was sound; the assertion's timing window was not.

Fixed by dispatching the burst and sampling the player's position **every animation frame inside the
page**, so no round-trip latency and no overshoot: per-frame sampling cannot miss a 65-tick arc.
M16 now fails at full parallelism.

### Criterion 2.11 — the Codex implementation review

Full report and triage in [reviews/phase-02-impl.md](reviews/phase-02-impl.md). Six findings, **all
six applied**, and it opened with *"Phase 2 is not ready to report complete."* It was right.

| # | Finding | Sev | Applied as |
|---|---|---|---|
| I1 | The buffer does not implement the header's stated window definition, and its tests cannot tell the difference | **High** | The header now states the two windows **separately**; a new test asserts `jumpedAt === landedAt + 1`, pinning the accepting tick rather than its existence |
| I2 | `PlaygroundScene` is registered in production builds | **High** | `scene:` is now `import.meta.env.DEV ? [Boot, Game, Playground] : [Boot, Game]`, and the `P` binding is guarded the same way. Verified in `dist/` |
| I3 | Criterion 2.8 is unrun or unrecorded | **High** | Corrected in the report, not fixed by code — **the phase is reported failing on 2.8** |
| I4 | Movement state is published one tick behind the physics | Medium | `resolveState` moved from step 4 to step 11, after collision; new test + mutation M17 |
| I5 | Deleting `renderPlayer()` leaves every test green | Medium | New e2e reads the actual `Rectangle` through `__phaserGame`; mutation M18 |
| I6 | The accepted reason for keeping the apex oracle does not hold | Low | Added a **closed-form** discrete oracle derived algebraically from the contract |

Three more mutations, run after these fixes, all confirmed applied and restored:

| # | Mutation applied | Result | Restored |
|---|---|---|---|
| M17 | `resolveState` moved back before integration (revert of I4) | **RED** — 1 failed / 12 passed | confirmed |
| M18 | `playerRect.setPosition` deleted from `renderPlayer()` | **RED** — expected 616.2, received 470 (the spawn) | confirmed |
| — | *(M17's first attempt never applied: a syntax error in the harness script. The apply check caught it and reported `resolveStateBeforeIntegrate: false` — C12 doing its job.)* | | |

### The same test-design defect, three times

Three separate tests in this phase were written as *"advance N ticks, then read once"*, and all three
were wrong in the same way. `waitTicks` guarantees **at least** N ticks, never exactly N, and under
parallel workers a single Playwright round trip can cost more wall-clock than the entire window
being measured:

| Test | What the overshoot did |
|---|---|
| the Playground knob sweep | measured distance across a stretch of world the player had already left |
| the key-repeat guard | player jumped, landed and returned to rest before the assertion read — **false green with the mutation applied**, only at 6 workers |
| the jump arc | loop exited after one or two samples and never saw the descent — **false RED on correct code** |

**A wait expressed in ticks cannot bound a sampling window.** All three now sample inside the page,
once per animation frame, and return an aggregate. `gameHarness.ts` carries the warning so the next
spec does not rediscover it.

### QA gate results

| # | Criterion | Result |
|---|---|---|
| 2.1 | Hold Right → x increases monotonically | **PASS** — e2e, with a floor and ceiling from the live knob, plus a separate test that the DRAWN rectangle tracks the sim |
| 2.2 | Jump apex within ±2 px of the discrete-integrator prediction | **PASS** — measured 150.3 px against a predicted 150.30 px |
| 2.3 | Coyote fires in its window and not outside; fixture ≥ 2× the window | **PASS** — sweep to `2N + 2`, both endpoints from the live knob |
| 2.4 | Jump buffer: press before landing jumps; too early does not | **PASS** — both endpoints, plus the exact accepting tick |
| 2.5 | Deleting any latch turns a test red | **PASS** — 18 mutations, 17 red on named assertions, 1 recorded survivor |
| 2.6 | Every Playground knob moves an observable output | **PASS** — 11/11 in the unit sweep with a pinned roster, plus the scene driven in the browser |
| 2.7 | Sim suite runs with Phaser uninstalled | **PASS** — 75/75 with `phaser` removed, restored to 4.2.1 exact |
| 2.8 | Feel check in the browser: weighty, responsive, no input drops | **PASS, with one defect found and fixed** — played by the user; see below |
| 2.9 | No file > 400 lines; diff review and adversarial pass | **PASS** — largest file 387 lines; both briefs ran, findings applied or recorded |
| 2.10 | Codex plan review ran; every finding applied or recorded | **PASS** — 8 applied, 1 acknowledged, 1 rejected with a reason |
| 2.11 | Codex implementation review ran; every finding applied or recorded | **PASS** — 6 findings, 6 applied |

**Regression set:** Phase 1 criteria 1.1–1.7 and `phase-01-boot.spec.ts` — **PASS**, 13/13, with the
three documented success-path assertion amendments. All 20 e2e tests pass, three runs in a row.

### Criterion 2.8 — what playing it found *(vault C4)*

The user played it and reported no problem with weight, responsiveness or dropped input. What they
did report is the thing seventy-five unit tests and twenty browser tests could not have surfaced:

> *"I managed to adjust the settings when I'm on the playground, but for some of them I can't be
> sure it actually works or not because I didn't see any visual change."*

**That is vault A6 stated from the player's chair** — *"a slider that visibly exists reads as a
slider that visibly works."* The knob values themselves always updated on screen; what was missing
was any way to see a knob's EFFECT. Four are invisible while playing by their nature: `coyoteTicks`
and `jumpBufferTicks` are forgiveness windows you only notice at the exact edge of a ledge,
`airFriction` acts only while airborne with nothing held, and `jumpCutDivisor` only if you tap
rather than hold. Turning one of those looked identical to turning a dead knob.

`knob-sweep.test.ts` was green throughout, and correctly so — it proves each knob changes an
internal trajectory fingerprint. **That satisfied the criterion mechanically while missing its
point entirely**, which is the cleanest example in this project so far of why C4 exists.

Fixed by `src/sim/derived.ts` and a second Playground panel: eleven derived numbers — apex in px and
tiles, airtime, short hop, top speed, ticks to top speed, ground stop distance, air drift, terminal
fall speed, and both windows in milliseconds — each produced by running the real simulation in a
scratch world rather than by a formula that could drift from it. They update on the same frame the
knob does. Measured with gravity taken from 0.9 to 0.54: apex moves 150.3 px → 245.1 px (4.70 → 7.66
tiles) and airtime 65 → 81 ticks, both visible without leaving the menu.

`tests/unit/derived-feel.test.ts` now holds the Playground to the standard the sweep cannot:
**for every knob, at least one DISPLAYED number must move.** An internal fingerprint change is no
longer sufficient. The four knobs that motivated it are also asserted individually, so a regression
names which one.

**Phase 2 passes all eleven criteria.**

### What was rejected, and why *(vault C10)*

- **Arcade Physics**, for the player. px/second velocities integrated with `delta` inside
  `World.step` are the exact `deltaTime` multiply vault 2.1 forbids, and it lives in `phaser`, which
  vault 1.1 forbids `src/sim/` importing. Zero-line rejection: Phase 1's config had no `physics` block.
- **`Phaser.Input.Keyboard.JustDown`**, for the jump edge. A consuming read that resets when checked;
  two readers in one frame lose the edge.
- **Arrow keys for the Playground knobs**, which the execution plan specified. They are how you run,
  and the scene exists to retune the feel while running.
- **Extending the `window.__game` surface.** Closed at nine fields by a Phase 1 Codex ruling. Two
  tests wanted values it does not carry; both were rewritten to measure behaviour instead.
- **A tinted texture for the grey-box player.** Tint is WebGL-only; the game runs `Phaser.AUTO`.

### Deliberately not fixed *(vault C11)*

1. **The `chance > 0` gate in `rollChance` is untested** — mutation M9 survives. It is redundant by
   construction because rolls read the per-tick sample rather than advancing the stream. Kept
   because vault 2.3 states it as a blocker; the guarantee it protects is tested by M13.
2. **`resolveCollisions` can tunnel through solids narrower than one tick of travel.** Raised by
   adversarial brief 2, which could not construct a failing input for the current data and said so.
   Measured: the shipped solids are 280 px and 240 px wide against a `runMax` of 5.2 px/tick and a
   `maxFallSpeed` of 17 px/tick, so the margin is ~14× on the tightest axis. Phase 3 introduces
   tilemap geometry at `TILE_SIZE` 32 px, still ~1.9× the worst-case per-tick travel. Revisit if a
   moving platform or a thin hazard is ever authored.
3. **The Playground knob keys drop presses fired faster than one per frame.** Observed only when
   driven by Playwright at machine speed; a human cannot press Q or E twice inside 16 ms. The e2e
   spec waits two ticks between presses rather than the scene queuing them.
4. **Character size on screen is unchanged at 4.3 % of height** against STYLE.md's ~20 %. Camera zoom
   is Phase 3's decision and setting it here would pre-empt it — the same reason Phase 1 deferred it.

---

## Vault-out — Phase 2

What this phase learned that the vault did not already say.

**0. A knob-sweep test can be green while every knob is invisible.** The single most valuable
finding of the phase came from the user playing it for two minutes, not from any gate. All eleven knobs
passed `knob-sweep.test.ts` — each provably changed an internal trajectory — and four of them showed
the player nothing whatsoever when turned. **"The output moved" and "the player can see the output
move" are different claims, and vault A6 is about the second one.** Any tuning UI needs the derived
consequence displayed next to the control, or a working knob and a dead knob are indistinguishable
from the chair. This is C4's *"only playing it found this"* landing on a gate that was specifically
designed to prevent it.

**1. A wait expressed in ticks cannot bound a SAMPLING window.** Three tests in this phase were
written as *"advance N ticks, then read once"*, and all three were wrong. `waitTicks` guarantees at
least N ticks, never exactly N; under parallel Playwright workers one round trip can cost more
wall-clock than the whole window being measured. It produced a **false green with a mutation
applied** (the key-repeat guard, only at 6 workers, correct at 1) and a **false red on correct code**
(the jump arc, which exited before seeing the descent). The fix is structural, not a bigger timeout:
sample inside the page once per animation frame and return an aggregate. This extends vault **B5** —
*"a wait-until loop must check before it steps and must not step in chunks"* — with the sharper form:
**a tick-count bound is not a time bound, and a sampled property needs continuous sampling, not a
bounded wait followed by one read.**

**2. `emitOnRepeat: false` is load-bearing, and Playwright cannot test it by holding a key.**
Measured: `page.keyboard.down()` held for three seconds emits **exactly one** keydown. No repeats at
all. So the obvious test — hold jump, assert one jump — can never fail from the cause it names.
Phaser's guard is real (`Key.onDown` emits `DOWN` only when `!isDown`, or when `emitOnRepeat`), and
instrumenting the live Key proved it: `key.repeats` climbed to 21 while `DOWN` emissions stayed at 1.
Repeat behaviour has to be driven with dispatched `KeyboardEvent`s — and `keyCode` must be attached
with `Object.defineProperty` after construction, because Chromium ignores it in the constructor and
Phaser keys off it.

**3. C12's check was itself wrong in two ways, and both wrote the file before failing.** Verifying a
mutation by counting the ORIGINAL string and requiring zero is wrong when the mutant **contains** the
original, and meaningless when the replacement is the **empty string**. Both exits happened after the
write, so two mutations sat applied in a green tree while the report said "refused". The correct
check is **content changed AND the original count dropped by exactly one**, verified in both
directions. Separately: **a non-zero exit code is not evidence a gate caught anything** — a vitest
spawned from a Node parent loses its runner context and every suite dies at import, printing
`Tests  no tests` and exiting 1. Detect redness positively, from `Tests N failed` plus named failing
specs.

**4. The tick order's two windows needed two sentences, not one.** The plan review predicted an
off-by-one in coyote time (it was there). Fixing it revealed the same defect mirrored in the jump
buffer. Then the implementation review found the *header* was now wrong: the two windows genuinely
differ, because step 7 tests `grounded` as set by step 9 of the previous tick, so a buffered jump
fires the tick **after** touchdown. The tests could not see it because they asked *"did a jump
happen"* rather than *"on which tick"*. **An existence assertion cannot verify a timing claim** — and
a documented invariant needs a test that pins the exact tick, or the documentation drifts from the
code while everything stays green.

**5. `pixelArt`-era Phaser 4 notes for this phase.** `Rectangle` is a Shape and Shapes do **not**
mix in the Flip component — `setFlipX` does not exist on it, which the typechecker caught and no test
would have. Tint is WebGL-only, so a `Phaser.AUTO` game cannot use a tinted texture as a grey-box
primitive. Game Objects default to origin `0.5, 0.5`, so a feet-anchored convention must set
`setOrigin(0.5, 1)` explicitly.

**6. A "DEV ONLY" label in a document is not a build gate.** `PlaygroundScene` was marked DEV ONLY in
PRD.md's file structure and shipped in the production bundle anyway, with every gate green. No test
asserted its absence because Phase 10 owns that check — so the only reader positioned to catch it was
the one reviewing the whole diff against the whole PRD. **Every dev-only artifact needs its
`import.meta.env.DEV` guard written at the moment it is created**, not deferred to the phase that
audits the bundle.

**7. The discrete-vs-continuous apex gap is 8.08 px here** (150.30 discrete, 142.22 from `v²/2g`),
against a ±2 px tolerance and the vault's recorded 7.4 px error. The gap is now asserted to exceed
the tolerance, so retuning cannot silently make criterion 2.2 vacuous. Three derivations must agree:
a closed form (`n·v₀ − g·n(n−1)/2`), an iterative oracle, and the simulation.

**8. Renumber the contract while it is still free.** The state transition sat at step 4, before
integration, so every published state described the previous tick's position — visible on screen,
because the render colour reads `player.state` directly. Moving it to step 11 renumbered the contract
Phase 5 depends on, which is exactly what the plan review warned would be expensive later. It was
free now because nothing consumes the numbering yet. **The moment to fix an ordering contract is the
phase that creates it.**
