# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Steampunk Platformer

A short browser platformer — 3–5 levels, Victorian industrial steampunk, all art generated through
fal.ai — built as a learning exercise with a hard QA gate at every phase.

**Phaser 4.2.1 · TypeScript 7 · Vite 8 · vitest · @playwright/test · Tiled · fal.ai via `genmedia`**

Ten phases, one per session, each built on a `phase-NN-name` branch and merged to `main` after
approval. **[PRD.md § The phases](docs/PRD.md#the-phases) is the authority on what is done** — never
a sentence in this file. Resuming mid-phase starts at [HANDOFF.md](docs/HANDOFF.md).

**The world contract:** 96 px grid · camera zoom 1 · **1920 × 1080 design view, and the guaranteed
minimum; the LIVE view may be up to `MAX_GAME_WIDTH` × 1080** · 132 × 288 px character at
`RENDER_SCALE` 6 · `PLAYER_BOX` 22 × 48 sim units. Published in
[ASSET-PIPELINE.md § 0a](docs/ASSET-PIPELINE.md), pinned by `tests/unit/tilemap-data.test.ts`.
**`src/game/constants.ts` is the authority; prose is not** — these were 32 px / 44 × 96 / scale 2
before Phase 4's 3× rescale, and three documents went on saying so.

⚠️ **The view stopped being a fixed size on 2026-09-01, and that line used to read "1920 × 1080
view".** A fixed 16:9 view pillarboxed a landscape phone — ~19.5:9 against a 16:9 game leaves
**17.9 %** of the width black — and filling the screen is incompatible with holding a fixed-width
view. `src/game/viewSize.ts` sets the view to the viewport's own aspect on every resize and
`Phaser.Scale.FIT` then has nothing to letterbox; **`Phaser.Scale.EXPAND` cannot be used here** and
that file says why in full. **Height is invariant**, pinned at 1080, which is what
keeps every `gameH / GAME_HEIGHT` ratio at exactly 1 and leaves the grid, the zoom and every tile
measurement untouched. Only the width breathes. A viewport wider than the ceiling pillarboxes again,
deliberately and with a spec of its own.

Animation timings are settled for `idle`, `walk`, `run`, `jump` and `fall` — see
`public/assets/index.json` and `character-bounds.json`. ⚠️ This used to end *"`run`'s stride is still
provisional and is the number to distrust"*. **`stridePxPerCycle` has been dead since session 9** —
nothing reads it for timing — so that sentence pointed a reader's suspicion at a number that cannot
affect anything. The live locomotion figures are `FOOT_PX_PER_FRAME` and `LOCOMOTION_TICKS_PER_FRAME`
in `src/sim/playerTuning.ts`, pinned against the prose beside them by
`tests/unit/tuning-prose.test.ts`. **The number to distrust is `brass-courier/fall`**, which still
judders — a 74 px frame-to-frame height spread. `jump` was re-shot 2026-08-23 and now draws at 82.9 %
of idle, the first jump take to pass G6.

Windows. Default shell is PowerShell; the Bash tool takes POSIX syntax.

## 1. Commands

```bash
npm run dev                       # Vite dev server on :5173
npm run build                     # tsc --noEmit && vite build && tools/gen/verify-dist.mjs
npm run typecheck                 # tsc --noEmit alone — fastest full check
npm test                          # vitest run (unit; sim + docs/style locks)
npm run test:e2e                  # Playwright
npm run test:sim-isolated         # uninstall Phaser, run the unit suite, reinstall — QA criterion 1.3
```

`npx vitest run <file>` / `-t <name>` and `npx playwright test <file>` / `-g <name>` narrow a run.
Add `--headed --workers=1` to watch an e2e spec with no parallel interference.

Asset pipeline (Phase 4 onward): the `assets:*` scripts in `package.json` — `prompts`, `build`,
`clips`, `world`, `audio`. See [ASSET-PIPELINE.md](docs/ASSET-PIPELINE.md).

`npm run test:sim-isolated` mutates `node_modules` — if it is interrupted, Phaser is left
uninstalled. Recover with `npm i phaser@4.2.1 --save-exact`.

⚠️ **`git worktree remove --force` on an agent worktree can delete the REAL `node_modules`.** Agent
worktrees get a **junction** to the root `node_modules` (they are created without one, and every
agent that needed to run a test made one). `worktree remove` deletes through the junction, not the
link — so removing 18 stale worktrees on 2026-08-23 emptied the root `node_modules` and `tsc` stopped
existing. Nothing is lost and there is no clever recovery: `npm ci` restores it exactly, and the
lockfile pins `phaser@4.2.1`. **Delete the junction first**, or just expect to reinstall after a
worktree sweep.

## 2. Architecture

Three layers, and the boundaries between them are the whole design. Read them in this order.

**`src/sim/` — the simulation. Pure, deterministic, engine-free.** Imports nothing from Phaser,
touches no clock, no `Math.random`, no DOM. A pure function of `(state, input)` → `state` — which is
what makes it unit-testable in milliseconds and replay possible later.
`tests/unit/sim-boundary.test.ts` and `npm run test:sim-isolated` enforce this mechanically.

**`src/game/frameClock.ts` — the seam.** Milliseconds exist here and stop here. It accumulates real
elapsed time from a variable-rate `requestAnimationFrame` and drains whole ticks out of it, capped at
`MAX_TICKS_PER_FRAME` so a stalled tab cannot produce a thousand-tick catch-up. It lives in
`src/game/`, not `src/sim/`, on purpose.

**`src/render/` — sim state → drawn objects.** Engine-free decision functions (`playerView.ts` picks
frame, flip and tint; `cameraRig.ts` decides bounds and zoom and owns the `viewFits`/`tracksTarget`
predicates); the scene only applies the result. Pulling decisions out of scenes *(vault 2.12)* is what
makes their edge cases reachable from a unit test — and the predicates are imported by the unit tests
**and** the e2e specs, so a criterion is asserted against one definition, not two that agree on the
happy path.

⚠️ **A decision function with no consumer is the same defect as a burst of zero particles**: it
satisfies every assertion about itself and draws nothing. Phase 9 shipped `spriteFeedback.ts` — 221
source lines and a 306-line test file — with **zero** production consumers, and blanking all four
function bodies left the game byte-identical on screen with the suite green. **Every module here owes
a draw-path gate**, in the shape of `tests/unit/effects-draw-path.test.ts` (source text, for the
scenes that name a Phaser value) or `tests/unit/enemy-feedback.test.ts` (behavioural, against a fake
scene, for the ones that take Phaser as a type only — the stronger of the two, so prefer it).

**`src/game/tilemap.ts` — Tiled `.tmj` → plain data.** Pure: takes an already-parsed object, imports
nothing from Phaser, does no I/O. That is what lets the unit suite run the **real** validator over the
**shipped** bytes *(vault 3.1)*. **Collision is an object layer of rectangles carrying a `solid`
property, not the tile grid** — solidity from data, never from a name *(vault 3.3)*.

**`src/scenes/` — the only place Phaser lives.** `BootScene` (load + refuse-to-route gate;
`bootLevels.ts` holds the level half), `GameScene` (production play) and `UIScene` (the Phase 6 HUD,
a parallel scene registered in **both** build arms and launched by `GameScene.create()`) ship.
**Dev-only scenes —
`PlaygroundScene`, `ElementEditorScene`, `GymScene` — must be guarded with `import.meta.env.DEV` at
the point of creation *and* inside everything that names them**: the scene roster, the key binding,
the toggle body, and `refuseToRoute`'s stop list. A "DEV ONLY" label in a document is not a build
gate — Phase 2 shipped one to `dist/`. `npm run build` ends in `tools/gen/verify-dist.mjs`, which
fails the build on any dev-only scene key, debug symbol or user-facing dev prose in the bundle, and
asserts every `.tmj` reached `dist/` byte for byte.

**Nothing resolves a Tiled layer or tileset by NAME.** `GameScene` takes the first of each. A
hardcoded name passes the boot gate and then throws in `create()`, leaving `ready:false` with
`bootError:null` — the exact hang state refuse-to-route exists to prevent.

### The tick contract

`src/sim/tick.ts` holds a **numbered 14-step order, declared authoritative** *(vault 2.2)*. Combat
timing is expressed against it and art frame rates derive from windows that slot into it — so
renumbering it is a balance change, not a refactor.

**Read that file's header before changing anything in `src/sim/`.** It states the two forgiveness
windows separately and on purpose: they are *not* symmetric, because step 7 tests `grounded` as set
by step 9 of the *previous* tick, so a buffered jump fires the tick **after** touchdown.

### The `window.__game` surface

Read-only, live, **dev build only** — installed via `Object.defineProperty` with a getter and no
setter, absent from `dist/`, and Phase 10 verifies that absence.

```ts
{ sceneKey: string; tick: number; player: { x, y, vx, vy, state } | null;
  score: number; health: number; levelId: string | null;
  ready: boolean; bootError: string | null }
```

**The surface is closed at those eight fields** by a Phase 1 Codex ruling (`src/debug/globals.ts`).
A ninth field needs a STOP-and-ask; Phase 2 wanted two it does not carry and rewrote both tests to
measure behaviour instead.

`ready` is the positive terminal condition every e2e spec waits on instead of sleeping; `bootError`
is the negative one. Both exist because there is deliberately **no loader timeout** *(vault 1.4)* —
without them a successful boot, a refused boot and an infinite hang are indistinguishable.

`window.__phaserGame` is also dev-only: it lets e2e restart the Boot scene, and lets a spec assert the
*drawn* object tracks the sim — without it, deleting `renderPlayer()` left every Phase 2 test green.

Full rationale: [PRD.md § The `window.__game` surface](docs/PRD.md#the-windowgame-surface).

## 3. Non-negotiables

- **Dependencies are frozen** at runtime `phaser@4.2.1` (exact, no caret); dev `vite`, `typescript`,
  `vitest`, `@playwright/test`, and **`@babel/parser`** (exact, added 2026-08-24 by owner decision —
  originally test-only; **widened to BUILD time 2026-08-27 by owner decision**, for
  `tools/gen/devSeamAst.mjs`. It stays a devDependency and reaches `dist/` never: the dev-seam gate
  is a `generateBundle` hook, not a transform. See `tests/unit/tweenCallbacks.ts` for the original
  use). It pulls **three** transitive packages, not one as
  first recorded: `@babel/types`, `@babel/helper-string-parser`, `@babel/helper-validator-identifier`
  (corrected 2026-08-25 from the lockfile — the decision is unaffected, the number put to the owner
  was wrong). **Anything else: STOP and ask.** Phase 1 needed
  `@types/node` twice and solved it without adding it — prefer that.
  ⚠️ **`typescript` is NOT a usable parser.** TS 7 is the Go port: `require('typescript')` exports
  only `version` and `versionMajorMinor`, `unstable/ast` is a scanner with no parser entry point,
  and `unstable/sync` drives the native `tsgo` binary. That is why the parser is a dependency and
  not an import — checked, not assumed.
- **A tween callback may not write sim-owned state, persisted progression, or a next-tick control
  flag** *(criterion 9.2, extended 2026-08-24 by owner decision)*. A tween is wall-clock;
  `BaseTween.destroy()` runs **neither** callback, so a sim write inside one can simply never happen
  and the tick loop reads the stale value forever. The test is **ownership, not the mutation verb**:
  anything reached from a `World` handle (`world`, `simWorld`) is sim-owned — through an alias too —
  while `flyers.delete(flyer)` is idempotent view bookkeeping and stays legal. Gated by
  `tests/unit/tween-sim-writes.test.ts`.
  ⚠️ **The rule forbids WRITES, not passing sim state around.** A 2026-08-25 repair briefly widened
  the gate to reject any sim-rooted argument to any call, which false-reds `invulnerable(world.player)`
  and would have strengthened this owner-authorised rule without asking. Caught by the Codex
  implementation review and narrowed back: the gate fires on a call to a **named** `src/sim/` mutator,
  or on a write it can resolve. **Widening an approved architectural rule is a STOP-and-ask**, and a
  test quietly enforcing more than the rule says is one form of that.
- **`src/sim/` imports nothing from Phaser**, and reaches no clock, no `Math.random`, no DOM.
  That includes **Arcade Physics: never** — collision is our own sim.
- **Every duration is an integer count of 60 Hz ticks. Every distance is pixels.** Never a float of
  seconds, never a `deltaTime` multiply inside the sim.
- **No source file over 400 lines** without a written justification in the phase's QA log under
  `docs/qa/`. Prefer splitting.
- **Grey-box before art.** No fal spend on a feature whose mechanics are not already playable.
- **A phase with a failing or unrun criterion is reported failing.** Never as done.
- **A QA gate's Owner column is an instruction, not a label.** A criterion owned by a
  `voltagent-qa-sec:*` agent is **unrun** until that agent has run it — twice, per *(A7)* — and every
  finding is applied or recorded with a one-line reason *(C11)*. Owner → agent map in
  [PRD.md § The QA agent protocol](docs/PRD.md#the-qa-agent-protocol).
- **The art direction is locked mechanically.** `tests/unit/style-lock.test.ts` hashes STYLE.md's §2
  parameter table, §4 prompt template and §5 separation rules. A red hash is an approval checkpoint,
  **never** something to clear by editing the hash. Gate-0 re-probe measurements (§2b, `[SETTING]`,
  `[SCALE_RATIO]`, §5's table) are deliberately outside the lock.
- **The phase documents are linted.** `tests/unit/docs-contract.test.ts` checks every gate owner
  against the roster it parses out of PRD.md, plus the §2 skill lists, the `play`/`playwright-cli`
  pairing, both Codex criteria, and a QA-LOG row per criterion on any phase marked done. **Add a new
  owner type to PRD.md § The QA agent protocol first** — the test reads it from there.
- **STOP and ask** before: a new dependency, deleting a file, a fal batch over 5 generations, or
  contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md.

## 4. Phase workflow

Run each phase with `superpowers:executing-plans`, one phase per session, in this order:

> vault-in → invoke the phase's named skills → **Codex plan review** → build → QA gate (**the agent
> owners in the gate's Owner column**, then the **Codex implementation review**) → vault-out →
> **STOP for approval**

Both Codex reviews are mandatory. The gate's agent owners are equally mandatory, each with **two
briefs** *(A7)*, and they run **before** the Codex implementation review — applying their findings
changes the diff Codex reviews. Every finding from either is **applied** or **recorded with a one-line
reason**; silently ignoring one is not permitted *(C11)*. Agent findings go in
`docs/qa/phase-NN-<slug>.md`; `docs/reviews/` stays Codex-only.

⚠️ **Codex's sandboxed shell cannot spawn processes on this machine** (`CreateProcessAsUserW failed:
5`) — permanent, retrying does not help. Every review prompt must tell it to use the `node_repl` MCP
tool with `fs.readFileSync` for file access. That restores file *reading*, not command *execution*, so
its findings are file-evidence only and **must be re-verified locally**. Detail in
[PRD.md § The Codex review protocol](docs/PRD.md#the-codex-review-protocol).

## 5. Testing rules

Each rule below cost a real false green or false red. **The evidence for every one is in
[TESTING-RULES.md](docs/TESTING-RULES.md)** — read it before arguing with a rule.

- **Watch every gate fail before trusting it** *(C1)*, and confirm the mutation reverted *(C12)*.
- **A gate that cannot go red is decoration** *(C2)*. Committed failing fixtures, not assertions
  about assertions.
- **Verify a mutation applied by "content changed AND the original count dropped by one"** — never by
  "the count is now zero" *(C12)*.
- **A perf bound is chosen on one set of runs and confirmed on a HELD-OUT set.** Both gates fixed on
  2026-08-18 false-redded on the first run that had no say in their bound.
- **A statistic that does not order its own mutation cannot be fixed by moving the bound** — replace
  the statistic. 6.9's GPU ratio put five full-screen scrims below a clean run.
- **A non-zero exit code is not evidence a gate caught anything.** Detect redness *positively*, from
  `Tests N failed` plus named specs. Drive mutation loops from the shell, never from a Node script.
- **And detect GREENNESS positively too, including the test COUNT** *(Phase 9)*. A run that selected
  nothing reports `expected: 0, unexpected: 0` and exits 0 — indistinguishable from a clean pass
  unless you read the count. Every other rule here assumes the tests ran; this is the one that checks.
  A zero exit *through a pipe* is `tail`'s exit, not the gate's.
- **Only one Playwright run at a time, and nothing heavy beside it** *(Phase 9)*. `test:e2e` shares
  port 5173 and `test-results/`, and its wall-clock-bounded specs read a busy box as a broken game —
  seven specs once failed for no reason but three concurrent jobs. ⚠️ **This used to cite
  `tests/e2e/portGuard.ts`, which does not exist and never did.** The orphaned-server problem is
  real and the fix is real; it lives in `tools/dev/free-port.mjs` (run against **both** 5173 and
  4173 by `test:e2e`) and in `tools/dev/e2e-server.mjs` / `prod-server.mjs`, which free the port
  in-process before binding. Read `free-port.mjs`'s header before touching any of it.
- **Assert the type before the value** in e2e.
- **An existence assertion cannot verify a timing claim.** Assert *which tick*.
- **Never `waitForTimeout`.** Wait on `window.__game.ready`.
- **A wait expressed in ticks cannot bound a sampling window.** Sample inside the page, once per
  animation frame, and return an aggregate.
- **The headless harness is not the frame rate** — SwiftShader inflates e2e milliseconds ~21×. Only
  same-session interleaved A/Bs decide a performance question.
- **The suite runs on ONE ENGINE unless a spec says otherwise** *(2026-09-02)*. Six of the seven
  Playwright projects are Chromium. Two `.ogg` beds shipped a `BOOT REFUSED` screen to every iPhone
  \u2014 Safari decodes no Ogg, every iOS browser is WebKit \u2014 while 229 e2e tests were green. A suite
  cannot test the substrate it stands on. The **`webkit`** project exists for that class; keep it
  narrow and keep it green.
- **Kill dev servers by port before reporting done** *(C13)*.
- **Two review briefs per gate** *(A7)*, and withhold brief 1's findings from brief 2.
- **A subagent's summary is a claim, not evidence.** Re-verify locally whatever it could not run.
- **Two Playwright skills, two different jobs — do not swap them.** `playwright-cli` drives the
  *running* game for `play`-owned criteria; `e2e-playwright-testing` authors `tests/e2e/` specs.

## 6. Where everything else lives

| Document | What it is | When to read it |
|---|---|---|
| [docs/HANDOFF.md](docs/HANDOFF.md) · [docs/handoff/](docs/handoff/) | **Where the last session stopped**, what is blocked, and the traps not visible in the code. HANDOFF.md is the index and the live sessions; `docs/handoff/` holds the superseded ones. **The § numbers did not change when it was split** — a citation to "HANDOFF.md §9" still lands on the index. | **First, when resuming a phase mid-flight.** |
| [docs/PRD.md](docs/PRD.md) | **The spine.** Phase table, Global Constraints, file structure, the QA agent and Codex review protocols. | Once per session, first. |
| `docs/prd/phase-NN-*.md` | One document per phase: scope, required skills, QA gate. | **Only the phase being executed.** |
| [docs/ENGINE-NOTES.md](docs/ENGINE-NOTES.md) | Phaser 4.2.1 behaviour already paid for in debugging time, by subsystem. | Before touching that subsystem. |
| [docs/TESTING-RULES.md](docs/TESTING-RULES.md) | The evidence behind every §5 rule. | Before writing a gate — or before arguing with §5. |
| [docs/LESSONS-APPLIED.md](docs/LESSONS-APPLIED.md) · [docs/lessons/](docs/lessons/) | 133 vault notes distilled into hard requirements, cited by ID (1.3, A7, C11…) throughout the code and docs. LESSONS-APPLIED.md is the root rule, §A/§B/§C and the index; `docs/lessons/phase-NN-*.md` is one vault-in checklist per phase. | **The phase file when executing that phase**; the hub when a citation is unfamiliar. |
| [docs/QA-LOG.md](docs/QA-LOG.md) · [docs/qa/](docs/qa/) · [docs/evidence/](docs/evidence/) | Every decision, measurement and deliberate non-fix, plus the captured evidence. QA-LOG.md is the index and cross-phase entries; `docs/qa/phase-NN-*.md` is one log per phase. A long log splits into **flat siblings** (`phase-05-combat-NN-*.md`), never a subdirectory — `tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively. | **Before re-measuring anything.** |
| [docs/reviews/](docs/reviews/) | Codex plan + implementation reviews, one pair per phase. | Before planning a phase — what the last one was warned about. |
| [docs/STYLE.md](docs/STYLE.md) | Locked art direction. Changing §2–§5 needs approval, not a prompt tweak. | Any art work. |
| [docs/FAL-MODELS.md](docs/FAL-MODELS.md) | Every fal endpoint: schema, price, gotchas. | Before any generating phase — **and re-run `genmedia schema`**; a documented schema is a snapshot. |
| [docs/ASSET-PIPELINE.md](docs/ASSET-PIPELINE.md) · [docs/ASSET-MANIFEST.md](docs/ASSET-MANIFEST.md) · [docs/GENERATION-LOG.md](docs/GENERATION-LOG.md) · [docs/generations/](docs/generations/) · [docs/SOURCE-ANALYSIS.md](docs/SOURCE-ANALYSIS.md) | Generation → sheet → catalog pipeline; what shipped; the log of every generation and its `request_id`; the reference-art analysis. | Phase 4 onward. |
