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
