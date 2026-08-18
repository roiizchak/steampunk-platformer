# Codex implementation review — Phase 8 (Level design and progression)

Run 2026-08-18, `/codex:rescue --wait --fresh`, on branch `phase-08-levels` against `main`, **after**
all three gate-owner agents had run twice each and their findings were applied — the order
[CLAUDE.md §4](../../CLAUDE.md) fixes, because applying owner findings changes the diff Codex reads.
This is criterion **8.9**.

Prompted with the `node_repl` + `fs.readFileSync` instruction, because Codex's sandboxed shell cannot
spawn processes on this machine (`CreateProcessAsUserW failed: 5`). It states its own blind spot at
the end of the report and it is preserved here *(9.3)*: it could not run Git, tests, the build or a
browser, so every finding is **static file evidence** and was re-verified locally before disposition
*(C6)*.

The prompt asked five questions and only those five, because "the tests could be stronger" had
already been asked and answered six times over by the gate owners:

1. Which change is most likely to be **wrong** rather than merely improvable, and what is the
   smallest observation that would reveal it?
2. Where does the implementation **contradict** a comment, a document, or a rule the project states
   about itself?
3. `src/sim/goal.ts` makes completion terminal before step 1. What does that freeze break that
   nobody has noticed?
4. `src/game/save.ts` holds an unwritable save in module state and carries unparsed entries through a
   write. Attack both.
5. Which gate is green for a reason other than the one its name and message claim?

---

## The report, verbatim

1. **High — rank 1/5.** The most likely wrong change is save-version laundering. `readProgress()` correctly rejects an unknown schema wholesale, but `carriedOver()` ignores the stored version, copies its level entries, and `writeProgress()` relabels them as version 1 (`src/game/save.ts:159-162`, `197-205`, `227-234`). An ordinary boot then writes `lastLevel`, invoking that path (`src/scenes/gameLevelPick.ts:151-154`).

   Smallest revealing observation: seed a version-2 save containing a version-1-shaped completed `level-04`, boot once, then inspect storage. It becomes version 1 while retaining that completion; a subsequent request for `level-05` passes because only its immediate predecessor is checked (`src/sim/progress.ts:66-70`). The future-version test only reads such a save; it never composes the read with a write (`tests/unit/save-progress.test.ts:113-127`).

2. **Low — rank 5/5.** The terminal guard contradicts the tick-order rule. The file declares its numbering authoritative and says inserted work receives a letter rather than changing that contract (`src/sim/tick.ts:2-9`, `11-29`, `43-58`). Phase 8 nevertheless added an unlettered branch before step 1 that suppresses every numbered step (`src/sim/tick.ts:135-141`). Consequently, a call advertised as "exactly one simulation tick" can execute zero steps (`src/sim/tick.ts:129-140`). That is a direct contract contradiction even if terminal behavior was intentional.

3. **Medium — rank 3/5.** The freeze breaks completion-delivery recoverability. The sim atomically sets `completed` and emits the sole edge (`src/sim/tick.ts:305-307`), but all later calls return no events (`src/sim/tick.ts:135-141`). The scene starts saving, overlay construction, and continuation only from that edge (`src/scenes/GameScene.ts:269-290`; `src/scenes/gameComplete.ts:67-82`).

   Therefore, if the first delivery is interrupted — most concretely, completion occurs in the early half of `advanceSplit()` and its intervening snapshot callback throws before merged events are returned — the world is already terminal and can never report completion again (`src/sim/advanceSplit.ts:70-73`; `src/scenes/GameScene.ts:252-260`). The terminal test only enforces that every later event is false; it never constructs a failed first delivery (`tests/unit/goal-completion.test.ts:133-142`). The result is a permanently inert level with no retry path for whatever portion of the save/overlay/continue handoff did not run.

4. **High — rank 2/5.** The two persistence mechanisms can create states absent from the tests:

   - `unwritten` is module-global, not associated with the storage instance, and `readProgress()` returns it before consulting the supplied storage (`src/game/save.ts:96-105`, `145-147`). After any failed write sets it (`src/game/save.ts:220-243`), a recovered store — or storage updated by another tab — is ignored. A later write can overwrite the newer `lastLevel` and a better score for the same level, contradicting the completion flow's claim that rereading storage prevents another tab's progress being rolled back (`src/scenes/gameComplete.ts:73-78`; `src/game/save.ts:227-230`). The test only proves that an explicit successful write clears the fallback; it never reads newer disk state while the fallback exists (`tests/unit/save-progress-durability.test.ts:90-97`).

   - Raw carry-over can produce the future-version-to-v1 state from answer 1. It also uses ordinary `{}` accumulators, so an own `__proto__` entry is assigned through the inherited setter and omitted by `JSON.stringify`, silently defeating the stated no-data-loss purpose (`src/game/save.ts:179-195`, `197-205`, `227-234`). The prototype test covers reading that key but never writing it back (`tests/unit/save-progress.test.ts:216-231`).

5. **Medium — rank 4/5.** The 8.6 "align" e2e gate can be green because the exit exists and renders, not because it is aligned. Its title claims the drawn exit is on the goal rectangle (`tests/e2e/phase-08-complete.spec.ts:173-181`), and the helper returns the object's `x` and `y` (`tests/e2e/completeHelpers.ts:31-56`), but the assertions never compare either coordinate — or rendered bounds — with `level.goal`; they check only `willRender`, depth, and the dimensions of the data rectangle (`tests/e2e/phase-08-complete.spec.ts:184-199`). This is especially material for the shipped greybox: its `Graphics` object remains at transform `(0,0)` while drawing absolute coordinates internally (`src/scenes/goalLayer.ts:71-84`). Offsetting those `fillRect` coordinates would preserve every asserted condition while visibly separating the exit from its trigger.

Blind spot stated by Codex: it could not run Git, tests, the build, or a browser, so it could not verify the diff against `main`, reported green counts, generated-file identity, or runtime behavior — findings are static file evidence only.

---

## Triage

Every finding is **applied** or **recorded with a one-line reason** *(C11)*. Nothing was silently
dropped. The order below is Codex's own ranking, not the order they were fixed in.

| # | Rank | Finding | Disposition |
|---|---|---|---|
| 1 | High 1/5 | **Save-version laundering.** `carriedOver` ran against raw bytes with no version check, so a version-2 save had its entries copied out and re-stamped version 1 by the next write | **APPLIED** — and **verified empirically first**, not taken on trust. Seeded `{"version":2,…,"level-04":{completed:true}}`, booted once, read storage back: `AFTER WRITE: {"version":1,"lastLevel":null,"levels":{"level-04":{"completed":true,"bestGears":1}}}` — which unlocks level-05. Self-inflicted two commits earlier, by the fix for the gate owners' "a corrupt entry must not be erased" finding. Fixed by gating `carriedOver` on `stored.version !== PROGRESS_VERSION → return kept`. New gate in `save-progress-durability.test.ts` |
| 4a | High 2/5 | **`unwritten` shadows the disk.** Module-global, returned by `readProgress` *before* consulting storage, so a recovered store — or another tab's newer save — was ignored. Directly contradicts `gameComplete.ts`'s own comment about re-reading storage so another tab's progress is not rolled back | **APPLIED** — `readProgress` split into `readFromStorage` + `mergeSaves(onDisk, memory)`, which takes the **union**: `completed` ORs, `bestGears` takes the `max`, `lastLevel` prefers memory. New gate asserts the union in both directions |
| 4b | High 2/5 | **`__proto__` silently lost.** `carriedOver` accumulated into a `{}` literal, so an own `__proto__` entry went through the inherited setter and vanished from `JSON.stringify` — defeating the stated no-data-loss purpose | **APPLIED** — the accumulator is `Object.create(null)`. Confirmed by observation first: the key was present in the input and absent from the written JSON |
| 5 | Medium 4/5 | **8.6's `align` test does not check alignment and could not.** It asserted `willRender`, depth and the dimensions of the *data* rectangle, never a coordinate. The greybox exit was a `Graphics` object left at transform `(0,0)` drawing absolute coordinates internally, so offsetting those `fillRect` calls would separate the exit from its trigger with every assertion still green | **APPLIED, in the CODE rather than the test.** `Graphics` has no `getBounds()` in Phaser 4 — the drawn extent was not measurable at all, which is *why* the test could not have been written correctly against it. The exit is now a `Container` positioned at `goal.x/goal.y` holding local child rectangles, so `getBounds()` returns the drawn extent; `completeHelpers.drawnGoal` returns `bounds`, and the spec compares them against `level.goal` |
| 3 | Medium 3/5 | **A lost `levelCompleted` edge leaves a terminal world with no flow and no retry.** The sim sets `completed` and emits the sole edge on the same tick; every later tick returns no events. If that single delivery is interrupted, the world is permanently inert — no save, no overlay, no ENTER binding, and a page reload is the only exit | **APPLIED** — new `src/scenes/completionGate.ts`: `shouldRunCompletion(edge, completed, handled)` fires on the edge **or** on a terminal world that has not been handled, with a `completionHandled` flag on `GameScene` (reset in `init()`, beside `playerInputEnabled`) keeping it one-shot. Deliberately not a loop: the flag is set *before* the flow runs, so a handler that throws is not re-entered every frame. `tests/unit/completion-gate.test.ts` drives all eight rows, and both bounds were watched failing — reverting to `return levelCompletedEdge` alone: **3 failed**; deleting the `handled` guard: **4 failed** |
| 2 | Low 5/5 | **The freeze is an unlettered branch before step 1**, against `tick.ts`'s own declared rule that the numbering is the contract and new work gets a letter — so a call advertised as "exactly one simulation tick" can execute zero steps | **APPLIED** — it is now **step `0`** in the contract list, with a paragraph stating why it is the one exception to the letter rule: `9b`/`9c`/`9d` are letters because each INSERTS work between two existing steps and must not shift them, whereas step 0 inserts nothing between anything — it precedes the list and, when it fires, replaces it. Nothing can be renumbered by a step that comes before number 1. The guard's inline comment is numbered to match |

### What Codex could not check, preserved *(9.3)*

Its own closing sentence: *"it could not run Git, tests, the build, or a browser, so it could not
verify the diff against `main`, reported green counts, generated-file identity, or runtime behavior —
findings are static file evidence only."*

So findings 1 and 4 were re-verified by **seeding the state and reading storage back**, in a real
browser, before either was called real. Finding 5 was re-verified by strengthening the assertion and
watching the exit fail it. Findings 2 and 3 are file-evidence claims about a contract and a
control-flow gap; both were read locally against the cited lines, and both were correct.

### What this review did NOT find, and who did

Recorded so the two review layers are not confused for one another. The blocker of the phase — every
level after the first opening with the character frozen, because `playerInputEnabled` was never reset
on a scene restart — was found by the **code-reviewer gate owner's adversarial brief**, not here, and
was already fixed by the time Codex read the diff. The six gate-owner briefs are logged separately in
[`../qa/phase-08-levels-02-gate-owners.md`](../qa/phase-08-levels-02-gate-owners.md); `docs/reviews/`
stays Codex-only.
