# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Steampunk Platformer

A short browser platformer — 3–5 levels, Victorian industrial steampunk, all art generated through
fal.ai — built as a learning exercise with a hard QA gate at every phase.

**Phaser 4.2.1 · TypeScript 7 · Vite 8 · vitest · @playwright/test · Tiled · fal.ai via `genmedia`**

Ten phases, one per session. **Phases 1–3 are done; Phase 4 (fal art production + Character Gym)
is in progress and is the first phase that spends money.** Its contract is published in
[ASSET-PIPELINE.md § 0a](docs/ASSET-PIPELINE.md) and pinned against the runtime constants by
`tests/unit/tilemap-data.test.ts`: **96 px grid, camera zoom 1, 1920 × 1080 view, 132 × 288 px
character at `RENDER_SCALE` 6.**

> ⚠️ These numbers were **32 px / 44 × 96 / scale 2** until Phase 4's 3× world rescale, and this
> paragraph still said so afterwards — caught by the Codex implementation review, finding 12. The
> constants are the authority (`src/game/constants.ts`); prose is not. `PLAYER_BOX` is 22 × 48 in
> sim units and 132 × 288 drawn.

Animation timings ARE now settled for `idle`, `walk`, `run`, `jump` and `fall` — see
`public/assets/index.json` and `character-bounds.json`. `walk` exists as its own state, selected by
`SHIFT`. **`run`'s stride is still provisional** and is the number to distrust.
The table of phases, their dependencies and their status is in
[PRD.md § The phases](docs/PRD.md#the-phases) — it is the authority, not this line. Each phase is
built on a `phase-NN-name` branch and merged to `main` after approval.

Windows. The default shell is PowerShell; the Bash tool is also available and takes POSIX syntax.

## 1. Commands

```bash
npm run dev                       # Vite dev server on :5173
npm run build                     # tsc --noEmit && vite build
npm run typecheck                 # tsc --noEmit alone — fastest full check
npm test                          # vitest run (unit; sim + docs/style locks)
npm run test:e2e                  # Playwright
npm run test:sim-isolated         # uninstall Phaser, run the unit suite, reinstall — QA criterion 1.3

npx vitest run tests/unit/coyote-time.test.ts        # one unit file
npx vitest run -t "buffered jump"                    # one test by name
npx playwright test tests/e2e/phase-02-movement.spec.ts
npx playwright test -g "jump apex"                   # one e2e test by name
npx playwright test --headed --workers=1             # watch it, no parallel interference
```

`npm run test:sim-isolated` mutates `node_modules` — if it is interrupted, Phaser is left
uninstalled. Recover with `npm i phaser@4.2.1 --save-exact`.

## 2. Architecture

Three layers, and the boundaries between them are the whole design. Read them in this order.

**`src/sim/` — the simulation. Pure, deterministic, engine-free.** Imports nothing from Phaser,
touches no clock, no `Math.random`, no DOM. Every duration is an integer count of 60 Hz ticks; every
distance is pixels. It is a pure function of `(state, input)` → `state`, which is what makes it unit
testable in milliseconds and what makes replay and determinism possible later.
`tests/unit/sim-boundary.test.ts` and `npm run test:sim-isolated` enforce this mechanically.

**`src/game/frameClock.ts` — the seam.** Milliseconds exist here and stop here. It accumulates real
elapsed time from a variable-rate `requestAnimationFrame` and drains whole ticks out of it, capped at
`MAX_TICKS_PER_FRAME` so a stalled tab cannot produce a thousand-tick catch-up. Everything downstream
counts in ticks only — that is what makes behaviour independent of frame rate. It lives in
`src/game/`, not `src/sim/`, on purpose.

**`src/render/` — sim state → drawn objects.** Engine-free decision functions (`playerView.ts` picks
the frame, flip and tint from sim state; `cameraRig.ts` decides bounds and zoom and owns the
`viewFits`/`tracksTarget` predicates); the scene applies the result. Pulling these decisions out of
scenes *(vault 2.12)* is what makes their edge cases reachable from a unit test at all — and the
predicates are imported by the unit tests **and** the e2e specs, so a criterion is asserted against
one definition rather than two that agree on the happy path.

**`src/game/tilemap.ts` — Tiled `.tmj` → plain data.** Pure: it takes an already-parsed object,
imports nothing from Phaser, and does no I/O. That is what lets the unit suite run the **real**
validator over the **shipped** bytes *(vault 3.1)*. **Collision is an object layer of rectangles
carrying a `solid` property, not the tile grid** — solidity from data, never a name *(vault 3.3)* —
because a tile grid cannot represent the sub-tile nudge the Element Editor exists to make.

**`src/scenes/` — the only place Phaser lives.** `BootScene` (load + refuse-to-route gate, with
`bootLevels.ts` holding the level half), `GameScene` (production play). Dev-only scenes —
`PlaygroundScene` and `ElementEditorScene` today, `GymScene` later — must be guarded with
`import.meta.env.DEV` **at the point of creation** *and* inside anything that names them: the scene
roster, the key binding, the toggle body, and `refuseToRoute`'s stop list. A "DEV ONLY" label in a
document is not a build gate; Phase 2 shipped one to `dist/` before Codex caught it, and Phase 3
shipped a help line advertising two dev keys before the adversarial brief caught that.
`npm run build` now ends in `tools/gen/verify-dist.mjs`, which fails the build on any dev-only
scene key, debug symbol or user-facing dev prose in the bundle — and asserts every `.tmj` reached
`dist/` byte for byte.

**Nothing resolves a Tiled layer or tileset by NAME.** `GameScene` takes the first of each. A
hardcoded name passed the boot gate and then threw in `create()`, which leaves `ready:false` with
`bootError:null` — the hang state the whole refuse-to-route design exists to prevent, reached from
a level the gate had approved.

### The tick contract

`src/sim/tick.ts` holds a **numbered 14-step order, declared authoritative** *(vault 2.2)*. Phase 5's
combat timing is expressed against it, and art frame rates derive from windows that slot into it — so
renumbering it later is a balance change, not a refactor. **Step 4 is reserved, empty, for Phase 5
combat**, placed before integration so knockback reaches the same tick's movement.

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

`ready` is the positive terminal condition every e2e spec waits on instead of sleeping; `bootError`
is the negative one. Both exist because there is deliberately **no loader timeout** *(vault 1.4)* —
without them a successful boot, a refused boot and an infinite hang are indistinguishable, and the
QA gate cannot fail.

`window.__phaserGame` is also dev-only. It exists so e2e can restart the Boot scene, and so a spec
can assert the *drawn* object tracks the sim — without that, deleting `renderPlayer()` left every
Phase 2 test green, because everything else reads `__game`, which the scene writes directly.

**The surface is closed at nine fields** by a Phase 1 Codex ruling. Phase 2 wanted two values it does
not carry and rewrote both tests to measure behaviour instead. A tenth field needs a STOP-and-ask.
Full rationale in [PRD.md § The `window.__game` surface](docs/PRD.md#the-windowgame-surface).

## 3. Non-negotiables

- **Dependencies are frozen** at runtime `phaser@4.2.1` (exact, no caret); dev `vite`, `typescript`,
  `vitest`, `@playwright/test`. **Anything else: STOP and ask.** Phase 1 needed `@types/node` twice
  and solved it without adding it — prefer that.
- **`src/sim/` imports nothing from Phaser**, and reaches no clock, no `Math.random`, no DOM.
- **Every duration is an integer count of 60 Hz ticks. Every distance is pixels.** Never a float of
  seconds, never a `deltaTime` multiply inside the sim.
- **No source file over 400 lines** without a written justification in the phase's QA log under
  `docs/qa/`. Prefer splitting.
- **Grey-box before art.** No fal spend on a feature whose mechanics are not already playable.
- **A phase with a failing or unrun criterion is reported failing.** Never as done.
- **A QA gate's Owner column is an instruction, not a label.** A criterion owned by a
  `voltagent-qa-sec:*` agent is **unrun** until that agent has run it — twice, per *(A7)* — and
  every finding is applied or recorded with a one-line reason *(C11)*. Owners map to agent types
  in [PRD.md § The QA agent protocol](docs/PRD.md#the-qa-agent-protocol).
- **The art direction is locked mechanically.** `tests/unit/style-lock.test.ts` hashes STYLE.md's §2
  parameter table, §4 prompt template and §5 separation rules. A red hash is an approval checkpoint,
  **never** something to clear by editing the hash. Measurements due for a gate-0 re-probe (§2b,
  `[SETTING]`, `[SCALE_RATIO]`, §5's table) are deliberately outside the lock.
- **The phase documents are linted.** `tests/unit/docs-contract.test.ts` checks every gate owner
  against the roster it parses out of PRD.md, and enforces the §2 skill lists, the `play`/
  `playwright-cli` pairing, both Codex criteria, and that every phase marked done has a QA-LOG row
  per criterion. **Add a new owner type to PRD.md § The QA agent protocol first** — the test reads
  it from there, so an owner the PRD does not define fails every gate that uses it.
- **STOP and ask** before: a new dependency, deleting a file, a fal batch over 5 generations, or
  contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md.

## 4. Phase workflow

Run each phase with `superpowers:executing-plans`, one phase per session, in this order:

> vault-in → invoke the phase's named skills → **Codex plan review** → build → QA gate (**the agent
> owners in the gate's Owner column**, then the **Codex implementation review**) → vault-out →
> **STOP for approval**

Both Codex reviews are mandatory; neither may be skipped. Every finding is **applied** or **recorded
with a one-line reason** — silently ignoring one is not permitted *(C11)*.

The gate's agent owners are equally mandatory and run under the same C11 rule, each with **two
briefs** *(A7)*. They run **before** the Codex implementation review, because applying their
findings changes the diff Codex reviews. Agent findings go in the phase's own log,
`docs/qa/phase-NN-<slug>.md`;
`docs/reviews/` stays Codex-only. Full protocol, including the copy-paste briefs and the
owner→agent map, in [PRD.md § The QA agent protocol](docs/PRD.md#the-qa-agent-protocol).

⚠️ **Codex's sandboxed shell cannot spawn processes on this machine** (`CreateProcessAsUserW failed:
5`). This is permanent — retrying does not help. Every review prompt must instruct it to use the
`node_repl` MCP tool with `fs.readFileSync` for all file access. That restores file *reading*, not
command *execution*, so review findings are file-evidence only and **must be re-verified locally**.
Full detail in [PRD.md § The Codex review protocol](docs/PRD.md#the-codex-review-protocol).

## 5. Testing rules

- **Watch every gate fail before trusting it** *(C1)*. Re-introduce the bug, see red, restore, and
  confirm the mutation actually reverted with `grep -c` *(C12)*.
- **A gate that cannot go red is decoration** *(C2)*. Committed failing fixtures, not assertions
  about assertions.
- **Verify a mutation applied by "content changed AND the original count dropped by one"** — never by
  "the original count is now zero". That is wrong when the mutant *contains* the original, and
  meaningless when the replacement is empty; both write the file before failing, so a "refused"
  mutation can sit applied in a green tree *(C12)*.
- **A non-zero exit code is not evidence a gate caught anything.** A vitest spawned from a Node parent
  loses its runner context and every suite dies at import, printing `Tests  no tests` and exiting 1.
  Detect redness *positively*, from `Tests N failed` plus named failing specs. Drive mutation loops
  from the shell, not from a Node script.
- **Assert the type before the value** in e2e — a prior project passed vacuously on
  `undefined === undefined` through a debug hook that returned nothing.
- **An existence assertion cannot verify a timing claim.** "Did a jump happen" passed while the tick
  order's documented window semantics were wrong. Assert *which tick*.
- **Never `waitForTimeout`.** Wait on `window.__game.ready`. A sleep long enough to pass is long
  enough to hide a hang.
- **A wait expressed in ticks cannot bound a sampling window.** `waitTicks(N)` guarantees *at least*
  N ticks, never exactly N, and under parallel Playwright workers a single round trip can outlast the
  whole window being measured. "Advance N ticks, then read once" produced a **false green with a
  mutation applied** and a **false red on correct code**, in the same suite. Sample inside the page,
  once per animation frame, and return an aggregate.
- **Kill dev servers by port before reporting done** *(C13)*. Playwright launches
  `node ./node_modules/vite/bin/vite.js` directly — never `npm run dev`, whose shell wrapper orphans
  the real process on Windows.
- Run **two** review briefs per gate: one verifying the stated criteria, one asking *how could this be
  wrong?* *(A7)*. In Phase 1 the first concluded there were no asset-missing paths; the second found
  three, and Codex then found two more. Withhold brief 1's findings from brief 2 — a second pass that
  has read the first one confirms it instead of attacking it. Both briefs are in
  [PRD.md § The QA agent protocol](docs/PRD.md#the-qa-agent-protocol), ready to paste.
- **A subagent's summary is a claim, not evidence.** An agent reporting a criterion green without
  citing the command output, file and line, or screenshot has reported nothing. Re-verify locally
  whatever it could not run — the same standing rule the Codex reviews carry.
- **Two Playwright skills, two different jobs — do not swap them.** `playwright-cli` drives and
  screenshots the *running* game, and is how every `play`-owned criterion gets its evidence.
  `e2e-playwright-testing` authors the spec files under `tests/e2e/`. This project standardises on
  `e2e-playwright-testing`; the near-identical `playwright-e2e-testing` is deliberately never used,
  so no session flips between them. What of its rules did and did not apply here is already
  recorded in [docs/qa/phase-01-boot.md](docs/qa/phase-01-boot.md).

## 6. Where everything else lives

| Document | What it is | When to read it |
|---|---|---|
| [docs/HANDOFF.md](docs/HANDOFF.md) | **Where the last session stopped**, what is done, what is blocked, and the traps that are not visible in the code. | **First, when resuming a phase mid-flight.** |
| [docs/PRD.md](docs/PRD.md) | **The spine.** Phase table, Global Constraints, file structure, the QA agent and Codex review protocols. | Once per session, first. |
| `docs/prd/phase-NN-*.md` | One document per phase: scope, required skills, QA gate. | **Only the phase being executed.** |
| [docs/ENGINE-NOTES.md](docs/ENGINE-NOTES.md) | Phaser 4.2.1 behaviour already paid for in debugging time, by subsystem. | Before touching that subsystem. |
| [docs/LESSONS-APPLIED.md](docs/LESSONS-APPLIED.md) · [docs/lessons/](docs/lessons/) | 133 vault notes distilled into hard requirements, cited by ID (1.3, A7, C11…) throughout the code and docs. LESSONS-APPLIED.md is the root rule, §A/§B/§C and the index; `docs/lessons/phase-NN-*.md` is one vault-in checklist per phase. | **The phase file when executing that phase**; the hub when a citation is unfamiliar. |
| [docs/QA-LOG.md](docs/QA-LOG.md) · [docs/qa/](docs/qa/) | Every decision, measurement and deliberate non-fix. QA-LOG.md is the index plus the cross-phase entries; `docs/qa/phase-NN-*.md` is one log per phase. | **Before re-measuring anything.** |
| [docs/reviews/](docs/reviews/) | Codex plan + implementation reviews, one pair per phase. | Before planning a phase — what the last one was warned about. |
| [docs/STYLE.md](docs/STYLE.md) | Locked art direction. Changing §2–§5 needs approval, not a prompt tweak. | Any art work. |
| [docs/FAL-MODELS.md](docs/FAL-MODELS.md) | Every fal endpoint: schema, price, gotchas. | Before any generating phase — **and re-run `genmedia schema`**; a documented schema is a snapshot. |
| [docs/ASSET-PIPELINE.md](docs/ASSET-PIPELINE.md) · [docs/GENERATION-LOG.md](docs/GENERATION-LOG.md) · [docs/generations/](docs/generations/) · [docs/SOURCE-ANALYSIS.md](docs/SOURCE-ANALYSIS.md) | Generation → sheet → catalog pipeline; the log of every generation; the reference-art analysis. GENERATION-LOG.md is the logging contract, the cost summary and the reconciled spend; `docs/generations/` is one log per gate group, and where every `request_id` lives. | Phase 4 onward. |
