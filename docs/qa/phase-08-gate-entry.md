# QA log — the gate-art + gate-entry session

← [QA-LOG.md](../QA-LOG.md) · plan review:
[reviews/session-gate-art-and-entry-plan.md](../reviews/session-gate-art-and-entry-plan.md) ·
impl review: [reviews/session-gate-art-and-entry-impl.md](../reviews/session-gate-art-and-entry-impl.md)

**Branch `session-gate-art-and-entry`, off `main` at `3affbf8`. Opened 2026-08-19.**

A scoped follow-up on Phase 8's exit, not Phase 9. Two deliverables: the generated gate art
that replaces `goalLayer.ts`'s grey box, and a scripted run-in that replaces "touched the
gate" with "entered the gate".

---

## Baseline, taken before the first change

| | |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **112 files · 1882 tests · 0 failed** |
| HEAD | `3affbf8` |

Recorded because a later count only means something against a recorded one — the trap
[QA-LOG.md](../QA-LOG.md) records from session 8, where a sweep was written down *after* the
edits it claimed to describe.

---

## The measurements this session is built on

Read off the repository, not off prose *(the CLAUDE.md rule: `src/game/constants.ts` is the
authority)*.

| Fact | Value | Source |
|---|---|---|
| Goal rect, levels 01–04 | `192 × 288` at `y 1632` | the shipped `.tmj` files |
| Goal rect, level 05 | `192 × 288` at `y 1728` | `level-05.tmj` |
| Floor top under every goal | `goal.y + goal.h` **exactly** | solids at 1920 ×4, 2016 |
| Player box | `132 × 288` world px | `PLAYER_BOX` 22×48 × `RENDER_SCALE` 6 |
| `runMax` | **9.0 px/tick** | `FOOT_PX_PER_FRAME.run` 18.0 / `LOCOMOTION_TICKS_PER_FRAME` 2 |
| `walkMax` | 4.5 px/tick | same |

### 🔴 The consequence that shaped the whole design

**The player box is exactly as tall as the goal rect, and the goal sits flush on the floor.**
So full containment is satisfiable — `top === goal.y` and `bottom === goal.y + goal.h` — but
**only while the player stands on that floor**. One pixel airborne is not contained.

Horizontally there is 60 px of slack, 30 each side. Entering from the left, first overlap is
at `player.x > goal.x − 66` and containment at `player.x ≥ goal.x + 66`: **132 px of travel,
≈ 15 ticks at `runMax`**. The gate centre is 162 px, ≈ 18 ticks. `GOAL_ENTRY_TICKS = 20` is
chosen so the **tick count**, not the geometry, is what binds completion — which is what makes
"assert which tick" a deterministic test rather than a race.

Codex's plan review confirmed independently that grounded play reaches that exact equality
reliably: `resolveCollisions` snaps `player.y` to `solid.y`, and the game has no slopes and no
moving platforms.

---

## Findings

### Codex plan review — 12 findings, 10 applied, 2 recorded

Full report and triage table in
[reviews/session-gate-art-and-entry-plan.md](../reviews/session-gate-art-and-entry-plan.md).
**Three were blockers**, and all three were re-verified locally before being acted on:

- **C1** — a player killed during the run-in respawned with the counter still armed and input
  still locked, auto-running from spawn and unable to jump. **The level becomes unwinnable.**
  Level 1 has a scavenger patrol ending 96 px from its exit; level 5 a sentry 384 px from its
  own. Fixed by a cancel in `stepGoalEntry`.
- **C2** — the planned attack lock passed a spread clone to `stepCombat`, so
  `consumeAttackPress` cleared the *clone* and left the real snapshot's edge latched forever.
  Vault 2.4 exactly. Fixed by consuming off the real snapshot.
- **C3** — the planned unit fixture could never have reached the gate: `createWorld` defaults
  `bounds` to the 1920×1080 grey-box extent and step 9 clamps a player at `x 8640` back inside
  it. The test would have failed for a reason unrelated to the feature.

Two findings the plan's own red proofs depended on were also wrong and are worth repeating
here, because both are the shape this project keeps paying for:

- **C5** — the mutation for Task 2's red proof grepped `"height":288`. The shipped `.tmj`
  writes `"height": 288`, **with a space**. Verified locally: `grep -c` returns **0** for the
  planned pattern and **6** for the real one. The mutation would have changed zero bytes and
  the "watched it go red" claim would have been a lie. *(C12 — this is exactly why "content
  changed AND the original count dropped by one" is the rule, and not "the count is now zero".)*
- **C6** — the shipped-art gate sampled 64×96 px, **11 % of the image**. An opaque dark slab
  with no doorway around it passed every machine gate. Widened, and a `play`-owned by-eye
  criterion (G.1b) added, because STYLE.md §5 already says the material rule is a local edge
  cue no whole-region metric can see.

### Gate-owner agents

_Recorded at Task 9._

### Codex implementation review

_Recorded at Task 10._

---

## The QA gate

| # | Criterion | Method | Owner | Status |
|---|---|---|---|---|
| G.1 | `goalIsGreybox()` false in all 5 levels; the gate renders at the goal rect | unit + e2e | `voltagent-qa-sec:qa-expert` | — |
| G.1b | **The art READS as a doorway with a dark opening** *(Codex C6)* | by eye, screenshotted *(C4)* | play | — |
| G.2 | Edge contact does NOT complete; the predicate fixture **and** the per-tick loop, both watched failing | unit | `voltagent-qa-sec:qa-expert` | — |
| G.3 | Containment DOES complete, at a named tick | unit | `voltagent-qa-sec:qa-expert` | — |
| G.4 | `run` plays from first overlap to completion; jump AND attack locked on the **sim** state; the attack edge is consumed | unit + e2e | `voltagent-qa-sec:qa-expert` | — |
| G.4b | **Dying during the run-in cancels it** — the respawned player is free *(Codex C1, blocker)* | unit + hands-on | `voltagent-qa-sec:qa-expert` + play | — |
| G.5 | Alpha reaches 0 over a tick-counted window; the curve has a red proof | unit + e2e | `voltagent-qa-sec:code-reviewer` | — |
| G.6 | No blink-out, no pop-back — all 5 levels, by hand | `playwright-cli` + hands-on *(C4)* | play | — |
| G.7 | No file > 400 lines; diff reviewed; adversarial pass; frame budget unchanged | `code-reviewer` ×2 + `performance-engineer` | — | — |
| G.8 | Codex plan review ran; every finding applied or recorded | [the review](../reviews/session-gate-art-and-entry-plan.md) | — | ✅ **12 findings, 10 applied, 2 recorded** |
| G.9 | Codex implementation review ran on the diff; every finding applied or recorded | [the review](../reviews/session-gate-art-and-entry-impl.md) | codex | — |

---

## Red proofs — every new gate watched failing *(C1)*, every mutation confirmed reverted *(C12)*

### `level-goal-fits.test.ts` — and the finding that Codex's "future-proofing" objection was wrong

**Mutation:** `level-01.tmj`'s goal rect height `288 → 240`, applied by editing the **parsed JSON**,
not by a text substitution.

🔴 **The planned text mutation would have changed zero bytes.** It grepped `"height":288`; the
shipped file writes `"height": 288`, with a space. Codex's plan review (C5) caught it and it was
verified here before anything ran: **6 matches for the real pattern, 0 for the planned one.** A
"watched it go red" record taken from that run would have been false — which is precisely why the
rule is *content changed AND the original count dropped by one*, and never *the count is now zero*.

| | |
|---|---|
| before | `grep -c '"height": 288'` → **6** |
| mutation landed | `cmp` reports the file differs → **yes** |
| after | **5** — dropped by exactly one, not to zero |
| gate red | `Tests 2 failed`, naming `level-01 is EXACTLY body-tall` and `level-01 has a solid whose top edge is flush with the exit bottom` |
| reverted | `git diff --quiet` clean → **byte-for-byte**; count back to **6** |
| green again | `Tests 95 passed` across both files |

**And the mutated level is genuinely unwinnable.** With the 240 px exit,
`level-completable.test.ts` fails on **all three seeds** (8201, 8202, 8203) — the solver plays the
real `tick()` over the real shipped bytes and can never finish. That retires Codex's C11 objection
(*"future-proofing, not current delivery"*) with evidence rather than argument: the failure this
ten-line file prevents is a shipped level that loads, validates, draws its door and cannot be
completed, and **no other gate in this repository sees it** — `level-goal.test.ts` passes it,
because one rect of positive size far from the spawn is all it ever asked for.

---

## The 400-line rule — one exemption, written before it was taken

`SIZE-EXEMPTION: src/sim/tick.ts lines=422`

**`src/sim/tick.ts` crosses the limit at 422 lines, up from 398.** The gate's own text says the
way past is *"to split the file or write the justification, in that order of preference"*, so the
split was attempted first and is recorded here as rejected, with the reason.

**What the +24 lines are.** The whole feature's footprint in this file: the widened-9d paragraph in
the contract header (8), the `entryLocked` cached read (3), the attack-edge consumption block (6),
the `dir` ternary gaining a branch (2), and one line each on steps 5, 7 and 9d. Roughly 11 further
lines were **moved out to `goal.ts`** while getting here — every one of them reasoning that
`goal.ts`'s own header already claims (*"the step in `tick.ts` is three lines and a pointer, and the
reasoning lives with the code that implements it"*). That was a real defect in the first draft, not
a line-count trick, and it is why this exemption is for 422 and not 445.

**Why it is not split.** This file is the numbered tick contract **and** the function that
implements it, and their co-location is the entire design premise — *"the code below is a numbered
list rather than a paragraph of arithmetic"*. The one extractable concern was already extracted:
`advance` moved to `advanceSplit.ts` in Phase 8 for exactly this reason, and that file's docstring
says so. The two remaining candidates were examined and both would **contradict a decision written
into this file**:

- **step 13's window advance** → `windows.ts`. Refused: step 13's own comment states that the
  guard in front of `advanceWindow` *"is the step-order rule above and stays here, with the
  numbered order that owns it"*.
- **step 4c's respawn** → `combat.ts`. Refused: the block states the decision is taken in `tick.ts`
  *"where the spawn point lives"*, and `combat.ts` deliberately imports no level data.

Splitting the contract header into a document was also rejected: CLAUDE.md's instruction is *"read
that file's header before changing anything in `src/sim/`"*, and its value is being in the file the
reader already has open.

**The ratchet moves 0 → 1** in `tests/unit/file-size.test.ts`, which is the deliberate act that
gate requires alongside this citation. Not one line of explanation was deleted to reach 422.

---

## Decisions and deliberate non-fixes

| | Decision | Why |
|---|---|---|
| **Tick contract** | Step 9d's **meaning** widened; nothing renumbered, inserted or lettered. | `tick.ts`'s header guarantees the numbering and the ordering. 9d already owned "the exit", and an exit you walk into for twenty ticks is still the exit. Codex's plan review was asked directly and ruled it not a substantive violation — the obligation is that the header text describe the widened semantics accurately, which it now does. |
| **Auto-run dead zone** | `dir` is 0 within one tick's travel of the centre. | Without it a 9 px/tick body oscillates around the centre forever. |
| **The foot-slide it costs** | For the last few ticks a fast entry plays `run` while standing still. **Accepted, not hidden.** | Alpha is ≤ 0.25 by then and the character is inside a dark opening. `ponytail:`-commented at the branch with its upgrade path (a decel ramp) named. |
| **`run`'s stride** | **Not retuned.** | It is documented as provisional and distrusted. If it reads wrong at gate scale that is *reported* — retuning it is a separate decision with its own foot-plant gate. |
| **`window.__game`** | No 9th field. | Closed at 8 by a Phase 1 Codex ruling. The e2e spec measures the sprite instead — what Phase 2 did when it wanted two fields it could not have. |
| **`level-goal-fits.test.ts`** | Kept, though Codex called it future-proofing. | It is the only guard against the exact-vertical-equality brittleness Codex itself confirmed. The failure it prevents makes a level unwinnable; the test is ten lines. |

---

## Open, for the owner

🔴 **The art-spend ceiling is recorded twice and the two disagree.** `PRD.md`'s Global
Constraints say **$50** (raised from $25 on 2026-08-16). `GENERATION-LOG.md` says
*"Running total after Phase 6: $47.61 of the **$55** ceiling."* This session's $0.15–$0.30 fits
under either reading, so it proceeds and names the contradiction rather than quietly picking a
winner. **Which number is current is the owner's call.**
