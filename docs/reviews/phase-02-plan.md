# Phase 2 — Codex plan review (review 1 of 2)

**Ran:** 2026-08-06, before any code was written.
**Invocation:** `/codex:rescue --wait --fresh`, first attempt — carrying the `node_repl` /
`fs.readFileSync` instruction from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** [phase-02-player.md](../prd/phase-02-player.md) and the execution plan at
`C:\Users\royko\.claude\plans\docs-prd-phase-02-player-md-let-s-conti-luminous-cookie.md`, against
[PRD.md](../PRD.md), [LESSONS-APPLIED.md](../LESSONS-APPLIED.md), [QA-LOG.md](../QA-LOG.md),
[phase-01-plan.md](phase-01-plan.md), [phase-01-impl.md](phase-01-impl.md),
[phase-03-tilemap.md](../prd/phase-03-tilemap.md), [phase-05-combat.md](../prd/phase-05-combat.md),
and the Phase 1 source and test files.
**Repository state at review time:** Phase 1 merged to `main`. `src/sim/` contained only `index.ts`;
`src/render/` did not exist; `gameConfig.scene` was `[BootScene]`; `window.__game.player` was `null`.

The execution plan lives outside the repository. Codex read it with `fs.readFileSync` without
difficulty, which is consistent with Phase 1's finding that the `node_repl` route restores file
reading. **The shell tool was not used and could not have been** — see the operational note in
PRD.md.

---

## The report, verbatim

### 1. Deliverables not required by §1's goal

- **Low — `src/sim/rng.ts` and `tests/unit/rng.test.ts`.** The goal covers run, jump, coyote time,
  buffering, and live tuning, but no random behaviour. RNG is infrastructure for a later phase, not
  required by this phase's stated feature. `docs/prd/phase-02-player.md:7-9, 37-41`; plan `:98-104`

### 2. Acceptance criteria that could pass while the feature is broken

- **High — 2.1** observes only `window.__game.player.x`; nothing in the criterion forces the render
  sync to actually happen or the movement to be non-trivial. `docs/prd/phase-02-player.md:43-47`;
  plan `:112-114, 216-219`
- **High — 2.2–2.4** are unit-only sim checks; no acceptance criterion drives a real jump in the
  browser, so the keyboard→sim bridge could be broken while these stay green.
  `docs/prd/phase-02-player.md:47-50`; plan `:102-103, 112-114, 218-225`
- **High — 2.6** proposes a unit sweep over `Object.keys(TUNING)` rather than exercising the actual
  `PlaygroundScene` UI, so the scene itself could be non-functional while the criterion passes.
  `docs/prd/phase-02-player.md:51-53, 64-66`; plan `:103-104, 114-116, 223-225`

### 3. Cited vault item claimed but not satisfied

- **High — vault 2.3**: requires seeded RNG sampled once per tick inside the fixed loop. The plan's
  12-step tick order contains no RNG sampling step at all — it only implements standalone RNG helper
  functions. `docs/LESSONS-APPLIED.md:154-156`; plan `:59-80, 98-104`

### 4. Dependency no earlier phase produces

- **Medium — a collision world (ground/ledge/landing surface)**. Phase 1 registers only `BootScene`
  and leaves `player` null; the real tile collision layer is Phase 3's job. The plan works around this
  with its own static rectangle list. `src/game/config.ts:14-36`; `src/debug/globals.ts:47-56`;
  `src/sim/index.ts:8-14`; `docs/prd/phase-03-tilemap.md:7-11`; plan `:33-35`

### 5. Single most likely subtle shipping error

- **High — off-by-one coyote window from decrement-before-use ordering.** Coyote is armed at step 9;
  the following tick's step 2 decrements before step 6 tests `coyote > 0`, so a configured value of N
  yields only N−1 usable ticks. Jump buffering is armed earlier (step 3, after the decrement), giving
  the two windows different endpoint semantics — and neither the plan nor criterion 2.3 states whether
  the arming tick counts. plan `:66-79, 182-190`; `docs/LESSONS-APPLIED.md:169-176`

### 6. Expensive Phase 5 ordering reversal

- **High — placing the state-transition door at step 10, after integration/collision.** A hit window
  activated there can't affect that same tick's step 7 collision resolution; knockback mutating
  velocity there also delays physical effect to the next tick. Step 2 ("decrement every timer/latch"
  before any hit test) means an i-frame/cooldown at value 1 expires before that tick's combat
  resolves. Because vault 2.11 forbids scaling velocities, this one-tick offset can't be papered over
  later, and reversing the order after combat art is locked would shift the contact frame relative to
  the active window or change `simTicks`, altering the required `renderFrames × TICK_HZ / simTicks`
  derivation. plan `:66-79`; `docs/LESSONS-APPLIED.md:166-172, 185-187`;
  `docs/prd/phase-05-combat.md:12-19, 62-67`. Note: `src/sim/tick.ts` doesn't exist yet, so this is an
  assessment of the plan's proposed order, not implemented code (`src/sim/index.ts:8-14`).

### 7. Named unit tests that would still pass if the behaviour were deleted

- **High — `knob-sweep.test.ts`**: derives its obligations from `Object.keys(TUNING)`, so deleting a
  knob and its behaviour together removes the corresponding test iteration — stays green,
  contradicting the vault A6 purpose it cites. plan `:129-137, 223-224`; `docs/LESSONS-APPLIED.md:36`
- **High — `rng.test.ts`**: tests only the standalone RNG functions; since no per-tick sampling exists
  in the tick order, this test can pass while the vault-2.3 fixed-loop behaviour is entirely absent.
  plan `:64-80, 98-104`; `docs/LESSONS-APPLIED.md:154-156`

### What the reviewer could not check

- Not checked: `player-movement.test.ts`, `coyote-time.test.ts`, `input-latch.test.ts` — these files
  don't exist yet and the plan doesn't specify their assertions in enough detail to make the same
  claim.

*(Preserved per vault 9.3 — a gate's blind spots are part of its result. Two further limits are stated
inline above rather than in this section: the question-6 answer assesses a proposed order, not code,
because `src/sim/tick.ts` did not exist; and every finding is file-evidence only, since the shell tool
is unusable on this machine. All findings are re-verified locally as they are implemented, per vault
**C6** — symptom as evidence, cause as hypothesis.)*

---

## Triage

Every finding is **applied**, or **rejected with a one-line reason** *(vault C11)*.

| # | Finding | Sev | Disposition |
|---|---|---|---|
| F1 | `rng.ts` / `rng.test.ts` are not required by §1's goal — no random behaviour in this phase | Low | **Rejected**, and F3 is why. §5 of the phase doc lists `rng.ts`, and vault 2.3 is a blocker scoped to Phase 2, so the PRD wins on a locked decision. F3 then gives it a real consumer inside the tick order, so it is no longer dead infrastructure — the two findings resolve each other. |
| F2a | 2.1 reads only `player.x`; nothing forces render sync or non-trivial movement | High | **Applied.** The e2e brackets horizontal distance with a floor **and** a ceiling derived from `TUNING.runMax` *(2.8)*, so a single pixel of drift no longer satisfies "increases monotonically". Render sync is covered by the `playerRenderDesc` unit test plus the hands-on 2.8 feel check: the `__game` surface is closed at nine fields by a Phase 1 Codex ruling and cannot carry a rendered position. |
| F2b | 2.2–2.4 are sim-only; the keyboard→sim bridge could be wholly broken while green | **High** | **Applied.** New e2e test drives a real `Space` press and asserts `player.y` rises then returns and `vy` changes sign — exercising `keydown-` latch → snapshot → `advance()` end to end. |
| F2c | 2.6 sweeps `TUNING`, not the actual `PlaygroundScene`, which could be non-functional | High | **Applied.** New e2e test adjusts a knob through the scene's own arrow-key UI and asserts the observed movement changes. |
| F3 | **Vault 2.3 claimed but not satisfied** — the 12-step order had no per-tick RNG sampling at all | **High** | **Applied.** New **step 1** of `tick()`: sample the seeded stream exactly once into `world.tickRoll`, the only place it advances. `rollChance(world, chance)` reads that sample and returns false immediately on `chance <= 0`, so a zero-probability roll cannot perturb the shared stream. |
| F4 | The collision world is a dependency no earlier phase produces | Medium | **Acknowledged, no change.** Codex itself notes the plan already works around it with a static rect list, which was the user's explicit decision before planning. Phase 3 swaps the source of the rects without touching the resolver. |
| F5 | **Off-by-one coyote window**: decrement-before-use gives `N−1` usable ticks, and buffer/coyote have different endpoint semantics from the same knob | **High** | **Applied — the highest-value finding of the review.** Decrementing timers replaced by incrementing counters tested `counter < knob` — one mechanism for both windows, so their endpoint semantics cannot diverge. The inclusive definition is written verbatim into the `tick.ts` header, and criterion 2.3's test asserts **both** endpoints against the live knob: accepted at offset `N−1`, rejected at offset `N`. |
| F6 | State door at step 10 (after integration) delays hit windows and knockback a tick; decrementing at step 2 expires an i-frame of 1 before combat resolves | **High** | **Applied.** State transition moved before integration (now step 4); **step 5 reserved by number for Phase 5 combat**, so combat inserts without renumbering the contract; counter advance moved to step 13, after every test of it. Knockback therefore reaches the same tick's movement, and is written as a velocity outside the scale seam per 2.11. |
| F7a | `knob-sweep.test.ts` stays green when a knob and its behaviour are deleted together | High | **Applied.** The sweep stays exhaustive-by-construction but now also pins the roster with an explicit literal list, so removing a knob turns the suite red and adding one forces a deliberate edit. |
| F7b | `rng.test.ts` passes while 2.3's fixed-loop behaviour is entirely absent | High | **Applied.** It asserts `advance(world, …, n)` moves the stream exactly `n` times and that `rollChance(world, 0)` leaves it untouched — not merely that `nextU32` works in isolation. |

**Applied: 8. Acknowledged without change: 1. Rejected with a reason: 1.**

## Was the review worth its cost?

Yes, on two findings that no amount of internal consistency checking would have surfaced.

**F5** is the one that would have shipped. The plan's step order was internally coherent and every
step was individually defensible; the defect lived in the *relationship* between two steps written
four lines apart, and it would have presented as "coyote time feels a frame short" — a tuning
complaint, not a bug report. Worse, criterion 2.3 as written would have passed, because a test
asserting "fires within its window" does not notice that the window is one tick narrower than the
knob says. This is vault **2.8** exactly: a floor without a ceiling.

**F3** is the review catching a claim the plan made about itself. The plan cited vault 2.3, listed
`rng.ts` as a deliverable, and then specified a tick order with no sampling step in it — so the vault
item was addressed on paper and absent in the design. That is the failure mode `LESSONS-APPLIED.md`'s
preamble names: *"mark it applied with evidence"*, where the evidence was never checked against the
thing it claimed about.

Note also that **F1 and F3 point in opposite directions on the same file**, and F3 is ranked higher.
Taken alone, F1 would have removed `rng.ts`; the correct resolution was to give it the consumer it was
missing. This repeats the Phase 1 F2/F7 pattern almost exactly — the reviewer surfaces both the
symptom and its opposite, and the triage has to pick. *(Vault C6: symptom as evidence, cause as
hypothesis.)*
