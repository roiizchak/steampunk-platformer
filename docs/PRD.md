# Steampunk Platformer — Phased PRD

**This file is the spine. Each phase is its own document in [`prd/`](prd/).**
Read this once, then read only the phase you are executing.

> **For execution:** run each phase with `superpowers:executing-plans`. One phase per session.
> Order within a phase is always:
> **vault-in → invoke required skills → Codex plan review → build → QA gate (incl. Codex
> implementation review) → vault-out → STOP for approval.**

**Goal:** A short browser platformer — 3–5 levels, Victorian industrial steampunk, all art generated
through fal.ai — built as a learning exercise with a hard QA gate at every phase.

**Architecture:** A strict **simulation / render split**. `src/sim/` contains the entire game
simulation and imports *nothing* from Phaser — no `Date.now`, no `Math.random`, no DOM. Phaser scenes
observe sim state and draw it. This is the single most load-bearing decision in the document: it is
what makes the game unit-testable at all, and it comes directly from the vault as a blocker.

**Tech stack:** Phaser 4.2.1 · TypeScript 7 · Vite 8 · vitest · @playwright/test · Tiled · fal.ai via `genmedia`.

---

## The phases

| # | Phase | Document | Gates on | Status |
|---|---|---|---|---|
| 1 | Boot | [phase-01-boot.md](prd/phase-01-boot.md) | — | ✅ **done** 2026-08-05 |
| 2 | Player controller + Character Playground | [phase-02-player.md](prd/phase-02-player.md) | 1 | ✅ **done** 2026-08-06 |
| 3 | Tiled → Phaser tilemap + Element Editor | [phase-03-tilemap.md](prd/phase-03-tilemap.md) | 2 | ✅ **done** 2026-08-07 |
| 4 | fal art production + Character Gym | [phase-04-art.md](prd/phase-04-art.md) | **3** (grid size) | ⚠️ **merged 2026-08-09 with known debt** — approved and merged while **reported failing**. **4.27 CLOSED 2026-08-27 by Phase 10 (owner ruling A).** It was open on the *wiring*, not the gate: `tools/gen/anchorGate.mjs` (**G1 — anchor contact geometry**) was written in Phase 5, worked, named 4.27 in its own header and caught a real defect on the first new art it saw — and nothing re-ran it. `tools/gen/anchorAudit.mjs` now runs G1 from the modules that READ an anchor: `build-assets.mjs` (covering every `assets:build*` path) and `submit-clips.mjs` (the SPEND point). Wiring it to the `assets:build` script first was itself wrong — `build-assets-all.mjs` spawns `build-assets.mjs` directly and bypassed it, re-creating the exact shape that made 4.27 open. Run: **4 PASS, 0 FAIL, 0 ABSENT**; red-proved (a floating-foot anchor fails before a byte of sheet is packed). ⚠️ **4.10 and 4.12 were recorded here as "closed in Phase 5" and that was wrong for both** — found by criterion 10.11, which exists to check prior phases' claims rather than repeat them. **4.12 is now CLOSED** with the deliberate-removal run *(C1)* it had been owed since Phase 4 (`tests/unit/find-source-refusal.test.ts`, red-proved by making `findSource` substitute rather than throw). **4.10 is SUPERSEDED, not closed**: `gateReachBand` is still called only from `selfTest()` and unit fixtures, but `gateReachWindow` (G5) does the same job better and IS wired into `sheetGates.mjs`. See [qa/phase-10-ship.md § 10.11](qa/phase-10-ship.md). **4.16 closed in Phase 6**, **4.2b closed 2026-08-16 by owner amendment** — ceiling raised to $50. Triage: [qa/phase-06-hud.md §Session 2](qa/phase-06-hud.md) |
| 5 | Enemies, hazards, combat + Enemy Gym | [phase-05-combat.md](prd/phase-05-combat.md) | **2** (tick contract) | ✅ **done** 2026-08-15 |
| 6 | Collectibles, HUD, steampunk UI chrome | [phase-06-hud.md](prd/phase-06-hud.md) | 4, 5 | ✅ **done** 2026-08-16 |
| 7 | Audio | [phase-07-audio.md](prd/phase-07-audio.md) | 5 | ✅ **done** 2026-08-16 |
| 8 | Level design and progression | [phase-08-levels.md](prd/phase-08-levels.md) | 3, 5, 6 | ✅ **done** 2026-08-18 |
| 9 | Polish, juice, particles | [phase-09-polish.md](prd/phase-09-polish.md) | 8 | ✅ **done** 2026-08-24 — merged 2026-08-19 on a verbal report the records did not corroborate; the owner round it was owed ran 2026-08-24. Six briefs (A-then-B, findings withheld) found and fixed **two real defects** — 9.2 had no gate for its own criterion, and a selector promised a tail its assertion rejects — refuted one construction by execution, and closed 9.7 with 14 unit families and nine e2e mutations each watched red. **9.5 was owner-amended** to the worst steady-state frame after the Codex review blocked a *“PASS, qualified”*; the combat path is now **measured** (`3d7c55f`); **no bound exists, and none is proposed** — but ⚠️ *"or will"* was over-claimed and is withdrawn. The 2026-08-25 session first concluded the catch-up spike *"does not occur"*; a re-measurement the same day, after the §10a perf briefs showed the mutation was ~4x too small, produced **296 two-tick frames in 3000** at a 150 ms block and reached the cap branch with smoothing off. It occurs. What blocks a criterion now is **attribution** — only an INJECTED main-thread block produces it, and an injected block is not the code under test, so a bound it reddens names the amplifier. ⚠️ *"a block is not a property of the game"* was the first wording and is **withdrawn** (Codex impl review): update/render work and GC are main-thread work the game causes. See `ENGINE-NOTES.md § TimeStep and delta`. **D8 fixed as an owner-approved balance change.** Owed forward, restated 2026-08-25 after checking each: the `phase-09-perf.spec.ts` split **did NOT happen** — it is still one `test()`, and `expect.soft` landed instead, with the spec itself recording full independence as unachievable (`:144-147`) · D9's `run: 8` wait **landed** · 9.3's scan bypasses: **D14 is CLOSED**, D4, S3-1 and S5-6 remain stated narrowings. See [qa/phase-09-polish.md § The close round](qa/phase-09-polish.md) |
| 10 | Build and ship | [phase-10-ship.md](prd/phase-10-ship.md) | everything | ⚠️ **REPORTED NOT DONE 2026-08-27 — built, gated and deployed to a preview, with THREE items open and named.** 11 of 15 criteria PASS; 10.6 passes locally and its deploy half is open; 10.12 is PARTIAL. **10.6 CLOSED 2026-08-27** — Vercel Authentication disabled by the owner, all five declared headers verified on a real Vercel edge response across four paths including a 404, every quoted CSP keyword intact. One divergence recorded: Vercel serves `.tmj` as `application/octet-stream` while the local substrate says `application/json` — harmless, but the substrate is more generous than production. **Open:** (1) **10.12's human half** and (2) **2.8's human half** — hands-on criteria never close on automated evidence *(C4)*. **`vercel --prod` was authorised and did NOT run**: the attempt was blocked by the sandbox's own permission classifier, not by a missing decision. 🔴 **A fourth item was reported open and should not have been: `level-05` is NOT unmeasured** — `level-completable.test.ts` proves it completable in the exact shipped world under all three disjoint gate seeds, with a `jumpVelocity`-1 margin and a `jumpVelocity`-0 negative control, and its geometry is level-04's with one more identical segment. The browser driver is position-blind; *a driver limit is not a level defect*, and reporting them as the same thing pointed the owner at the wrong question. **Also closed 2026-08-27:** the dev-seam gate's residual same-file hole, by owner decision to widen `@babel/parser` from test-only to build time — and the rule that closes it is the **site** pin, not dominance, because both ends of a same-file move are guarded. ⚠️ **Three full e2e runs, three DIFFERENT wall-clock-bounded specs failing (9.5, 6.9, 10.12), every one passing alone.** No bound was moved. 🔴 **And the playthrough found a real defect no gate could**: `FOLLOW_LERP` was applied per RENDERED frame, so the camera was 4x less responsive at 60 Hz than on the 240 Hz box it was tuned on — the character swung a quarter of the screen height on every jump. Fixed by `followLerpForFrame` and redeployed. **That is criterion 10.12's hands-on half earning its place** — and it earned it TWICE: a second defect, `pixelArt` not governing the canvas→screen resample, produced the identical symptom and was only separable by playing. ✅ **Owner-confirmed 2026-08-27: *"now it looks good in 60Hz and 240Hz"*.** The general lesson is that anything the ENGINE applies per rendered frame, or per presented pixel, sits outside this project's tick rule — which is written about `src/sim/`. ⚠️ **A bare `vercel deploy` targets PRODUCTION on this project** (no git integration) — the first attempt was labelled Production and was stopped only by erroring. Always `--target=preview`. The phase closed **4.27** (wired, red-proved, at the spend point) and **4.12** (the deliberate-removal run owed since Phase 4), and dispositioned **4.10** as superseded — see the Phase 4 row. The two mandatory Codex reviews ran: the plan review **did not converge** (5 rounds, all REVISE, at `MAX_ROUNDS`); the implementation review returned **REVISE with 2 CRITICAL** on a diff that had already passed six agents and twelve briefs — one of them broke the dev-seam gate, which was a pad-able count. Everything is in [qa/phase-10-ship.md](qa/phase-10-ship.md), including the §7 ten-phase retrospective and the QA gate's own recorded defect (its worktrees were created at `main`). |

### Phase dependency notes

- **Phase 3 blocks Phase 4** — the tile grid cell size must be published before art is generated
  against it.
- **Phase 2 blocks Phase 5** — combat timing is expressed in the tick contract from Phase 2.
- **Phase 4's 4a blocks 4b** — the hero-asset readability check gates the batch spend.
- **Phases 7 and 9 are independent** of each other and could swap if needed.
- 🟢 **The perf-gate session between Phase 8 and Phase 9 RAN on 2026-08-18. Both gates are
  repaired and Phase 9 is unblocked.** Full evidence:
  [qa/session-bugfix-perf-gates.md](qa/session-bugfix-perf-gates.md).
    - **Criterion 7.7** — `MAX_AUDIO_FRAME_LOSS_RATIO` 1.15 → **1.05**, on a per-pair median with
      AB/BA ordering and `PAIRS` 3 → 10. Clean 0.9927–1.0022 against a mutated 1.0915–1.0961. Stated
      floor: it resolves about half the 30 ms/cue mutation, ~15 ms per cue.
    - **Criterion 6.9** — `MAX_HUD_GPU_RATIO` **deleted**, not retuned: the completed scrim sweep
      showed clean runs reaching 1.692 while TWO full-screen scrims read 1.665 and FIVE read 1.678.
      It does not order its own mutation at any bound. `MAX_HUD_GPU_DELTA_MS = 0.2` replaces it —
      still a GPU statistic, paired, in milliseconds. Stated floor: six or more scrims reliably,
      three to five borderline, one or two not at all.
    - 🔴 **Both mutations are now COMMITTED** (`PERF_MUTATION=cue-stall` / `=scrimN`), paying the
      uncommitted-mutation debt [qa/session-gate-defects.md](qa/session-gate-defects.md) recorded.
    - 🔴 **The held-out discipline caught an overfit on BOTH gates** — a bound chosen from the
      selection runs false-redded on the first run that had no say in the choice, twice. Choosing and
      proving a perf bound on the same data is now a named trap in
      [TESTING-RULES.md](TESTING-RULES.md).
- **Phase 5 onward runs `voltagent-qa-sec:performance-engineer`**; **Phase 6 onward runs
  `voltagent-qa-sec:ui-ux-tester`** and, for its WCAG criterion,
  `voltagent-qa-sec:accessibility-tester`; **Phase 10 additionally runs
  `voltagent-qa-sec:security-auditor`**. See [§ The QA agent protocol](#the-qa-agent-protocol).

---

## Global Constraints

Every task in every phase inherits these. Copied verbatim from the locked decisions.

- **Dependencies are frozen at:** runtime `phaser@4.2.1`; dev `vite`, `typescript`, `vitest`,
  `@playwright/test`. **Anything else requires explicit approval — STOP and ask.**
- **`src/sim/` imports nothing from Phaser.** Mechanical test: the sim test suite must run with Phaser
  uninstalled. *(LESSONS-APPLIED 1.1, blocker)*
- **Every duration is an integer count of 60 Hz ticks. Every distance is pixels.** Never a float of
  seconds, never a `deltaTime` multiply inside the sim. *(2.1, blocker)*
- **No source file exceeds 400 lines** without a written one-line justification in the phase's QA
  log, `docs/qa/phase-NN-<slug>.md`.
- **Grey-box before art.** No fal spend on a feature whose mechanics are not already playable.
- **All art via `genmedia`**, following [STYLE.md](STYLE.md). Zero tutorial assets, zero stock assets.
- **Before any phase that generates, re-read [FAL-MODELS.md](FAL-MODELS.md)** — every endpoint's
  schema, price and gotchas — **and re-run `genmedia schema` on the endpoints it names.** A schema in
  a document is a snapshot; upstream endpoints change under us.
- **Every generation logged** to [GENERATION-LOG.md](GENERATION-LOG.md): model, prompt, seed, cost,
  path, kept/discarded.
- **The fal art-spend ceiling is `$55`**, raised from `$25` by owner amendment on 2026-08-16 after
  Phase 4 came in at `$31.39` against an estimate that `genmedia pricing` had understated by ~21×,
  and reconciled to `$55` by owner decision on 2026-08-20. This line said `$50` and
  `GENERATION-LOG.md` said `$55` for four days; the gate-entry session found the contradiction,
  refused to pick a winner, and the owner settled it. **`GENERATION-LOG.md`'s running total is the
  live figure; this line is the ceiling it is measured against, and they must agree.**
  **The ceiling is not the whole rule.** Phase 4 had a ceiling and overran it anyway, because 22
  clips ran before anyone read an invoice: **read the invoice before the next batch, not after it.**
  The ceiling bounds the damage; the ordering is what makes the bound reachable. This is the *art*
  ceiling — a new medium (audio, Phase 7) needs its own number set before its first real batch.
- **The fal audio-spend ceiling is `$5`**, set by owner decision on 2026-08-16 **before Phase 7's
  first generation** — which is the half of 4.2b that no ceiling could fix. It is a separate number
  from the art ceiling because audio is a separate medium, and it is deliberately generous: both
  Phase 7 endpoints price **flat per generation** (`$0.0206` SFX, `$0.0217` music), so `$5` buys
  ~240 generations against a realistic need of nine. **The ordering carries the rule, not the
  number** — probe one cue, read the invoice, batch, read the invoice again.
- **STOP and ask** before: any new dependency, deleting any file, any fal batch over 5 generations,
  or contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md.
- **A phase with a failing or unrun criterion is reported failing.** Never as done.
- **Both Codex reviews are mandatory and neither may be skipped.** See below.

---

## The Codex review protocol

**Added 2026-08-05 by user decision.** Every phase is reviewed **twice** by Codex — once on the plan
before any code is written, and once on the implementation before the phase can be reported done.

Codex is an independent model with no memory of the conversation that produced the plan. That is the
entire point: it cannot inherit the assumption that made the mistake. This is the
`LESSONS-APPLIED` **A7** countermeasure applied at the model level rather than the prompt level — a
dedicated QA pass once returned 8/8 PASS on a diff an adversarial review then found three real
defects in.

### How to run it: `/codex:rescue`

**Both reviews are run through the `codex:rescue` skill, never by calling the `codex` binary
directly.** The skill routes to the `codex:codex-rescue` subagent, which is the supported path and
the one this project has actually exercised — the Gate 7 documentation review
([reviews/gate-07-docs.md](reviews/gate-07-docs.md)) was produced this way.

**Flags that matter:**

| Flag | Use |
|---|---|
| `--wait` | run in the foreground. **Always use this for a review** — the gate blocks on the result |
| `--fresh` | start a new Codex thread. **Use for review 1 of every phase**, so the reviewer carries no assumption from the last one |
| `--resume` | continue the existing thread. Use for review 2, which benefits from having seen the plan |
| `--model`, `--effort` | leave unset unless there is a reason |

⚠️ **Operational note — root-caused in Phase 1. Read this before running either review.**

Invocations fail with `CreateProcessAsUserW failed: 5 (Access is denied)` and report having read
**zero** files. Codex says so rather than inventing findings, which is the correct behaviour and is
exactly what to check for.

**This was first seen at Gate 7 and recorded here as "a retry succeeded". That was luck, not a fix.**
Phase 1 hit it twice in a row and diagnosed it: Codex's sandbox spawns its shell with a restricted
token, and the configured shell resolves to
`%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` — a **Microsoft Store execution alias**, a zero-byte
reparse point that a restricted token cannot launch. There is no standalone PowerShell 7 on this
machine to fall back to. **It is permanent. Re-running does not fix it.**

**The fix — put this in every review prompt, both reviews, every phase:**

> On this machine your sandboxed shell cannot spawn any process (`CreateProcessAsUserW failed: 5`).
> Do NOT use the shell tool. Use the `node_repl` MCP tool with `fs.readFileSync` / `fs.readdirSync`
> for all file access. If that also fails, say so plainly and do not invent findings.

Verified: with that instruction Codex read every named file — including one outside the repository —
and returned grounded findings with correct file-and-line citations.

**Still binding:** do not accept a review that could not read the repository, and never record its
silence as a pass.

### Review 1 — the plan, before any code

Runs after vault-in and skill invocation, **before the first line of implementation.**

```
/codex:rescue --wait --fresh Review the plan in docs/prd/phase-NN-<name>.md against this
repository. Read first: docs/PRD.md (global constraints), docs/FAL-MODELS.md (if this phase
generates), docs/lessons/phase-NN-<name>.md (this phase's vault items) together with
docs/LESSONS-APPLIED.md (the root rule and §A/§B/§C, which bind every phase), docs/qa/ (one log
per phase — what earlier phases actually found), and docs/reviews/ (what earlier phases were
warned about).

Answer these, and only these:
1. Which deliverables in this phase's section 5 are NOT actually required by its section 1 goal?
2. Which acceptance criteria in its section 6 could pass while the feature is still broken?
3. Which cited vault item does the plan claim to satisfy but does not?
4. What does this phase depend on that no earlier phase actually produces?
5. What is the single most likely way this phase ships something subtly wrong?

Do not write code. Do not modify any files. Do not propose a redesign. Cite file and line for
every claim. Rank by severity. State plainly what you could not check.
```

Question 4 is the one that pays. At Gate 7 it found a Phase 4 gate that depended on data Phase 5
produces — a defect no consistency check would surface, because both documents were internally
correct.

### Review 2 — the implementation, in the QA gate

Runs on the phase's diff, after the phase's own tests are green and before it is reported done. It is
a numbered criterion in every phase's QA gate and carries the same weight as a failing test.

```
/codex:rescue --wait --resume Review the diff of this phase against docs/prd/phase-NN-<name>.md
and docs/PRD.md. Compare against main.

Check specifically:
- Does src/sim/ import anything from Phaser, Date.now, Math.random, or the DOM? (blocker)
- Is any duration expressed as a float of seconds rather than an integer tick count? (blocker)
- Is any animation fps authored rather than derived as renderFrames x TICK_HZ / simTicks? (blocker)
- Does any file exceed 400 lines without a justification in the phase's docs/qa/ log?
- For each acceptance criterion in the phase's QA gate: does the code actually satisfy it, or
  only appear to?
- Which test would still pass if the behaviour it names were deleted?

Do not modify any files. Cite file and line for every finding. Rank by severity. State plainly
what you could not check.
```

### Recording the result

`/codex:rescue` returns its report into the conversation; **it does not write the file.** Save the
report verbatim to `docs/reviews/phase-NN-plan.md` or `phase-NN-impl.md`, then append the triage —
one line per finding, **applied** or **rejected with a reason**. The Gate 7 review file is the
template.

**Handling findings:** every one is either **applied**, or **recorded with a one-line reason for
rejecting it**. Silently ignoring a finding is not permitted — *(vault C11: record what you didn't
fix)*. If Codex and this PRD disagree on a **locked** decision, the PRD wins and the disagreement is
recorded; if they disagree on anything else, ask.

**Preserve the reviewer's own "could not check" section.** A gate's blind spots are part of its
result *(vault 9.3)*, and Codex has real ones — it has no network access, so it cannot verify any
fal.ai price, schema or licence claim. Those are verified separately via `genmedia`, which makes the
two passes complementary rather than redundant. Say which is which.

**A phase is not done until review 2 has run and every finding is applied or recorded.**
The two reviews are distinct: review 1 asks *"is this the right thing to build?"*, review 2 asks
*"is this a correct build of it?"* Running only the second is the failure mode this protocol exists
to prevent.

Both reviews' outputs are committed under `docs/reviews/`, so a later phase can see what an earlier
one was warned about.

---

## The QA agent protocol

**Added 2026-08-07 by user decision.** Codex is not the only reviewer in a QA gate. Every phase's
gate has an **Owner** column, and most of its rows are owned by a subagent. Until now those owners
were bare nouns — `qa-expert`, `code-reviewer`, `perf` — that read as labels rather than as
instructions, and only one line in the whole repository (Phase 1's criterion 1.8) named a real
agent type. This section makes the column executable.

### Owner → what to actually do

| Owner in a gate | What it means |
|---|---|
| `voltagent-qa-sec:qa-expert` | spawn that agent — the default owner for a measurable criterion |
| `voltagent-qa-sec:code-reviewer` | spawn that agent — diff review, adversarial pass *(Phase 1 precedent, [qa/phase-01-boot.md](qa/phase-01-boot.md) 1.8)* |
| `voltagent-qa-sec:performance-engineer` | spawn that agent — frame budget, worst-case load. Phase 5 onward |
| `voltagent-qa-sec:ui-ux-tester` | spawn that agent — UI behaviour and layout. Phase 6 onward |
| `voltagent-qa-sec:accessibility-tester` | spawn that agent — WCAG claims only. Phase 6's contrast criterion |
| `voltagent-qa-sec:security-auditor` | spawn that agent, with the `security-review` skill — Phase 10's CSP and secret-scan criteria |
| `codex` | `/codex:rescue`, per [§ The Codex review protocol](#the-codex-review-protocol) above |
| `e2e` | **not an agent.** `npm run test:e2e`; specs authored with `e2e-playwright-testing` |
| `play` | **not an agent.** Human hands-on, driven and screenshotted with `playwright-cli` |
| `—` | **no owner.** Command output, a `wc -l` sweep, or a doc review |

`e2e` and `play` are deliberately not agent rows. A spec file is evidence a machine produced; an
agent asserting the spec would pass is not. And `play` exists because some criteria — *does this
feel weighty*, *is there a third leg* — are human judgements no agent can stand in for *(vault C4)*.

### The rules

- **An owner is an instruction, not a label.** A criterion owned by an agent is **unrun** until
  that agent has run against it. Per Global Constraints, a phase with an unrun criterion is
  reported failing — never as done.
- **Two briefs per agent-owned gate, always** *(vault A7)*. One verifies the stated criteria; the
  second asks only *"how could this be wrong?"*. This is what the `code-reviewer ×2` criterion in
  every phase has always meant; it was never written down. In Phase 1 the first brief concluded
  there were no asset-missing paths, the second found three, and Codex then found two more. The
  second brief is not optional and is not a re-run of the first.
- **Every finding is applied, or recorded with a one-line reason for rejecting it** *(vault C11)* —
  the identical rule the Codex reviews carry. Silently dropping one is not permitted.
- **Findings land in the phase's own QA log**, [`docs/qa/phase-NN-<slug>.md`](qa/), in the
  findings-table format Phase 1 already established. Do not invent a new file: that log and
  `docs/reviews/` — which stays exclusively Codex's, one plan/impl pair per phase — are the only
  two destinations.
- **Preserve the agent's own "could not check" section** *(vault 9.3)*. A gate's blind spots are
  part of its result. An agent that reports none has almost certainly not looked for them.
- **An agent may not turn its own criterion green from reasoning alone.** It must cite command
  output, a file and line, or a screenshot. A subagent's summary is a claim, not evidence — and a
  subagent that reports a criterion passing without citing what it ran has reported nothing.
- **Re-verify locally what an agent could not run.** Same standing rule as Codex: agent findings
  are file-evidence until a command in this repository confirms them.

### The brief

One base brief covers every agent owner. Fill in the phase, the owner, and its criteria; the
closing paragraph is fixed and matches the Codex prompts deliberately.

```
Review docs/prd/phase-NN-<name>.md, section 6 (QA gate). You own criteria: <list>.

Read first: docs/PRD.md (Global Constraints + this protocol), docs/lessons/phase-NN-<name>.md
(this phase's vault items) together with docs/LESSONS-APPLIED.md (the root rule and §A/§B/§C,
which bind every phase), docs/qa/ (one log per phase — what earlier phases already measured;
check here before re-measuring anything), and docs/reviews/ (what earlier phases were warned
about).

For each criterion you own, answer separately:
1. Does the code actually satisfy it, or only appear to?
2. What did you run, read, or measure to know that? Quote it.
3. Would this criterion still pass if the behaviour it names were deleted?

Do not modify any files. Cite file and line for every claim. Rank by severity. State plainly
what you could not check.
```

The **second brief** *(A7)* is run after the first returns, with the first brief's findings
withheld from it:

```
Same phase, same criteria. Do not verify that the implementation meets them.

Answer only: how could each of these criteria pass while the feature is still broken?
Name the specific input, state, or ordering that would do it. If you cannot construct one for
a criterion, say so — that is a real answer.

Do not modify any files. Cite file and line. State plainly what you could not check.
```

**Per-owner additions** to the base brief:

| Owner | Add to the brief |
|---|---|
| `code-reviewer` | *"Also: does any file exceed 400 lines without a justification in this phase's docs/qa/ log?"* |
| `performance-engineer` | *"Measure under the worst case this phase can produce, not the typical case. Distinguish 'fast' from 'not drawing' — a frame-rate number that cannot tell those apart is not a measurement (vault 9.4)."* |
| `ui-ux-tester` | *"Drive the running game with `playwright-cli`; screenshot what you assert."* |
| `accessibility-tester` | *"Name the WCAG success criterion and level for every claim. Measure the contrast ratio; do not estimate it."* |
| `security-auditor` | *"Verify against the production build and the production header config, never the dev server."* |

### Where this sits in the phase

The QA gate is one step, and it contains both reviewer kinds:

> vault-in → invoke §2 skills → **Codex plan review** → build → **QA gate: agent owners (×2 briefs
> each) + Codex implementation review** → vault-out → STOP for approval

Run the agent owners **before** the Codex implementation review. Codex reviews the diff as it will
be reported, and applying an agent's findings changes that diff.

---

## File structure

Locked now so decomposition decisions are not made ad hoc later.

```
src/
  main.ts                     entry point; boots Phaser, nothing else
  game/
    config.ts                 GameConfig: renderer, scale, pixelArt, FPS
    constants.ts              TICK_HZ, TILE_SIZE, world constants
    frameClock.ts             real ms → whole ticks; the only clock the sim sees
    assetCatalog.ts           public/assets/index.json load + validation
  sim/                        ← ZERO Phaser imports, ZERO clock, ZERO Math.random
    tick.ts                   numbered tick step order; the contract
    player.ts                 movement state machine
    input.ts                  input snapshot + consumption
    derived.ts                knobs → readable feel metrics (jump height, apex…)
    rng.ts                    seeded xorshift32
    combat.ts                 (Phase 5) hit windows, damage, knockback
    progress.ts               (Phase 8) level completion, save state
    types.ts
  scenes/
    BootScene.ts              asset load + refuse-to-route gate
    GameScene.ts              production play scene
    UIScene.ts                (Phase 6) HUD, parallel scene
    PlaygroundScene.ts        DEV ONLY — movement feel tuning
    GymScene.ts               DEV ONLY — asset registration, bounds, frames
    ElementEditorScene.ts     DEV ONLY — tile collision strips
  render/
    playerView.ts             sim state → sprite; no game logic
    cameraRig.ts              follow, bounds, zoom
    hud.ts                    (Phase 6)
  debug/
    globals.ts                window.__game; dev build only, stripped from dist
tests/
  unit/                       vitest; sim only
  e2e/                        @playwright/test; one spec per phase
tools/
  gen/                        tracked fal generation + frame-pick scripts
public/assets/
  index.json                  the asset catalog
  levels/                     Tiled .tmj sources, SHIPPED VERBATIM
docs/
  PRD.md                      this file — the spine
  prd/                        one document per phase
  lessons/                    one vault-in checklist per phase
  qa/                         one QA log per phase
  generations/                one fal generation log per gate group
  reviews/                    Codex review outputs, one pair per phase
  FAL-MODELS.md               every fal endpoint: schema, price, gotchas
  STYLE.md  ASSET-PIPELINE.md  SOURCE-ANALYSIS.md
  LESSONS-APPLIED.md  QA-LOG.md  index + cross-phase entries
  GENERATION-LOG.md
```

---

## The `window.__game` surface

Fixed in Phase 1, because every later e2e spec depends on it. Read-only, dev build only, stripped
from `dist/` — and Phase 10 verifies its absence.

```ts
{ sceneKey: string; tick: number; player: { x, y, vx, vy, state } | null;
  score: number; health: number; levelId: string | null;
  ready: boolean; bootError: string | null }
```

**`ready` and `bootError` were added in Phase 1**, which is the phase this document says fixes the
surface. Codex reviewed the original seven fields against Phases 5, 6 and 8, ruled both additions
necessary and no others justified. They exist because there is deliberately no loader timeout
*(vault 1.4)*: without them a successful boot, a refused boot and an infinite hang are
indistinguishable — all three sit in the Boot scene — so the phase's own QA gate could not fail.
`ready` is the positive terminal condition every e2e spec waits on instead of sleeping; `bootError`
is the negative one. See [reviews/phase-01-plan.md](reviews/phase-01-plan.md) F1/F6/F12.

The surface is **read-only and live**: installed with `Object.defineProperty(window, '__game', { get })`
and no setter, each read returning a frozen copy of current state. Not an object assigned once, which
would go stale and let a spec asserting `tick === 0` pass forever.

**`window.__phaserGame` is a second dev-only handle, and is not part of this surface.** It exposes
the `Phaser.Game` instance so e2e can restart the Boot scene, and so a spec can assert the *drawn*
object tracks the sim. Phase 2 needed the latter: deleting `renderPlayer()` left every test green,
because everything else reads `__game`, which the scene writes directly. It carries no state of its
own, so it does not widen the eight-field closure — but it is dev-only under the same rule, and
Phase 10 verifies its absence from `dist/` alongside `__game`.
