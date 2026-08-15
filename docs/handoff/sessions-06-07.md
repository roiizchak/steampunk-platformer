[← HANDOFF.md index](../HANDOFF.md)

## 12. Session 6 — 2026-08-11. **The batch shipped. Padding turned out to break the sprite size.**

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-staged-mountain.md` (revision 2, approved).
Its Codex plan review — **BLOCK, 6 blockers, 3 major** — is appended to
[reviews/phase-05-plan.md](../reviews/phase-05-plan.md). **All re-verified locally, all CONFIRMED**,
including two the plan's author had stated wrongly himself.

**Spend: $23.51 → $31.84 of $40. $8.16 remains.** Four commits: `15f3aad`, `26aa639`, `59d0e7c`,
plus this. `Tests 847 passed (847)`, typecheck clean, build + verify-dist ok.

### 🔴 The review finding that saved the batch

**Revision 1 would have spent $8.33 and extracted the clips it was buying replacements for.**
`submit-clips.mjs` picks a download filename from what is on disk (`nextFreeDownloadPath`);
`findClip` resolves what to extract from `CLIP_FILES`. **Nothing connected the two.** Measured one
step before submission: six of seven keys would have landed a new `-rN` and gone on packing the
PREVIOUS round — silently, looking exactly like success — and the seventh (`brass-courier/death`,
declared `null`) would have thrown on an ambiguous glob.

Closed by `tools/gen/clipAdoption.mjs`: every `.mp4` on disk must be the declared winner or listed in
`SUPERSEDED_CLIPS` as knowingly rejected. **Not "newest wins"** — `jump-r2.mp4` is the standing
counter-example, kept as evidence and deliberately not adopted. Watched go red on the **live**
assertion with a synthetic `-r99`, reverted, verified by count.

### 🔴🔴 THE FINDING THAT MATTERS MOST — padding breaks the scale

`brass-courier/attack` extracted, packed, catalogued, and drew **114 px tall against `hurt`'s
288 px**. The character shrinks to 40 % the instant it swings.

`scale` is per SLUG *(vault A5)*. The courier's `0.23723229` came from an **unpadded** idle where the
figure stands 1214 px of 1280. The padded round puts it at ~480 px of 960. `480 × 0.23723229 = 114`.

> **Padding is a property of a GENERATION, and so is the scale it implies.** This is session 5's own
> lesson — padding is not a property of a *subject* — arriving one layer down, at packing instead of
> submission. **A per-slug scale cannot serve both a padded and an unpadded generation of one
> character.** Any future padding decision must be all-or-nothing per subject, or scale must become
> per-generation too.

**User decision: re-shoot courier `attack`/`death` UNPADDED.** Padded records removed.

### The reframe guard now measures the defect instead of banning a string

Un-padding the courier exposed that `validateClipJob` rejected the literal `"9:16"` as *"the specific
defect"* — right about the evidence, wrong about the rule.

**The courier anchor is 1536 × 2752 = 0.558, which IS 9:16.** So for the courier `9:16` is the
*matched* ratio and `1:1` is the reframe — the opposite of the sentry and scavenger, whose anchors are
square. Every clean courier sheet the project ships was shot at `9:16`. The blanket ban forbade the
only correct ratio for one of three subjects.

The guard now compares `anchorRatio` against the submitted ratio (`clipAnchors.expectedAspectRatio`).
**Stricter, not looser** — it catches a reframe on any subject in either direction. Committed failing
fixtures cover both directions. Same correction G6 has had twice: change what it MEASURES, never what
it TOLERATES.

### What the seven clips actually did

Framing is **solved**: no subject crop in five of seven strips, on two anchors never ratio-matched
before, confirmed by eye at full resolution. `rust-scavenger/walk` — which previously failed
extraction outright — now closes at **exactly 2.0 cycles**.

```
PACK   rust-scavenger/walk   12 frames, cycle 2.0   (blocked at pack: needs a 296px cell vs 288 global)
PACK   rust-scavenger/chase  12 frames, cycle 2.6   (blocked at catalog: stride not measured)
PACK   brass-courier/attack   8 frames              (WRONG SCALE — re-shoot unpadded)
PACK   brass-courier/death   10 frames              (WRONG SCALE; cell 7 of 10 flagged a fragment)
FAIL   brass-sentry/fire     G6 f0/6   L232 R0 T278 B244
FAIL   brass-sentry/death    G6 f1/8   L2   R0 T16  B244
FAIL   rust-scavenger/death  G6 f7/10  L14  R0 T532 B228
```

**`brass-sentry/fire-r4` has almost no discharge.** `DISCHARGE_MARGIN` was satisfied by the model very
largely **not firing** — a thin wisp of smoke, no flash. That is the `SPAN_CLIP` failure shape: a
constraint describing a SHAPE, met by not performing the action. Declared as winner because it is the
round the gates must judge, **not** because it is better art.

### ✅ `brass-courier/hurt` SHIPS — the first Phase 5 combat sheet in the catalog

It extracted clean from the **existing unpadded** clip, needed no purchase, and is now catalogued at
288 px with fps 20 derived. Only the per-action sweep found it; it saved $1.19. `PENDING_ART` is down
from three to two.

### Traps session 6 added or confirmed

- 🔴 **Per-action `assets:build` DESTROYED five lift-profile entries.** The write REPLACED the whole
  file, so `assets:build brass-courier hurt` cut `animations` from `idle, walk, run, jump, fall` to
  just `hurt`. That file is **tracked** and is the independent oracle for criterion 4.19. Found by a
  test failing on a missing `run` key, not by anything watching the write. Fixed with
  `upsertLiftProfile` — the same merge `upsertCatalogSheets` already used. **Per-action runs are not
  a misuse; they are what extraction requires.**
- **`build-assets` writes the sheet PNG BEFORE it can know the catalog row will resolve**, so a throw
  leaves a packed sheet with no row. Third instance of the loop-write trap. Two orphans removed.
- **`verify-dist`'s bare-symbol list cannot see a module-scope dev function.** esbuild minifies the
  name away entirely — `spawnDevEnemies` and `DEV_FLEET_COUNT` are **absent from `dist/`**, so that
  check can never fire either way. Proven by removing the guard, rebuilding, and watching
  `verify-dist ok` print anyway. Class **method** names DO survive (as `spawnDevFleet(){}`, exactly
  like `togglePlayground(){}`) but survive identically whether guarded or not, so they cannot
  discriminate either. **The real protection for dev module-scope code is the guard discipline plus
  review, not the build gate.** Recorded, not fixed — an empty-body assertion would discriminate and
  is the obvious next move.
- **`--derive-scale` hardcoded `findSource('idle')`** and the scavenger has no `idle` BY DESIGN, so it
  threw while the config's error message told you to run it. Now action-aware. Scavenger scale
  **0.56074766** from `walk`, spread **4.2 %** against the sentry's 0.3 % — because a gait is not a
  neutral pose. Recorded in the config.
- **An unescaped apostrophe in a test title** (`session 1's`) terminated a single-quoted string and
  produced a brace error 100 lines away. Reword rather than escape.

### Where to pick up

**1. The four approved re-shoots — $4.76 → $36.60, leaving $3.40.** Already authorised:
   - `brass-courier/attack` + `/death` **UNPADDED at 9:16** (the guard now resolves this automatically;
     both carry `FRAME_MARGIN`, which round 1 lacked, so it is a genuine single-variable retry).
   - `brass-sentry/death` + `rust-scavenger/death` **with a tighter debris clause** — NOT YET WRITTEN.
     Write it in `motionCombat.mjs` first. ⚠️ The last containment clause (`DISCHARGE_MARGIN`) was
     satisfied by the model not performing the action; a debris clause risks a flat death the same way.

**2. `rust-scavenger/walk` needs a cell decision.** `packStrip` refuses it: frame 6 is 270 px wide and
   its centroid sits 122 px from its left edge, so it needs **296 px** against the **288 px global
   cell** (decision M3, ONE cell for every subject). Widening the cell touches every sheet; lowering
   the scavenger's scale is "rescale one animation to fit", which vault 4.14 forbids. **This is a
   STOP-and-ask, not a tuning.**

**3. Then:** measure the scavenger stride off the packed walk/chase strips → paste into
   `character-bounds-rust-scavenger.json` → their catalog rows resolve. `tools/gen/sheetGates.mjs`
   (new, this session) runs G4/G5 on any packed sheet: `node tools/gen/sheetGates.mjs <slug> <action>`.

**Not started:** `tests/e2e/phase-05-combat.spec.ts` (W18 — still does not exist; all 44 e2e are
phases 1–4), the **entire §6 QA gate** (every agent owner, two briefs each), and the Codex
**implementation** review (5.14).

**Criterion 5.12 has NOT moved.** The over-limit count is still exactly **10**. The three files split
this session sat *at* 400, never over it, so removing their zero-headroom risk removed nobody from the
list. The ten genuine offenders (`gates.mjs` 726, `GameScene.ts` 611, `prompt.mjs` 586, `chroma.mjs`
556, …) are untouched.

**Phase 5 is failing and must be reported failing.**

---

## 12b. Session 6, second half — the ceiling moved, and the prompt lever ran out

**Spend: $36.60 → $41.36. The user raised the ceiling from $40 to $45**, naming the figure explicitly
after being asked to; the reasoning and who decided it are in
[qa/phase-05-combat.md](../qa/phase-05-combat.md). **⚠️ `prd/phase-05-combat.md` §1b still says "$40,
and it is a hard STOP" — that line is stale and was deliberately not edited from the session that
spent against it.** Correct it deliberately.

### What eight more clips established

| clip | state | detail |
|---|---|---|
| `rust-scavenger/death` | ✅ **PASSES G6** | 10 frames, onset f11 — but **will not pack**, see below |
| `brass-courier/hurt` | ✅ **SHIPS** | catalogued, 288 px, fps 20 derived. No purchase; the sweep found it |
| `brass-sentry/death` | FAIL `top 0` only | `-r4` is the best: `L226 R200 T0 B244`. The failure is the **steam plume** |
| `brass-courier/attack` | FAIL `R0` | `L188 R0` — unchanged across three prompt clauses |
| `brass-courier/death` | FAIL `R0` | `L172 R0` |
| `brass-sentry/fire` | FAIL `R0` | and its **discharge is nearly absent** — a separate problem |
| `rust-scavenger/walk` | extracts, cycle **2.0** | blocked at pack — cell width |
| `rust-scavenger/chase` | extracts, cycle 2.6 | fits 288; blocked at catalog — stride unmeasured |

### 🔴 The cell decision was taken on incomplete data — reopen it

**User chose to widen the global cell 288 → 320×384**, keeping M3's one-cell rule, on the strength of
`rust-scavenger/walk` needing **296 px**. Then `rust-scavenger/death` turned out to need **358 px** —
a collapsed scavenger lying flat is genuinely wider than it is tall. **320 does not cover it.**
Measured requirements: `chase` fits 288 · `walk` 296 · `death` **358**. The courier and sentry sheets
all fit 288 today.

**Nothing has been repacked.** 288 → 384 is a ~33 % atlas increase against the ~11 % that was agreed,
which is a materially different decision, so it goes back to the user rather than being rounded up
quietly.

### 🔴 The prompt lever is exhausted for the courier, and padding is the proven answer

Three containment clauses have now been tried against `brass-courier/attack`'s `right 0`, and its
margins did not move: `L188 R0` before and after. **What demonstrably works is padding** — the padded
`brass-courier/attack` (`-r3`, already bought and on disk) **passed G6 cleanly**. Its only defect was
that it packed at **114 px against `hurt`'s 288 px**, because `scale` is per-slug and was derived from
an unpadded clip.

> **So the courier's framing is already solved on disk, and what remains is a number in a config
> file.** The $0 path is a declared per-`(slug, action)` scale, pasted by hand with provenance exactly
> as A5 requires, letting a padded generation and an unpadded one coexist. That was the option
> originally recommended and not taken; the $4.76 spent since is what established that the
> alternative — re-shooting unpadded — does not fix the framing.

### `HOLD_CENTRED`: withdrawn as UNATTRIBUTABLE, not disproven

One win, one loss, two no-change across four clips (`rust-scavenger/death` fixed;
`brass-sentry/death` destroyed from `L226 R200` to `L0 R0`). **The endpoint has no `seed` input**, so
four samples split 1/1/2 cannot separate a clause from run-to-run variance. Left unapplied as a risk
judgement. `DEBRIS_MARGIN`, by contrast, IS attributable: `L2 → L226`, single-variable.

### 🔴 5.11's frame budget is measured and it is not comfortable

`tests/e2e/phase-05-combat.spec.ts` now exists (46 e2e pass). Under **22 drawn enemy bodies**:
**90 frames, median 55.70 ms, max 63.30 ms — roughly 18 fps against a 60 fps target.** The spec
asserts a loose `<100 ms` sanity ceiling because no baseline exists (PRD §7: the vault has nothing on
performance). **Interpreting this is criterion 5.11's owner's job** and it should not be waved through
— though headless Playwright plus 34.5 MB of parallax PNG per boot is a known confound.

### Traps added

- **A summary line is not evidence, demonstrated live.** A regex rewrote an `import {}` list; seven
  suites died at parse and vitest printed **`PASS (745) FAIL (0)`** — zero failures while 102 tests
  never ran. Every count since is taken from the JSON reporter (`--reporter=json --outputFile`).
- **Do not measure the tree while an agent is mutating it.** A run showed `enemy-view` and
  `player-hud` failing with `healthBarFillWidth` returning full width; the source was correct and the
  tree matched HEAD — it was a subagent's deliberate C1 mutation, mid-revert. Generalises the existing
  "never run `test:sim-isolated` while others work".
- **An unescaped apostrophe in a test title** terminated a string and produced a brace error 100 lines
  away.

---

## 13. Session 7 — 2026-08-12. ~~**This section supersedes §12b, and everything above it.**~~

> ⚠️ **Superseded by §14 (session 8, 2026-08-13). Read §14 first.**

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-vectorized-hanrahan.md`. Its Codex plan
review — the **seventh** — returned **BLOCK, 4 blockers, 3 major, 1 minor**, all applied
([reviews/phase-05-plan.md](../reviews/phase-05-plan.md)). The Codex **implementation** review
(criterion 5.14) ran for the first time in this phase and returned **BLOCK, 6 blockers, 2 major,
2 minor** ([reviews/phase-05-impl.md](../reviews/phase-05-impl.md)).

**Spend: $41.36. Not one cent spent this session.** The ceiling was raised **$45 → $55** by the user
before it was clear nothing would need it.

```
267 unit suites / 870 tests / 0 failed   (JSON reporter, never a summary line)
46 e2e passed (5.3m) · typecheck clean · build + verify-dist ok · dev servers killed by port
```

**Phase 5 is FAILING and must be reported failing.**

### The whole session in one paragraph

Everything that shipped was **$0 config work on art already bought**. Two sheets entered the catalog —
`rust-scavenger/walk` (the first scavenger sheet the project has ever had) and `brass-courier/attack`
— by fixing two *numbers*, not by generating anything. The rest of the session was the §6 QA gate,
deferred across six sessions, and the two Codex reviews. **The gate found two real gameplay bugs that
every checklist verdict had just called PASS**, and the implementation review found a hole in a guard
written the same day.

### Four user decisions, all recorded in [qa/phase-05-combat.md](../qa/phase-05-combat.md)

| | decision |
|---|---|
| **D1** | The frame cell is **PER SLUG** — courier 288, sentry 288, **scavenger 512**. Decision M3 amended in the open |
| **D2** | `scale` is declarable per **`(slug, action)`**, pasted by hand with provenance |
| **D3** | Ceiling **$45 → $55**, figure named on request. `prd/phase-05-combat.md` §1b corrected, with the whole `$40 → $45 → $55` chain |
| **D4** | Config and gate first at $0; **art is explicitly post-phase** — spending after 5.14 would invalidate it |

### 🔴 D1 was decided TWICE, because the first number was wrong

**`rust-scavenger/death` needs 510 px, not the 358 this document recorded in §12b. 358 is frame 4.**
`packStrip` threw on the first clipped frame and frames 5–9 were never evaluated. A user decision
(384 global) was taken on that number and had to be withdrawn.

**Fifth instance in this phase of one pattern**, and the first that cost a decision:

> **When a pipeline stops at the first failure, a verdict about stage N is evidence about stage N
> ONLY.** Any statement of the form *"X is blocked on Y"* is provisional until X has reached the end.
> **Prefer an instrument that sweeps and reports a maximum over one that stops and reports an
> instance.**

So the instrument was fixed, not just the number: **`packStrip` now sweeps every frame on both axes**
and reports the true maximum. Verdict unchanged — any clipped frame still fails.

**Fixing it immediately surfaced a sixth instance.** Both `death` clips now clear the clipping gate and
hit a **fragment gate** instead: `detectFrames` segments debris flecks as separate frames
(`"death" cell 5 of 12 is 36x9 against a median height of 229`). **A wider cell does not help** —
probed at 384 for the courier, same gate. Both deaths are an art problem, and art is post-phase.

### What ships, and what does not

| clip | state |
|---|---|
| `brass-courier/hurt` | ✅ ships, 288 px, fps 20 |
| **`brass-courier/attack`** | ✅ **NEW** — padded round adopted, per-action scale **0.6**, draws 289 px, fps **24** derived as `8 × 60 / 20` |
| **`rust-scavenger/walk`** | ✅ **NEW** — packs at 512, stride **312** game px measured by the courier's own foot-band method |
| `brass-sentry/idle` | ships, held by the expected-failure lock on loop wrap |
| `rust-scavenger/chase` | ❌ stride **INDETERMINATE** — one peak and one trough across 12 frames at band heights 16/24/32, the trailing-leg-airborne failure vault 4.18 names for the courier's `run`. **No stride was guessed** |
| `rust-scavenger/death` · `brass-courier/death` | ❌ both hit the **fragment gate** |
| `brass-sentry/fire` · `/death` | ❌ unchanged; `fire`'s discharge is still nearly absent |

### 🔴 TWO CONFIRMED GAMEPLAY BUGS — unfixed, and the phase fails on them

Found by the **adversarial** `code-reviewer` brief, re-measured by the orchestrator against the real
sim, and **escalated by the Codex implementation review from "defer to session 8" to "these block the
phase"** — a judgement adopted over the orchestrator's.

- **S1 — the scavenger chase has no dead zone.** `enemyScavenger.ts:118-120` is
  `dir = playerX >= x ? 1 : -1` with no tolerance, so a player it cannot reach — standing above it —
  flips `facing` **every tick**. **Measured: 39 flips in 40 ticks.** `enemyView.ts` reads `facing` for
  `flipX`, so **the sprite strobes.** The flap test re-pins `s.x` every tick and its own docstring
  names *"the player is above it"* as the real in-game case — **it pins out exactly the case it names.**
- **S2 — the chase ignores the patrol bounds.** `:121` returns before the clamp at `:127-133`.
  **Measured: patrolMax 700, chased to x=900, snapped back to 700 on release — a 200 px teleport.**

Both need a design call (dead-zone width; whether a chase should leave its ledge), which is why they
were raised rather than patched. **Fix these first in session 8.**

### The gate, honestly

15 findings in [qa/phase-05-combat.md](../qa/phase-05-combat.md), every one applied or given a one-line
reason *(C11)*, each agent's "could not check" preserved *(9.3)*. **5.1 and 5.5 were re-run from
scratch** — their session-3 sign-offs were void. **5.7 turned out never to have been run by its owner
at all**, despite being listed. **5.4c PASSED for the first time**, now that `attack` ships:
`G4 drift 0px within budget 3px`, `G5 frame 3 (tick 9) lands inside the active window [6, 10)`.

**5.4 and 5.8 were both run by hand** with `playwright-cli` and are recorded with their evidence —
5.4 by sampling `frame.index` in-page off the `animationupdate` event (**12 distinct indices** during
patrol), 5.8 by driving a scavenger to **2/60** and judging the screenshot **at 3× magnification**.

### 🔴 5.11 — measured, and it is bad

**Three runs now, and they do not agree:**

```
55.70 ms median   session 6 — the 20-strong fleet drew as RECTANGLES, no scavenger sheet existed
82.10 ms median   session 7 — after rust-scavenger/walk shipped
73.40 ms median   session 7, final verification
```

**≈ 12–18 fps against a 60 fps target.** Part of the 55.70 → 73–82 movement is very likely **not noise
but the cost of this session's own art landing** — those 20 bodies now animate. **That is a hypothesis,
not a measurement**; isolating it needs a run with the catalog row removed. **Do not report the swing
as pure variance.**

The spec asserts only `<100 ms` because **no baseline exists** (PRD §7, vault §B1) — and the measured
values are now 73–89 % of that ceiling, so it can fire on noise while still passing a 2× regression.
**`bodyCount` also cannot tell a real Sprite from the `Rectangle` fallback** — `EnemyLayer` tracks
`isSprite` for exactly that and the spec never reads it. **Vault 9.4, and it is the first thing to fix.**

### Traps this session added or proved

- 🔴 **A handoff document is stale from the first commit of the session that will rewrite it.** This
  cost real review time twice: a `qa-expert` brief reported 5.4c/5.4d as never run, and **two of
  Codex's six blockers were it correctly reporting that the REPOSITORY had no record of work that had
  been done.** Record evidence as it is produced, and tell any mid-session reviewer which documents
  are known stale.
- 🔴 **A probe that quietly does nothing looks exactly like a probe that found nothing.**
  `createScavenger` takes `y` with **no default**; omitting it made `withinRadius` compare against
  `undefined`, detection returned `false`, and the scavenger never chased — so the first run looked
  like a clean refutation of S1. The second put the player outside the 480 px detect radius and failed
  the same way. **Check the fixture entered the state it is meant to test.**
- **Two agent reports were flatly WRONG** and were caught only by re-verifying: the performance
  checklist brief claimed zero enemy keys in `index.json`; the qa adversarial brief claimed 5.4c had
  never run. Both false. Its own adversarial counterpart contradicted the first one and was right.
- **`file-size.test.ts`'s globs cannot see** `.agents/skills/**` — two files there exceed 400. Judged
  out of scope (vendored skill runtime, not project source), so the honest count stays **8**.
- **A guard can be watched go red three ways and still have a hole**, if part of the path is
  unreachable from a test. `scale: null` resolved to the slug value but was labelled `'action'`,
  buying an exemption it had not earned. The logic moved out of the build script into
  `slugConfig.mjs` so a test could reach it.
- **`gates.mjs` grew 538 → 562** while fixing the split's circular import, and **the evidence table
  drifted inside the very session that corrected it for drifting.**

### 🔴 A PLAYTEST AFTER THE GATE FOUND FOUR MORE — read this before the list below

The user played the build for 27 seconds **after** the gate, both Codex reviews and 46 e2e had all
been run and reported green. Full write-up, with the confirming line numbers, in
[qa/phase-05-combat.md](../qa/phase-05-combat.md). **All four confirmed in code. None fixed.**

| | defect | root cause |
|---|---|---|
| **P1** | **Dead enemies keep acting** — a killed sentry keeps firing; a killed scavenger keeps patrolling | `enemyTurn.ts:29-41` iterates every enemy with **no `hp > 0` filter**, and `stepSentry` never reads `hp` at all |
| **P2** | **No death animation, either enemy** | neither `death` sheet ships (fragment gate), so `playIfChanged` no-ops and the previous cycle keeps playing — **which only looks right if the body has also stopped, and P1 means it has not** |
| **P3** | **Hitstun is COSMETIC** — the player moves and attacks through being hit | `HURT_TICKS` reserves a state label for 18 ticks; `isCombatState` is consumed **only** in `resolveState` (`player.ts:185`) to stop step 11 overwriting the label. **Nothing gates input, movement or the attack edge.** Needs a design call, not a patch |
| **P4** | **The run cycle visibly drops frames** | the sheet is fine — 12 frames, fps **26.67** derived. **The renderer runs at 12–18 fps (criterion 5.11), so it physically cannot show them.** Do NOT lower the fps to match; it is derived, and authoring it down reintroduces vault 4.22 foot-slide |

**P4 is the one that changes a priority.** 5.11's number was abstract. It is now known to be
**destroying a 12-frame animation the project paid to generate.** Fix the frame rate before spending
another cent on art.

**And P1 is one missing condition causing two of the four symptoms** — the cheapest fix on the list.

> **Vault C4, harder than Phase 2 recorded it.** 4 owners x 2 briefs, 15 findings, two Codex reviews,
> 870 unit tests and 46 e2e — all green — and two minutes of play found four defects. **The gate had
> no criterion for "what does the world do after something dies."** 5.10's standing caveat, *"no test
> actually swings twice and asserts death"*, was the same blind spot seen from the other end.

### Where to pick up

0. **P1 first — it is one `hp > 0` guard and it kills two symptoms.** Then P3 and P4, both of which
   need a decision from the user before any code.
1. **Fix S1 and S2.** They block the phase. Both need a design call from the user first.
2. **Make 5.11's spec assert `isSprite`, not just `bodies.length`**, and add a lower bound on
   `medianMs`. Then isolate whether the 55.70 → 73–82 shift is the sprite path.
3. **4.10 and 4.12 are still unrun** — Phase 4 debt from §1b, confirmed by the Codex implementation
   review. **G5 does not substitute for 4.10**; different audit, different question.
4. **5.12**: 8 files over 400, none justified. `gates.mjs` needs gate logic moved, not fixtures —
   its non-self-test body is 529 lines on its own. `GameScene.ts` (657) is the big one and is
   subclassed, so it is the risky split.
5. **Then art**, post-phase, with $13.64 available: `brass-sentry/fire`'s missing muzzle flash is the
   one problem with an unattempted fix, and `DEBRIS_MARGIN` has never been applied to the scavenger.

**Not started:** an automated spec for 5.4 (hands-on evidence only, no regression guard).
**Phase 5 is failing and must be reported failing.**

---
