# Next session — close Phase 9, then the last of Tier 5

**Written 2026-08-23, at the end of the branch-cleanup / Tier-5 session.** Everything is merged to
`main`, pushed, and green: typecheck clean · unit **2404 / 0** (157 files) · `verify-dist ok` ·
`test:sim-isolated` 2401 + 3 skipped · e2e **128 selected, 128 passed** · port 5173 clear.

⚠️ **This file replaces the ~60-item inventory it used to hold.** Everything closed is recorded in
`docs/qa/session-bugfix-tiers.md` and `docs/qa/session-tier5-and-cleanup.md`. **What is below is
only what is still open.** Nothing has been summarised — every unreached item is named.

**The owner has playtested and accepts the game as it plays** (2026-08-23, twice). See §4 for exactly
what that settles and what it cannot.

---

## 0. Read first

| document | why, for this session |
|---|---|
| `CLAUDE.md` | §3 non-negotiables, §5 testing rules. **New**: §1's note that `git worktree remove --force` deletes through the `node_modules` junction. |
| `docs/PRD.md` § The QA agent protocol | §1 is a gate round. The Owner column is an instruction. |
| `docs/qa/phase-09-polish.md:230-275` | The gate table and *"why Phase 9 is still not done"*. **This is §1's whole brief.** |
| `docs/qa/session-tier5-and-cleanup.md` | What last session closed, and the four items that were wrong about themselves. |
| `docs/lessons/phase-09-*.md` | Vault-in before touching Phase 9's gates. |

---

## 1. Close Phase 9 — the single highest-value thing here

`PRD.md:35` reads `—` and that is correct. **Phase 9 was merged and approved on a verbal report the
project's own records do not corroborate.** The work is not bad — the mutation proofs at `:448` and
`:1320`, the integrator's re-mutations at `:104` and the Codex round at `:1518` are as thorough as
anything in this repository. **The last protocol step was skipped**: agent-owned criteria that FAILED
were fixed and never handed back to their owners.

| # | criterion | owner | state |
|---|---|---|---|
| 9.1 | Hit-stop lives in the sim as integer ticks, not a tween | `voltagent-qa-sec:code-reviewer` ×2 | **OWED — no verdict either way.** The round ran; `:529` records verdicts only for 9.3/9.4/9.7/9.9. |
| 9.2 | No game logic sequenced off a tween completion | `voltagent-qa-sec:code-reviewer` ×2 | **OWED — no verdict either way.** ⚠️ And its landing-shake gate moved twice since (3.1's tick alignment, then 2b.7's camera growth). |
| 9.3 | Tweens tracked individually; no kill-by-target | `voltagent-qa-sec:code-reviewer` ×2 | **OWED** — failed by four blind briefs, fixed, never re-run. |
| 9.4 | A fade force-settles its end value on stop as well as complete | `voltagent-qa-sec:qa-expert` ×2 | **HALF OWED.** Brief A was recovered from a dead worktree and passes — but it verified the **gear pop**, the substituted subject, and the owner failed 9.4 on exactly that split. `hud-fade.test.ts` closes the fade half; no owner brief has seen it. |
| 9.5 | Frame budget holds under worst case | `voltagent-qa-sec:performance-engineer` ×2 | **OWED** — failed twice, 11 findings applied 2026-08-22, never re-run against the fix. |
| 9.7 | Thresholds pinned as literals, fixtures both sides | `voltagent-qa-sec:qa-expert` ×2 | **HALF OWED.** Brief A passes and tabulates all 24 thresholds — and states plainly that **no Playwright ran**, so the e2e bounds' construction is verified and their redness is not. |
| 9.9 | No file > 400 lines; diff reviewed; adversarial pass | `voltagent-qa-sec:code-reviewer` ×2 | **OWED** — failed, fixed, never re-run. |

**Already substantiated, do not re-run:** 9.6 · 9.8 · 9.10 · 9.11.

### How to run it

- **Two briefs each *(A7)***, brief 1 verifying the criterion, brief 2 asking only *"how could this be
  wrong?"*, **with brief 1's findings withheld from brief 2**.
- **`isolation: "worktree"` for every agent** *(§9 — six Phase 8 agents corrupted the shared tree)*.
- ⚠️ **Copy every agent's deliverable out of its worktree before removing it.** Last session found an
  unapplied 209-line brief in a dead worktree — the one that turned out to be 9.4/9.7's missing
  re-run. **A worktree agent's output is not in the repository unless somebody copies it out.**
- ⚠️ **Worktrees have no `node_modules`.** Agents junction to the root one, and `worktree remove`
  deletes *through* the junction. Expect to `npm ci` after the sweep.
- Every finding **applied or recorded with a one-line reason** *(C11)*. Findings to
  `docs/qa/phase-09-polish.md`; `docs/reviews/` stays Codex-only.
- **A subagent's summary is a claim** — re-verify locally whatever it could not run.

**Only when every row is substantiated does `PRD.md:35` become `✅ done`** — which flips
`docs-contract.test.ts` into requiring a QA-LOG row per criterion. **Mutation:** mark it done with one
row still owed; that test must fail.

---

## 2. The remaining Tier-5 items

⚠️ **Re-confirm each is still open before fixing it.** Last session, **four of the ten it examined
were wrong about themselves** — 5.19, 5.6, 5.8 and 5.18 all claimed less coverage than existed, and a
purpose-built gate for 5.19 was written, watched red, and then **deleted** as redundant. **Run the
mutation before believing the claim.**

### Measurement gates that can go false

- **5.2 — the GPU-ratio flake, and there is now data.** `phase-08-perf.spec.ts`: *"level-05 costs
  4.47× level-01 … Expected: ≤ 2"*. Observed **1 in 4**, and the one was the **loaded** run inside the
  full 128-test sweep; three isolated re-runs passed. **It is load-sensitive**, which is why isolated
  re-runs never catch it. The G.7b repair shape applies: pair the observations, median the per-round
  **deltas**, keep the arms separate until the effect clears the timer grid. ⚠️ *A statistic that
  does not order its own mutation cannot be fixed by moving the bound.*
- **5.3 — Codex's algebra was accepted and never applied.** `phase-09-impl.md:44`: `k = 0.9001`,
  reported `1.034b` against a true `3.914b` — **3.79×**. The docstring was corrected; **the cost model
  and the `k = 0.9` floor were not**. Finish applying it.
- **5.9 — the knob sweep loses sensitivity when physics moves and blames the knob.** Happened three
  times in one session. Make it assert its **own** sensitivity.
- **5.21 — GPU cost is unmeasurable without `EXT_disjoint_timer_query`.** ⚠️ *"Recorded as unreachable
  twice and reachable both times."* **DO NOT soften into a skip.**

### Gates satisfiable by the wrong thing

- **5.4** — 9.5 says *"max enemies"* and nothing caps concurrent enemies. **One verification owed
  first**: read `docs/qa/phase-05-combat-08-gate-10.md:121` before recording it as fact.
- **5.5** — `sheetGates.mjs`'s G5 asks only whether contact falls *inside* the active window; it lands
  on the window's **last two ticks** — inside, and still the wrong frame to freeze.
- **5.16** — the hazard-width ceiling has **two conflicting figures**, and the two shipped 480 px runs
  are not flat crossings, so 480 is confirmed by nothing shipped.
- **5.17** — the frame-0 guard's real failure mode, *a looping clip visibly frozen on screen*, was
  nominated as "Playwright's job" and **no e2e took it**.
- **5.20** — **no gate checks spacing BETWEEN HUD elements.** Found once, by a human reading an
  evidence screenshot. Pairs with §4's 852×480 reading.
- **5.26, remaining half** — the injectivity check landed (`tier5-gaps.test.ts`); still open is
  `hudGearPop.destroy()`'s **idle branch**, which has no fixture and is the **common** one (every
  resize), plus the wrong test file cited *(C9)*.

### Art blind spots — 5.7, all four open

Cross-tile brass continuity · **anatomy: a third limb scores favourably on silhouette metrics** ·
facing direction · readability at true sprite size. **G6 passes a figure missing a hand.**

⚠️ These are by-eye judgements a metric cannot take. **The deliverable is a documented human check in
the gate table, not a new metric pretending to.**

### Engine hazards, documented and ungated

- `ENGINE-NOTES.md:125-131` — at `SHUTDOWN`, `scene.cameras.main` is `undefined`; an unguarded
  `setPosition` throws **inside `Systems.shutdown`**. Convention only; no source-text gate.
- `:174-178` — `BaseTween.destroy()` runs **neither** callback. The fake's contract was fixed last
  session; the **production** destroy path is still ungated. Overlaps 5.26.
- `:78-85`, `:158-160`, `:52-56`, `:100-104` — `TilemapGPULayer`'s no-op Canvas renderer · WebGL-only
  tint under a live `Phaser.AUTO` Canvas fallback · `Rectangle` has no `setFlipX` · solidity read from
  a **name** cannot be caught by a rename test.

### Recorded non-fixes — do not re-open, the bound IS the deliverable

**5.10** full soft-lock coverage is a search problem · **5.24** determinism holds for a fixed
toolchain only · **4.5** `assets:fetch` / `assets:verify` do not exist and the error text is fixed;
add the scripts only if they earn it.

---

## 3. Owed with a fal cost — `brass-sentry/idle`

It **fails its own loop gate** and has since generation: `wrap 0.01371 exceeds 0.01143 — it snaps`.
Held as a **pinned waiver** in `tests/unit/every-slug-loop-gate.test.ts` at its measured value with
0.00009 of headroom, so it is visible and cannot worsen silently.

⚠️ **`idle` is the sheet the whole slug's `scale` derives from**, so a re-shoot moves every number in
`character-bounds-brass-sentry.json` — as `3.10`'s fire re-shoot did, which drew the turret 23.4 %
small until it was re-derived from the tripod landmark. Budget a rebuild, not a swap.

**When it lands, DELETE the waiver — never relax it.** The gate already fails if a waived sheet starts
passing, for exactly that reason.

**Spend:** ~$1.20, against $2.33 remaining of the $55 ceiling. **STOP-and-ask before generating.**

---

## 4. The playtest verdict, and what it does and does not settle

**The owner played the shipped game and accepts it — 2026-08-23, stated twice.** That is the
`play`-owned sign-off, and it is recorded as such rather than as an automated result *(C4: a playtest
finds what gates cannot)*.

**Settled by it:** the game plays acceptably end to end. **2.2's courier-fall judder** is closed as
*not visible at play speed to the owner* — two numeric proxies had already failed to order it, and a
defect nobody sees at 60 Hz on a real monitor is not worth a re-shoot. **3.3's spark colour** and the
general feel questions in 9.8's list go the same way.

**NOT settled by it, because ordinary play cannot reach them:**

- **the UI at 852×480** — the smallest supported window. 5.20's inter-element spacing, 3.8's counter
  centring and the help banner all live here.
- **DPR 2** — a `chromium-dpr2` Playwright project exists; a human has never looked at it.
- **240 Hz** — the interpolation judder probe. The *choice* is settled; the *diagnosis* never was.
- **the sentry-coverage question** — 3 of 9 sentries lost downward shots to a correct fix
  (`sentry-coverage.test.ts` pins it). Whether the levels were authored assuming those shots landed
  cannot be settled from a number.

**These four are the only `play`-owned items left.** They need a deliberate setup, not a play session.

---

## 5. What this session is NOT

- **Not Phase 10.** It has not started. Closing Phase 9 honestly is what unblocks it.
- **Not a new inventory sweep.** The three read-only sweeps that built the original ~60-item list are
  spent; what survives is above.

---

## 6. Working rules

1. **Every fix ships with a gate, watched failing first** *(C1)*, on the mutation the fix's own claim
   names — **never the convenient one**. Last session's 5.12 needed two attempts to find the
   discriminating mutation, and the first proved nothing.
2. **Confirm each revert by "content changed AND the original count dropped by one"** *(C12)*.
3. **Detect greenness positively, including the COUNT.** ⚠️ Last session a commit message claimed a
   count that had not been read, and the suite was red at the time. **Run, read, then write.**
4. **A redundant gate is worse than none** — it implies the coverage elsewhere is thinner than it is.
   If every mutation a new gate names is already caught, delete it and fix the citation instead.
5. `npm run test:e2e` — **never** `npx playwright test`. One Playwright run at a time, nothing heavy
   beside it. Kill port 5173 before reporting done *(C13)*.
6. **STOP and ask** before: a new dependency · deleting a file · any fal generation · a ninth
   `__game` field · renumbering the tick contract · contradicting STYLE.md / PRD.md /
   LESSONS-APPLIED.md · merging to `main` · any balance change.

**Session log:** `docs/qa/session-<slug>.md`, splitting to **flat siblings** near 400 lines —
`file-size.test.ts` globs `docs/qa/*.md` non-recursively, never a subdirectory. **Branch:** off
`main`, commit per batch, no merge without asking.

**Baseline — anything worse is a regression this session caused:**

| check | baseline 2026-08-23 |
|---|---|
| typecheck | clean |
| unit | **2404 passed / 0 failed** (157 files) |
| build | `verify-dist ok: 5 level(s) and 12 audio file(s)` byte-identical |
| `test:sim-isolated` | 2401 passed / 3 skipped, phaser restored to 4.2.1 |
| e2e | **128 selected, 128 passed** |
