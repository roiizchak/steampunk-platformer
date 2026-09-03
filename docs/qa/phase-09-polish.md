# Phase 9 — Polish, juice, particles — QA log

← [QA-LOG index](../QA-LOG.md) · phase: [phase-09-polish.md](../prd/phase-09-polish.md) ·
reviews: [plan](../reviews/phase-09-plan.md) · impl (owed)

Branch `phase-09-polish`, from `main` at `080e3e8`.

## This log, split into parts

**This log reached 2126 lines** — the largest document in the repository. On 2026-09-03 it was split
into five flat siblings, per CLAUDE.md §6: `docs/qa/` splits into **flat siblings**, never a
subdirectory, because `tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively.

The gate heading, its criterion table and the vault-out stayed here. `docs-contract.test.ts` slices
this file between the phase heading and the vault-out heading and reads the criterion rows out of
that slice, so neither heading is free to move — and this paragraph deliberately does not quote
either one verbatim, because `between()` takes the FIRST match of its start marker.

| Part | What is in it |
|---|---|
| [01 — before the gate](phase-09-polish-01-preflight.md) | task 0's contact-frame trace · what landed in the build and what was verified by hand · the e2e environment's three false greens |
| [02 — what the gates do not cover](phase-09-polish-02-uncovered.md) | § 9.8 items 1–35: the record/do-not-fix findings, task 8's closures, the gate round's mutation proofs and e2e runs, and what four blind agents found missing |
| [03 — the perf diagnosis](phase-09-polish-03-perf-diagnosis.md) | corrections to this phase's own predicates · G.7b attributed then disproved · "max enemies" is not a bound · 9.5's measurement floor and its FAILED gate round |
| [04 — the perf bounds](phase-09-polish-04-perf-bounds.md) | the bound-confirmation run sets A and B · criterion 5.11's one-in-seven red · fix round #2 and the guard that could not fire |
| [05 — the close](phase-09-polish-05-close.md) | fix round #3 · 9.8 item 32 judged twice · 9.11's Codex round · the flaky landing-shake gate · the six owner briefs · the playtest after D8 |
---

## Phase 9 — the gate

⚠️ **This heading is load-bearing and is not free to rename.**
`docs-contract.test.ts`'s *"every phase marked done in the PRD is evidenced criterion-by-criterion
in its QA log"* slices this file between a start marker of `##`+`Phase 9`+space and an end marker of
`##`+`Vault-out`+em-dash+`Phase 9`, then looks for a `| 9.x |` row per criterion. `between()` **throws
`start marker not found`** when the start marker is absent — a red naming a parse failure rather than
a missing criterion. This section read `## QA gate — status` until 2026-08-24, which is why the
contract could not reach Phase 9 at all: the rows below sat outside any slice it could take. Every
other done phase carries the same `## Phase N — …` marker. Found by the Codex plan review for the
close session, confirmed locally.

⚠️ **And do not quote either marker verbatim in prose above the table.** The first draft of this very
note spelled the end marker out; `indexOf` found *that* occurrence first, sliced from the heading to
the sentence, and reported all eleven criteria missing while all eleven were present six lines below.
The markers are written above in split form for exactly that reason. *(Watched, 2026-08-24.)*

<!-- gate-verdicts -->

| # | Criterion | Owner | Status |
|---|---|---|---|
| 9.1 | Hit-stop lives in the sim as integer ticks, not a tween | `code-reviewer` ×2 | ✅ **PASS.** Closed by the close round, 2026-08-24. Brief A: PASS — one integer deadline in `src/sim/hitstop.ts` with six real consumers, no clock reachable from the sim. Brief B CONSTRUCTED a scene-side re-implementation that would keep every gate green — **recorded as D1**, since it describes code that does not exist and gating it is a new architectural rule, not this criterion. See §*"The close round — 2026-08-24"*. |
| 9.2 | No game logic sequenced off a tween completion | `code-reviewer` ×2 | ✅ **PASS — and this is the row that earned the round.** Brief B found the criterion **had no gate at all**: the `describe` block carrying its number tests the shake envelope and the emitter depth band, and neither involves a tween. `tests/unit/tween-callback-boundary.test.ts` now closes it, watched red on the real tree (**D2**). A second construction — a shake armed one tick early — was **refuted by execution** (E5, **D7**). A latent selector flake was found and fixed (**D3**). See §*"The close round — 2026-08-24"*. |
| 9.3 | Tweens tracked individually; no kill-by-target | `code-reviewer` ×2 | ✅ **PASS.** Re-run against the fix, 2026-08-24. Brief A: PASS — `tween-boundary.test.ts` 9/9 with both-direction literal fixtures; all four tween owners hold and stop a handle. Brief B named five ways the regex scan can be bypassed — **none present on this tree**, recorded as **D4** so the scan's reach is known rather than assumed total. See §*"The close round — 2026-08-24"*. |
| 9.4 | A fade force-settles its end value on stop as well as complete | `qa-expert` ×2 | ✅ **PASS — on the FADE this time.** Both briefs of two, 2026-08-24, both pointed at `src/scenes/hudFade.ts` / `hud-fade.test.ts` and explicitly warned off the gear pop that caused the original failure. Brief A mutation-proved **both** settle paths (`onStop` and `onComplete` deleted separately, each reding its own named test). Brief B tried three further mutations and cross-checked the test's fake against real vendored Phaser: **NONE FOUND**. See §*"The close round — 2026-08-24"*. |
| 9.5 | Frame budget holds under the worst STEADY-STATE frame (**owner-amended 2026-08-24**) | `performance-engineer` ×2 | ✅ **PASS against the amended criterion.** It read *"max enemies + max particles + shake"* and could not honestly pass as written: `installStorm` suppresses combat in every arm and the shake in the window is `SHAKE.land`, smallest of four. I recorded that as *"PASS, qualified"* and the **Codex implementation review blocked it** — *a caveat cannot reverse a criterion's wording* — correctly. The owner then **amended the criterion** to name the worst steady-state frame, which is what is measured and defensible; the amendment, its alternatives and what it does **not** close are recorded in `docs/prd/phase-09-polish.md`. Against the amended wording both briefs pass: every defect the two prior FAILs named is fixed on disk, and **E6** re-proved the shake-load guard on the current post-`8c9d0fc` tree. ⚠️ **The combat path stays unmeasured and stays open work** — entries 43, 44 and D5. |
| 9.6 | Measurement distinguishes "fast" from "not drawing" | `performance-engineer` ×2 | **RAN ×2 → PASS ×2**, checklist verified item by item by both briefs; brief B's one finding (L1, `inView` was an existence check) applied |
| 9.7 | Every gate's threshold pinned as a literal, with fixtures both sides | `qa-expert` ×2 | ✅ **PASS, with one limit stated.** Brief A verified construction for all 24 and said plainly that no Playwright ran, so redness was unproven — that sentence stands as written. I first recorded six mutations as discharging it; the **Codex implementation review refused that**, correctly, and it was downgraded to PARTIAL. It is now closed by a full table: **14 unit-side threshold families each watched red, every one naming its own constant in the failure text**, plus **nine e2e executions** including `MIN_COST_EXPONENT` (E7, the bound the review said nothing covered) and `MAX_EFFECT_FRAME_WORK_MS` (E9, red on a real 3 ms cost injection rather than a harness flag). ⚠️ **Four upper perf bounds** — P95, work-delta, per-particle, storm-delta — have no mutation of their own: `phase-09-perf.spec.ts` is one sequential test and an earlier guard always fires first. Construction verified, redness **inferred**, recorded as weaker, and splitting that spec is owed work. See §*"9.7's threshold → fixture → red-proof table"*. |
| 9.8 | What the gates do NOT cover is stated here | — | ✅ **PASS.** Drafted below and extended through every round (entries 25, 36, 37, 43–45, and the two written in §*"The two §9.8 entries this round wrote"*). Item 32 was closed by hands-on judgement and then **re-judged on the fixed build** because the first approval did not count — §*"9.8 item 32 — CLOSED by hands-on judgement, 2026-08-22"* and §*"9.8 item 32 — re-judged on the fixed build, and why the first approval did not count"*. |
| 9.9 | No file > 400 lines; diff reviewed; adversarial pass | `code-reviewer` ×2 | ✅ **PASS.** Re-run against the fix, 2026-08-24. Line count: the largest file in `src`/`tests`/`tools` is exactly **400**, `file-size.test.ts` green, no active exemption. Clauses two and three are human acts with no mechanism (**D6**) — and the adversarial pass is the clause discharging itself, this round being it. Six files at exactly 400 with no headroom is **9.8 entry 48**, unchanged (**D11**); two tracked files outside the gate's glob are recorded as **D12**. See §*"The close round — 2026-08-24"*. |
| 9.10 | Codex plan review ran; every finding applied or recorded | — | ✅ **PASS** — [phase-09-plan.md](../reviews/phase-09-plan.md), 4 blockers + 2 highs applied, 3 lows recorded |
| 9.11 | Codex implementation review ran on the diff | codex | ✅ **PASS** — §*"Criterion 9.11 — the Codex implementation round, and what it cost to close"*. Triage with a verdict per finding in [phase-09-impl.md](../reviews/phase-09-impl.md); five gates watched failing with the mutation each assertion names, reverted and confirmed per *(C1, C12)*; four verification runs green on the same tree (unit 2151|3, sim-isolated 2151|3, e2e 119, build `verify-dist ok`). |

### The reconciliation of 2026-08-23, and why Phase 9 was still not done then

⚠️ **Kept as written, and superseded.** This subsection records the state on 2026-08-23 — seven
criteria owed. All seven were closed by the owner round of 2026-08-24; the table above carries the
verdicts and §*"The close round — 2026-08-24"* carries the evidence. It is preserved rather than
edited because the reasoning that refused to call seven criteria closed is the reason they are
honestly closed now. Deleting the refusal would leave only the answer.

**Inventory item 0.1 asked for the table to be brought in line with what ran. It now is, and the
answer is not the comfortable one.** Four rows are substantiated; seven are owed.

| verdict | criteria | why |
|---|---|---|
| ✅ **PASS**, substantiated | 9.6 · 9.8 · 9.10 · 9.11 | each has a round with a **recorded verdict** and its evidence section cited in the row |
| **OWED — ran, failed, fixed, never re-run** | 9.3 · 9.5 · 9.9 | the four blind briefs at `:529` failed all of these; the fixes landed with their reds recorded; **no owner brief has looked at the result** |
| **OWED — ONE brief of two has re-run** | 9.4 · 9.7 | brief A was recovered from a dead worktree 2026-08-23 and passes both against the fix. *(A7)* wants two, brief 1's findings withheld from brief 2 — and for 9.4 the recovered brief verified the substituted subject, not the one the criterion names |
| **OWED — no verdict either way** | 9.1 · 9.2 | the round ran, but `:529` records verdicts only for 9.3/9.4/9.7/9.9 and neither brief's write-up decides these |

**The standard applied here is the log's own.** 9.5's row was already written as *"RAN ×2 → FAIL
twice … all 11 findings applied or recorded … **still UNRUN in the sense that matters: neither owner
brief has re-run it against this fix**"* — and nothing distinguishes 9.3, 9.4, 9.7 or 9.9 from it.
Applying the standard to one criterion and not to its four siblings would be picking the answer
first.

**So the PRD's Phase 9 row stayed `—`** through 2026-08-23: the phase was not marked done, and
`docs-contract.test.ts` stayed green for the reason it always had rather than because the phase
earned it. *(Global Constraints: a phase with a failing or unrun criterion is reported failing,
never as done.)*

✅ **Closed 2026-08-24.** All seven were re-run by their owners, two briefs each, brief A's findings
withheld from brief B. Two real defects were found and fixed, one adversarial construction was
refuted by execution, and 9.7's unproven e2e redness was discharged by six integrator-run mutations.

⚠️ **And `docs-contract` could not reach Phase 9 at all until that morning.** This log carried no
`##`+`Phase 9`+space marker, so the contract would have thrown `start marker not found` rather than
naming a missing criterion — the gate meant to make "done" mean something was, for this phase,
decoration. Found by the close session's Codex plan review, confirmed locally, and fixed before any
verdict was written. The note under this file's gate heading has the detail.

**What this means about the merge.** The phase was merged to `main` and approved on a verbal report,
and the project's own authority does not corroborate it. That is item 0.1's finding stated plainly.
It is **not** a claim that the work is bad — the mutation proofs at `:448` and in §*"Every gate
watched failing — the mutation each assertion NAMES"*, the integrator's own re-mutations in §*"The
build — what landed, and what I verified myself"*, and the Codex round in §*"Criterion 9.11 — the
Codex implementation round, and what it cost to close"* are as thorough as anything
in this repository. It is a claim that **the last step of the protocol was skipped**: agent-owned
criteria that FAILED were fixed and never handed back to their owners.

**What closing it costs.** One gate round: `code-reviewer` ×2 over 9.1, 9.2, 9.3, 9.9 and
`qa-expert` ×2 over 9.4, 9.7, plus `performance-engineer` ×2 over 9.5 against the fix round #2/#3
tree — each with two briefs *(A7)*, brief 1's findings withheld from brief 2. That is a session's
work and it is **not** this session's scope, so it is recorded here as owed rather than quietly
absorbed. *A QA-LOG row reading PASS is still a sentence a human wrote* (`QA-LOG.md:262`); this
section exists so nobody writes seven of them.

---

### ⚠️ 9.4's subject: the substitution, and why it is now BOTH

The build substituted the HUD gear pop (`hudGearPop.ts`) for the level-complete fade
(`hudFade.ts`) as 9.4's observable subject, on the argument that the fade's settle is not
independently observable — its only call path, `UIScene.levelComplete(null)`, destroys the fade and
the panel text on the next two lines. The argument is honest and `hudFade.ts` made it in the open.
It was recorded only in a source comment, and the gate table above still said *"a fade"*.

**The two gate briefs then split on exactly that.** Brief A verified the gear pop's settles, found
real reds in both directions, and passed 9.4. Brief B verified the FADE's settles and found that
deleting **both** of its `onStop` callbacks left 2073/2073 green, with `hudFade` occurring in
`tests/` exactly once, as prose. Neither brief was careless: **they verified different subjects, and
only one of them was the subject the criterion names.**

The phase owner ruled 9.4 FAILING, on the grounds that the criterion's named subject was ungated
**and** its stand-in was unwired — deleting `UIScene.ts`'s sole `this.gearPop?.pop()` call site was
also green. Both halves are closed now, and the answer to "not observable in production" turned out
to be a fake scene rather than a substitution: `hudFade.ts` names no Phaser VALUE, so one
`import type` made `showLevelComplete` drivable. See `tests/unit/hud-fade.test.ts` (the fade, both
settles plus the stop-before-destroy ORDER) and `tests/unit/sprite-draw-path.test.ts` (the pop's
call site). Reds recorded in the row table below.

## Vault-out — Phase 9

**Status: written 2026-08-22, at the close of the phase. All eleven Phase 9 criteria are green;
one INHERITED gate (Phase 8's G.7b) is under repair and is not a Phase 9 criterion.** Vault-in
*(B1)* recorded that the vault had nothing on particle cost or frame budget. It still does not have
what follows, and this is the phase that had to pay for it.

Phase 9 found **twenty-two** gates of a single defect class, plus a shipped-game bug none of them
could see. Sections 1–3 are that class. Sections 4–6 are what the phase learned about measuring.

### 1. The defect class: a gate that asks whether a value CAME BACK, not whether it can DO anything

Every one of the twenty-two has the same shape. Something is counted, or returned, or found present
in a source file — and the gate treats presence as proof of function. The canonical instance is the
one Codex found, and it is worth stating exactly because the suite's own numbers argued the other way:

> Change `pen.fillStyle(spec.tint, 1)` to `pen.fillStyle(spec.tint, 0)` in `particleTexture.ts`.
> **Every particle texture in the game becomes fully transparent.** The unit suite stays 2150/2150
> green, and criterion 9.6 reports `drawn 96 inView 96` — **PASS**, on a real GPU.

The reason is mechanical and generalises: **Phaser submits a fully transparent quad exactly as
happily as an opaque one.** A draw-count gate measures *submission*. Nothing about visibility follows
from it. The three gates that were supposed to cover this each stopped one step short — one scanned
the function's *source text* for `spec.tint`, one read emitter/particle *alpha and scale*, one counted
*alive particles plus emitter `willRender`*. None read a pixel.

Closed by an actual pixel read (`phase-09-draw.spec.ts`), watched red against both that mutation and
`fillStyle(0xffffff, 1)`. **The generalisation: if a gate can be satisfied without the thing existing
on screen, it is not a gate about the screen.**

### 2. A decision function with no consumer is the same defect as a burst of zero particles

`spriteFeedback.ts` shipped with **221 source lines and a 306-line test file** — and **zero production
consumers**. Blanking all four function bodies left the game byte-identical on screen with the suite
green. It satisfied every assertion about itself and drew nothing.

This is the cost of the `src/render/` pattern, and it is worth paying with the guard rather than
avoiding: pulling decisions out of scenes is what makes their edge cases unit-testable, but a
decision nobody applies is invisible to exactly those tests. **Every module in `src/render/` now owes
a draw-path gate.** Two shapes, and the second is stronger — prefer it:

| shape | example | when |
|---|---|---|
| source text | `effects-draw-path.test.ts` | the scene names a Phaser value the test cannot construct |
| behavioural, against a fake scene | `enemy-feedback.test.ts` | the module takes Phaser as a *type* only |

### 3. The bug all twenty-two missed, and why the fixtures hid it

The emit window in `gameEffects.render` was `(cursor, tickCount]` while the stamps it compares against
are taken from the **pre-increment** count. The consequence, unnoticed through the entire phase:

> **No impact spark, death plume or hurt vent had ever fired in the shipped game.**

Two independent things kept it invisible, and each is its own lesson:

- **Every unit fixture bumped the tick count before stamping** — an ordering the game never performs.
  A fixture that sets up its state in a different order than production does is not testing production.
- **The perf gates drove `explode()` on the emitter handles directly**, from `installStorm`, bypassing
  `gameEffects.emit` entirely. So 9.5 and 9.6 measured *the storm*, never *the game*. The narrowing
  was disclosed in a comment that then cited a covering gate **which did not exist**.

Correcting to `fresh = hitTick >= cursor && hitTick < tick` reds six tests. **A disclosure that names
a covering gate must name one you have opened.**

### 4. A render-frame-derived edge is LOST whenever a frame drains several sim ticks

The landing edge was inferred in the render layer, from `grounded` changing between two render calls.
Driven directly:

| frame rate | result |
|---|---|
| 1 sim tick per frame | dust emits, player squashes |
| 2 sim ticks per frame | **zero particles, no squash, no shake** |

A buffered jump lands on one tick and jumps on the next; the jump clears `grounded`, so the renderer
observes `false -> false` and the whole event never happened. **This gets worse on faster release
hardware**, where multi-tick frames are the norm — the opposite of the direction people test in.

**The fix is the general one: stamp the event in the sim (`PlayerSim.landedTick`, step 10) and have
the renderer read the stamp. Never re-derive an edge from two samples of a level.** The same lesson
recurred one layer out when criterion 9.2's own spec inferred the same edge the same way and flaked
one run in three — this harness drains 3–4 ticks per frame while `SHAKE.land` lasts 3, so the inferred
edge routinely pointed *past the end of the shake*, and every offset it read was a legitimately
settled zero.

### 5. Perf: the shape that fails is an UNPAIRED median per arm, subtracted or divided

Four gates in this project have now failed this way — 6.9's GPU ratio (discarded), G.7b, 5.11, and
9.5's Guard 1. The first diagnosis written down was wrong and the correction is the valuable part:
it is **not** "a ratio with a quiet denominator". A quiet denominator is an aggravator. The cause is

> reducing each arm to a single **unpaired** median, then subtracting or dividing, when the effect is
> within a few timer quanta.

`performance.now()` quantises to **0.1 ms** on this machine, and that quantum is the root of nearly
every perf-gate failure recorded here. Guard 1 had **no denominator at all** and false-redded 5 runs
in 6.

**The repair is two things and both are needed:** pair the observations and take the median of
per-round *deltas*; and separate the arms far enough that the effect clears the grid. Pairing alone on
9.5's old sample points still ordered only 4 runs in 6. Sampling harder cannot rescue the old shape —
resolving a 0.06 ms gap against a 0.1 ms grid needs ~225 rounds, about six hours per run.

And two rules that cost real time here:

- **A statistic that cannot order its own mutation is not fixed by moving the bound.** 9.5's linearity
  guard reduced algebraically to `2^|k-1|` and could only fire at N-cubed or steeper. It was replaced,
  not retuned.
- **Never attribute a perf red from one run per arm.** I attributed G.7b to Phase 9 on exactly that,
  and was wrong: the tally across eight runs was 3 fail / 4 pass with the *failing direction
  inconsistent*, and the single-exit baseline ranges 0.036–0.152 ms — wider than the effect.

### 6. Detect GREENNESS positively, including the count

A Playwright run that selected **nothing** reports `expected: 0, unexpected: 0` and exits **0** —
indistinguishable from a clean pass unless you read the count. Every other testing rule in this
project assumes the tests ran; this is the one that checks. Corollaries paid for this phase:

- **A zero exit through a pipe is `tail`'s exit, not the gate's.**
- `test:sim-isolated` reported 2150/2150 with **nothing skipped** while pinning an engine that run was
  not using — `require.resolve` had walked up to the parent checkout's `node_modules`.

### 7. Two smaller ones worth keeping

- **`Math.sin` is implementation-approximated** (ECMA-262 §21.3.2.30). Chromium's V8 and Node's V8
  return values differing by **1 ULP** for the same argument, so a cross-engine `toEqual` on anything
  trigonometric red-flags a correct result about 1 run in 12. Bound it — 9.2 uses 1e-9 px, six orders
  under the peaks it guards.
- **A dead keyboard in a hands-on session is a game-state question before it is a harness question.**
  Input appeared broken during playtest; the player had run into the goal and `playerInputEnabled` was
  false.

### 8. Evidence for a visual criterion must MEASURE the visual result

The first juice clip approved for criterion 9.8 was captured on a build where the emit window bug of
section 3 was still live, so sparks and steam **were not on screen at all**. The caption named them
because the sim state (hp dropping, enemy hp falling) was read and the effects *inferred* from it.
Re-captured with instrumented per-effect particle counts printed as it ran — sparks 18, steam 14,
dust 14 — and the first approval was withdrawn rather than quietly superseded. **A visual criterion is
closed by measuring pixels or counting emissions, never by inferring them from the state that should
have caused them.**
