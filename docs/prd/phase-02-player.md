# Phase 2 — Player controller + Character Playground

← [PRD spine](../PRD.md) · prev: [Phase 1](phase-01-boot.md) · next: [Phase 3](phase-03-tilemap.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Grey-box movement that feels good: run, jump, coyote time, jump buffering. Plus **PlaygroundScene**,
a dev-only scene with live-tunable movement parameters. **No art.** Primitives only.

### 2. Required skills
`input-keyboard-mouse-touch` · `game-object-components` · `time-and-timers` ·
`e2e-playwright-testing` (specs) · `playwright-cli` (drive the running game)
**Always:** `superpowers:executing-plans` · `superpowers:test-driven-development` ·
`superpowers:systematic-debugging` · `superpowers:verification-before-completion`
**Not `physics-arcade`.** Arcade Physics is deliberately unused — `Body.velocity` is px/**second**,
integrated with a delta inside `World.step`, which is the exact multiply vault 2.1 forbids, and it
lives in `phaser`, which vault 1.1 forbids `src/sim/` importing. There is no `physics` block in
`gameConfig`. See CLAUDE.md § Engine gotchas.

### 3. Vault-in
**2.1** integer ticks only · **2.2** numbered, authoritative `tick()` step order · **2.3** seeded
xorshift32, sampled once per tick, every roll gated on `chance > 0` · **2.4** input snapshot is a
mutable working copy the batch consumes from — reusing it replays a press, clearing on "a tick ran"
drops it · **2.5** never reconstruct an edge from frame-to-frame comparison; emit per-tick booleans ·
**2.6** every state has exactly one door · **2.7** a temporal-invariant test must span the window —
a one-tick fixture cannot distinguish "at most once" from "every time" · **2.8** derive expected
values from the live knob, with a floor **and** a ceiling · **2.10** collision boxes local, `+x`
forward, `+y` up from feet, one `toWorld` · **2.11** `scale` a required constructor arg; never scale
velocities · **2.12** pull render decisions out of scenes into engine-free modules · **2.14** compute
jump apex with the **discrete** integrator, not `v²/2g` — that error was 7.4px · **A6** sweep every
Playground knob and confirm the number moves

### 4. Codex plan review
**Runs now, before any code.** Invoke **`/codex:rescue --wait --fresh`** with the review-1 prompt from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol), naming this file.
Save verbatim to `docs/reviews/phase-02-plan.md`, then append the triage. Review 2 uses `--wait --resume`.

Ask Codex in particular: **the tick step order in `tick.ts` is the contract Phase 5's combat timing is
expressed against — which ordering decision here will be expensive to reverse then?** And: **which of
these unit tests would still pass if the behaviour it names were deleted?**

### 5. Deliverables
`src/sim/tick.ts` · `src/sim/player.ts` · `src/sim/input.ts` · `src/sim/rng.ts` · `src/sim/types.ts` ·
`src/render/playerView.ts` · `src/scenes/PlaygroundScene.ts` · `src/scenes/GameScene.ts` ·
`tests/unit/player-movement.test.ts` · `tests/unit/coyote-time.test.ts` · `tests/unit/input-latch.test.ts` ·
`tests/unit/rng.test.ts` · `tests/e2e/phase-02-movement.spec.ts`

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 2.1 | Hold Right → x increases monotonically | e2e via `__game` | e2e |
| 2.2 | Jump apex within ±2px of the **discrete-integrator** prediction | unit | `voltagent-qa-sec:qa-expert` |
| 2.3 | Coyote time fires within its window and **not** outside it — fixture spans ≥ 2× the window | unit *(2.7)* | `voltagent-qa-sec:qa-expert` |
| 2.4 | Jump buffer: press before landing still jumps; press too early does not | unit | `voltagent-qa-sec:qa-expert` |
| 2.5 | Deleting any latch condition turns a test **red** — verified by doing it | mutation *(C1)* | `voltagent-qa-sec:qa-expert` |
| 2.6 | Every Playground knob moves an observable output | sweep *(A6)* | `voltagent-qa-sec:qa-expert` |
| 2.7 | Sim suite still runs with Phaser uninstalled | command | — |
| 2.8 | Feel check in browser: weighty, responsive, no input drops | `playwright-cli` + hands-on *(C4)* | play |
| 2.9 | No file > 400 lines; diff reviewed; adversarial pass | `voltagent-qa-sec:code-reviewer` ×2 | `voltagent-qa-sec:code-reviewer` |
| 2.10 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-02-plan.md` | — |
| 2.11 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-02-impl.md` | codex |

**Regression set:** Phase 1 criteria 1.1–1.7, `phase-01-boot.spec.ts`.

### 7. Vault-out
The tick step order that turned out to be load-bearing. Whether the input-snapshot rule caught a real
double-press. Coyote/buffer values that actually felt right, with the discrete-integrator apex numbers.

### 8. Demo
A grey box runs and jumps with good feel. A dev key opens the Playground; sliders change the feel live;
every slider visibly does something.
