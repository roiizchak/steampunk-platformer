# Next session — three gate defects, and nothing else

← [HANDOFF.md](../HANDOFF.md) · [PRD.md § The phases](../PRD.md#the-phases)

**Written 2026-08-16, at the end of the session that closed Phase 7.**

The previous version of this file (the one that scoped Phase 7) is superseded. Phase 7 is done,
merged and pushed.

---

## Where things stand

**Phases 1–7 are ✅ and merged.** `main` is at `3f46c7f`, pushed and verified: typecheck · 1350 unit
tests · 1350 with Phaser uninstalled · `build` + `verify-dist` with 11 audio files byte-identical ·
38/38 on `chromium-gpu` · 47/48 headless.

Phase 8 (Level design and progression) is next in the plan. **It is not this session's work.**

### 🔴 This session is scoped to exactly three things

The owner's instruction, verbatim: *"the 3 that you flagged, we'll do them only in the next session.
**only them**."*

All three are **defects in the project's own gates**, not in the game. Each one is a gate that is
green while it cannot see the thing it was written to catch, or a rule that is satisfied by a
citation that expired. None of them changes what a player experiences, and that is exactly why they
are easy to keep deferring.

Do **not** start Phase 8. Do **not** fix criterion 4.23 (see the note at the bottom).

---

## The three

### 1. `MAX_BURST_RATIO` in Phase 5 is probably blind, and was never red-proved

**Where:** `tests/e2e/perfBudget.ts` (`MAX_BURST_RATIO = 6`) and
`tests/e2e/phase-05-perf.spec.ts:326-333`.

**The claim to test.** Phase 7 proved, by measurement, that **a percentile cannot see a cost carried
by a small fraction of frames**. This machine serves **~479 rAF frames per 120 sim ticks** — about
240 fps against a 60 Hz sim. An audio cue fires ~8 times in that window, so cue frames were **1.9 %
of frames**, and `workP95Ms` did not move when 30 ms of blocking work was injected into every cue.
Frames-served moved from 479 to 425 for the same mutation.

`MAX_BURST_RATIO` gates `fleet.workP95Ms / baseline.workP95Ms`, and its stated purpose
(`perfBudget.ts:68-76`, and `docs/qa/phase-05-combat-08-gate-10.md` finding A2) is to catch the
**synchronised ten-sentry volley** — which is a *single-tick* event, roughly **2 of ~720 frames**,
about **0.3 %**. That is below even the 1.9 % Phase 7 measured as invisible.

**Its only red-proof on record** (`docs/qa/phase-05-combat-07-session-10b.md:347-360`) is a
**per-frame** O(n²) sweep injected into `EnemyLayer.sync` — a cost present on *every* frame, which
the median bound `MAX_WORK_RATIO` catches on its own at 6.43×. Nobody ever injected a burst confined
to the volley tick and watched `burstRatio` respond.

**What to do.**

1. Write the mutation that represents the defect the bound names: a cost confined to the tick the
   sentries fire on — a per-enemy allocation storm on the fire branch, for instance. Not a
   per-frame cost.
2. Run it and watch what `burstRatio` does. **If it does not go red, the bound is decoration** and
   must be replaced or deleted — vault C2, and the project does not keep gates that cannot fail.
3. The replacement Phase 7 landed on is **frames served over a fixed tick window** (`sample()`
   already returns `frames`). See `MAX_AUDIO_FRAME_LOSS_RATIO` in `tests/e2e/perfBudget.ts` for the
   worked version, including why its bound is 1.02 and what its demonstrated floor is.
4. Whatever you conclude, **record the numbers**, not the verdict.

⚠️ Phase 6 is **not** affected — `phase-06-perf.spec.ts` never gates main-thread p95, and its GPU
p95 is deliberately left ungated with a documented reason.

**Read first:** `docs/qa/phase-07-audio.md` § "7.7 — the percentile that could not see a 30 ms
stall", and `docs/qa/phase-07-audio-02-gate-owners.md` finding **G31**, which is where this was
raised.

---

### 2. Criterion 6.9 fails under full-suite load and passes in isolation

**Where:** `tests/e2e/phase-06-perf.spec.ts`, the GPU ratio assertion against
`MAX_HUD_GPU_RATIO = 1.25` (`tests/e2e/perfBudget.ts:147-158`).

**What is known, and it is all measured rather than assumed.**

| run | result |
|---|---|
| full suite, phase-07-audio branch | **failed**, GPU ratio 2.5× (0.037 → 0.092 ms) |
| full suite, same branch, later | **failed**, GPU ratio 3.53× (0.176 → 0.623 ms) |
| full suite, **pre-audio `main`** in a worktree | **failed**, main-thread ratio 2.333× (0.300 → 0.700 ms) |
| isolation, `--project=chromium-gpu` alone | **passed**, 3 of 3 |
| GPU project alone (38 specs) | **passed**, twice |

**So it is pre-existing and proven so** — the `main` run had zero audio rows in the catalog. The
trigger is the **47 preceding headless tests**, not Phase 7 and not the HUD.

Note the two branch failures disagree with each other: one baseline is **five times below** the
documented 0.171–0.198 ms range and the other sits inside it. Numbers that unstable are measuring
the machine, not the HUD. The performance owner's finding **G37** predicted exactly this: a gate
whose clean margin is **one frame in 479** is noise-sensitive in both directions — it can go red for
a reason unrelated to the HUD, and it can stay green while a real cost hides in the same noise.

**What to do.**

1. Reproduce it deliberately: run the headless project, then the GPU project, in one session.
2. Decide what the gate is actually for. If it is a *budget*, it needs a bound that survives a
   contended machine; if it is a *regression tripwire*, it needs a statistic that is not two small
   numbers divided by each other.
3. **Do not fix it by raising the bound.** A bound loose enough to survive contention is loose
   enough to hide the overdraw the assertion exists to catch, which is the same reasoning
   `playwright.config.ts` uses to ban raising `BOOT_TIMEOUT`.
4. Consider whether the GPU ratio should be gated at all. Phase 6 already left the GPU **p95**
   ungated for the same class of reason and wrote down why.

**Read first:** `docs/qa/phase-07-audio.md` deviation **D8**.

---

### 3. `GameScene.ts` is 432 lines, and the rule that permits it is satisfied by an expired citation

**Where:** `src/scenes/GameScene.ts`, `tests/unit/file-size.test.ts:82-108`.

**Two separate problems, and the second is the one that matters.**

**(a) The file is over the ceiling.** It was 386 lines on `main` before Phase 7 and is 432 now.
Phase 7 added four things: an `audio` field, `protected catalog()`, the `createAudio` call, and one
line in `update()` — twenty-seven lines with their docstrings.

The seam is real and already established twice: `gameInput.ts` and `gameDev.ts` were both carved out
of this file for exactly this reason. The remaining coherent group is the rendering glue —
`renderPlayer`, `renderHud`, `renderParallax`, `createParallax`, `drawLevel`, `followPlayer`. About
27 lines out closes it.

It was not done in Phase 7 because it touches the scene surface every Phase 2–6 spec drives, and
that needs a session that can re-run the full regression against it. **This is that session.**

**(b) 🔴 The mechanical gate could not have caught the crossing.** `file-size.test.ts` accepts an
over-limit file whose path appears in **any** `docs/qa/*.md`, and `docs/qa/phase-04-art.md:239`
already named `GameScene.ts` — a Phase 4 citation justifying **459 lines** on grounds
(`create()`, `update()`, five `protected` methods, three DEV scene literals) that say nothing about
audio. So the file crossed 400 in Phase 7 with the gate green.

**What to do.**

1. Split `GameScene.ts` back under 400. The rendering glue is the seam; keep the docstrings —
   `file-size.test.ts`'s own message says not to get under the limit by deleting the comments that
   explain the code.
2. Then decide about the test. Options considered and deliberately deferred in Phase 7 (**D9**):
   requiring the citation to name the *current* phase would re-open every existing citation, which
   is why it was not done piecemeal. With the split done there may be **zero** files over the limit,
   which makes tightening it cheap for the first time.
3. If you tighten it, **watch it go red** against a stale citation before trusting it.

**Read first:** `docs/qa/phase-07-audio.md` § "7.7 — the 400-line justification", and deviations
**D7** and **D9**.

---

## How to run this session

Not a phase, so not the ten-phase workflow. But three rules still bind:

- **Watch every gate fail before trusting it** *(C1)*, and confirm the mutation reverted by
  "content changed AND the original count dropped by one", never by "the count is now zero"
  *(C12)*.
- **A gate that cannot go red is decoration** *(C2)*. Items 1 and 3(b) are both instances of that
  rule, so the session should end with more gates that can fail, not fewer.
- **Kill dev servers by port before reporting done** *(C13)*.

Full verification before reporting done:

```bash
npm run typecheck
npm test
npm run test:sim-isolated      # recover with: npm i phaser@4.2.1 --save-exact
npm run build
npx playwright test                              # headless
npx playwright test --project=chromium-gpu       # real GPU, headed
```

⚠️ **If you use a `git worktree` to compare against another branch, do not junction `node_modules`
into it.** `git worktree remove --force` follows the junction and deletes the real one — it happened
in the Phase 7 session and cost an `npm ci` and a full re-verification. Remove the link first with
`[System.IO.Directory]::Delete(path, $false)`, which does not recurse into the target.

---

## Explicitly NOT in scope

**Phase 8.** Do not start it.

**Criterion 4.23 — `phase-04-assets.spec.ts:150`, currently RED on `main`.** The drawn bottom sits
**14.75 px** off the sim feet y while the player is not moving vertically. It fails identically on
pre-audio `main` (**14.70 px**), and it *passed earlier in the Phase 7 session* — it began failing
after an `npm ci` rebuilt `node_modules`, so the trigger is environmental rather than a source
change. Reproducible in isolation. Recorded as **D8b** in `docs/qa/phase-07-audio.md`.

The owner scoped this session to the three items above and said *"only them"*, so **4.23 is out of
scope.** It is named here rather than omitted because it is a merged phase's criterion sitting red
on `main`, it is about the character meeting the ground, and **Phase 8 is level design** — so it is
the obvious thing to raise with the owner before Phase 8 starts, not something to quietly fix now.
