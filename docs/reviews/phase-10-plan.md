# Codex plan review — Phase 10 (Build and ship)

← [reviews index](../PRD.md#the-codex-review-protocol) · phase doc: [prd/phase-10-ship.md](../prd/phase-10-ship.md)

**Review 1 of 2. Ran 2026-08-26, before any implementation code.** Five rounds, all `VERDICT: REVISE`.
The loop hit its `MAX_ROUNDS` cap without converging, and **that is recorded rather than presented as
convergence** — a flagged disagreement is worth more than a false APPROVED.

## This review, split into two

**This document reached 668 lines.** On 2026-09-03 the five verbatim Codex rounds moved to a
sibling; the protocol note, the reviewer configuration, the scoreboard and the triage stayed here.
`docs/reviews/` is Codex-only, and **not one word of the reviewer's output was edited** — the
split moved whole rounds, headings intact.

| Part | What is in it |
|---|---|
| [02 — the five rounds, verbatim](phase-10-plan-02-rounds-verbatim.md) | rounds 1–5 exactly as Codex returned them, each ending `VERDICT: REVISE` |

---

## 🔴 Protocol substitution — authorised, not silent

[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol) and
[CLAUDE.md §4](../../CLAUDE.md#4-phase-workflow) both specify `/codex:rescue --wait --fresh`.
**This phase used `claudex-loop:codex-review` for both reviews instead**, authorised by the owner in
the session prompt of 2026-08-26 with the explicit instruction *"Do not silently deviate — record the
substitution and its authorisation."*

| | |
|---|---|
| **What changed** | the invocation path only |
| **What did not** | read-only sandbox · the `node_repl` workaround · verbatim output + triage · both files at `docs/reviews/phase-10-{plan,impl}.md` · every finding applied or recorded (C11) |
| **Why it is not a downgrade** | the skill loops on **one persistent Codex thread**, so rounds 2–5 could be asked *"is each of your earlier findings actually fixed, or only reworded?"* — a question a fresh reviewer cannot answer. Four of the five rounds' findings were defects in the **fixes** to earlier rounds. |

`tests/unit/docs-contract.test.ts` and criteria 10.14/10.15 read those two paths, so the file
locations were non-negotiable and are unchanged.

## Reviewer configuration

| | |
|---|---|
| CLI | `codex-cli 0.149.1` |
| model | `gpt-5.6-sol`, `model_reasoning_effort = "high"` (from `~/.codex/config.toml`; not pinned by the caller) |
| sandbox | `-s read-only` on round 1; `-c sandbox_mode="read-only"` on every resume — **`codex exec resume` rejects `-s`**, and `config.toml` could otherwise default to `danger-full-access` |
| thread | `01a03e4e-e980-7930-a026-78ba06af4f83`, resumed for rounds 2–5 |
| file access | `node_repl` MCP + `fs.readFileSync`, per the standing workaround for `CreateProcessAsUserW failed: 5` |

**Round 1 hit a 10-minute ceiling mid-review and was resumed, not restarted.** The session rollout
showed 56 completed `node_repl` calls at the kill — the review was working, not hung. Timeout raised
to 60 minutes for every subsequent round.

## The standing rule this review was read under

> **A subagent's summary is a claim, not evidence.** Codex has no shell here, so every finding is
> file-evidence until a command in this repository confirms it.

**Every finding below was re-verified locally before being acted on.** Three times that verification
made the finding *sharper* than Codex had stated it; those are marked ⬆ in the triage.

---

## Round scoreboard

| round | verdict | findings | of which were defects in the PREVIOUS round's fix |
|---|---|---|---|
| 1 | REVISE | 5 blockers + the two mandatory cross-phase answers | — |
| 2 | REVISE | 2 blockers resolved, 1 partial, 2 escalated to the owner, **4 new** | 4 of 4 |
| 3 | REVISE | 2 fixed, 1 partial, **4 new** (1 Critical) | 4 of 4 |
| 4 | REVISE | 2 blockers | 2 of 2 |
| 5 | REVISE | 2 blockers | 2 of 2 |

**The pattern is the finding.** After round 1, Codex was almost exclusively finding defects in gates
this session had invented *that round* to fix its previous findings. Twice — the T8 oracle and the
dead-sim fixture — a fix was replaced twice before it was sound.

---

## Verbatim output follows

Each round is reproduced exactly as returned, including its `VERDICT:` line and its own
*"could not check"* section. **The reviewer's blind spots are part of its result** *(vault 9.3)* and
are not edited out.


# Triage

**Every finding is APPLIED or REJECTED with a one-line reason** *(vault C11)*. ⬆ marks a finding local
verification made **sharper** than Codex stated it. ⚠️ marks a finding that corrects something this
session had told the owner.

## Round 1 — five blockers

| # | Finding | Verified locally | Disposition |
|---|---|---|---|
| R1.1 | **10.12: `levelDriver.ts` cannot drive `dist/`** — it reads `__phaserGame` and `scene.simWorld`, both stripped by design | ✅ `levelDriver.ts:48,108,143-145` | **APPLIED.** 10.12 split: production uses real keyboard input + the progress oracle; `levelDriver.ts` runs against the **dev** build at the same commit. The phase doc's 10.12 row now says so. |
| R1.2 | **(a) A single canvas pixel readback is not a terminal condition** — draw once, throw, and the pixels satisfy every later poll | ✅ reasoning confirmed against `globals.ts:33-46`'s three-state contract | **APPLIED.** Replaced with four labelled signals; `pageerror`/`console` listeners installed **before** `goto`, because after navigation they miss initial-document violations — which is exactly what a bad CSP produces. |
| R1.3 | **(e) The stated reason for refusing a production readiness signal was wrong** — the Phase 1 ruling closes `window.__game`; it does not forbid every production signal | ✅ `PRD.md:405-433` | **APPLIED**, and it is a correction to this session's *reasoning*, not just its conclusion. The honest reason is that a new production observation surface is an architecture change, i.e. a STOP-and-ask. The refusal stands; the justification changed. |
| R1.4 | **(d) `chromium-prod` needs its own `testMatch`** — ignoring `phase-10-` in `chromium` does not constrain the new project, which would run every spec against production. Plus `globalSetup` reads `projects[0].use.baseURL` and waits on `__game` | ✅ `globalSetup.ts:79,97`; `playwright.config.ts:196-201,221-241` | **APPLIED.** Explicit `testMatch`, port 4173 freed either side, `chromium-prod` asserted **not** to be `projects[0]`, and `vite preview` dropped for an in-process server on the `e2e-server.mjs` shape (the documented Windows shell-orphan failure). |
| R1.5 | **10.11: the plan opened on a false premise** — it said phases 1–9 are green; Phase 4 is ⚠️ merged with known debt and 4.27 is unrun | ✅ `PRD.md:30` | **APPLIED**, and escalated to the owner as ruling A. **Owner ruled: wire `anchorGate.mjs`, run it, close 4.27** — the only option that satisfies "every". |
| R1.6 | **Mandatory Q6 — the "35 dev seams" count is misleading: 14 are comments, 21 are executable guards** | ✅ 35 total lines, 14 comment-only | **APPLIED.** Corrected everywhere the number appears. |
| R1.7 | **Mandatory Q7 — the recorded-but-not-fixed warning now shipping is `assets:fetch`/`assets:verify`** (`phase-05-plan-r1-r2.md:222-226`, "binding debt, not optional scope"). Cost: the public repo cannot reconstruct its art from its provenance | ✅ `.gitignore:11-14`; no such script in `package.json` | **APPLIED as 10.13's headline disposition**, and escalated as ruling C. Owner ruled: amend 10.9, cite the objection verbatim, ship. |
| R1.8 | **§1's `README.md` and `.vercelignore` are not required by the goal** | — | **REJECTED.** `README.md` is a §5 deliverable of the phase document, which is the authority on scope; `.vercelignore` prevents 53 MB of source assets uploading as build input. Both stay. |
| R1.9 | **Vault 10.3 also asks for Node types and the plugin directory** | ✅ `tsconfig.json` has neither | **RECORDED, deliberately unmet.** `@types/node` is a frozen-dependency STOP-and-ask, and importing `vercel.json` removes the need for `fs`. The separate-program half is satisfied; the Node-types half is not, with that reason. |
| R1.10 | **10.7: an extension sweep is not a detection oracle** | — | **APPLIED.** 10.7 now states its oracle: content-grep over `git log --all -p` for high-entropy strings and named key formats, plus `git rev-list --objects --all` over unreachable blobs, plus every tracked binary listed with a reason — and its blind spots recorded. |
| R1.11 | **10.8: MIT over `src/ tests/ tools/` leaves the root code unlicensed** | ✅ `vite.config.ts`, `playwright.config.ts`, `index.html` | **APPLIED** via owner ruling B: the code licence is widened to the root source and config files. |
| R1.12 | **10.13's `*-plan.md` glob misses Phase 5's split records** | ✅ `phase-05-plan-r1-r2.md` etc. do not match | **APPLIED.** The sweep enumerates all 34 files in `docs/reviews/` by name. |

## Round 2 — four new defects, all in round 1's fixes

| # | Finding | Verified locally | Disposition |
|---|---|---|---|
| R2.1 | **Critical — `steampunk.progress` is written on level ENTRY, so "key exists" and "value changed" are both false greens** | ✅ `phase-08-progress.spec.ts:161-168` — a first boot stores `lastLevel` with `levels: {}` | **APPLIED.** The predicate is now the exact `levels[<id>].completed` **false → true** transition against a baseline established *before* any input. |
| R2.2 | **High — canvas activity is not simulation activity: the idle sheet loops, so the hash changes with a dead sim** ⬆ | ✅ `gameAnimations.ts:54` (`repeat: -1`), `index.json:66-68` (`loop: true`, 7.5 fps) | **APPLIED.** The rAF counter and the canvas hash are demoted to smoke signals and labelled with what they do **not** prove. |
| R2.3 | **High — the negative dev-seam assertions have no activation ordering** — a keypress before `bindKeys` runs, or a query flag applied after overlay attach, passes even if the seam leaked | ✅ `gameInput.ts:147-165`; `gameDev.ts:78-98` | **APPLIED.** Query flags go in the URL at `goto`; keys are pressed only after the readiness gate; and every negative is watched red against the **DEV** build, where the seam genuinely exists. |
| R2.4 | **High — T8 has no watched-module inventory, and `gameDev.ts` is a mixed module** | ✅ `gameDev.ts:113-128` — `helpLine()` returns the shipped banner | **APPLIED.** Explicit roster with mixed modules named and excluded from the zero-byte rule. |
| R2.5 | **Medium — the plan contradicted itself on 10.11**, recommending a green exception while defining an unrun criterion as a failing phase | — | **APPLIED.** The contradiction was this session's. Default flipped to "report FAILING, naming 4.27"; the owner then ruled to close it properly. |

## Round 3 — four new defects, all in round 2's fixes

| # | Finding | Verified locally | Disposition |
|---|---|---|---|
| R3.1 | **Critical — the T8 roster excluded `globals.ts`, the module carrying T8's own motivating miss**, and assigned it to the very check that mutation defeats | ✅ ⬆ **sharper than stated:** `updateDebugState` is called **unguarded** from `BootScene.ts:67,224`, `GameScene.ts:221`, `LevelSelectScene.ts:120`, and `installDebugGlobals()` from `main.ts:5` — the guard is *inside* each function, so the stubs legitimately ship and **zero-bytes would have been a false red here too**. Neither of this session's columns was right. | **APPLIED.** See R4.1 — the eventual answer is a content assertion, not a roster reshuffle. |
| R3.2 | **High — the RIGHT/world-scroll discriminator can go green on a dead sim** (camera lerp keeps `scrollX` moving) **and red on a healthy one** (level 01 spawns at x=624 against a 1920 viewport, so the camera stays clamped) | ✅ `Camera.js:553-583`; `constants.ts:47-58`; `level-01.tmj:2340-2357` | **APPLIED.** The strong causality claim is deleted; it is a sustained-window smoke signal, and the completion transition is the liveness proof. |
| R3.3 | **High — the completion predicate proves persistence, not presentation**: the save is written before the overlay is built, and `ctx.ui?.levelComplete(...)` silently no-ops | ✅ `gameComplete.ts:53-54,75-87`; `save.ts:330-346` | **APPLIED.** Scope stated honestly; a separate overlay assertion added, red-proved by suppressing `ctx.ui`. |
| R3.4 | **High — the red proof mutated rAF, which validates a different signal** | — | **APPLIED.** See R4.2 — the eventual answer is a committed patch fixture at `advanceSplit.ts:84-97`. |
| R3.5 | **Medium/High — "the whole canvas changes" is a non-discriminating discriminator for P/O/G**, since the idle loop already changes the whole canvas | — | **APPLIED.** Replaced with sustained HUD-region persistence (`UIScene` runs beside `GameScene`; no dev scene has it). |
| R3.6 | **Ruling A option (i) was mislabelled to the owner** — "accept the debt and call 10.11 green" is a waiver/amendment, not a way to satisfy "every" | — | ⚠️ **APPLIED.** Both options relabelled honestly. |
| R3.7 | **Ruling C was mislabelled to the owner** — "your 10.9 decision stands" is false; rewriting the row is an acceptance-criterion **amendment** | ✅ `phase-10-ship.md` 10.9 as written | ⚠️ **APPLIED.** The row now says AMENDED in its own text, with the objection quoted. |

## Round 4 — two blockers

| # | Finding | Verified locally | Disposition |
|---|---|---|---|
| R4.1 | **Blocker — T8 Rule 2's pinned rendered-length budget can both false-red and false-green.** `renderedLength` carries no DEV/production semantics: a legitimate edit or minifier change exceeds a pin, a module that shrank elsewhere hides a leak under its old ceiling, and re-pinning blesses one | — (API surface confirmed by Codex at `rolldown/.../define-config:153-169`) | **APPLIED.** The byte budget is **deleted**. Rule 2 became a per-guarded-body **content** assertion. |
| R4.2 | **Blocker — the committed dead-sim mutation had no activation mechanism, and the cited precedents were false** ⚠️ | ✅ `cue-stall` is DEV-guarded at `audio.ts:225` so it never reaches `dist/`; `scrimN` has no `src/` implementation at all | **APPLIED.** The claim that these are "committed build-time mutations of a production artifact" was **wrong and had been told to the owner**. Replaced with a committed patch fixture, matching `tests/fixtures/bad-docs|bad-levels|bad-sim|bad-style`. Mutation point named: `advanceSplit.ts:84-97`, which compiles. |
| R4.3 | **Blocker — the T8 roster is still incomplete**: `main.ts:16`, `GameScene.ts:304,312`, and dev-only `enemyTuning.ts` | ✅ all three; `render/enemyTuning.ts` is imported only by `PlaygroundScene.ts:4` | **APPLIED.** |
| R4.4 | **High — one mutation cannot exercise a roster.** Removing `config.ts:60` unfolds only the three scenes, so the `devSpawn`/`devFeelTuner`/`devMotionProbe` entries could stay misspelled and vacuous | ✅ `gameDev.ts:31-33,79,197-218` | **APPLIED.** Every roster entry carries **its own** red proof. |
| R4.5 | **High — N/K have no production observation source**, yet the plan claimed "completion-relevant world state" — which is `scene.simWorld`, absent from `dist/` by the same plan's own statement | ✅ | **APPLIED.** Claim deleted. N/K join `?hitstop=`/`?feel=`/`?perfMutation=` as seams with **no** behavioural discriminator, stated plainly rather than implied. |
| R4.6 | **Medium — the overlay assertion has no positive signature**; "the region changed" is defeated by the animation this plan established | — | **APPLIED.** A pinned pixel signature, red-proved via the `ctx.ui` no-op. |
| R4.7 | **Ruling A: wiring `anchorGate` is not verifying it** — the gate must run and pass, and `npm run build` does not invoke `assets:build` | ✅ `package.json:8,14` | **APPLIED.** The 10.11 row says so explicitly. |
| R4.8 | Provenance: the plan header still said "round 2" | — | **APPLIED.** |

## Round 5 — two blockers, the final round

| # | Finding | Verified locally | Disposition |
|---|---|---|---|
| R5.1 | **Blocker — natural forbidden tokens are not a sound per-guard oracle.** A token can vanish *with its guard removed* because a second guard downstream makes the value unused; be rewritten by Oxc's mangler; or survive because unrelated production code in the same module uses it | ✅ the concrete case: removing `GameScene.ts:304` exposes `this.feelTuner` while `gamePlayerDraw.ts:157-159` still guards its consumer | **APPLIED.** Codex named the stronger oracle and it is adopted: a **unique string-literal sentinel** per guarded body, asserted absent from the output chunk. Causal by construction, survives minification, and extends `verify-dist`'s existing literal sweep. |
| R5.2 | **Blocker — the dead-sim mutation has no selector, no build command, and adding one creates another seam to strip** | ✅ | **APPLIED, by removing the need for a selector.** A committed **patch fixture** applied and reverted by the gate script ships in no bundle, so no new seam exists. |
| R5.3 | **The `cue-stall`/`scrimN` precedent is still described as committed build-time mutations** | ✅ as R4.2 | ⚠️ **APPLIED.** Corrected in the plan, and corrected to the owner. |

### The one thing round 5 asked for that a plan cannot supply

Codex's residual objection is that **no plan can guarantee in advance that each sentinel's red proof
will actually redden** — layered guards may still defeat individual entries. That is correct, and it
is answered with a rule rather than a promise:

> **An entry whose red proof does not redden is reported UNCOVERED, with its reason — never assumed
> covered.** 10.2's result is *"N seams covered with a watched red, M uncoverable and here is each"*,
> not a bare PASS.

Which seams land in which column is a **measurement**, and it gets measured in the QA log.

---

## What the reviewer could not check

Preserved because a gate's blind spots are part of its result *(vault 9.3)*. Codex, across all five
rounds: no shell, so **no build, no browser run, no Vitest, no Playwright, no mutation run, no gzip
measurement, no Vercel CLI, no deployment, and no inspection of actually-served headers.** Every
finding is a source-level construction or a previously recorded repository measurement. In round 4 it
additionally could not import Vite through `node_repl` (`Importing module "node:process" is not
allowed`), so it never measured whether the `updateDebugState` mutation moves `globals.ts`
specifically. In round 5 it did not re-read every phase 1–9 plan review, having done so in round 1.

**All of that is exactly what the local re-verification exists to cover**, and it is why three
findings came out sharper than stated.

## Findings count, for the §7 retrospective

| | |
|---|---|
| findings raised | **36** |
| applied | **33** |
| recorded, deliberately unmet | **2** (vault 10.3's Node-types half; 10.2's uncoverable seams) |
| rejected | **1** (R1.8, scope) |
| findings that were defects in a previous round's fix | **12 of 25** after round 1 |
| findings correcting something told to the owner | **3** (R3.6, R3.7, R4.2/R5.3) |
| blockers found **before a line of implementation code** | **11** |
