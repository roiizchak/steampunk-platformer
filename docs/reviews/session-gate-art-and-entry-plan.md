# Codex plan review — the gate-art + gate-entry session

← [PRD § The Codex review protocol](../PRD.md#the-codex-review-protocol) · impl review:
[session-gate-art-and-entry-impl.md](session-gate-art-and-entry-impl.md)

**Run 2026-08-19, `--wait --fresh`, before a single line of implementation.** The plan under
review lived outside the repository at
`C:\Users\royko\.claude\plans\read-docs-handoff-md-docs-prd-md-claude-transient-riddle.md`;
Codex read it with `fs.readFileSync` through the `node_repl` MCP tool, per the standing
instruction that its sandboxed shell cannot spawn a process on this machine.

**It found three blockers.** All three were re-verified locally before being acted on.

---

## The report, verbatim

### 1. Deliverables not required by the stated goal

- **Low — redundant:** changing the second `playerRenderDesc` call in `GameScene.create()`. The proposed API defaults `goalEntryTicks` to `null`, and `create()` has just constructed a fresh world, so explicitly passing its freshly initialized `null` changes nothing. [plan:688–689], [plan:758–780], [GameScene.ts:155–170]

- **Low — future-proofing, not current delivery:** `tests/unit/level-goal-fits.test.ts` protects hypothetical future goal rectangles. The five current levels already have compatible geometry. It is useful QA, but not necessary to ship this image and behavior in today's five levels. [plan:356–396]

- The generation log, manifest/pipeline documentation, QA evidence, owner passes, and two Codex reviews are not gameplay deliverables, but they are still mandatory project-process deliverables. In particular, generated art must be logged and the review protocols cannot be skipped. [PRD.md:81–103]

### 2. Acceptance criteria that can false-green

- **Blocker — G.3, G.4, G.5 and G.6 can all pass while a damage/respawn path permanently wedges the level.** After arming, `goalEntryTicks` never cancels. Enemies and projectiles continue running before movement, and damage still resolves at 9b. A lethal hit therefore leaves the counter armed; `containedInGoal()` refuses a dead player, then `respawnPlayer()` moves the player back to spawn without any possible knowledge of the world-owned counter. The proposed jump lock then makes the forced run from spawn incapable of traversing an ordinary platformer level. [plan:577–588], [plan:595–628], [tick.ts:169–178], [tick.ts:291–319], [combat.ts:161–188]

  The proposed G.3/G.4 unit path contains no enemies or hazards; G.5 tests the pure alpha curve; G.6 is one hands-on route per level. All can miss the reachable lethal branch. Level 1 has a scavenger patrol ending only 96 px before the goal, and level 5 has a sentry 384 px before it. [level-01.tmj:2431–2447], [level-05.tmj:4991–5007]

- **High — G.1 can pass with visibly wrong art.** `goalIsGreybox() === false` proves only that a texture key exists, while `willRender()` proves only that the object is eligible to render. The bytes test samples just 64×96 pixels — 11.1% of the image — and ignores everything outside that central patch. A mostly transparent frame with a central black patch, or simply an opaque dark slab that doesn't read as a doorway, passes dimensions, one-component detection, the darkness ratio, and G.1. [goalLayer.ts:35–68], [plan:931–949], [plan:984–1018]

- **High — G.4 does not actually cover every input path it names.** Its unit test holds left and jump, but never attack; its animation assertion is also masked by the render layer forcibly returning `run`, whatever the sim state is. A pre-existing attack can remain live, and an incorrect attack-lock implementation can be visually hidden. [plan:474–503], [plan:719–723], [combat.ts:252–264]

- **Medium — G.2's first committed fixture proves only the two geometry predicates.** It never calls `tick()` or observes `world.completed`; the later happy-path sequence tests provide the real runtime protection. G.2 alone can be green while 9d still uses the wrong predicate or completes at the wrong time. [plan:257–274]

- **Low — G.7, G.8 and G.9 are process gates.** File size, performance, and the existence of review records can all pass while gameplay is broken; project policy expressly allows a review finding to be recorded with a reason instead of fixed. [plan:1157–1160], [PRD.md:212–225]

### 3. Claimed rules that are not satisfied

- **Blocker — vault 2.4:** the proposed attack suppression passes a cloned snapshot with `attackPressed: false`. `stepCombat()` consumes that false value from the clone, leaving the original mutable working copy's edge latched. `consumeAttackPress()` is the only clearing path, and combat is supposed to consume the edge every tick even when it refuses the action. [plan:623–633], [input.ts:71–81], [combat.ts:252–259], [phase-02-player.md:26–31]

- **High — C1/C12:** Task 2's mutation does not match the shipped JSON. It searches for `"height":288`; the file contains `"height": 288`. It can therefore change zero bytes, and the plan performs no "content changed and original count dropped by one" check before trusting the run. [plan:404–421], [level-01.tmj:2233], [TESTING-RULES.md:12–23]

- **High — the art-spend ordering rule:** the plan reruns schema and pricing but does not read/reconcile the invoice before generating. The invoice-before-next-batch step is part of the binding rule, not merely staying below a static ceiling. Flagging the `$50`/`$55` contradiction and proceeding does not discharge it. [plan:146–152], [plan:865–873], [PRD.md:86–101], [GENERATION-LOG.md:23–32]

### 4. Repository dependencies

Verified as present and correctly described: all five goals are 192×288 and flush with their floor; `PLAYER_BOX` 22×48, `RENDER_SCALE` 6; `runMax` is `18/2 = 9` px/tick; `catalogWrite.mjs` preserves `images` (only rewrites `catalog.sheets`); `drawGoal()` already has the `goal-gate` image branch; the `crop`/`downscale`/`detectFrames`/`estimateKeyColour` signatures match.

What does not exist as described:

- **High:** no `tests/unit/helpers/levels` / `shippedLevels()` helper exists. The real seam is `SHIPPED_ENTRIES` + `parseLevel()` from `tilemap-data-fixtures.ts`, as used by `level-goal.test.ts`. [plan:367–402], [tilemap-data-fixtures.ts:12–16]
- **Blocker to written Task 3 tests:** `worldAtFeet()` doesn't build the level-sized world it assumes; `createWorld({seed,scale})` defaults to a 1920-wide grey-box world, so the player/goal placed at `x≈8640` gets clamped back inside on the next tick. The written `runToGate()` can't reach the goal even once the feature works. [plan:245–254], [world.ts:28–32], [tick.ts:284–300]

### 5. Single most likely subtle shipping defect

**A player is damaged or killed during the 20-tick run-in, fades completely, then respawns with `goalEntryTicks` still armed and controls still locked** — invisibly auto-running from spawn without jumping, potentially never terminating the level. Damaging actors already sit immediately beside two shipped exits (level 1 patrol 96 px before the goal, level 5 sentry 384 px before it).

### On the five stated risks

- **(a)** Widening 9d in place is not itself a substantive contract violation — the header's numbering/ordering guarantee is preserved; the header text just needs to accurately describe the widened semantics. No new letter or extraction outside the tick is required.
- **(b)** Normal grounded play reaches the exact vertical equality reliably (collision snaps `player.y` to `solid.y`, no slopes/moving platforms exist). The real nontermination risk is the death/respawn path retaining the armed counter, not float drift.
- **(c)** Movement/jump locks hold, but the attack suppression is broken as described in finding 3 above (vault 2.4).
- **(d)** No permanent transparency into the next level and no premature alpha pop — completion freezes before the next tick and `Game` restarts cleanly. The real fade defect is alpha reaching 0 before containment is reached, leaving an invisible player mid-sequence.
- **(e)** Yes — the central-darkness sampling gate can approve art that is visually wrong outside the sampled patch.

### What Codex could not check

> Codex could not run Git, tests, the build, Playwright, or a browser; could not inspect the
> not-yet-generated gate PNG, live fal schema/pricing, or the current invoice.

Preserved per vault 9.3: a gate's blind spots are part of its result. Every one of those is
re-verified locally during execution — the plan's Task 6 Step 1 and Task 10 Step 3 are
exactly that work.

---

## Triage

Every finding is **applied** or **recorded with a one-line reason** *(C11)*. Codex's sandbox
cannot run a command on this machine, so each finding below was **re-verified locally first**;
the "verified" column says how.

| # | Sev | Finding | Verified locally | Disposition |
|---|---|---|---|---|
| **C1** | **Blocker** | A player killed during the run-in respawns with the counter still armed and input still locked — auto-running from spawn, unable to jump, level unwinnable. Level 1 has a patrol 96 px from the exit; level 5 a sentry 384 px. | Yes — `respawnPlayer` at 4c (`tick.ts:211`) knows nothing about a world counter; the plan had no cancel path. | **APPLIED** — `stepGoalEntry` disarms when the player stops overlapping the goal. Covers death, knockback-out, and the invisible-player-outside-the-door case in one branch. Three new unit tests, plus a new hands-on criterion **G.4b**. |
| **C2** | **Blocker** | Suppressing attack with a spread clone leaves the ORIGINAL edge latched forever — `consumeAttackPress` mutates the object it is handed. Vault 2.4. | Yes — `input.ts:78-82` mutates the argument; `combat.ts:254` is the only caller. | **APPLIED** — the edge is consumed off the real snapshot and discarded. Never cloned. New unit test asserts the snapshot's edge is cleared. |
| **C3** | **Blocker (tests)** | `createWorld({seed,scale})` defaults `bounds` to the 1920×1080 grey-box extent, so a fixture at `x≈8640` is clamped at step 9 and can never reach the gate. | Yes — `world.ts` `GREY_BOX_BOUNDS = {1920,1080}`; `clampToBounds` at `tick.ts:289`. | **APPLIED** — the fixture passes explicit `bounds` and `solids`. |
| **C4** | High | No `shippedLevels()` helper exists; the real seam is `SHIPPED_ENTRIES` + `parseLevel`. | Yes — `tests/unit/tilemap-data-fixtures.ts:78`. | **APPLIED** — the real seam is used. |
| **C5** | High | The red-proof mutation greps `"height":288`; the file writes `"height": 288`. It would change zero bytes and the "watched it go red" claim would be false. | Yes — `grep -c '"height":288'` → **0**; `'"height": 288'` → **6**. | **APPLIED** — the mutation edits parsed JSON and asserts "content changed AND the original count dropped by one" before the run is believed *(C12)*. |
| **C6** | High | G.1 can pass on visibly wrong art: the bytes test samples 11 % of the image. | Yes, by inspection of `goalLayer.ts:46-48`. | **APPLIED** — the shipped-bytes test gained jamb-opacity, overall-opacity and frame-vs-void luminance assertions, and **G.1b is a new `play`-owned by-eye criterion**. STYLE.md §5 already says the material rule is a local edge cue no whole-region metric can see. |
| **C7** | High | G.4 never exercises attack, and its animation assertion is masked because the render layer forces `run`. | Yes. | **APPLIED** — the lock test holds `attackPressed` and asserts the **sim** state, not the render key. |
| **C8** | High | The art-spend rule is *read the invoice before the next batch*, not merely stay under a ceiling. | Yes — `PRD.md:86-101`. | **APPLIED** — Task 6 Step 1 reads the invoice first and records it beside the quoted running total. |
| **C9** | Medium | G.2's fixture tests only the geometry predicates; it never calls `tick()`. | Yes. | **APPLIED** — G.2 now cites both the predicate fixture and the "must not complete at counter *i*" loop. |
| **C10** | Low | Passing `goalEntryTicks` at `GameScene.ts:170` is redundant. | Yes. | **APPLIED** — dropped. Smaller diff. |
| **C11** | Low | `level-goal-fits.test.ts` is future-proofing, not needed for today's five levels. | Yes. | **RECORDED, NOT REMOVED** — it is the only guard against the exact-vertical-equality brittleness Codex itself confirms in (b), and the failure it prevents makes a level unwinnable. Cheap insurance against an expensive class of defect. |
| **C12** | Low | G.7/G.8/G.9 are process gates and can be green while gameplay is broken. | Yes — true of every phase's gate. | **RECORDED** — inherent to the protocol; the `play`-owned criteria exist for exactly this reason, and this session added two more of them. |

**Ruling accepted on the question the plan was least sure about:** widening step 9d's meaning
in place is **not** a substantive violation of `tick.ts`'s contract, because the numbering and
ordering guarantee is untouched. The header text is amended to describe the widened semantics
accurately, which is the whole obligation.
