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
