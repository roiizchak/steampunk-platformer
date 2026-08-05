# Phase 1 — Codex implementation review (review 2 of 2)

**Ran:** 2026-08-05, on the `phase-01-boot` branch, after the phase's own tests were green and
after criteria 1.8 (diff review) and 1.9 (adversarial pass) had both run and been applied.
**Invocation:** `/codex:rescue --wait --resume`, carrying the `node_repl` instruction from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).

`main` contained no code at all, so the entire diff is new files plus edits to `docs/PRD.md`.

---

## The report, verbatim

### Blocker

**1. Scene restart still skips every fetch because the JSON catalog is globally cached.**
Only `filecomplete` for `asset-catalog` triggers `queueCatalog()` and the texture-removal fix. On
restart, Phaser's `LoaderPlugin.addFile` skips the already-cached JSON key (`hasCacheConflict`), so
the callback never fires; `create()` validates the stale cached catalog against stale global textures
and reports success without fetching catalog or images.
`src/scenes/BootScene.ts:93-139, 107-120, 143-184`. **This is the fourth path the prior two reviews
missed** — no E2E test restarts the same Phaser game (`tests/e2e/phase-01-boot.spec.ts:176-312` all
use `page.goto()` fresh).

**2. The sim gate ignores any `src/sim` file not reachable from `src/sim/index.ts`.**
`simClosure()` walks only files reachable from the barrel via recognized imports
(`tests/unit/sim-boundary.test.ts:30-43, 205-230`); the non-vacuity check just requires one `/game/`
file in that closure (`:253-267`). An orphan file like `src/sim/debug-cheat.ts` could import
Phaser/`Date.now`/DOM and the gate stays green — violates the "all of `src/sim`" blocker per
`docs/PRD.md:14-17, 53-58`.

### Major

**3. Boundary scanner has concrete evasions**: bare `Date()`, `crypto.getRandomValues`, aliased clock
(`const clock = Date`), lazy `import('phaser/...')`, and template-literal interpolation
(`` `${new Date()}` ``) all pass undetected — verified by running the same regex/state machine
in-process. `resolveImport()` advertises `.mts/.cts/.mjs/.cjs/jsx` in its glob but doesn't try those
extensions or directory-index variants when resolving extensionless imports.
`tests/unit/sim-boundary.test.ts:63-84, 103-175, 30-35, 178-203`.

**4. Filtering is only proven for WebGL; Canvas fallback can boot with smoothed textures.**
`Phaser.AUTO` allows Canvas fallback (`src/game/config.ts:14-20`), but Boot's assertion only checks
WebGL-relevant state (`src/scenes/BootScene.ts:246-285`). Verified against
`node_modules/phaser/dist/phaser.esm.js:184618-184648, 185776-185825, 236313-236321`: Canvas sets
`imageSmoothingEnabled = !frame.source.scaleMode`, and `scaleMode` defaults to `0` (falsy negated →
`true`), so Canvas draws smoothed regardless of the pinned decision. CSS `image-rendering` only
affects the canvas element's own scaling, not in-context texture drawing.

**5. Playwright's `reuseExistingServer: true` can silently test a stale/unrelated server** on port
5173, contradicting QA-LOG's claim that the config always launches the real Vite entry point.
`playwright.config.ts:18-25` vs `docs/QA-LOG.md:174-180`.

### Minor

**6.** `window.__game` field count disagrees between `docs/prd/phase-01-boot.md:40-50` (7 fields) and
`docs/PRD.md:250-267` (9 fields); implementation (`src/debug/globals.ts:23-45`) correctly follows the
newer 9-field spec, but the phase deliverable doc is stale.

**7.** QA-LOG/constants claim all four Phaser-reserved textures are 32×32
(`src/game/constants.ts:44-49`, `docs/QA-LOG.md:195-203`), but per `phaser.esm.js:234604-234622`
`__NORMAL` is actually 1×1. The rejection logic is still correct (1×1 is nonzero) but the documented
measurement is wrong.

### QA gate / rejected-findings assessment

- R19, R20, R21 rejections are all defensible on inspection; none hides a real defect — the defects
  found (items 1–5 above) are separate from those three.
- Gate criteria **1.5** (refuse missing/corrupt assets) and **1.6** (filtering pinned) assessed as
  **Fail** given findings 1 and 4.
- **1.7** (no file >400 lines) **Pass** — BootScene 362 lines, E2E spec 343, boundary test 332.
- Build/typecheck/Vitest/Playwright were **not independently rerun**.

### What the reviewer could not check

Could not run git, `tsc`, build, Vitest, Playwright/Chromium, or reproduce the scene-restart scenario
live — all child-process execution failed with `spawnSync EPERM` / `CreateProcessAsUserW failed: 5`.
Could not confirm the existing `dist/` artifact or QA-LOG command outputs came from exactly the
claimed commit. Everything else (all cited file/line evidence, the Phaser source checks, and the
scanner-evasion probe) was verified directly this session.

*(Preserved per vault 9.3 — a gate's blind spots are part of its result. Note the shell failure
persisted even with the `node_repl` workaround; the reviewer routed file reads through `node_repl`
successfully and only lost the ability to execute commands, which is why its findings are grounded in
file evidence but carry no test output.)*

---

## Triage

Every finding **applied**, or **rejected with a reason** *(vault C11)*. Two claims were verified
against `phaser.esm.js` before acting, per vault **C6** — take a reviewer's symptom as evidence and
their cause as a hypothesis. Both held.

| # | Finding | Sev | Disposition |
|---|---|---|---|
| I1 | Scene restart skips every fetch — the JSON catalog is cached game-globally, so `filecomplete` never fires and nothing is re-verified | **Blocker** | **Applied.** Confirmed against source: `File.hasCacheConflict()` is literally `this.cache.exists(this.key)`. `preload()` now drops the cached catalog before loading, mirroring the texture fix one level up. **Regression added** (`1.5 the gate still works on a scene RESTART`), and it required a dev-only `window.__phaserGame` handle — without one the case is untestable from outside. Mutation-proven: removing both cache-clears turns exactly that test red. |
| I2 | The sim gate ignores any `src/sim` file not reachable from the barrel — an orphan could import Phaser and stay green | **Blocker** | **Applied.** The scanned set is now the **union** of every file under `src/sim/` and the transitive closure from the entry point. Each half covers the other's blind spot: closure alone misses orphans, directory alone misses helpers one hop out. Mutation-proven with an unreferenced `src/sim/orphan-scratch.ts`. |
| I3 | Five scanner evasions: bare `Date()`, aliased `const clock = Date`, `crypto.getRandomValues`, subpath `import('phaser/...')`, and template interpolation `` `${new Date()}` ``; plus `resolveImport` not trying the extensions its own glob admits | Major | **Applied.** `Date` is now a bare-identifier rule (covering call-without-`new` and aliasing), `crypto` added, the Phaser pattern accepts a `/` subpath, `blank()` hands `${...}` interiors back to code mode via a brace-depth scan, and `resolveImport` tries all eight extensions plus directory-index forms. Five new evasion cases in the scanner's own test block. |
| I4 | Filtering proven only for WebGL — Canvas fallback draws smoothed regardless, because it reads `scaleMode`, which `pixelArt` never sets | Major | **Applied, and it changed the design.** Verified: `ctx.imageSmoothingEnabled = !frame.source.scaleMode`, and `scaleMode` defaults to `0`, so `!0 === true` — smoothing on. `Phaser.AUTO` can reach this in production. The fix is to stop relying on derivation: every loaded texture now gets an explicit `setFilter(NEAREST)`, and the per-texture `scaleMode` is asserted alongside `config.antialias`. This makes the assertion renderer-independent and, as a side effect, makes `scaleMode === NEAREST` a *correct* assertion — which the code comment previously warned it was not. Comment rewritten to explain both halves. |
| I5 | `reuseExistingServer: true` can silently test a stale server, contradicting the QA-LOG claim | Major | **Applied.** Set to `false`. This immediately caught a real instance: a dev server left running from an earlier measurement made the suite run **zero** tests. Killed by port *(vault C13)*, then 13/13. |
| I6 | `phase-01-boot.md` still showed the 7-field surface while PRD.md and the code had 9 | Minor | **Applied.** Phase doc updated with a note on why the two fields exist. |
| I7 | `__NORMAL` is 1×1, not 32×32 as documented | Minor | **Applied.** Corrected in `constants.ts` and `QA-LOG.md`. The rejection logic was already right — 1×1 is non-zero — so this was a documentation defect only, which is exactly the C9 class. |
| I8 | Criteria 1.5 and 1.6 assessed **Fail** | — | **Accepted.** Both were genuinely failing at review time. Both now pass, with mutation evidence for each fix. |

**Applied: 8. Rejected: 0.**

The reviewer's assessment that **R19, R20 and R21 were defensible rejections** is recorded as an
independent check on the 1.8/1.9 triage.

## Was review 2 worth its cost?

**Yes, decisively, and more than review 1.** Two blockers survived a correctness review *and* an
adversarial review before Codex found them:

- **The restart path (I1)** is the more alarming of the two. Three prior passes all reasoned about a
  *fresh page load*. Phase 2 onwards will re-enter Boot, at which point the entire refuse-to-route
  apparatus — the thing this phase exists to build for all nine later phases — would have been a
  silent no-op. Nothing in the QA gate as written would ever have gone red.
- **The Canvas filtering hole (I4)** would have shipped smoothed pixel art on any machine falling
  back from WebGL, with a runtime assertion actively reporting that filtering was pinned.

Both are the same failure shape the vault names repeatedly: a check that verifies the *config* rather
than the *outcome*, passing while the outcome is wrong.

**Protocol observation for later phases.** Codex's shell remained unusable even with the `node_repl`
workaround — the workaround restores *file reading*, not *command execution*. So review 2 cannot run
the test suite and its findings are file-evidence only. That is not a defect in the protocol; it is
the division of labour that makes the passes complementary. But it does mean **every Codex finding
must be re-verified by running something locally**, as was done here for all four of its
source-level claims.
