[← QA-LOG index](../QA-LOG.md) · [next-session prompt](../SESSION-PROMPT-next.md)

## Session — Phase 9's debts (1a–1f) + the stale citations

**Branch:** `session-phase-09-debts` · **Started:** 2026-08-24, off `main` at `3a0a566`
(the docs commit on top of the `a8e4fa1` baseline).

**Scope:** the six debts Phase 9's close recorded (`docs/SESSION-PROMPT-next.md` §1a–§1f) plus §0's
stale `:line` citations. **Out of scope and deliberately so:** the Tier-5 items (§2), the
`brass-sentry/idle` re-shoot (§3), the `play`-owned captures (§4), and Phase 10.

**Baseline this session must not regress:**

| check | baseline 2026-08-24 |
|---|---|
| typecheck | clean |
| unit | 2417 passed / 0 failed (160 files) |
| build | `verify-dist ok: 5 level(s) and 12 audio file(s)`, byte-identical |
| `test:sim-isolated` | 2414 passed / 3 skipped, phaser restored to 4.2.1 |
| e2e | 128 selected, 128 passed |

---

## Owner authorisation on record — §1e, the new architectural rule

`SESSION-PROMPT-next.md` §1e and working rule 8 both mark the game-state-write rule a
**STOP-and-ask**, because closing it means inventing a new architectural rule and 9.2 is not the
criterion that authorises inventing one.

**The owner was asked before any code was written and answered "implement a rule now"** —
2026-08-24, at plan time. That is the approval the STOP requires. It is recorded here so a later
reader does not find an architectural rule with no visible authorisation behind it.

The rule as authorised is written up in Batch 5 below.

---

## The Codex plan review — ran BEFORE approval, verdict BLOCK

Per [PRD.md § The Codex review protocol](../PRD.md) and the workflow's two-review rule, the plan
was reviewed by Codex **before** the owner approved it. Session `01a0348a-5929-7963-911b-290baf329c38`.

**Verdict: BLOCK** — five blockers, one high, one medium, one low. ⚠️ **Codex's sandboxed shell
cannot spawn processes on this machine**, so the prompt directed it to `node_repl` +
`fs.readFileSync` and every finding is file-evidence. **All eight were re-verified locally before
being applied**; none was taken on trust.

| ID | severity | finding | local verification | disposition |
|---|---|---|---|---|
| PR-01 | blocker | "Exactly one criterion row in the whole phase slice" is the wrong repair — Phase 4's log legitimately carries two unbolded rows each for 4.2b, 4.16, 4.27; and the lint's `✅` filter selects **eight** phases, not nine | ✅ confirmed — the rows exist; PRD row 4 reads `⚠️ merged with known debt`; the filter yields 8 | **APPLIED** — Batch 4 parses the designated criterion-verdict table instead, adds Phase 4 as a regression case, and corrects the count |
| PR-02 | blocker | The bracket-access fix would stay false-green: `blankFor('code')` blanks **string contents**, so `tweens['killTweensOf'](x)` reaches the regex as `tweens['            '](x)` and no pattern extension can see it | ✅ confirmed — `sourceScan.ts:43` documents `'code'` as "comments AND string literals blanked" | **APPLIED** — Batch 3 changes the **view** to `code+strings`; fixtures must pass through the production blanking path |
| PR-03 | blocker | A handle-rooted regex cannot enforce the rule (misses `scene.simWorld.player.hp = 0`, aliases, destructuring); **`saveProgress` does not exist**; `playerInputEnabled` is real control state; excluding entity spawn/removal is a hole | ✅ confirmed — `src/game/save.ts:264` is `writeProgress` and no `saveProgress` exists anywhere in `src/`; `gameInput.ts:114` | **APPLIED** — Batch 5 restated by **ownership**, TS compiler API preferred (already a frozen dev dep), real names used, narrow-the-claim fallback made explicit |
| PR-04 | blocker | `MIN_STORM_WORK_DELTA_MS` is **Guard 2**, a premise, not a bound — soft-failing it would let execution continue into the `exponent` and `perParticle` assertions it licenses | ✅ confirmed — `phase-09-perf.spec.ts:291` reads `// ── Guard 2: the amplifier amplified` | **APPLIED** — it stays hard; exactly four assertions go soft |
| PR-05 | blocker | Fixed N does **not** equalise `atLimit()` between combat-on and combat-off arms; a capped emitter returns before emitting, so the measurement can time a **rejected** burst | accepted — consistent with 9.8 entry 43's mechanism and `ParticleEmitter.js:2698-2703` | **APPLIED** — Batch 7 rewritten: matched arms, reserved and verified headroom, admitted-**and-drawn** assertions, event-aligned per-pair deltas as the primary statistic |
| PR-06 | high | A sample-count wait is a differently-shaped sleep; the draw site presses Jump though the player spawns airborne; only `:113` was to be reproduced though three sites change | ✅ confirmed — `src/sim/world.ts:171-172` is `grounded: false, state: 'fall'` | **APPLIED** — per-site conditions, deletion preferred over reshaping, a grounded wait for the draw site, all three reproduced failing |
| PR-07 | medium | Batch 6 refuses to restructure while Batch 7 lands "in the restructured spec"; `PERF_MUTATION` routing across two tests unresolved | ✅ confirmed — module-level selector, one `test()` at `:150` | **APPLIED** — Batch 6 gains a routing/wall-clock prototype step; new criterion **S8** |
| PR-08 | low | "Six batches" announced against seven enumerated | ✅ confirmed | **APPLIED** — seven batches, seven commits |

**What Codex could not check** *(kept, per vault 9.3 — a gate's blind spots are part of its result)*:
any test, typecheck, build or Playwright result; whether the three `run` waits fail under comparable
load; actual `expect.soft` reporter output; current perf wall-clock, fixed-N measurement, held-out
stability or combat-statistic ordering; runtime animation-frame ordering between Phaser's render and
the storm top-up; git revision or worktree state. **Every one of those is a local verification this
session owes**, and each is carried as a criterion in the gate below.

---

## Batch 1 — the stale `:line` citations. **There were FIVE, not four.**

§0 of the next-session prompt named four stale citations inside `phase-09-polish.md`'s own gate
table: `:1363`, `:1485`, `:1518`, `:1562`. Reading the file found a **fifth** of the same shape.

**The drift is a uniform 76 lines**, which is what made the mapping checkable rather than guessed:
every stale number plus 76 lands exactly on the heading it was written for.

| stale citation | what it was written for | now |
|---|---|---|
| `:1363` | the two §9.8 entries a round wrote | §*"The two §9.8 entries this round wrote"* (`:1439`) |
| `:1485` | item 32 closed by hands-on judgement | §*"9.8 item 32 — CLOSED by hands-on judgement, 2026-08-22"* (`:1561`) |
| `:1562` | item 32 re-judged on the fixed build | §*"9.8 item 32 — re-judged on the fixed build, and why the first approval did not count"* (`:1638`) |
| `:1518` | the Codex implementation round | §*"Criterion 9.11 — the Codex implementation round, and what it cost to close"* (`:1594`) |
| **`:1320`** | **the mutation proofs** — the fifth, named by no finding | §*"Every gate watched failing — the mutation each assertion NAMES"* (`:1396`) |

⚠️ **`:1320` was actively misleading, not merely stale.** It was cited as *"the mutation proofs"* and
landed on the cost-exponent algebra — a reader following it would have found a derivation where they
were promised a redness proof. That is *(C9)* — the wrong thing cited — and it is the reason the
repair is **by heading, never by a re-counted number**: a heading citation cannot drift.

**Checked and left alone:** `:104` and `:448` both still land on their referents (`:104` on
§*"The build — what landed, and what I verified myself"*, whose table column is literally *"what I
re-mutated myself"*; `:448` mid-paragraph on a real redness proof). Both sit **before** the drifted
region. `:104` was nevertheless converted to a heading citation in the same sentence, because leaving
one number among four headings invites the next reader to trust it the same way.

**Verification:** every one of the six cited headings resolves to **exactly one** heading in the file
(checked by count, not by eye — a heading citation that matches two places is the same defect one
step on). Docs gates green: **PASS (103) FAIL (0)** — the count read positively, per the close
session's `PASS (0) FAIL (0)` parse-error precedent.

**No gate.** A citation repair has nothing to assert; the mechanical protection against it recurring
is that headings do not drift.

---

## Batch 3 — §1d, the two tween-scan bypasses. **The view was the defect, not the pattern.**

`tests/unit/tween-boundary.test.ts`. Both bypasses named in §1d are closed, and the first one was
not the change the prompt described.

### (a) Computed access — the plan review caught a would-be false green

The prompt asked for `tweens['killTweensOf'](x)` to be recognised, and the obvious repair is to
extend `KILL_BY_TARGET`. **That repair would have shipped a rule that passes its own fixture and
misses the violation in a real file.**

`bodies()` fed `blankFor('code', src)` to the rule, and that view blanks **string contents** as well
as comments — `sourceScan.ts:43` says so in as many words. So `tweens['killTweensOf'](x)` reaches
the pattern as `tweens['            '](x)`, and **no regex written can see it**. Codex flagged it
(PR-02); confirmed locally from `sourceScan.ts`'s own docstring.

**The fix is the view.** A new `killBodies()` uses `'code+strings'` — which `sourceScan.ts` already
nominates for exactly this, citing `Date['now']` as its example. Comments stay blanked in both
views, so the deliberate prose about `killTweensOf` in `hudFade.ts`, `hudGearFlyers.ts` and
`hudGearPop.ts` still cannot false-red; **checked — all six mentions in `src/` are in doc comments,
none in a string.**

The pattern gained the computed-access alternative on top:
`/\b(?:killTweensOf|killAll)\s*\(|\[\s*(['"])(?:killTweensOf|killAll)\1\s*\]/` — both quote forms,
interior whitespace, and `?.['killTweensOf']`. Optional chaining on the *member*
(`tweens?.killTweensOf(`) needed no alternative: `\b` already matches after the dot.

⚠️ **A committed test now asserts the bypass itself** — that the `'code'` view returns `false` on
computed access and `'code+strings'` returns `true`. If someone later "simplifies" `killBodies()`
back, the scan silently stops seeing bracket access and that test is what says so.

### (b) Argument position is no longer "held"

`unbound()` treated a preceding `(` or `,` as held, so `noop(scene.tweens.add({…}))` passed. Both
dropped; `=` and `return` kept.

The counter-argument is real and does not save the classification: `live.add(scene.tweens.add({…}))`
genuinely does retain the handle, and **a static scan cannot tell a collector from a discarder**. The
criterion is about whether the handle is REACHABLE later, so the rule asks for a NAME. That costs
nothing here — **all five live sites are `= ` assignments** (`goalLayer.ts:185`, `hudFade.ts:185`
and `:195`, `hudGearFlyers.ts:103`, `hudGearPop.ts:119`) — and a site that wants to pass a tween
onward can name it first, which the accept fixture demonstrates.

### Watched failing *(C1)*, against the PRODUCTION scan, then reverted *(C12)*

⚠️ **Both mutations were planted in a real `src/` file, not handed to the regex.** A fixture driven
straight at the pattern is what let the bracket bypass survive a committed red-proof in the first
place; every C2 fixture in this file now goes through `killView()`, the same blanking the real files
take.

| # | mutation, in `src/scenes/hudGearPop.ts` | result | named failing test |
|---|---|---|---|
| 1 | `scene.tweens['killTweensOf'](o)` | **PASS (11) FAIL (1)** | `9.3a … finds no killTweensOf or killAll call in any source file` — offender reported as `hudGearPop.ts` |
| 2 | `sink.add(scene.tweens.add({ targets: o, alpha: 0 }))` | **PASS (11) FAIL (1)** | `9.3b … no source file starts a tween it does not hold` |

Each revert confirmed by **content changed AND the count dropped by one** *(C12)*: `git diff --stat`
empty on the mutated file, and `PASS (12) FAIL (0)` restored both times. ⚠️ The test file was
`touch`ed before every re-run — vitest caches `?raw` glob fixtures, and a landed mutation has
reported green in this repo before.

**Suite:** 160 files, **2420 passed / 0 failed** — 2417 + the three tests added here, read
positively rather than inferred from an exit code. Typecheck clean.

### What stays narrowed — **D4**, unchanged

Inlining `getTweensOf` + destroy (literally how Phaser defines `killTweensOf`), `tweens.destroy()`,
and the other tween entry points. All ambiguous, all documented, **none present on this tree.**

---

## Batch 4 — §1f, docs-contract's fragile repair. **The obvious one-liner was the wrong repair.**

`docs-contract.test.ts`'s per-criterion check was `/^\| 9\.2 \|/m.test(section)` — satisfied by
**any** such row anywhere in the phase's slice. Phase 9's own close-round verdict table would have
discharged it, and the only thing preventing that is that its rows are **bolded** (`| **9.1** |`)
and so missed by the regex. A gate protected by Markdown emphasis.

### Why "exactly one row in the slice" was rejected

That is the obvious durable fix and **it is wrong.** `docs/qa/phase-04-art.md` carries a
criterion-verdict table **and** a later summary table, giving 4.2b, 4.16 and 4.27 two unbolded rows
each. A slice-wide count calls that an error. Phase 4 escapes only because the PRD's `✅` filter
excludes it — its row reads `⚠️ merged with known debt` — which is **luck, not design**.

Codex flagged this (PR-01) and it was confirmed locally: the rows exist, and the filter's own output
is **eight** done phases, not the nine this session's plan first claimed.

⚠️ **Phase 4's log is therefore never checked by this lint at all.** That is a standing blind spot,
recorded here rather than fixed: making Phase 4 checkable is a question about Phase 4's status, not
about this gate.

### What shipped — an explicit designation

A `<!-- gate-verdicts -->` marker on the line above each log's criterion-verdict table. Invisible
when rendered, cannot drift the way a line number did (Batch 1), and a missing one is a red with its
own message rather than a silent pass. Added to all eight done phases **and** Phase 4.

A marker rather than a table header because **the logs share none** — they run from
`| # | Criterion | Result |` through `| # | Verdict | Evidence |` to
`| # | verdict | the evidence that decides it |`. "The first table with a criterion row" would work
today and is exactly the heuristic that silently picks the wrong table later.

The check now takes the contiguous run of `|`-leading lines after the marker and requires **exactly
one** row per criterion **in that table**. Zero is the missing row it always caught; two is a
duplicate verdict, which it previously could not tell apart from one.

### The 400-line rule bit, and the file was SPLIT rather than justified

`docs-contract.test.ts` went 325 → 466 lines and `file-size.test.ts` went red — **found by the full
suite, not by the targeted run**, which is the argument for running the whole thing per batch.

Split per CLAUDE.md §3's *"Prefer splitting"*, in the `sourceScan.ts` idiom the repo already uses:

- `tests/unit/gateVerdicts.ts` (79) — the parser. No assertions.
- `tests/unit/gate-verdicts.test.ts` (73) — its red-proofs, driven against literals.
- `tests/unit/docs-contract.test.ts` (369) — back under the limit; keeps the cross-document check and
  the Phase 4 regression test, which needs its document glob.

⚠️ **`criterionRowGaps` is a function, not a loop inlined in the test, so the red-proofs drive the
PRODUCTION path.** That is Batch 3's lesson applied one file over.

### Watched failing *(C1)*, four mutations on the REAL log, each reverted *(C12)*

| # | mutation, `docs/qa/phase-09-polish.md` | result |
|---|---|---|
| A | marker deleted | **PASS (98) FAIL (1)** — *"has no `<!-- gate-verdicts -->` marker"* |
| B | 9.1's row duplicated **inside** the designated table | **PASS (98) FAIL (1)** — `…criterion-by-criterion in its QA log` |
| C | close-round verdict table **un-bolded** (8 rows) | **PASS (99) FAIL (0)** — emphasis is no longer load-bearing |
| D | **the decisive one**: 9.1's designated row deleted *while* the un-bolded duplicate remained | **PASS (98) FAIL (1)** |

⚠️ **D is the proof the whole batch rests on.** With one un-bolded `| 9.1 |` row still in the slice,
the OLD rule reported the criterion evidenced — the bypass, live. The new rule reports it missing.
Mutation D was re-run **after the split** to confirm the wired path, not just the pre-split code:
**PASS (92) FAIL (1)**, back to **PASS (93) FAIL (0)** on revert.

Every revert confirmed by `git diff --stat` on the mutated file plus the restored count.

**Suite:** 161 files, **2428 passed / 0 failed** — 2420 + the eight tests added here. Typecheck clean.

---

## Batch 5 — §1e, the sim-write rule. **Owner-authorised twice: the rule, then a dependency.**

### The plan's recommended route did not exist, and that was checked rather than assumed

The plan preferred the TypeScript compiler API on the grounds that `typescript` is already a frozen
dev dependency, so "this adds nothing". **True of the dependency, false of the API.**

TypeScript 7.0.2 is the Go port. Verified on this tree:

| probe | result |
|---|---|
| `Object.keys(require('typescript'))` | `['version', 'versionMajorMinor']` — **no `createSourceFile`** |
| `typescript/unstable/ast` | 409 exports, `createScanner` among them; **no parser entry point** |
| `typescript/unstable/sync` | `API`, `Program`, `Checker` — but drives the native `tsgo` binary |

⚠️ **So the sentence in `tween-callback-boundary.test.ts` — *"closing them means a real parser, and
the project's dependency set is frozen"* — was RIGHT, and this session's plan was wrong to call it
out of date.** The docstring now carries the three probes so the next reader does not re-litigate it.

The owner was asked, with the three options and their costs, and **authorised adding a real parser**.

**`@babel/parser` 8.0.4, pinned exact, devDependency.** Pure JS, no native binary. ⚠️ **THREE
transitive packages, not one** — corrected 2026-08-25 from the lockfile after a gate-round finding:
`@babel/types`, `@babel/helper-string-parser`, `@babel/helper-validator-identifier`. The owner's
decision is unaffected; the number put to them was wrong, and it is corrected rather than quietly
restated. ⚠️ `npm audit` reports one high-severity advisory (`nanoid <3.3.18`) —
**pre-existing**, confirmed by re-running the audit against the stashed tree. Not introduced here
and not fixed here.

### The rule, as authorised

> **A tween callback may not write sim-owned state, persisted progression, or a next-tick control
> flag.**

⚠️ **Ownership, not the mutation verb.** `flyers.delete(flyer)` is idempotent view bookkeeping the
criterion has no quarrel with; `world.projectiles.push(p)` is a sim entity. What separates them is
who owns the object, and this project already declares that boundary: `src/sim/` is the simulation
and `World` is its root, held in scenes as `this.world` or `scene.simWorld`.

🔴 **Rooted at the HANDLE, never at `player`.** `player` and `playerSprite` are common view names; a
bare `player` root would report a sprite write as a sim write, and a false red on a blocker rule is
how a gate gets edited instead of obeyed. There is a committed accept-fixture for exactly that.

**Real names, checked against the tree** — Codex's PR-03 was right on all three:

- Persistence is **`writeProgress`** (`src/game/save.ts:264`) and `recordCompletion`.
  **`saveProgress` does not exist anywhere in `src/`** and is not gated.
- **`playerInputEnabled`** (`gameInput.ts:114`) is the concrete next-tick control flag.
- **Registry writes are NOT gated**: `grep` finds no `registry.set` or `.data.set` in `src/` at all.
  A rule whose every mutation is already impossible is worse than none — recorded, not written.

### What the parser bought — and it closes §1f's first bullet too

Every *inline* callback form falls out of the AST for free. The two *indirect* forms are resolved:
a bare identifier and **a member expression** (`onComplete: this.foo`) — one of the four holes the
regex extractor named and could not close.

⚠️ **The old extractor was NOT deleted.** It has committed fixtures and has never been wrong on this
tree, and replacing a proven rule with a new one is how a gate that worked becomes a gate nobody has
watched fail. Instead **9.2c** runs the same `SEQUENCING` patterns over the parser's extraction as
well. Both must be clean, and a committed test shows the parser catching `this.foo` where the regex
returns `[]` — the debt made visible rather than described.

**One remaining narrowing, stated:** `declarations()` is file-wide, not lexically scoped, so two
declarations of one name collapse. No shadowed callback name occurs on this tree.

### A measured fact the vacuity check nearly hid

The first vacuity assertion was `simWriteViolations(src) !== undefined` — **always true for an
array**. Replaced with a count of extracted callback BODIES, which then failed at `>= 4` and
exposed something worth knowing:

**Three files, not four.** The five live `tweens.add` sites sit in four files, but
`goalLayer.ts`'s goal pulse registers **no callback at all** — it is a yoyo whose end state is its
start state, which is finding **D13** arriving from the other direction. Bodies: `hudFade` 4,
`hudGearPop` 2, `hudGearFlyers` 1 = **seven**, now pinned.

### Watched failing *(C1)*, in a REAL callback, each reverted *(C12)*

Injected into `settleFade` in `src/scenes/hudFade.ts` — a live `onStop`/`onComplete`, not a literal:

| mutation | reported |
|---|---|
| `scene.simWorld.player.hp = 0` | `hudFade.ts: a sim-state write` |
| `const p2 = scene.simWorld.player; p2.hp = 0` | `hudFade.ts: a sim-state write` |
| `scene.simWorld.projectiles.push(…)` | `hudFade.ts: a sim entity spawn or removal` |

⚠️ **The alias case is the one that justifies the dependency.** `p2` appears in no rule anywhere; a
regex cannot reach it at all. Counted: **PASS (11) FAIL (1)**, named test
`9.2b … finds no sim-state write in any tween callback in src/`, back to **PASS (12) FAIL (0)** with
`git diff --stat` empty on revert.

### The 400-line rule again

`tween-callback-boundary.test.ts` reached 397 — three lines under, and the docstring correction the
owner asked for would have broken it. Split: **`tween-sim-writes.test.ts`** (111) holds 9.2b and the
D1 note; the original keeps the sequencing rule and 9.2c at 285. Parser in
**`tweenCallbacks.ts`** (250), no assertions.

### Verified with the new dependency in place

| check | result |
|---|---|
| typecheck | clean |
| unit | **162 files, 2437 passed / 0 failed** (2417 + 20: batches 3, 4, 5) |
| build | `verify-dist ok: 5 level(s) and 12 audio file(s)` byte-identical |
| **`test:sim-isolated`** *(criterion 1.3)* | **2434 passed / 3 skipped**, phaser restored to **4.2.1** |

⚠️ `test:sim-isolated` is the check that mattered here: a new dependency could have broken the
"suite runs with Phaser uninstalled" criterion. It does not — `@babel/parser` is unrelated to Phaser
and the run came back clean with the pin restored.

---

## Batch 2 — §1c, the `run:` waits. **D9's stated cause was wrong, and the real one was elsewhere.**

### The measurement that changed the diagnosis

§1c says the three `run:` waits are D9, citing *"No usable hit in 61 ticks"* from a loaded sweep.
**That message cannot come from a `run` wait.** A `waitFor` that never resolves produces a 60 s
Playwright `TimeoutError`. The message comes from `firstAirborneHit`, and what it demands is
`contiguous(t0, t0 + 7)` — **the same eight-tick contiguity requirement, buried in the SELECTOR**,
where no finding had looked.

Removing the waits alone would have been *the convenient fix, not the one the claim names*.

### The harness profile, re-measured — the documented one describes neither project idle

`polishSeries.ts` states: *"1 tick per frame for about the first second, then 3-4 ticks per frame
indefinitely … the longest gap-free run available after that first second is 1"*. Probed on this
machine, 2026-08-24, per-frame over 301 samples:

| project | opening burst | longest gap-free run after it | gap histogram after burst |
|---|---|---|---|
| `chromium` — idle | **90 frames** | 2 | `{1:1, 2:7, 3:170, 4:32}` |
| `chromium` — CPU saturated (n−1 cores) | **61 frames** | 2 | `{1:1, 2:5, 3:163, 4:70}` |
| `chromium-gpu` — idle | **300+ frames** — no steady phase reached | — | `{}` |

⚠️ **Two corrections fall out of this.** The burst is ~90 frames (~1.5 s), not "about the first
second"; and under SwiftShader the sim ran 1 tick/frame for the *entire* window, so the documented
steady phase is a **loaded-box** profile, not this harness's resting state. Load shortens the
burst — 90 → 61 — which is the mechanism, confirmed.

⚠️ **The two files run under different projects**, which no finding had noted:
`phase-09-polish.spec.ts` → `chromium`; `phase-09-draw.spec.ts` → `chromium-gpu`. The documented
profile could only ever have described one of them.

### What shipped

| site | change | why |
|---|---|---|
| `brawlOnce` (was `:113`) | **deleted** | `startBrawl` tests `p.vy === 0` itself every frame; `airborneDrop` is the real terminal condition. A latent 60 s hang, establishing nothing. |
| hazard test (was `:180`) | **deleted** | same construct, same reasoning. Holding one key needs no warm-up. |
| `phase-09-draw.spec.ts` (was `:296`) | **`{ kind: 'grounded' }`** | The player spawns `grounded: false, state: 'fall'`. Twelve samples do not mean the player can jump — and without the condition the `land` that follows can select the **spawn** touchdown: a landing with no jump and none of the burst under test. |
| `firstAirborneHit` | **bounded retry** | The real D9 fix. |

⚠️ **The contiguity was NOT relaxed, because it is load-bearing.** Arm A asserts *exactly six*
frozen ticks as a COUNT; with a gap that count is not wrong but **unmeasurable** — the identical
point `polishSeries.ts` makes about `run`. "At least six sampled" would pass a game frozen forever.
So the fix makes the event land where the resolution is: per-tick sampling exists only in the
opening burst, and **a re-boot buys a fresh one**. Three attempts.

### A branch written, mutation-tested, and DELETED as unreachable

The first draft classified two failures — `no-drops` (the product) and `no-window` (the harness) —
and skipped the retry for the product case. Both product mutations were run:

| mutation | expected | actual |
|---|---|---|
| scavenger spawn disabled | `THE PRODUCT` | **`airborneDrop` times out at 60 s**, 0 retries logged |
| bunny-hop disabled — every hit grounded | `THE PRODUCT` | **`airborneDrop` times out at 60 s**, 0 retries logged |

The wait guarantees an airborne drop is in the series before the selector ever runs, so
`airborne.length === 0` is impossible there. **A gate that cannot fire is worse than none** — the
branch was deleted and the reasoning kept as a comment. The surviving message says
*"THE HARNESS, NOT THE GAME"*, which the old shared text could not.

### Watched failing *(C1)*, reverted *(C12)*

`contiguous(t0, t0 + 700)` — a window unsamplable by construction — gave **1 failed**, three
retries logged, and *"THE HARNESS, NOT THE GAME … 1 drop(s): [52]"*. Reverted; both specs green:
`phase-09-polish` **4 passed**, `phase-09-draw` **3 passed**.

### The claim pinned where it cannot flake — `tests/unit/wait-spec.test.ts`

Reproducing the failure *as an e2e run* needs a loaded box, which is a flaky proof — it passed in
isolation minutes after failing in a sweep, three times. So seven tests drive the measured gap
profile directly: `run: 8` and `run: 12` satisfiable only from the burst, **unsatisfiable at any
length once it is short**, `grounded` satisfiable on the same failing input, and — committed as
evidence — that a **sample-count** wait would have resolved on an airborne series where the player
cannot jump. ⚠️ Its header records the one narrowing: the predicate is a **copy**, because
`page.waitForFunction` serialises its argument and cannot close over an import.

### The 400-line rule, twice

`phase-09-draw.spec.ts` was at **exactly 400** before this session — zero headroom — and
`phase-09-polish.spec.ts` at 376. Both went over. Split per CLAUDE.md §3, in the `polishSeries.ts`
idiom: **`tests/e2e/brawlArm.ts`** (159) holds the driver, the arm and the selector, no assertions;
the spec is back to 281 and draw trimmed to 400.

### Baseline e2e before this batch — 5.2 fired, and it is not ours

Full suite, loaded: **127 passed, 1 failed**. The failure is `phase-08-perf.spec.ts` criterion 8.7 —
Tier-5 item **5.2**, explicitly out of scope:

> `level-05 costs 2.36x level-01 on the GPU … Expected: <= 2`

**A fourth data point, and the spread is now 2.36 / 4.47 / 5.61 against a bound of 2.** Recorded
for whoever repairs it; not touched here.

---

## Continued in a flat sibling

At 451 lines this log reached CLAUDE.md §6's split point. **Batches 6 and 7 — the two measurement
batches, §1b and §1a — are in
[`session-phase-09-debts-02-perf.md`](session-phase-09-debts-02-perf.md), and the six-brief QA gate
round is in [`session-phase-09-debts-03-gate.md`](session-phase-09-debts-03-gate.md)**, a flat sibling rather than
a subdirectory, because `tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively.
