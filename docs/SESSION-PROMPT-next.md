# Next session — the debts Phase 9's close left, then the last of Tier 5

**Written 2026-08-24, at the end of the Phase-9 close session.** Everything is merged to `main` at
`a8e4fa1`, pushed, and green: typecheck clean · unit **2417 / 0** (160 files) · `verify-dist ok` ·
`test:sim-isolated` 2414 + 3 skipped · e2e **128 selected, 128 passed** · port 5173 clear.

**Phase 9 is DONE.** All eleven criteria carry a recorded owner verdict. **This file holds only what
is still open**, and nothing has been summarised away — every item below is named with the evidence
that makes it real.

**The owner has playtested and accepts the game as it plays** — 2026-08-23, and again 2026-08-24
**after D8's balance change shipped**. That second acceptance is the one that matters now.

---

## 0. Read first

| document | why, for this session |
|---|---|
| `CLAUDE.md` | §3 non-negotiables, §5 testing rules. |
| `docs/qa/phase-09-polish.md` § *"The close round — 2026-08-24"* | **The whole brief for §1.** Findings D1–D14 with dispositions, the E1–E9 execution record, and 9.7's threshold table. |
| `docs/reviews/phase-09-impl.md` § *"The close round's review"* | Codex's BLOCK and the nine findings. Three of them are §1's items. |
| `docs/prd/phase-09-polish.md` § *"Owner amendment, 2026-08-24"* | What 9.5 now says, and **what the amendment deliberately did not close**. |
| `docs/qa/session-tier5-and-cleanup.md` | The Tier-5 items still open. |

⚠️ **Every `:line` citation written before 2026-08-24 in `phase-09-polish.md` has drifted 50–70 lines**,
and four inside its own gate table are still stale (`:1363`, `:1485`, `:1518`, `:1562`). **Locate by
heading, never by a copied line number.** Fixing those four is a one-minute job nobody has done.

---

## 1. The debts Phase 9's close created or recorded

**None of these blocks anything.** They are the honest remainder of a gate round that was run
properly, written down at the time rather than discovered later. That is the difference between this
list and the one this file used to hold.

### 1a. 9.5's combat path is unmeasured — the amendment's stated non-closure

The owner amended 9.5 to name the worst **steady-state** frame, because that is what the gate
measures. **The amendment does not claim the combat-triggered path is cheap, and does not close it.**

`installStorm` holds the player invulnerable on every frame of every arm — it has to, because without
it the shipped effects path fires bursts that `atLimit()` **accepts** in cheap arms and **drops** in
expensive ones, an inversion that stops the sweep ordering at all. So no `hurt`/`death` state, no
hit-stop, no knockback, no i-frame flicker, and the shake in the window is `SHAKE.land`, **smallest of
the four commands**.

⚠️ **A regression confined to `gameEffects.ts`'s `light` / `lethal` / `playerHurt` arm sites would
leave 9.5 green** — the same shape as the already-fixed multi-enemy hit-stop-chain defect
(`hitstop-chain-cap.test.ts`).

**Needs no owner decision, only the work.** The concrete design for a combat-enabled `installStorm`
variant is in the close round's `voltagent-qa-sec:performance-engineer` adversarial brief. ⚠️ **Read
9.8 entries 43, 44 and 45 first** — they explain why closing it is *actively risky to the statistic*,
which is why it was suppressed rather than overlooked. **Do not assume it is a small change.**

### 1b. Four upper perf bounds cannot go red on their own

`MAX_EFFECT_FRAME_P95_MS` (16) · `MAX_EFFECT_WORK_DELTA_MS` (0.3) · `MAX_PER_PARTICLE_WORK_MS`
(0.003) · `MIN_STORM_WORK_DELTA_MS` (0.2).

**`tests/e2e/phase-09-perf.spec.ts` is one sequential `test()`, and an earlier guard always fires
first.** Proven twice in the close round rather than assumed: `PERF_MUTATION=stall` was aimed at the
P95 bound and red the **window-close guard three checks earlier**; a real 3 ms burn injected into the
shipped render path reached `MAX_EFFECT_FRAME_WORK_MS` and **stopped there**.

Their construction is verified; their redness is **inferred from the guard ahead of them**, which is
weaker and is recorded as weaker. **The repair is to split that spec so each bound is independently
reachable.** ⚠️ Splitting it means each arm re-establishing its own storm — check what that costs in
wall-clock before committing to the shape.

### 1c. D9 — the `run:` waits, and there are THREE, not one

`polishSeries.ts` measured it on 2026-08-22: this harness runs **1 tick per frame for about the first
second, then 3–4 ticks per frame indefinitely**, so the longest gap-free run available after that is
**1**. Its header says plainly: ***"Do not add a `run` wait to a new test."***

Three live sites still do:

| site | wait | note |
|---|---|---|
| `phase-09-polish.spec.ts:113` | `run: 8` | `brawlArm`. **Observed failing** in the close session's loaded sweep — *"No usable hit in 61 ticks"* — and green in isolation minutes later |
| `phase-09-polish.spec.ts:180` | `run: 8` | **The one nobody has mentioned.** Same construct, same file, never named in any finding |
| `phase-09-draw.spec.ts:296` | `run: 12` | ⚠️ **`run: 12` is the exact value `polishSeries.ts` names as satisfiable only out of the opening burst** |

**The repair is the one 9.2 already had**: ask for the condition the reduction actually needs
(`landings` + `coveredLanding`), not for contiguity. ⚠️ These specs are green in isolation — replacing
a wait on a green spec is how the last flake was introduced. **Watch each one fail first**, on a
loaded box, before trusting the fix.

### 1d. 9.3's scan has two unambiguous bypasses that should be closed

`tests/unit/tween-boundary.test.ts` says *"kill-by-target, in every form Phaser offers it"* and its
regex recognises only direct identifier calls. Two bypasses are **unambiguous** and were called out by
the Codex review as a dodge to leave open:

- **`tweens['killTweensOf'](x)`** — bracket access, invisible to the scan.
- **`noop(scene.tweens.add({…}))`** — classified **held** because the preceding character is `(`, though nobody retains the handle.

**Close these two with literal red fixtures.** The more ambiguous ones (inlining `getTweensOf` +
destroy, which is literally how Phaser defines `killTweensOf`; `tweens.destroy()`; the other tween
entry points) stay documented narrowings — **D4** in the phase log. **None is present on this tree.**

### 1e. 9.2's new gate does not reach game-state writes

`tests/unit/tween-callback-boundary.test.ts` forbids **sequencing**: scene transitions (all thirteen
ScenePlugin methods), event emission, the level-completion callback. Codex's second blocker was that
this is not the whole criterion, and it is right:

> `world.completed = true` · `player.hp = 0` · `finishLevel()` · `saveProgress()` · spawning or
> removing entities · registry writes · a flag consumed next tick — **all pass.**

⚠️ **This is a STOP-and-ask, not a coding task.** Closing it means classifying game-state APIs, which
is a **new architectural rule**, and 9.2 is not the criterion that authorises inventing one. It also
overlaps **D1**: 9.1's *"not a tween"* half is carried only by `sim-boundary.test.ts`, so a freeze
re-implemented scene-side as an `addCounter` writing `world.player.{x,y,vx,vy}` keeps every gate
green — and this phase's own e2e harness does exactly that deliberately (`effectShake.ts`).
**Put the rule to the owner before writing it.**

### 1f. The extractor's remaining holes, and the contract's fragile repair

- `callbackCode()` still cannot reach: a member-expression callback (`onComplete: this.foo`), an
  imported one, a config built elsewhere and passed as a variable, or a **shadowed name** (first
  textual declaration wins; there is no lexical scoping). **All four are named in its docstring** —
  the docstring is honest, the reach is narrow. **None occurs on this tree.**
- `docs-contract.test.ts`'s per-criterion check is satisfied by any `^| 9.x |` row in the slice. It
  is currently protected by **bolding the close round's verdict table out of the regex's reach**,
  which works and is fragile: removing Markdown emphasis silently restores the bypass. **The durable
  fix is to parse only the designated gate table and require exactly one row per criterion.**

⚠️ **Two pieces of prose written during the close round each degraded the gate they described** —
finding **D14**. Documentation about a gate is inside that gate's blast radius. Expect it.

---

## 2. The remaining Tier-5 items — unchanged, none started

⚠️ **Re-confirm each is still open before fixing it.** In the 2026-08-23 session, **four of the ten it
examined were wrong about themselves**. **Run the mutation before believing the claim.**

### Measurement gates that can go false

- **5.2 — the GPU-ratio flake, and there is now MORE data.** `phase-08-perf.spec.ts`. Previously
  *"level-05 costs 4.47× level-01 … Expected: ≤ 2"*, observed 1 in 4. **It fired again on
  2026-08-24 at 5.61×**, in the loaded full-suite sweep, and passed in isolation minutes later —
  the third time the loaded/isolated split has held. **It is load-sensitive, which is why isolated
  re-runs never catch it.** The G.7b repair shape applies: pair the observations, median the
  per-round **deltas**, keep the arms separate until the effect clears the timer grid.
  ⚠️ *A statistic that does not order its own mutation cannot be fixed by moving the bound.*
- **5.3 — Codex's algebra was accepted and never applied.** `phase-09-impl.md`: `k = 0.9001`,
  reported `1.034b` against a true `3.914b` — **3.79×**. The docstring was corrected; **the cost model
  and the `k = 0.9` floor were not.** Finish applying it.
- **5.9 — the knob sweep loses sensitivity when physics moves and blames the knob.** Happened three
  times in one session. Make it assert its **own** sensitivity.
- **5.21 — GPU cost is unmeasurable without `EXT_disjoint_timer_query`.** ⚠️ *"Recorded as unreachable
  twice and reachable both times."* **DO NOT soften into a skip.**

### Gates satisfiable by the wrong thing

- **5.4** — ✅ **the verification this item was waiting on is DONE (2026-08-24).**
  `docs/qa/phase-05-combat-08-gate-10.md:121` confirms it as recorded finding **S5**:
  *"`DEV_FLEET_COUNT = 20` is a chosen multiple, **not a bound** — nothing in `src/sim/` or the level
  format caps concurrent enemies … Capping it is a design decision."* So 9.5's *"max enemies"* rests
  on a dev constant, not on anything the game enforces. ⚠️ **What remains is the design decision, and
  it is the owner's** — do not cap it unilaterally.
- **5.5** — `sheetGates.mjs`'s G5 asks only whether contact falls *inside* the active window; it lands
  on the window's **last two ticks** — inside, and still the wrong frame to freeze.
- **5.16** — the hazard-width ceiling has **two conflicting figures**, and the two shipped 480 px runs
  are not flat crossings, so 480 is confirmed by nothing shipped.
- **5.17** — the frame-0 guard's real failure mode, *a looping clip visibly frozen on screen*, was
  nominated as "Playwright's job" and **no e2e took it**.
- **5.20** — **no gate checks spacing BETWEEN HUD elements.** Found once, by a human reading an
  evidence screenshot. Pairs with §4's 852×480 reading.
- **5.26, remaining half** — `hudGearPop.destroy()`'s **idle branch**, which has no fixture and is the
  **common** one (every resize), plus the wrong test file cited *(C9)*.

### Art blind spots — 5.7, all four open

Cross-tile brass continuity · **anatomy: a third limb scores favourably on silhouette metrics** ·
facing direction · readability at true sprite size. **G6 passes a figure missing a hand.**

⚠️ By-eye judgements a metric cannot take. **The deliverable is a documented human check in the gate
table, not a new metric pretending to.**

### Engine hazards, documented and ungated

- `ENGINE-NOTES.md:125-131` — at `SHUTDOWN`, `scene.cameras.main` is `undefined`; an unguarded
  `setPosition` throws **inside `Systems.shutdown`**. Convention only; no source-text gate.
- `:174-178` — `BaseTween.destroy()` runs **neither** callback. The fake's contract was fixed; the
  **production** destroy path is still ungated. Overlaps 5.26.
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
- **Not a re-run of Phase 9's gate.** It closed on 2026-08-24 with a recorded verdict per criterion.
  §1 is its *remainder*, not a re-litigation.

---

## 6. Working rules

1. **Every fix ships with a gate, watched failing first** *(C1)*, on the mutation the fix's own claim
   names — **never the convenient one**.
2. **Confirm each revert by "content changed AND the original count dropped by one"** *(C12)*.
3. **Detect greenness positively, including the COUNT.** ⚠️ In the close session a rewritten gate
   reported `PASS (0) FAIL (0)` — a parse error collecting zero tests — and only reading the count
   caught it. A bare exit code would have read as green.
4. ⚠️ **This shell collapses backslashes in heredocs.** Three regex escapes were silently destroyed in
   one session, once producing a literal `0x08` **backspace byte inside a regex** — a rule that
   matched nothing and looked green. **Use regex literals or `String.raw`, and read the bytes back
   (`od -c`) when a regex is built through a shell.** A terminal will happily render the corruption
   as correct.
5. **A redundant gate is worse than none.** If every mutation a new gate names is already caught,
   delete it and fix the citation instead.
6. `npm run test:e2e` — **never** `npx playwright test`. One Playwright run at a time, nothing heavy
   beside it. Kill port 5173 before reporting done *(C13)*.
7. **Agents: `isolation: "worktree"`, and give each one a deliverable path OUTSIDE its worktree.**
   That is what made the close round lose nothing; a reminder to copy files out is not a mechanism.
8. **STOP and ask** before: a new dependency · deleting a file · any fal generation · a ninth
   `__game` field · renumbering the tick contract · **any new architectural rule (§1e)** ·
   contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md · merging to `main` · any balance change.

**Session log:** `docs/qa/session-<slug>.md`, splitting to **flat siblings** near 400 lines —
`file-size.test.ts` globs `docs/qa/*.md` non-recursively, never a subdirectory. **Branch:** off
`main`, commit per batch, no merge without asking.

**Baseline — anything worse is a regression this session caused:**

| check | baseline 2026-08-24 (`a8e4fa1`) |
|---|---|
| typecheck | clean |
| unit | **2417 passed / 0 failed** (160 files) |
| build | `verify-dist ok: 5 level(s) and 12 audio file(s)` byte-identical |
| `test:sim-isolated` | 2414 passed / 3 skipped, phaser restored to 4.2.1 |
| e2e | **128 selected, 128 passed** |

⚠️ **The e2e figure is the LOADED full-suite number and it is genuinely 128/128 today** — but 5.2 and
D9 both fired in a loaded sweep earlier the same day and both passed in isolation. **A 126/128 with
those two named is not automatically your regression.** Identify the failures before assuming.
