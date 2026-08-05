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

**Tech stack:** Phaser 4.2.1 · TypeScript · Vite · vitest · @playwright/test · Tiled · fal.ai via `genmedia`.

---

## The phases

| # | Phase | Document | Gates on |
|---|---|---|---|
| 1 | Boot | [phase-01-boot.md](prd/phase-01-boot.md) | — |
| 2 | Player controller + Character Playground | [phase-02-player.md](prd/phase-02-player.md) | 1 |
| 3 | Tiled → Phaser tilemap + Element Editor | [phase-03-tilemap.md](prd/phase-03-tilemap.md) | 2 |
| 4 | fal art production + Character Gym | [phase-04-art.md](prd/phase-04-art.md) | **3** (grid size) |
| 5 | Enemies, hazards, combat + Enemy Gym | [phase-05-combat.md](prd/phase-05-combat.md) | **2** (tick contract) |
| 6 | Collectibles, HUD, steampunk UI chrome | [phase-06-hud.md](prd/phase-06-hud.md) | 4, 5 |
| 7 | Audio | [phase-07-audio.md](prd/phase-07-audio.md) | 5 |
| 8 | Level design and progression | [phase-08-levels.md](prd/phase-08-levels.md) | 3, 5, 6 |
| 9 | Polish, juice, particles | [phase-09-polish.md](prd/phase-09-polish.md) | 8 |
| 10 | Build and ship | [phase-10-ship.md](prd/phase-10-ship.md) | everything |

### Phase dependency notes

- **Phase 3 blocks Phase 4** — the tile grid cell size must be published before art is generated
  against it.
- **Phase 2 blocks Phase 5** — combat timing is expressed in the tick contract from Phase 2.
- **Phase 4's 4a blocks 4b** — the hero-asset readability check gates the batch spend.
- **Phases 7 and 9 are independent** of each other and could swap if needed.
- **Phase 5 onward runs `performance-engineer`**; **Phase 6 onward runs `ui-ux-tester`**.

---

## Global Constraints

Every task in every phase inherits these. Copied verbatim from the locked decisions.

- **Dependencies are frozen at:** runtime `phaser@4.2.1`; dev `vite`, `typescript`, `vitest`,
  `@playwright/test`. **Anything else requires explicit approval — STOP and ask.**
- **`src/sim/` imports nothing from Phaser.** Mechanical test: the sim test suite must run with Phaser
  uninstalled. *(LESSONS-APPLIED 1.1, blocker)*
- **Every duration is an integer count of 60 Hz ticks. Every distance is pixels.** Never a float of
  seconds, never a `deltaTime` multiply inside the sim. *(2.1, blocker)*
- **No source file exceeds 400 lines** without a written one-line justification in `QA-LOG.md`.
- **Grey-box before art.** No fal spend on a feature whose mechanics are not already playable.
- **All art via `genmedia`**, following [STYLE.md](STYLE.md). Zero tutorial assets, zero stock assets.
- **Before any phase that generates, re-read [FAL-MODELS.md](FAL-MODELS.md)** — every endpoint's
  schema, price and gotchas — **and re-run `genmedia schema` on the endpoints it names.** A schema in
  a document is a snapshot; upstream endpoints change under us.
- **Every generation logged** to [GENERATION-LOG.md](GENERATION-LOG.md): model, prompt, seed, cost,
  path, kept/discarded.
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

⚠️ **Operational note, learned at Gate 7:** the first invocation failed with
`CreateProcessAsUserW failed: Access is denied` — Codex's own Windows sandbox failing to spawn — and
reported that it had read **zero** files. **It said so rather than inventing findings, which is the
correct behaviour and is exactly what to check for.** A retry succeeded. If a review returns a
grounding complaint, re-run it; **do not accept a review that could not read the repository, and
never record its silence as a pass.**

### Review 1 — the plan, before any code

Runs after vault-in and skill invocation, **before the first line of implementation.**

```
/codex:rescue --wait --fresh Review the plan in docs/prd/phase-NN-<name>.md against this
repository. Read first: docs/PRD.md (global constraints), docs/FAL-MODELS.md (if this phase
generates), docs/LESSONS-APPLIED.md (the vault items this phase cites), docs/QA-LOG.md (what
earlier phases actually found), and docs/reviews/ (what earlier phases were warned about).

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
- Does any file exceed 400 lines without a justification in docs/QA-LOG.md?
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

## File structure

Locked now so decomposition decisions are not made ad hoc later.

```
src/
  main.ts                     entry point; boots Phaser, nothing else
  game/
    config.ts                 GameConfig: renderer, scale, pixelArt, FPS
    constants.ts              TICK_HZ, TILE_SIZE, world constants
  sim/                        ← ZERO Phaser imports, ZERO clock, ZERO Math.random
    tick.ts                   numbered tick step order; the contract
    player.ts                 movement state machine
    input.ts                  input snapshot + consumption
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
levels/                       Tiled .tmj sources
docs/
  PRD.md                      this file — the spine
  prd/                        one document per phase
  reviews/                    Codex review outputs, one pair per phase
  FAL-MODELS.md               every fal endpoint: schema, price, gotchas
  STYLE.md  ASSET-PIPELINE.md  LESSONS-APPLIED.md  SOURCE-ANALYSIS.md
  GENERATION-LOG.md  QA-LOG.md
```

---

## The `window.__game` surface

Fixed in Phase 1, because every later e2e spec depends on it. Read-only, dev build only, stripped
from `dist/` — and Phase 10 verifies its absence.

```ts
{ sceneKey: string; tick: number; player: { x, y, vx, vy, state } | null;
  score: number; health: number; levelId: string | null }
```
