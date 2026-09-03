# QA log — the gate-art + gate-entry session

← [QA-LOG.md](../QA-LOG.md) · plan review:
[reviews/session-gate-art-and-entry-plan.md](../reviews/session-gate-art-and-entry-plan.md) ·
impl review: [reviews/session-gate-art-and-entry-impl.md](../reviews/session-gate-art-and-entry-impl.md)

**Branch `session-gate-art-and-entry`, off `main` at `3affbf8`. Opened 2026-08-19.**

A scoped follow-up on Phase 8's exit, not Phase 9. Two deliverables: the generated gate art
that replaces `goalLayer.ts`'s grey box, and a scripted run-in that replaces "touched the
gate" with "entered the gate".

## This log, split into parts

**This log reached 1055 lines.** On 2026-09-03 it was split into three flat siblings, per
CLAUDE.md §6 — `docs/qa/` splits into **flat siblings**, never a subdirectory, because
`tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively.

| Part | What is in it |
|---|---|
| [02 — the findings](phase-08-gate-entry-02-findings.md) | the Codex plan review, the gate-owner agents, G.7b's frame budget, and the Codex implementation review |
| [03 — the gate and the hands-on runs](phase-08-gate-entry-03-gate-and-hands-on.md) | the criterion table, all five levels on the grey box, the screenshots, G.4b, the real-art re-run, and the gate-height defect nine machine gates called perfect |
| [04 — the red proofs and what came after](phase-08-gate-entry-04-red-proofs.md) | every new gate watched failing, the 400-line exemption, the decisions and non-fixes, and G.7b's 2026-08-22 replacement |

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

