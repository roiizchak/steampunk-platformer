# The bug-fix session — QA gate

Flat sibling of [`session-bugfix-tiers.md`](session-bugfix-tiers.md), which holds the A0
reconciliation table and the per-item record. This file holds **only the gate**: the criteria, who
owns each, what they found, and the disposition of every finding *(C11)*.

**An Owner column is an instruction, not a label** *(CLAUDE.md §3)*. A criterion owned by an agent is
**UNRUN** until that agent has run it **twice** *(A7)* — brief 1 verifying the criterion, brief 2
asking only *"how could this be wrong?"*, **with brief 1's findings withheld from brief 2**.

## How the owner agents were run

Ten agents, five owner types, two briefs each, **every one under `isolation: "worktree"`** — the §9
rule, written after six Phase 8 agents corrupted the shared tree and a commit captured it.

A git worktree shares `.git` but **not** `node_modules`, so none of the ten could run `npm`, `vitest`,
`tsc` or Playwright. That is deliberate here rather than merely tolerated: `test:e2e` shares port
5173 and `test-results/`, and its wall-clock-bounded specs read a busy box as a broken game — ten
concurrent agents each starting a dev server is the exact shape that once failed seven specs for no
reason. Every brief carried the prohibition explicitly.

The consequence is stated rather than hidden: **their findings are file-evidence only**, the same
standing as Codex's, and *"a subagent's summary is a claim, not evidence"* — every finding below was
**re-verified locally** before it was dispositioned. Where a criterion genuinely needs a rendered
frame or a measured run, the agent was instructed to say so rather than round it to PASS, and the
orchestrator ran it.

---

## S.5 · The mechanical non-negotiables — Owner `—`

No agent owns this one; four checked-in gates do. Run 2026-08-23 on the approval revision.

| check | gate | result |
|---|---|---|
| No new dependency | `git diff main...HEAD -- package.json` | **no dependency line changed** at all |
| Phaser pinned exact | `node_modules/phaser/package.json` after `test:sim-isolated` | **4.2.1**, restored |
| `src/sim/` boundary intact | `tests/unit/sim-boundary.test.ts` + `npm run test:sim-isolated` | **2257 passed / 3 skipped (145 files)** with Phaser uninstalled |
| No file over 400 lines without a citation | `tests/unit/file-size.test.ts` | pass |
| Docs contract | `tests/unit/docs-contract.test.ts` | pass |
| Art direction lock | `tests/unit/style-lock.test.ts` | pass — **no hash edited this session** |
| **Tick contract not renumbered** | `git show main:src/sim/tick.ts` step list vs `HEAD` | **byte-identical** |
| `window.__game` still eight fields | `src/debug/globals.ts` `GameDebugView` | **8** — `sceneKey`, `tick`, `player`, `score`, `health`, `levelId`, `ready`, `bootError` |

The four lock suites were run together and read positively: **`PASS (143) FAIL (0)`**.

⚠️ The tick-contract check is the one worth keeping. This session changed **what happens inside**
steps 4a, 7, 9b and 9d, and added a `goalReached` edge — every one of those is a change combat timing
is expressed against. Diffing the *numbered list itself* against `main` is what distinguishes a
lettered insert from a renumber, and it is a two-line check nobody had written down before.

## S.10 · Full sweep, counts read positively — Owner `—`

Against Phase 9's closing baseline. **The count is read, never the exit code** — a run that selected
nothing exits 0.

| check | Phase 9 baseline | this session | verdict |
|---|---|---|---|
| typecheck | clean | **clean** | — |
| unit | 2154 passed / 0 failed (133 files) | **2260 passed / 0 failed (145 files)** | +106 tests, +12 files |
| build | `verify-dist ok`, 5 levels + 11 audio byte-identical | **`verify-dist ok`, 5 levels + 11 audio byte-identical, no DEV-only scene key or debug surface in 1 bundle** | — |
| `test:sim-isolated` | 2151 passed / 3 skipped | **2257 passed / 3 skipped (145 files)** | Phaser restored to 4.2.1 |
| e2e | 118 passed / 1 failed (criterion 1.4) | **held until the ten owner agents finish** — one Playwright run at a time, and nothing heavy beside it | see below |

The e2e arm is deliberately **not** run concurrently with the gate owners. Recorded here rather than
quietly deferred, because a green e2e taken on a loaded box is worth less than no e2e at all.

---

## The owner agents' findings, and what each cost

**Forty-eight findings across ten briefs.** Every one re-verified locally before disposition. **Two of
the loudest did not survive that** — recorded below alongside the ones that did, because a gate owner
being wrong is evidence about the gate, not something to quietly drop.

### The blocker: a disposition that said APPLIED and was not

| | |
|---|---|
| **Found by** | `code-reviewer` brief 1 (S.0 / S.3) |
| **Evidence** | `git diff main...HEAD -- src/sim/player.ts` → **empty**. Lines 140, 145, 167, 169 byte-identical to `main`. |
| **Verified** | Locally, both halves. |

Codex finding **Y7** was recorded in this log as *"APPLIED for CLAUDE.md and `player.ts`"*. The
CLAUDE.md half landed. **The `player.ts` half never did** — four comment lines still described
`movingHorizontally = dir !== 0 || vx !== 0` as live machinery, after `tick.ts:334` deleted the term.

**A disposition recorded APPLIED that was not applied is worse than one recorded unfixed.** An unfixed
item is visible; a false APPLIED is *false gate evidence*, and it means **no other Y row was
self-certifying either** — each had to be re-checked by hand, which is what the brief forced.

⚠️ **This session's Tier 4 was "prose that contradicts the code".** The Tier 4 fix created three new
instances of that exact defect — `player.ts` ×4, `enemyTurn.ts:51`, `audio-cue-edges.test.ts:339` —
and filed them as closed. The gate meant to prevent recurrence (`tuning-prose.test.ts`) covers
`playerTuning.ts`'s numbers only; **no gate reads a comment for a term that no longer exists**, and one
is not cheap to build. Recorded as the honest limit.

The `player.ts` rewrite keeps the deferral cost rather than deleting the paragraph: *"moves every
locomotion assertion from Phase 2 onward"* was the stated reason for three phases of deferral, and it
**moved none**. A scheduling estimate nobody re-tested became a standing reason not to act.

### The ruling's own file still contradicted the ruling

`enemyTurn.ts:51` carried a red marker reading *"Death is the ONLY exit from a chase now that aggro is
permanent"* — **after** the owner reopened that ruling and the release radius shipped. Three of the
**four** files carrying the ruling were updated. The fourth is the one with the marker on it, and the
one this log cited as proof the change was written down.

### Two draw-path gates that could not go red

Both found by the same question: *what does the fix's own claim name, and did anything test **that**?*

| # | The gate | The mutation, RUN | Result |
|---|---|---|---|
| 1 | 2.5's banner font (`code-reviewer` b1) | `gameDev.ts` `fontSize` back to `'18px'` — the **consumer**, not the constant | **suite green.** The recorded watched-red had mutated `HELP_FONT_PX` itself, which the shipped defect never touched |
| 2 | Y3's bed retirement (`qa-expert` b2) | delete `sound.remove(bed)` from `startBeds`'s loop | **`PASS (2260) FAIL (0)`.** `grep -rn "sound.remove" tests/` returned **zero** matches |

Gate 2 is the sharper of the two. Codex's Y3 — a HIGH regression re-introducing vault 7.5's
accumulation — was fixed, recorded APPLIED, and **nothing in the repository touched the fixed line.**
The one e2e that counts `sound.sounds` (7.5) drives **Boot restarts**, which route through
`destroyAudio` and empty `liveBeds` first: a different branch of the same file. The adopt path — the
entire subject of item 1b.2 — has no test at all.

Both are now red by name. ⚠️ **Gate 2 is the weak (source-text) shape and its own header says so**:
asserting the call *appears* is not asserting `sound.sounds` stays bounded across a level transition.
The behavioural e2e is **owed, not written**.

### The finding that shrank by 3× under measurement

`code-reviewer` brief 2 called item 1.2's fix a **BLOCKER**: *"the fix makes every shipped sentry
unable to hit a player standing below it … a playthrough-visible combat regression in every level."*
Its arithmetic was hand-done from `SENTRY_MUZZLE`, `RENDER_SCALE`, `SENTRY.radius` and the `.tmj`s.

Re-measured by driving `stepProjectiles` over **every standable surface inside each sentry's firing
radius** on all five shipped levels:

| | brief 2's claim | measured |
|---|---|---|
| sentries affected | *"every"* — 9 of 9 | **3 of 9** |
| level-01 sentry position | `(5616, 1344)` | **`(5472, 1152)`** — not a position in the shipped file |
| standable spots lost | implied total | **13 of 96** |

The worked example describes a level that does not ship. **The phenomenon is real anyway** — three
sentries do lose downward shots — but the six unaffected ones are the difference between *"a combat
regression in every level"* and *"a bounded change worth a playtest"*.

And every lost shot has a large `dy`: the player is on a **lower ledge**, with the sentry's own
platform between them. Before item 1.2 those bolts travelled **through solid rock**. So the loss is
the fix working as specified, not a regression in it.

⚠️ **Whether the levels were authored assuming those shots landed is a `play`-owned question** and
cannot be settled from a number. Flagged for playtest, not closed.

`tests/unit/sentry-coverage.test.ts` pins the measured coverage per sentry as a **floor**. Watched red
*(C1)* with the mutation its header names — `segmentHitTime` clipping at `t = 0` — **10 failures, all
nine sentries named, each carrying its real number** (`reaches 0 of 9`, `0 of 20`). Clip-call count
1 → 0 and back *(C12)*.

### The record that had gone stale about the same day's work

`qa-expert` brief 1 enumerated the inventory against this log and produced the difference as a list.
**Four items — 1.2, 1b.1, 1b.6, 2.7 — shipped with a commit and (three of them) a watched-red gate,
and their A0 rows still read `OPEN` with no disposition section anywhere.**

Worse, and found in the same pass: **all four rows of the "Owner decisions this session is blocked on"
table had been answered** — 0.2, 2b.1, 1b.1 and 1b.3 — and none was updated. The table spent the day
claiming the session was waiting on decisions that had already been made and shipped.

The A0 table is what the plan calls *"the session's most valuable single deliverable … what stops the
next session re-chasing what is already closed."* It had drifted from the code **within one session**,
which is the precise defect the whole inventory exists to fix. **A commit message is not the record**
*(C11)* — 2.7's reason lived only in `f5b582b`'s body.

### Findings RECORDED, not applied *(C11)* — each with its reason

| finding | owner | reason |
|---|---|---|
| Scavenger released past `patrolMax` snaps back through walls in one tick | `code-reviewer` b2 | **Plausible and unverified.** The gate's `pinned()` fixture sets `patrolMin = patrolMax`, so the clamp is a no-op in every fixture — the brief is right that its own gate cannot see it. Needs a real fixture and probably a walk-back-at-patrol-speed fix; that is a behaviour change to enemy motion, not a comment fix, and is **owed**. |
| I-frame flicker is a WCAG 2.3.1 photosensitivity BLOCKER at 10 Hz | `accessibility-tester` b2 | **Rate right, area wrong by ~15×.** `IFRAME_FLICKER_PERIOD = 6` (3 on / 3 off) at 60 ticks/s **is** 10 Hz. But the brief computed the flashing area as 26.7% of the viewport from the sprite's **height** (288/1080); the sprite is 132 × 288 = **1.83% of screen area**, and WCAG's general flash threshold is **area**-based (25% of the central 10° field ≈ 57,510 px² at 1920×1080; the sprite is 38,016 px², about 66% of it). It is also a dim to `alpha 0.35`, not a flash pair. **Under the threshold, and not by a comfortable margin** — recorded, with no accessibility opt-out existing. |
| Gear-counter contrast fails WCAG AA at 1.13:1 | `accessibility-tester` b1 **and** b2 | **The failing half is right; the number is not usable.** Both briefs computed fill-vs-background and **ignored the 6 px stroke** — which `UIScene.ts:66` already records as *"load-bearing rather than decorative … what holds the contrast when the player walks in front of something pale"*. Their figures are unreliable for exactly the reason they identify: **2b.4's sampling method was never written down.** Item 2b.4 is **not reached** this session and stays so; writing the method is the first owed step, before any re-measurement. |
| `dev-guard-census` counts guard *lines*, so an inverted or emptied guard stays green | `code-reviewer` b2 | **True and worth stating.** It reds only on a deleted guard, which is the one mutation run. Counting guarded *statements* is the fix. **Owed.** |
| `globalSetup.ts` re-declares port 5173 (vault 5.3) | `code-reviewer` b2 | **True, low.** If the port moves, the warm-up targets the wrong server and the run collects **zero tests and exits 0** — the false-green shape. One-line fix, **owed**. |
| `enemyTuning.ts` / `PlaygroundScene.ts` still say `releaseRadius` no longer exists | `code-reviewer` b2 | **True** — two more instances of the same prose-vs-code defect as the blocker, in the dev tuning path. The Playground can still drag `detectRadius` past 720 on a live scavenger, which the construction-time throw cannot see. **Owed.** |
| No live projectile cap; `O(projectiles × solids)` unbounded by construction | `performance-engineer` b1 **and** b2, independently | **Bounded today, real as a ceiling.** Measured from shipped data: ≤16 solids and ≤3 sentries per level, 90-tick cooldown — low hundreds of `segmentHitTime` calls per tick at worst, far inside a frame. No cap exists for a sixth, larger level. **Recorded as a ceiling, not a defect.** |
| 3.8's other two sub-items — arrival punctuation, counter sitting 2–4 px high | `code-reviewer` b1, `ui-ux-tester` b1 | **Punctuation already exists** (`hudGearPop.ts`, fired on every count change — verified). **Vertical centring is untouched and was never recorded** — a real C11 gap, named here. **Owed.** |
| The banner's `y` is a second hand-typed derivation of the plate's bottom edge | `ui-ux-tester` b2 | **True, and the inconsistency is the finding**: the same session routed the banner's *font size* through a shared constant while leaving its *position* as a hand-summed copy of two other modules' constants. Correct today only because the margin scaling reduces to the raw constants at scale 1. **Owed.** |
| A0's summary says *"~12"* unreconciled; the true count is **24** | `code-reviewer` b1 | **True.** Corrected in the not-reached list *(S.13)*, where each is named individually. |

### Findings NOT ACCEPTED, with the reason

| finding | why not |
|---|---|
| *"Every shipped sentry cannot hit a player below it"* | Measured: **3 of 9**, and the cited level-01 coordinates are not in the shipped file. |
| *"I-frame flicker is a WCAG 2.3.1 BLOCKER"* | Area computed from sprite **height**, not area — off by ~15×, and under the threshold. |
| *"Gear counter fails at 1.13:1"* | Computed against the fill while ignoring the 6 px stroke the source already names as load-bearing. The item is genuinely open; the number is not evidence. |
| *"`tuning-prose.test.ts`'s `runMax` assertion is tautological"* | Fair, and **left alone**: the file's load-bearing coverage is its docstring-vs-constant text diff, watched red at `PASS (4) FAIL (1)`. One redundant assertion beside a strong gate is not worth a change. |

### What the worktree isolation cost, and why it was still right

**Every one of the ten reported that its worktree was checked out at `main`, not at the branch.** Each
compensated by reading through `git show session-bugfix-tiers:<path>` — and two said explicitly that an
early `Read` of a working-tree file returned pre-fix `main` content that *"would have produced false
findings if trusted"*.

That is a near miss worth keeping. The isolation did its job — **no agent could corrupt the shared
tree, which is the §9 rule six Phase 8 agents earned** — but a worktree at the merge-base is a trap
that silently answers questions about the wrong code. **The next session's briefs should state the
`git show` requirement up front** rather than leaving ten agents to each discover it.

---

## S.13 · What this session did NOT cover — Owner `—`

**Every unreached item is named individually.** The plan forbids summarising them as *"the low
tiers"*, and §0.4 of the inventory is explicit: if time runs short the low tiers get dropped, and that
is **said**, not rounded up to done.

⚠️ **The A0 summary said *"~12"* unreconciled. The true count is 24**, found by the S.0 gate owner.
Under-reporting the remainder by 2× is the same defect as a stale A0 row: it makes the next session
plan against a number that is wrong in the direction that flatters this one.

### Never reconciled at all — 24 items

These were never opened against merged source. **Their inventory text may be as stale as Tier 1's
was** — four of the first fourteen items examined turned out already fixed, two had expired premises,
and one contradicted a shipped ruling. **Do not implement any of these from the inventory snapshot.**

| tier | items |
|---|---|
| 2b | **2b.8** (three audio defects: `bed-ambience` loop seam at −27.5 dBFS · `sfx-jump` first sample 0.084 · two pickups in one frame play one cue) |
| 4 | **4.5** (`assets:fetch` / `assets:verify` promised and absent) · **4.6** (Gym edits discarded before the config fetch resolves) |
| 5 | **5.2** · **5.3** · **5.4** · **5.5** · **5.6** · **5.7** · **5.8** · **5.9** · **5.10** · **5.11** · **5.12** · **5.13** · **5.15** · **5.16** · **5.17** · **5.18** · **5.20** · **5.21** · **5.24** · **5.25** · **5.26** |

Plus the **engine hazards** from `ENGINE-NOTES.md`, reconciled as OPEN and not addressed: the
`SHUTDOWN`-time `cameras.main` guard · `BaseTween.destroy()` running neither callback (**and the
`hud-gear-pop` fake that re-implements the contract it tests**) · `TilemapGPULayer`'s no-op Canvas
renderer · WebGL-only tint under a live Canvas fallback. Only **`setTintFill`** was reconciled; its
source-text gate is **not written**.

### Reached, classified, deliberately not fixed

| item | state |
|---|---|
| **1.4** body starting inside a solid | **RE-AFFIRMED non-fix** *(C11)*, with the player/enemy coupling made executable in `overlap-escape-parity.test.ts`. The paired change is real risk and was not attempted. |
| **2.2** `brass-courier/fall` judders | **OPEN.** 74 px frame-to-frame height spread. The jump half of C1 was re-shot and passes G6; **the fall was not.** |
| **2.7** `SENTRY_MUZZLE` | **RE-AFFIRMED non-fix, measured** — the fire pose has no barrel to measure. Blocked behind 3.10's re-shoot. |
| **3.2** own strike extends i-frames | **RECORDED** with a written ruling and a gate pinning current behaviour. |
| **3.9** hitstun knob reads 6, lock is 5 | **OPEN, already documented.** `movementLock.ts:31-37` derives it in full; the code is consistent and the defect is naming only. Deprioritised. |

### Reached and left open

**2b.4** WCAG contrast — *the sampling method still is not written down, and that is the blocker, not
the number* · **2b.5** flyer stacking (no stagger added) · **2b.6** DPR ≠ 1 never tested · **2b.7**
camera shake exposes up to 9.6 px of raw background · **3.1** shake and squash drawn a tick apart ·
**3.3** particle tints never read by eye · **3.4** `HUD_PLATE` / `HUD_SLOT` by eye · **3.5** footstep
phase after a wall pin (*"closed by 2.3"* — **believed closed, never verified**) · **3.6** no
level-complete sting (needs fal spend **and** a 400-line file split first) · **3.7** a restart
preserves an in-flight flyer · **3.10** `brass-sentry/fire` discharge (separate spend) · **3.12** the
judder probe's outcome never recorded · **3.13** `dropCastShadow`'s height guard · **3.8(b)** the
counter sitting 2–4 px high — *silently omitted from 3.8's fix and never recorded until the S.7 gate
owner found it*.

### Owed from the gate itself

- **The behavioural audio e2e.** The bed-retirement gate that shipped is source-text; the adopt path
  (`retireCurrent()` then `startBeds()` with a predecessor's beds live) has **no test**.
- **The scavenger snap-back.** Released past `patrolMax`, a scavenger clamps position in one tick and
  can cross a wall. Plausible, unverified, and the existing gate's fixtures cannot see it.
- **`dev-guard-census` counting statements, not lines.**
- **`globalSetup.ts`'s duplicate port constant.**
- **`enemyTuning.ts` / `PlaygroundScene.ts`** still describing `releaseRadius` as gone, and the
  Playground still able to drag `detectRadius` past it on a live scavenger.
- **The banner's `y`**, a second hand-typed derivation of the plate's bottom edge.
- **`GameScene.ts`'s seventh extraction.** It hit the 400-line ceiling four times in one session.

### S.9 — the `play`-owned criteria, all UNRUN

**No agent can close these and I did not.** Each needs hands on the keyboard with `playwright-cli`,
and a clip kept in `docs/evidence/`:

- **B3's refusal-after-boot** — settled by reading a green test, not by watching the screen.
- **C1's jump-vs-idle height**, by eye rather than by ratio.
- **3.3's spark colour** — *"brass-on-steel rather than generic orange"*.
- **3.12's judder probe.**
- **The sentry coverage question this gate raised**: three sentries lost their downward shots to a
  correct fix. Whether the levels were authored assuming those shots landed cannot be answered from a
  number.
- **Every UI reading at 852×480 and DPR 2** the S.7 owner listed and could not take: banner legibility
  and wrap count, the flyer smear, the 2–4 px counter offset, letterbox symmetry at DPR 2.

---

## Criteria verdicts

**A session with a failing or unrun criterion is reported failing, never as done.**

| # | criterion | owner | verdict |
|---|---|---|---|
| S.0 | Every item reconciled before implementation | `code-reviewer` ×2 | **FAIL** — 24 of 73 never classified, the summary under-reported it 2×, and four rows went stale about this session's own work. Fixed where found; the 24 remain. |
| S.1 | Every item fixed / re-affirmed / already-fixed / named as not reached | `qa-expert` ×2 | **FAIL when run, now PASS** — the four silent absences (1.2, 1b.1, 1b.6, 2.7) are recorded and the not-reached list above names every remaining item individually. |
| S.2 | Every gate watched failing with the mutation the plan names *(C1, C12)* | `qa-expert` ×2 | **FAIL when run, now PASS** — two gates could not go red; both mutations were run, both gates repaired, both re-watched red. |
| S.3 | Every fix at the root | `code-reviewer` ×2 | **FAIL when run, now PASS** — the five hard cases (gear, projectile, aggro, hit-stop, `goalReached`) are genuinely at the root; the two failures were a missing consumer gate and the false-APPLIED `player.ts`. |
| S.4 | No unsigned balance change or ruling reversal | `code-reviewer` ×2 | **PASS with a caveat.** All three (B5, B7, C3) carry owner rulings. The caveat is real: B5's ruling lived **only in a commit message** until this gate, and the ruling's own file still contradicted it for C3. |
| S.5 | Mechanical non-negotiables | `—` | **PASS** — no dependency, 8 `__game` fields, tick contract byte-identical, boundary intact under `test:sim-isolated`. |
| S.6 | No perf regression; any bound confirmed on a held-out set | `performance-engineer` ×2 | **PASS as static analysis, with the limit stated.** No perf bound was touched at all. Neither brief could measure; both flagged the uncapped `O(projectiles × solids)` as a ceiling for a sixth level. **The interleaved A/B they asked for was not run.** |
| S.7 | UI at 852×480 and DPR 2 | `ui-ux-tester` ×2 | **FAIL** — 2b.5, 3.8(b), 5.20 and DPR 2 all remain open, and every reading that needs a real browser is unrun. |
| S.8 | Gear counter meets WCAG AA, method written down | `accessibility-tester` ×2 | **FAIL** — 2b.4 not reached. Both briefs' numbers ignore the load-bearing stroke, so the *method* is still the blocker, exactly as the item says. |
| S.9 | Every by-eye defect closed by eye | `play` | **UNRUN** — human only. |
| S.10 | Full sweep, counts read positively | `—` | see the table above. |
| S.11 | Codex plan review | `codex` | **PASS** — 7 findings, 7 applied. ⚠️ **The write-up in `docs/reviews/` is owed** — the S.0 owner found neither `-plan.md` nor `-impl.md` exists, and every prior session committed both. |
| S.12 | Codex implementation review | `codex` | **PASS** — 7 findings; 2 blockers and 2 highs applied, 2 recorded with reasons. ⚠️ **One of them, Y7, was recorded APPLIED and was not** — see the blocker above. |
| S.13 | What was not covered, named individually | `—` | **PASS** — above. |

**Four criteria FAIL and one is UNRUN. The session is reported FAILING**, with every fix that did land
recorded and gated.
