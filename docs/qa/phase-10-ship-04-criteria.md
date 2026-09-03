[← Phase 10 QA log index](phase-10-ship.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-10-ship.md)

## 10.7 — the sweep, its oracle, its blind spot, and the one real finding

**The oracle, stated rather than assumed** (an extension sweep is not an oracle):

- `git log --all -p` content-grepped for named key formats and high-entropy strings — **506 commits**
- `git rev-list --objects --all` over blobs unreachable from HEAD — **6,447 reachable objects**, plus normal unreachable garbage, all scanned
- every tracked binary listed with a reason
- an entropy scan: **593 high-entropy tokens**, classified — 228 npm integrity hashes, 11 audio headers, 354 paths/ids

**Result: zero named-format secrets in the entire history.**

⚠️ **`grep` printed `Binary file (standard input) matches` and bailed**, silently truncating results.
Everything was re-run with `grep -a`. This nearly produced a false "0 hits" — the failure mode where
a tool's helpfulness looks like a clean result.

🔴 **One real leak, found and fixed.** `public/assets/characters/*/anchor.job.json` — three files —
shipped `C:\Users\royko\.genmedia\...` to the CDN. The entropy oracle had classified those tokens as
"file paths" and the `session_id` values sit below its 40-character floor, so the *statistical* sweep
saw nothing. A targeted path sweep found them. Stripped; `pathsweep public/` is now **0**.

A fourth was found later in the same sweep and is worth separating because it is a different class:
`character-bounds.json` carried a literal `C:\Claude\Street-Fighter` inside a prose note — a project
path rather than a username, in a file the game actually **fetches at boot**. Reworded.

**The blind spot** *(vault 9.3)*: a secret that never matched a named format and never cleared the
entropy floor is invisible to both halves. The path sweep is the third pass precisely because the
first two missed something a human would have recognised at a glance.

---

## 10.8 — the licence split

`LICENSE`: MIT over `src/`, `tests/`, `tools/` and the root configuration files. Widened to the root
files by owner ruling **B** — MIT scoped to three directories left `vite.config.ts`,
`playwright.config.ts`, `index.html` and the tsconfigs unlicensed in a public repo, which is a real
gap rather than a formality.

`ASSETS-LICENSE.md`: everything under `public/assets/` and `assets/` — every sprite sheet, tile set,
parallax layer, portrait and sound — © the repo owner, all rights reserved, no redistribution. It
also records the thing that makes the assets irreplaceable: **they cannot be regenerated from this
repository.** Seedance is not seed-deterministic and the raws are gitignored.

`README.md`: run it, what is interesting about it, the commands, the document index, both licences,
and the deployed URL (still a placeholder until the deploy is authorised). Every number in it is a
claim that was checked *(vault 10.6)*.

**Carve-out added by the gate:** `.claude/skills/` and `.agents/skills/` are **215 tracked files** of
third-party material from `fal-ai-community/skills`, covered by neither licence and carrying their
own terms. Named explicitly.

---

## 10.9 — the amendment, the objection, and a defect git could not see

The criterion as written was *"Asset rebuild from a fresh clone is byte-identical."* **That is not
achievable in this repository and the reason is structural**: `assets:fetch`/`assets:verify` do not
exist, the raw clips are the only byte-stable inputs, they are gitignored, and the generator is not
seed-deterministic. Rescoped by owner ruling to **ship-path reproducibility**.

🔴 **This is a criterion amendment, not the original criterion satisfied.** Codex's objection is
recorded verbatim in the phase document: the public repo cannot reconstruct its own art from its
recorded provenance, and `docs/reviews/phase-05-plan-r1-r2.md` warned in Phase 5 that
`assets:fetch`/`assets:verify` were binding debt and "not optional scope". They still do not exist.
That is the recorded-but-not-fixed finding now shipping, and it is 10.13's headline disposition.

**As amended: PASS.** Fresh clone → `npm ci` → `npm run build` → **62/62 files byte-identical**.

The first run was **61/62**, and the one is the interesting part. A shipped config file had **CRLF in
the working tree while its blob was LF**. `git status` reported clean — git's clean filter normalises
CRLF→LF *before hashing*, so the working file matched the blob — while `vite build` copies the
on-disk bytes. `verify-dist` compared `dist/` against `public/`, and both carried it. **Three
mechanisms that should have caught it were each blind to it for a different reason.** Normalised;
62/62.

`tests/unit/shipped-eol.test.ts` is the cheap continuous version. It is now a **denylist** — every
file that is not a known binary type — because an allowlist over an evolving directory silently
skips whatever is added next. `index.html` is in the walk (the one shipped file Vite *transforms*
rather than copies, and it was in neither half of 10.9). The vacuity guard is a pinned **19**, not
`> 5` over 18: losing twelve of them, `public/assets/config/` included, used to pass — and
`public/assets/config/` is where the CRLF actually was.

---

## 10.11 — "every" is load-bearing, and it found two errors in the PRD

### 4.27 — CLOSED, by owner ruling **A**

`anchorGate.mjs` (G1 — anchor contact geometry) existed since Phase 5, worked, named 4.27 in its own
header, and caught a real defect on the first new art it saw. **Nothing re-ran it.** It was a
standalone CLI no `assets:*` script invoked, so its verdicts were one person's out-of-band
measurement rather than a property of the pipeline. The defect it exists to catch — one boot drawn
above the other in the anchor every later frame is measured against — cost roughly **$7**.

Wiring it revealed three further holes, all found by the gate owners:

1. **`assets:build:all` bypassed it.** `build-assets-all.mjs` spawns `build-assets.mjs` **directly**,
   not through npm. The multi-slug path — which exists precisely because *"the command nobody runs is
   the only one that prints it"* — ran zero anchors. The new gate had been re-created in the exact
   shape that made 4.27 open.
2. **`assets:build` packs sheets. The money is already spent by then.**
3. **It exited 0 having measured nothing on any machine but the integrator's.** `_generated/` is
   gitignored, so a fresh clone printed `0 PASS, 0 FAIL, 4 ABSENT` and succeeded.

Fixed at the root: `auditOrThrow()` is called from the modules that **read** an anchor —
`build-assets.mjs` (covering every pack path) and `submit-clips.mjs` (the spend point). ABSENT is
fatal once `_generated/` exists. Wiring a gate to a *script name* is wiring it to a habit.

Run: **4 PASS, 0 FAIL, 0 ABSENT, 0 INDETERMINATE of 4 declared.**
Red-proved: a floating-foot anchor fails `assets:build` with exit 1 **before** a byte of sheet is
packed; unwiring either consumer reddens `anchor-audit.test.ts` by name.

### 4.12 — CLOSED, and the PRD said it already was

`docs/PRD.md`'s Phase 4 row reads *"4.10/4.12 closed in Phase 5"*. **For 4.12 that was wrong.** No
test called `findSource` at all — `sheet-name-contract.test.ts` covers the naming both sides agree
on, which is a different property and reaches neither throw.

This is exactly what 10.11 is for: checking a prior phase's claims rather than repeating them.

`tests/unit/find-source-refusal.test.ts` runs the deliberate-removal *(C1)* the criterion has been
owed since Phase 4. Both refusals — missing directory, and missing sheet in an existing directory —
plus the message contract. Red-proved by making `findSource` substitute a placeholder instead of
throwing: **2 failed**. That matters more than an ordinary error path, because vault 4.16 is that a
declared input which cannot be found must fail the build and never substitute; a build that quietly
packed a placeholder would ship art nobody generated, and every gate downstream would measure the
placeholder and pass.

### 4.10 — SUPERSEDED, recorded

`gateReachBand` is still called only from `gatesSelfTest.mjs` and unit fixtures, never against real
sheets — so the PRD's "closed in Phase 5" is wrong here too, but the criterion is **obsolete rather
than open**: `gateReachWindow` (G5) does the same job better and **is** wired into `sheetGates.mjs`.
"Superseded" is a disposition; silence is not. Recorded here and corrected in PRD.md.

### Phase 9's three carried items — dispositioned, not fixed

| item | disposition |
|---|---|
| the `phase-09-perf.spec.ts` split **did not happen** | **STILL TRUE and shipping.** It is one `test()` with `expect.soft`; the spec itself records full independence as unachievable. Out of scope for a ship phase — it is a perf-suite refactor, and doing it here would be scope growth |
| **9.5 has no bound, and none is proposed** | **STILL TRUE and correctly open.** The blocker is attribution: only an injected main-thread block reproduces the spike, and a bound reddened by an injected block names the amplifier, not the game |
| 9.3's scan bypasses D4, S3-1, S5-6 | **STILL TRUE — stated narrowings, not gaps.** Each is a deliberate, recorded limit of the tween-scan gate. D14 was closed |

None is newly discovered and none is hidden: all three are in PRD.md's Phase 9 row already. 10.11's
job was to reach a verdict on each rather than let them sit unread, and the verdict is that all three
remain open and none blocks shipping.

---

## 10.12 — the level was finished by PLAYING it, for the first time

Every prior completion test **teleported** the player, through `levelDriver.ts`'s `simWorld` handle.
`dist/` does not expose it. So the production half could not reuse a single line of the existing
driver, and saying so plainly is the point: for ten phases nothing had proved the level was
completable by a person.

**The predicate.** `localStorage['steampunk.progress']` is a shipped Phase 8 feature, which is what
lets 10.12 run against `dist/` at all — but it is written on level **entry**, not only on completion.
So "the key exists" and "the value changed" are both false greens. The predicate is the exact
**false → true transition** on `levels['level-01'].completed`, with the false baseline established
**before a key is pressed**.

**The driver is position-blind and self-synchronising**: hold RIGHT, and re-jump the moment the last
jump is spent. The first version was x-triggered against measured geometry and worked only in the
dev build; a route keyed to coordinates is a route that breaks on any level edit.

**Result: 3/3 in dev, 3/3 against `dist/`, 18.5–22.9 s.** Screenshots in `docs/evidence/phase-10/`.

### 🔴 One level of five is not a "full playthrough", and the fix was to play more, not to reword

The Codex implementation review pointed out that `README.md` advertises five levels while the spec
proved one. Rather than amend the criterion, the driver was extended and the result **measured**:

| levels | budget/level | result |
|---|---|---|
| 01 | 60 s | completes, 18.5–22.9 s |
| 01→02 | 60 s | **stopped at 02** — no way past a wall needing a run-up |
| 01→03 | 60 s + a back-up move | reaches 04 |
| 01→04 | 120 s + a back-up move | reaches 05, **all four completed** |
| 05 | 240 s | **not completed** |

The back-up move — release RIGHT, hold LEFT for 420 ms, resume — is what a stuck player does, and it
took the reach from **one level to four**.

### ⚠️ And then the four-level test flaked, which changed what it is allowed to be

Scoped to four levels it passed alone and **failed at level 03 inside `npm run test:e2e`**, having
completed those same three levels comfortably on a quiet box minutes before. That is exactly
CLAUDE.md §5's *"its wall-clock-bounded specs read a busy box as a broken game"*, and **a test that
passes alone and fails in the suite is a flake generator, not a gate.** Widening the budget until it
stopped flaking is the move this project has a rule against — the bound would then be measuring the
box.

So the two things are separated by what they actually are:

| | what it is | where it lives |
|---|---|---|
| **The gate** | level 01 completes · ENTER advances · **level 02 boots and draws** | `tests/e2e/phase-10-campaign.spec.ts`, in the suite |
| **The measurement** | levels 01–04 completed end to end on a quiet box; 05 did not | this table, and `playCampaign()` in `prodHarness.ts` for re-running it |

The gate is strictly more than the single-level assertion it replaces: **nothing before this proved
the game had a second level a player could reach.** Every step of it is a shipped production
behaviour — ENTER on the completion overlay bound to `nextLevelId`, no save-file surgery, no
level-select shortcut, no `simWorld` — and the drawn-frame check is there because a progression that
moves the save while the next level fails to boot is the shape a save-only assertion cannot see.


### 🔴 CORRECTION, 2026-08-27 — `level-05` was reported open and it should not have been

The owner asked whether level-05 hides a real defect. It does not, and the evidence was already in
the suite when this log called it *"unmeasured"*.

`tests/unit/level-completable.test.ts` builds the **exact shipped world** — goal, hazards, enemies,
gears, `DEFAULT_TUNING` — and plays it with a policy auto-player. For `level-05` it passes:

| assertion | seeds |
|---|---|
| reaches the exit in the world the player gets, **enemies live** | 8201, 8202, 8203 |
| the goal is reachable from the spawn | 8201, 8202, 8203 |
| the route still connects with `jumpVelocity` **reduced by 1** | 8201, 8202, 8203 |
| every gear is collected by some proved transition | — |
| **negative control**: with `jumpVelocity` 0 the goal is UNREACHABLE | — |

The gate seeds are disjoint from the tuning seeds, so a route that only survived its own tuning seed
would not pass. And the geometry says the same thing independently — level-05 is level-04's shape
with one more segment:

| level | width | ground gaps | hazards | enemies | gears |
|---|---|---|---|---|---|
| level-04 | 13824 px | 288, 288, 288 | 4 | 5 | 10 |
| level-05 | 15360 px | 288, 288, 288, **288** | 5 | 6 | 11 |

Identical gap widths, one more of everything, goal sitting on the final ground slab exactly as in the
other four. **There is no unreachable ledge and no missing trigger.**

So what was actually missing was only the **browser end-to-end** run, and the reason it is missing is
a property of the driver, not of the level: `playToExit` is position-blind — it holds RIGHT and jumps
when the ground ahead runs out. It cannot choose a route, backtrack meaningfully, or decide to kill
something. Calling that "the level is unmeasured" overstated the gap and pointed the owner at the
wrong thing.

**Corrected disposition:** `level-05`'s mechanical completability is PROVED, at the sim level, under
adversarial seeds, with a negative control. What remains is the hands-on run — which criterion 10.12
requires for *every* level regardless *(vault C4)*, and which no automated evidence closes.

**`level-05` resists the BROWSER driver — not the sim.** A position-blind driver
cannot navigate: it cannot choose a route, backtrack meaningfully, or decide to kill something. It is
owed to the owner's hands-on run, which criterion 10.12 requires anyway *(vault C4)*.

**Red-proved against a DEAD SIM**, not a frozen rAF — the distinction matters here because the
courier's idle sheet loops at 7.5 fps with `repeat: -1`, so "pixels changed" stays TRUE while the
fixed-tick sim is dead. `tests/fixtures/dead-sim.patch` neuters `advance()`'s loop:

```
2 failed | 2 passed   ← the two playthrough tests, by name; the CSP and debug-surface tests unaffected
reverted → 4 passed
```

It is a **committed** fixture, so the proof is re-runnable *(C2)*, and
`tests/unit/advance-split.test.ts` now pins the context line it anchors on — a patch that stops
applying is a red proof that has silently stopped existing.

⚠️ **`playwright-cli` cannot platform this game.** Every command is a round trip while the game runs
on real time; the courier dies in level 01's pit every attempt. Said plainly rather than worked
around.

**The human half is the owner's at approval.** A hands-on criterion is never closed on automated
evidence alone *(C4)*.

---

## 10.14 — the plan review did not converge, and that is the report

Five rounds, `claudex-loop:codex-review` (`gpt-5.6-sol`, high effort, read-only), **all REVISE**,
hitting `MAX_ROUNDS`. The trajectory was 5 blockers → 4 defects → 4 → 4 → 2, and by rounds 4 and 5
Codex was almost entirely finding defects in *my fixes to its earlier findings* — twice in gates
invented that same round.

**A flagged disagreement is worth more than a false APPROVED.** Every finding was re-verified locally
before being acted on; three times the verification made the finding sharper than Codex had it, and
twice it caught me citing a precedent that did not exist.

**Protocol substitution, authorised by the owner:** `claudex-loop:codex-review` in place of
`/codex:rescue`, for both reviews. Recorded in `docs/reviews/phase-10-plan.md` and in the phase
document's §4. Both records still land at their required paths.

⚠️ Codex's sandboxed shell cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`).
Every review prompt told it to use `node_repl` + `fs.readFileSync`. That restores file *reading*, not
command *execution*, so its findings are file-evidence only and every one was re-verified locally.

---

## The implementation review — 8 findings on a diff that had already been through twelve briefs

`docs/reviews/phase-10-impl.md` carries the verbatim review and the full triage. Verdict **REVISE**:
2 CRITICAL, 4 HIGH, 2 MEDIUM. Every finding is applied or recorded with a reason.

| # | finding | disposition |
|---|---|---|
| 2 | **the 27-sentinel gate is a pad-able count** | **APPLIED** — exact file→token manifest. Confirmed by BUILDING the mutation; it shipped a DEV body with both gates green. § 10.2 |
| 1a | the spend-point anchor audit is permissive on a clean clone | **APPLIED** — `requirePresent: true`. `submit-clips.mjs` creates `_generated/` itself, so the heuristic stood aside on the one path that spends money |
| 1b | the wiring test is satisfied by a COMMENT | **APPLIED** — comments stripped. Same defect the sentinel census had two commits earlier; fixing it in one place and not the other is how a lesson stays local |
| 1c | verify each anchor's SHA-256 at submission | **RECORDED, not done** — `clipAnchors.mjs` states the declared sha is *"data, not a runtime check"*. Making it one changes a recorded decision, i.e. a STOP-and-ask |
| 3 | the census cannot see `target: 'esnext'` | **APPLIED** — the four config values pinned in `verify-dist.mjs`. Red-proved |
| 4 | `Object.fromEntries` keeps the LAST duplicate directive; a browser enforces the FIRST | **APPLIED** — duplicates rejected before comparison. Red-proved with `script-src *;` prepended |
| 5 | 10.12 claims a "full playthrough" of one level; the log contradicts itself on what is open | **APPLIED** — four levels now automated, level 05 named as unmeasured, four open items listed |
| 5b | 2.8's human half contradicts 10.11's PASS | **RECORDED, disagreed** — 10.11 asks that every prior criterion be RE-VERIFIED, not closed. 2.8 is dispositioned in the sweep as owner-facing; that is a verdict, and silence would have been the failure |
| 6 | the build-program test is satisfied by a comment | **APPLIED** — comments stripped. Codex's suggested fix (TS's config parser) does not exist in TS 7: it is the Go port, and `require('typescript')` exports only `version` |
| 7 | `prodHarness` does its own catch-all lookup | **APPLIED** — delegates to `headersFrom()`. It duplicated the lookup inside the phase that consolidated it, under a header claiming otherwise |
| 8 | the fixture pin checks only the removed line, not the context | **APPLIED** — every anchor line of the hunk pinned. Red-proved |

**What it says about the protocol.** Two CRITICALs survived six agents and twelve adversarial briefs.
The sentinel-manifest one was invisible to all of them *because the red proofs were cooperative*.
That is the argument for a reviewer who did not write the gate — and its counterpart is this phase's
other protocol lesson, that the QA gate's adversarial brief found a false claim Codex had read past
four times. Neither substitutes for the other; both were cheap relative to what they found.

---

## The regression, read positively

At the tip (`ef1eb9b`), after the parser gate landed:

| run | result |
|---|---|
| `npm run typecheck` | clean |
| `npm run typecheck:build` | clean |
| `npm test` | **175 files, 2602 tests passed** |
| `npm run test:sim-isolated` | **2599 passed, 3 skipped** — Phaser uninstalled, restored after |
| `npm run build` | 4 steps green · dev-seam gate ok, 27 sentinels folded, **each dominated by its own guard and in the function the manifest names** · verify-dist ok |
| `npm run test:e2e` | **140 passed, 1 failed** — and the failure is a different spec each run. See below |

Counts are read, not inferred from exit codes. A Playwright run that selects nothing prints
`expected: 0, unexpected: 0` and exits 0; a zero exit through a pipe is `tail`'s exit.

### ⚠️ Two GPU perf gates false-red under full-suite load, and NEITHER floor was moved

The suite was run twice at this tip. Each run had exactly one failure, **and it was a different
gate each time**:

| run | failing gate | measured | bound | alone, immediately after |
|---|---|---|---|---|
| 1 | 9.5 cost exponent | k = 0.893 | ≥ 0.9 | **k = 0.922, passed** |
| 2 | 6.9 HUD GPU delta | 0.974 ms | < 0.2 ms | **passed** |

Run 2 passed 9.5 at k = 0.963 — the gate that had failed run 1 — which is the shape that settles it:
a code regression does not alternate between two unrelated specs and then decline to reproduce in
isolation.

The causal claim, stated separately from the numbers *(vault 10.2)*: **nothing in this tip's diff
can reach the render path.** `git diff --name-only 048dae5..HEAD` is 13 files — a build-time Vite
plugin, its manifest and declarations, `tsconfig.build.json`, two unit tests, `CLAUDE.md` and four
documents. **Zero files under `src/`.** What would refute it: the same gate failing repeatedly, or
failing in isolation on a quiet box.

This is CLAUDE.md §5's *"only one Playwright run at a time, and nothing heavy beside it"* and
*"the headless harness is not the frame rate"* arriving together, on gates that Phase 6 and Phase 9
already record as marginal. **Widening either bound would be measuring this box**, and 9.5's own
failure message says *"do not move this floor"* in as many words. Neither was touched. It is
recorded here as a live property of the suite, not resolved.

---

