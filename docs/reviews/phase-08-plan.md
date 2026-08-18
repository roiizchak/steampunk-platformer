# Codex plan review — Phase 8 (Level design and progression)

Run 2026-08-17, `/codex:rescue --wait --fresh`, **before the first line of implementation**, per
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol). This is criterion **8.8**.

Prompted with the `node_repl` + `fs.readFileSync` instruction, because Codex's sandboxed shell cannot
spawn processes on this machine (`CreateProcessAsUserW failed: 5`). It confirmed at the end of the
review that it read every cited file through `node_repl` and used no shell process — so its findings are
file-evidence and were re-verified locally before disposition *(C6)*.

Two documents were under review: [`prd/phase-08-levels.md`](../prd/phase-08-levels.md) (the phase
contract) and the session's detailed 8-stage implementation plan. Both were named in the prompt, along
with the five standard questions and the two extra questions
[`prd/phase-08-levels.md`](../prd/phase-08-levels.md) §4 directs be asked — the unwinnable-level
question and the spread-versus-headline question.

**Tally: 11 findings. Applied 7 (4 of them blockers). Recorded 3. Confirmed-clean 1. Rejected 0.**

---

## The review, verbatim

> **1. Low — excess deliverables.** `level-04.tmj` and `level-05.tmj` are optional: §1 requires
> **3–5** levels, not five. Five is a later owner choice, not a goal requirement.
> [`phase-08-levels.md:7`] [`detailed plan:9`]
>
> `tests/unit/level-data.test.ts` is also unnecessary even as QA machinery: the plan itself says the
> existing shipped-data sweep in `tilemap-data.test.ts` already answers that question.
> [`phase-08-levels.md:32`] [`detailed plan:233`]
>
> **2. Acceptance criteria with concrete false-green paths, severity-ranked:**
>
> - **Blocker — 8.1:** the proposed proof can validate terrain while omitting the enemies that make
>   terrain traversable or fatal. The existing "real tick / real level" harness explicitly constructs a
>   world with **no enemies**, and the plan calls traversal "essentially seed-independent" precisely
>   because it discounts enemy behaviour. [`phase-08-levels.md:40`] [`level-traversal.test.ts:44`]
>   [`detailed plan:203`]
>
> - **Blocker — 8.2:** one successful hands-on route does not exclude a soft-lock on another branch or
>   approach direction. Its automated companion only examines places where a **right-held** player
>   stalls, although the historical enemy/terrain failure depended on the exact stall and enemy
>   reachability together. [`phase-08-levels.md:41`] [`detailed plan:149`]
>   [`phase-05-combat-06-session-10a.md:217`]
>
> - **High — 8.5:** the gate permits a reversed ramp. Only three named metrics must be non-decreasing;
>   length, surface-height complexity, rise precision, gap precision, hazard count, and the remaining
>   metrics may all make level 1 hardest and later levels easier. "No metric more than doubles"
>   constrains increases, not arbitrarily large decreases. [`phase-08-levels.md:44`]
>   [`detailed plan:191`] [`detailed plan:195`]
>
> - **High — 8.6:** it can pass after the reviewer is led into an invisible goal volume. The criterion
>   begins at "align, animate, fade…" after completion; neither it nor any planned stage requires an
>   in-world goal renderer or visible affordance. [`phase-08-levels.md:45`] [`detailed plan:41`]
>   [`detailed plan:118`]
>
> - **Low — 8.7–8.9:** these are process gates. File size, performance, and completed review records
>   can all be green while gameplay remains broken; "finding recorded" is expressly sufficient even
>   when it is not fixed. [`phase-08-levels.md:46`] [`PRD.md:204`]
>
> **3. High — vault 8.2 is claimed but not satisfied.** It requires seeded RNG, knob sweeps, and
> distinct tune/gate seed sets. The plan calls seed separation "thin," supplies no two seed sets, and
> dismisses the need because terrain is deterministic—even though `tick()` samples RNG and advances
> enemies before player movement. [`phase-08-levels.md:17`] [`phase-08-levels.md:18`]
> [`detailed plan:201`] [`tick.ts:139`]
>
> Vault 8.4 is a separate outright omission: the binding human-scale/background-art anchor is cited by
> the phase but appears nowhere in the detailed plan. [`phase-08-levels.md:19`]
> [`phase-08-levels.md:20`] [`lessons/phase-08-levels.md:14`]
>
> **4. Blocker — a visible goal/exit affordance.** Earlier phases produce no goal field, goal renderer,
> or exit asset: current `LevelData` ends with gears, the catalog's images contain no exit, and
> `GameScene.create()` draws the terrain, player, enemies, and gears only. [`tilemap.ts:68`]
> [`index.json:4`] [`GameScene.ts:123`]
>
> Phase 8 plans the trigger rectangle, sim edge, and post-trigger overlay, but nothing that tells the
> player where that rectangle is before they touch it. [`detailed plan:41`] [`detailed plan:64`]
> [`detailed plan:118`]
>
> **5. High — the most likely subtle shipping defect is a terrain-valid level whose live enemy
> interaction creates a soft-lock.** The plan generalises a terrain traversal and a narrowly defined
> "right-held stall" check, then treats the route as seed-independent. The prior level only avoided a
> guaranteed-death stall because one particular pit stopped the scavenger; removing that ground veto let
> it close from over 400 px away to 92 px. [`detailed plan:142`] [`detailed plan:149`]
> [`phase-05-combat-06-session-10a.md:217`]
>
> **6. Blocker — Stage 6d closes the literal isolated "one pixel above apex" case, but not general
> unwinnability.**
>
> - The vertical gate compares **distinct heights**, not concrete platform nodes or route edges. Two
>   disconnected platforms at the same height collapse into one value, and "consecutive" heights do not
>   establish that the lower platform is reachable from spawn. It also ignores ceilings, which the plan
>   concedes and the real collision resolver actively enforces. [`detailed plan:205`]
>   [`detailed plan:211`] [`detailed plan:213`] [`player.ts:318`]
>
> - The horizontal sweep proves isolated obstacles from a supplied run-up position. The existing
>   `attempt()` creates a fresh world at an arbitrary `startX`; it does not prove the player can reach
>   that run-up, that the landing area is usable, or that consecutive obstacles leave enough recovery
>   distance. [`level-traversal.test.ts:44`] [`level-traversal.test.ts:81`] [`detailed plan:208`]
>
> - The scripted traversal is conclusive only if it builds the exact shipped world—including goal,
>   hazards, enemies, tuning, and shipped seed—and mutates nothing except legal input. The plan does not
>   state those conditions, admits the route covers only itself, and its precedent explicitly omits
>   enemies. [`detailed plan:209`] [`detailed plan:213`] [`level-traversal.test.ts:44`]
>
> - The margin sweep changes one knob by an unspecified delta and only replays that one route.
>   Horizontal clearance also depends on acceleration, friction, speed cap, gravity, jump-cut state,
>   collision shape, and available run-up; the plan therefore does not establish a margin for every
>   required transition. [`detailed plan:210`] [`player.ts:191`] [`tick.ts:218`]
>
> - "Every surface is reachable from the surface below" is a collection of local claims, not a connected
>   spawn-to-goal graph. Each island can have some locally reachable predecessor while the whole cluster
>   remains disconnected from spawn; same-height duplicates are again invisible. [`detailed plan:207`]
>   [`detailed plan:211`]
>
> **7. High — it is reported as a spread, but the gate overclaims what that spread proves.** The
> per-level table with min/max/median and no composite score is honestly a spread rather than one
> headline number, satisfying vault 5.7's reporting form. [`phase-08-levels.md:20`]
> [`detailed plan:189`]
>
> It can genuinely go red: identical levels fail non-zero spread, a decrease in any of the three named
> directional metrics fails, and an upward jump over 2× fails. [`detailed plan:195`]
> [`detailed plan:227`]
>
> It is not an honest gate for "difficulty ramp," however: only three metrics carry direction, one of
> those is optional gears off the critical path, and every other reported metric may trend backwards
> while the gate stays green. It proves varied authored statistics with three monotonic counters—not
> that levels become progressively harder to finish. [`detailed plan:191`] [`detailed plan:197`]

### What Codex could not check — preserved verbatim *(9.3)*

> **Could not check:** I could not execute Git, tests, builds, Playwright, or the browser, so the plan's
> clean-tree and baseline-count claims remain unverified. No shell process was used. All requested
> documents and repository files cited above were successfully read through `node_repl`; Phase 8
> implementation behaviour cannot be checked because it has not been written.

---

## Triage

Every claim re-verified locally before disposition *(C6)*. Findings are numbered `F1…F11`; the numbering
follows the review's own answer order, with the sub-bullets of answer 2 and answer 6 broken out because
they carry different severities and different fixes.

| # | Finding | Severity | Disposition |
|---|---|---|---|
| **F1** | 8.1's traversal harness builds a world with **no enemies**, so it can bless terrain while an enemy makes the required route fatal | Blocker | **APPLIED.** Confirmed locally at `tests/unit/level-traversal.test.ts:44` — the `world()` factory passes no `enemies`. Stage 6d's traversal now builds the **exact shipped world**: goal, hazards, enemies, gears, shipped seed, `DEFAULT_TUNING`, mutating nothing but legal input. |
| **F2** | 8.2's automated soft-lock companion only examines **right-held** stalls | Blocker | **APPLIED, with the residual limit recorded.** Broadened to left-held and post-landing stalls, plus an assertion that no enemy patrol span can reach a point where the player can be pinned between a solid and the enemy. Beyond that it is a search problem — the QA log states the residual limit rather than implying full coverage. |
| **F3** | 8.5 permits a **reversed** ramp: only 3 metrics directional, and "no metric more than doubles" bounds growth, not decreases | High | **APPLIED.** Directional set widened to five — length px, total hazard width, enemy count, max rise as a fraction of apex, widest gap as a fraction of clearable distance — each named in the QA log **with the reason it is directional**. New *no-backslide* rule caps any non-directional metric's decrease at 25% between consecutive levels. |
| **F4** | **Nothing draws the exit.** No goal field, no goal renderer, no exit asset anywhere in earlier phases; 8.6's "align" presupposes something visible | Blocker | **APPLIED.** Confirmed locally: `src/game/tilemap.ts`'s `LevelData` ends at `gears`, and `GameScene.create()` draws terrain, player, enemies and gears only. New Stage 1b adds `src/scenes/goalLayer.ts`, greyboxed from existing tileset gids or a `Graphics` shape — **no fal spend**, because *grey-box before art* is a Global Constraint and Phase 8 is not a generating phase. Final exit art is deferred and recorded. e2e asserts the goal is **drawn** via `willRender(camera)`, with a `setScale(0)` red proof. |
| **F5** | Most likely subtle defect: a terrain-valid level whose live enemy interaction soft-locks | High | **APPLIED via F1 + F2**, and promoted to risk 0 — the phase's named top risk. The `x:3198` history is the evidence: the old level avoided a guaranteed-death stall only because one particular pit stopped the scavenger. |
| **F6** | Vault **8.2** claimed but not satisfied — no two seed sets, and the dismissal was wrong because `tick()` samples the RNG at step 1 and advances enemies at 4a **before** player movement | High | **APPLIED. The first draft's dismissal was wrong and is withdrawn.** Confirmed locally at `src/sim/tick.ts:139` (step 1, `world.tickRoll`) and `:155` (4a, `stepEnemies`). Once F1 puts enemies in the traversal world, seeds matter. Two **disjoint** seed sets: a **tune set** while authoring and choosing routes, a **gate set** the committed assertions run under. |
| **F7** | Vault **8.4** (anchor prop scale to a human figure) is cited by the phase and appears nowhere in the plan | High | **APPLIED.** Confirmed the omission. Stage 1b and Stage 6a now state goal, doorway, platform and prop sizes in **character heights** (288 px body, 132 × 288 px frame) and check them in the contract test, rather than eyeballing them. |
| **F8** | `level-04.tmj`/`level-05.tmj` exceed §1's 3–5 requirement | Low | **RECORDED, no change.** §1 permits 3–5 and the owner chose 5 this session, with the reason that today's level-01 was unplanned and the whole set is being designed. Codex is right that five is a choice, not a requirement; it is a recorded choice. |
| **F9** | `tests/unit/level-data.test.ts` is unnecessary — `tilemap-data.test.ts` already is the shipped-data sweep | Low | **CONFIRMED — Codex and the plan agree.** §5's deliverable is read as "extend `tilemap-data.test.ts` + add `level-reach.test.ts`". Recorded as a deviation rather than creating a second file that answers the same question differently. |
| **F10** | 8.7–8.9 are process gates that can be green while gameplay is broken | Low | **RECORDED, no action.** Structural to the protocol, and it is precisely why 8.1, 8.2 and 8.6 exist and why two of them are `play`-owned *(C4)*. Worth recording as a *pass* rather than as silence. |
| **F11** | Stage 6d proved neither **connectivity** nor same-height platform distinctness, and its horizontal sweep started from an unproved `startX` | Blocker | **APPLIED — Stage 6d rewritten.** Every sub-point was correct: distinct-height comparison collapses two disconnected same-height platforms; "reachable from the surface below" is a bag of local claims that never becomes a spawn→goal path; `attempt()` at `tests/unit/level-traversal.test.ts:81` does create a fresh world at an arbitrary `startX`. Replaced with a **simulated reachability graph**: nodes are walkable surface *segments* (per solid top, not per height), edges are transitions proved by the real `tick()` from an achievable position **on the source segment**, and the assertion is a BFS from the spawn segment reaching the **goal** segment. Because the edges are simulated, ceilings, acceleration, friction, the speed cap, gravity and the collision box are accounted for by construction. Gears get the same treatment. |

## Codex's own blind spots, preserved *(9.3)*

Codex could not execute Git, tests, builds, Playwright or the browser — its shell cannot spawn a process
on this machine, permanently. So the baseline counts and clean-tree claims in the plan
(**1356 unit / 1356 sim-isolated / 48 headless / 38 GPU** green on `208e7bd`) are **unverified by
Codex** and are verified locally instead. It also cannot check any Phase 8 implementation behaviour,
because none existed when the review ran — that is criterion **8.9**'s job, on the diff.
