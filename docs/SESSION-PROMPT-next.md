# Next session — §1a's cost bound, the narrowings this session recorded, then Tier 5

**Written 2026-08-25, at the end of the debts session.** `main` is at `7c04a63`, pushed.
**Not Phase 10.**

## 0. Read first

- [CLAUDE.md](../CLAUDE.md) §3 and §5 — the non-negotiables and the testing rules.
- [docs/TESTING-RULES.md](TESTING-RULES.md) — the evidence behind every §5 rule.
- [docs/qa/session-phase-09-debts-03-gate.md](qa/session-phase-09-debts-03-gate.md) — **the eleven
  recorded narrowings §1 below draws from, each with the reason it was not fixed.**
- [docs/reviews/session-phase-09-debts-impl.md](reviews/session-phase-09-debts-impl.md) — the Codex
  implementation review, and what the plan review missed.

**State:** five of Phase 9's six debts closed. Unit **2465 / 164 files**, e2e **130**, build
byte-identical, `test:sim-isolated` 2462 + 3 skipped.

> ⚠️ **The lesson that cost the most last session, and it is a process one.** It produced **two false
> "applied" dispositions**: Codex's PR-03 named destructuring explicitly and the log recorded it
> applied when it was not, and the tween-alias fix was applied to one of two rule families and logged
> as complete. Both were found by *later* reviewers, not by the person who wrote them.
> **A disposition of "applied" is a claim like any other — re-verify it against the code, not against
> the commit message.** When you read a table below saying RECORDED, that is trustworthy. When you
> read one saying APPLIED anywhere in `docs/`, check it.

---

## 1. What the debts session left open

### 1a — the combat-path cost bound. **The one real debt, and it may not be closable.**

Reported **NOT CLOSED** with measurements, not with an argument. Read
[`session-phase-09-debts-02-perf.md`](qa/session-phase-09-debts-02-perf.md) §Batch 7 and the header of
`tests/e2e/phase-09-combat.spec.ts` before touching it. The three findings:

1. **The shipped emitter caps pin a combat burst at 32 sparks / ~85 particles.** An 8× spark-burst
   mutation planted in `src/scenes/gameEffects.ts` left **both unchanged** — `atLimit()` drops the
   surplus. The combat path cannot be made to cost more from inside the game.
2. **At that population the cost is under the clock grid.** 8192 particles cost 4.1 ms on this GPU, so
   85 cost ~0.04 ms — below `performance.now()`'s 0.1 ms step. Per-event median delta: **-0.0000 /
   0.0000 / 0.2000 ms** clean, **0.0000 ms** mutated. *The statistic does not move at all.*
3. **The 22-39 ms worst combat frames are post-hit-stop tick catch-up**, not the burst — two to three
   orders of magnitude above anything 85 particles can cost.

**Closing it needs ONE of these, and each is a decision, not a repair:**

- an amplifier for the combat path that does **not** go through the emitter caps *(the only one that
  exists is a storm, and entry 43 is the record of a storm destroying admission ordering)*;
- a clock finer than 0.1 ms *(`performance.now()` is what the browser gives)*;
- **or the owner's decision that the post-hit-stop catch-up spike is the thing worth bounding** —
  which is a **different criterion** and needs its own approval. ⚠️ **STOP and ask; do not adopt it
  as a reinterpretation of 9.5.**

⚠️ *A statistic that does not order its own mutation cannot be fixed by moving the bound.* Re-bounding
what is there is not an option. **If none of the three is available, the honest outcome is to leave it
recorded** — it already is, with evidence, and that is worth more than a bound that cannot go red.

### The eleven narrowings recorded, not fixed

Each has a stated reason in `session-phase-09-debts-03-gate.md`. **Do not re-open one without reading
that reason** — several are deliberate and the bound IS the deliverable.

**Worth fixing if a session has room:**

- **D14 — `this.add.tween(config)`** is a real Phaser 4.2.1 entry point (`phaser.d.ts:26869` factory,
  `:28201` creator) that bypasses **9.3b, 9.3d, 9.2, 9.2b and 9.2c at once**. Nothing on the tree uses
  it and the **absence is pinned** by a committed test, so it is latent, not live. Closing it means
  resolving what `add` is bound to.
- **`storm<N>` is unrouted.** It is parametric, so it sits outside `NAMED_MUTATIONS`,
  `MUTATION_TARGETS` and `perf-mutation-routing.test.ts` — and it is the recorded red proof for **two
  of the four upper bounds** in `phase-09-perf.spec.ts`. Routing an unbounded family needs a different
  key than `Record<NamedMutation, …>`.
- **`SIM_MUTATORS` is a name list.** A new mutating export in `src/sim/` is invisible to the 9.2b
  argument rule until someone adds it by hand. ⚠️ **The self-maintaining version was considered and
  rejected for scope, not for correctness**: derive the set by parsing `src/sim/` for functions that
  write to their own parameters. That is the right fix and it is a real piece of work.
- **`blank()` has no regex-literal mode** — a lone apostrophe inside a regex blanks the rest of the
  file in the `'code'` view. Shared infrastructure used by many gates; needs its own red proofs.

**Recorded as narrowings — read the reason before reopening:**

- **D4** — `getTweensOf(o).forEach(t => t.destroy())`, `tweens.destroy()`, template-literal keys,
  `Reflect.get` all reach kill-by-target semantics under other names.
- **"Held" is satisfied by a dead local**, and 9.3c's teardown check matches any `.destroy()` on
  anything. An honest fix needs liveness analysis.
- **Sim handles are matched BY NAME, not by type** — a `World` parameter named `w` is invisible. By
  type needs a type checker, and TS 7 does not expose one to a test.
- **`MAX_PER_PARTICLE_WORK_MS` has no isolating mutation** and cannot have one; its red is never
  attributable to it alone. Reddening it needs the 8192-particle delta at ~24.6 ms, which also reddens
  the two bounds above it.
- **`light` combat events barely occur** (measured 0/0/0/1/2/3), because a scavenger's claw moves both
  hit stamps on one tick. The 1a gate asserts **two** of three classes and says so.
- **`raw.length` is observed stamp changes, not landed hits** — several hits inside one animation
  frame collapse into one observation. An exact count needs a tick-level queue on `window.__game`, and
  **that surface is closed at eight fields** by a Phase 1 Codex ruling. A ninth is a STOP-and-ask.
- **The REST phase-edge leak is measured, not eliminated.** `combatDrive` writes from a rAF callback
  that runs after the frame's sim ticks have drained. `restEventFrames` counts the leak per run.
- **The premise/bound classification table is hand-duplicated** between the perf spec's comment and
  the QA log with nothing syncing them. A lint would be a third copy.
- **`perf-mutation-routing`'s mention check is a raw string search** and cannot tell a live
  `if (mutation === '…')` from a stray comment. Disclosed in that test's own header.
- **The 9.2c `callbackCode()` holes** — an imported callback and a config passed as a variable both
  yield **zero** callback bodies; shadowing still hides a violation (file-wide, last-wins).
- **D1's remainder** — 9.1's *"not a tween"* half is carried only by `sim-boundary.test.ts`, so a
  freeze re-implemented scene-side as an `addCounter` writing `world.player.{x,y,vx,vy}` passes
  everything. `tests/e2e/effectShake.ts` does exactly that deliberately, as a test helper, which is
  why the scan reads `src/` only.

### Documentation that is now false

- ⚠️ **`docs/PRD.md` row 9 is stale.** It still says *"Owed forward: split `phase-09-perf.spec.ts` so
  four upper bounds are independently reachable · D9's `run: 8` wait · 9.3's two scan bypasses"* —
  **all three landed in `7c04a63`.** No lint checks that prose. One-line fix.

### What the gate round could NOT cover, and still cannot

**No agent ran Playwright** (one run at a time on this machine) and **no agent could plant a mutation
in a real `src/` file** (they shared a worktree lineage with the primary checkout). Every C1/C12
confirmation in that session is the primary session's own work. If you want independent reproduction
of a mutation proof, that is still owed and needs a different isolation strategy.

---

## 2. The remaining Tier-5 items — unchanged, none started

⚠️ **Re-confirm each is still open before fixing it.** In the 2026-08-23 session, **four of the ten it
examined were wrong about themselves**. **Run the mutation before believing the claim.**

### Measurement gates that can go false

- **5.2 — the GPU-ratio flake, and the data now cuts BOTH ways.** `phase-08-perf.spec.ts`. Previously
  *"level-05 costs 4.47× level-01 … Expected: ≤ 2"*, then 5.61× on 2026-08-24 — three failures, all in
  loaded full-suite sweeps, all passing in isolation minutes later. ⚠️ **It then PASSED in both full
  loaded sweeps of 2026-08-25** (130/130 twice). So it is **intermittent under load, not reliably
  load-triggered**, and a repair session now has five observations rather than three. The G.7b repair
  shape still applies: pair the observations, median the per-round **deltas**, keep the arms separate
  until the effect clears the timer grid.
  ⚠️ *A statistic that does not order its own mutation cannot be fixed by moving the bound.*
- **5.3 — Codex's algebra was accepted and never applied.** `phase-09-impl.md`: `k = 0.9001`, reported
  `1.034b` against a true `3.914b` — **3.79×**. The docstring was corrected; **the cost model and the
  `k = 0.9` floor were not.** Finish applying it.
- **5.9 — the knob sweep loses sensitivity when physics moves and blames the knob.** Happened three
  times in one session. Make it assert its **own** sensitivity.
- **5.21 — GPU cost is unmeasurable without `EXT_disjoint_timer_query`.** ⚠️ *"Recorded as unreachable
  twice and reachable both times."* **DO NOT soften into a skip.**

### Gates satisfiable by the wrong thing

- **5.4** — the verification is **done**; what remains is a **design decision and it is the owner's**.
  `DEV_FLEET_COUNT = 20` is a chosen multiple, **not a bound** — nothing in `src/sim/` or the level
  format caps concurrent enemies, so 9.5's *"max enemies"* rests on a dev constant. **Do not cap it
  unilaterally.**
- **5.5** — `sheetGates.mjs`'s G5 asks only whether contact falls *inside* the active window; it lands
  on the window's **last two ticks** — inside, and still the wrong frame to freeze.
- **5.16** — the hazard-width ceiling has **two conflicting figures**, and the two shipped 480 px runs
  are not flat crossings, so 480 is confirmed by nothing shipped.
- **5.17** — ⚠️ **RESTATED 2026-08-25; the item as written was FALSE.** It said the frame-0 guard's real
  failure mode, *a looping clip visibly frozen on screen*, *"was nominated as 'Playwright's job' and
  **no e2e took it**."* An e2e **did** take it: `tests/e2e/phase-05-combat.spec.ts:204` samples
  `sprite.anims.currentFrame` once per animation frame across a 90-frame window and asserts
  `distinctFrames > 1`. It runs live on the `chromium` project.
  **What is actually open is the weaker claim, R4** (`qa/phase-05-combat-09-session-11.md:173`,
  reconfirmed at `qa/phase-06-hud.md:475`): *the gate samples a patroller that cannot flap, and
  `distinctFrames > 1` is weaker than its title — a walk pinned to frames 0 and 1 passes on a 12-frame
  sheet.* The fix is to strengthen that assertion toward the sheet's real frame count, and to correct
  the now-stale docstring at `tests/unit/enemy-layer-catalog.test.ts:18-20`.
- **5.20** — **no gate checks spacing BETWEEN HUD elements.** Found once, by a human reading an
  evidence screenshot. Pairs with §4's 852×480 reading.
- ~~**5.26, remaining half**~~ — ⚠️ **STRUCK 2026-08-25. The item was STALE on both halves.**
  It said `hudGearPop.destroy()`'s **idle branch** has no fixture and is the common one (every resize),
  *"plus the wrong test file cited (C9)."*
  1. **There is no idle branch.** `src/scenes/hudGearPop.ts:130-136` is one unconditional path —
     `stopAndSettle()` — and its comment records the two-branch version being replaced precisely
     because the old one *"settled only when nothing was running and otherwise trusted `onStop`."*
  2. **The idle case has a fixture, and the fixture names this item.**
     `tests/unit/hud-gear-pop.test.ts:237-247`: *"destroy() with NOTHING running still settles — the
     common case on every resize … the branch is gone now and this is what says so."*
  3. **The "wrong test file cited" half resolves to nothing** — no such citation exists on the tree.
  ⚠️ It also **fused two numbering spaces**: `qa/session-bugfix-tiers-02-gate-owners.md:359` defines
  **5.26** as `IMPACT_BY_FREEZE` collisions, while mutation **row 26** in `qa/phase-09-polish.md:563`
  is the `hudGearPop` one. Those are different items; neither is the other's remaining half.

### Art blind spots — 5.7, all four open

Cross-tile brass continuity · **anatomy: a third limb scores favourably on silhouette metrics** ·
facing direction · readability at true sprite size. **G6 passes a figure missing a hand.**

⚠️ By-eye judgements a metric cannot take. **The deliverable is a documented human check in the gate
table, not a new metric pretending to.**

### Engine hazards, documented and ungated

- `ENGINE-NOTES.md:125-131` — at `SHUTDOWN`, `scene.cameras.main` is `undefined`; an unguarded
  `setPosition` throws **inside `Systems.shutdown`**. Convention only; no source-text gate.
- `:174-178` — `BaseTween.destroy()` runs **neither** callback. ⚠️ **CORRECTED 2026-08-25: the
  production destroy path is NOT ungated.** `tests/unit/hud-gear-pop.test.ts:198-209` —
  *"settles even when Phaser destroys the tween without dispatching anything"* — destroys the tween
  handle directly and asserts the icon still returns to `baseScale`, which is this hazard exactly.
  It is a behavioural gate against a fake scene, the stronger of the two shapes. The stale "Overlaps
  5.26" pointer is dropped: 5.26 is struck above.
- `:78-85`, `:158-160`, `:52-56`, `:100-104` — `TilemapGPULayer`'s no-op Canvas renderer · WebGL-only
  tint under a live `Phaser.AUTO` Canvas fallback · `Rectangle` has no `setFlipX` · solidity read from
  a **name** cannot be caught by a rename test.

### Recorded non-fixes — do not re-open, the bound IS the deliverable

**5.10** full soft-lock coverage is a search problem · **5.24** determinism holds for a fixed
toolchain only · **4.5** `assets:fetch` / `assets:verify` do not exist and the error text is fixed ·
**D13** `goalLayer`'s alpha pulse is a yoyo whose end state is its start state, so there is no end
value to force-settle.

---

## 3. Owed with a fal cost — `brass-sentry/idle` *(owner already approved, never started)*

It **fails its own loop gate** and has since generation: `wrap 0.01371 exceeds 0.01143 — it snaps`.
Held as a **pinned waiver** in `tests/unit/every-slug-loop-gate.test.ts:74` at `ceiling: 0.0138`, with
0.00009 of headroom, so it is visible and cannot worsen silently.

⚠️ **`idle` is the sheet the whole slug's `scale` derives from**, so a re-shoot moves every number in
`character-bounds-brass-sentry.json` — as `3.10`'s fire re-shoot did, which drew the turret **23.4 %
small** until it was re-derived from the tripod landmark, and then forced four dependent readings to
be retaken. **Budget a rebuild, not a swap.**

**Precedent:** `bytedance/seedance-2.0/image-to-video`, one generation, **$1.19**, request
`01a02eb2-9ec0-7b93-982f-f060bbcbffb1`.

**Spend:** ~$1.20 against **$2.33 remaining** of the $55 ceiling. **STOP and show the command, prompt
and quoted price before generating.**

**The transactional sequence — agreed but never executed:**

1. Re-read [FAL-MODELS.md](FAL-MODELS.md) **and re-run `genmedia schema`** on the endpoint.
2. **Inventory every dependent reading FIRST** — bounds, derived scale, framing, every gate reading
   them. This list is what step 5 checks and step 6 restores.
3. **Generate under a versioned candidate name. Replace no shipped artifact yet.**
4. Re-derive scale from the **tripod landmark**; rebuild `character-bounds-brass-sentry.json`.
5. Run **every** sheet gate plus the step-2 readings — not just the loop gate. A pass on wrap while
   `sprite-size-consistency` regresses is the fire precedent repeating.
6. **Adopt as one batch or not at all.** On success clip, sheet, catalog reference, bounds and the
   **waiver deletion** land together. **DELETE the waiver — never relax it.** On rejection, restore
   every shipped artifact, re-confirm the original waiver measurement, and log the discard.
7. **Log the spend either way** and update the running total.

---

## 4. The `play`-owned items — never started

**The owner accepts the game as it plays**, 2026-08-23 and again 2026-08-24 after D8 shipped. These
are the things ordinary play cannot reach:

- **the UI at 852×480** — the smallest supported window. 5.20's inter-element spacing, 3.8's counter
  centring and the help banner all live here.
- **DPR 2** — a `chromium-dpr2` Playwright project exists; a human has never looked at it.
- **the sentry-coverage question** — 3 of 9 sentries lost downward shots to a correct fix
  (`sentry-coverage.test.ts` pins it). Whether the levels were authored assuming those shots landed
  **cannot be settled from a number**. Read the three against how their levels are built and put it to
  the owner as a decision with a recommendation.
- **240 Hz** — the interpolation judder probe. The *choice* is settled; the *diagnosis* never was.

⚠️ **Drive the capture with the `playwright-cli` skill, not `e2e-playwright-testing`** — two Playwright
skills, two different jobs. **The deliverable is images plus a short index the owner can scan, not a
new metric asserting the layout is fine.** A defect it surfaces becomes a finding with its own gate.

---

## 5. What this session is NOT

- **Not Phase 10.** It is unblocked and the owner has deferred it deliberately. Do not start it.
- **Not a new inventory sweep.** The three read-only sweeps that built the original list are spent.
- **Not a re-litigation of §1a.** It is recorded with evidence. Either bring one of the three closing
  conditions, or leave it.
- **Not a re-run of the debts session's gate.** It closed 2026-08-25 with every finding applied or
  recorded, and both Codex reviews ran.

---

## 6. Working rules

1. Every fix ships with a gate, **watched failing first** *(C1)*, on the mutation the fix's own claim
   names — never the convenient one. ⚠️ **And re-watch it when the gate's own definition or inputs
   move** — last session a predicate change made a green red proof vacuous, and a file split made
   another one answer its own question.
2. Confirm each revert by **"content changed AND the original count dropped by one"** *(C12)*.
3. **Detect greenness positively, including the COUNT.** A run that selected nothing exits 0 and
   reports `PASS (0) FAIL (0)` — seen three times last session.
4. ⚠️ **This shell eats backslashes and backticks.** `\n` in a heredoc becomes a real newline and a
   backtick becomes command substitution — both produced broken files and one mangled commit message
   last session. **Build fixture strings from a named constant** (`const NL = '\n'`) and write
   multi-line content with the Write tool, not a heredoc.
5. **A redundant gate is worse than none.** Prefer deleting a check to reshaping one.
6. `npm run test:e2e`, **never** `npx playwright test`. One Playwright run at a time, nothing heavy
   beside it. Kill port 5173 before reporting done *(C13)*. The full sweep is ~17 minutes.
7. Agents: `isolation: "worktree"`, each with a deliverable path **outside** its worktree.
   ⚠️ Delete the `node_modules` junction before any `git worktree remove --force`.
   ⚠️ **They cannot run Playwright or mutate `src/`** — plan their briefs around source review.
8. **STOP and ask** before: a new dependency · deleting a file · any fal generation · a ninth
   `__game` field · renumbering the tick contract · **any new architectural rule, and any WIDENING of
   an existing one** · contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md · merging to `main` · any
   balance change.
   ⚠️ *Rule 8's widening clause is new: last session a repair quietly strengthened an owner-authorised
   rule from "may not write sim-owned state" to "may not pass sim state", and only the Codex review
   caught it. **A test enforcing more than the rule says is a rule change.***

**Session log:** `docs/qa/session-<slug>.md`, splitting to **flat siblings** near 400 lines.
**Branch:** off `main`, commit per batch, **no merge without asking**.
**Both Codex reviews are mandatory** — plan before approval, implementation before reporting done.
Each lands as a pair in `docs/reviews/`. ⚠️ Codex's shell cannot spawn processes; **every review prompt
must tell it to use the `node_repl` MCP tool with `fs.readFileSync`**, and every finding it returns is
file evidence that **must be re-verified locally**.
