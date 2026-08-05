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

| Failure mode | `loaderror` | texture check | catalog check |
|---|---|---|---|
| genuine HTTP 404 | fires | catches | — |
| corrupt 200 (HTML served as PNG) | **silent** | catches | — |
| catalog missing | **silent** | — | catches |

No check is redundant, and none is dead code; each was confirmed firing in a browser.

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
| 1.7 | No source file > 400 lines | ✅ largest is `BootScene.ts` at 264 |
| 1.8 | Diff reviewed | see below |
| 1.9 | Adversarial pass | see below |
| 1.10 | Codex **plan** review ran; every finding applied or recorded | ✅ `docs/reviews/phase-01-plan.md` — 11 applied, 1 rejected with a reason |
| 1.11 | Codex **implementation** review ran on the diff | see `docs/reviews/phase-01-impl.md` |

**Looked at in a browser, not only tested** *(vault C4)*: all four states screenshotted and viewed —
clean boot (letterboxed, centered, correct colour, "Boot OK"), 404 refusal, corrupt-200 refusal,
filtering refusal. Refusal text is legible on the canvas, not only in `bootError`.

**Servers killed by port before reporting done** *(vault C13)*. `playwright.config.ts` launches
`node ./node_modules/vite/bin/vite.js` directly, never `npm run dev`, because on Windows the package
script is a shell wrapper and killing the wrapper orphans the real process.

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
