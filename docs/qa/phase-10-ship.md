# QA log — Phase 10 (Build and ship)

Branch `phase-10-ship`, off `main` at `ab4334f`. Executed 2026-08-26 → 2026-08-27.

The gate table is the record. Everything under it is the evidence, and where a criterion's own
stated method turned out to be wrong, the correction is recorded rather than the method quietly
swapped.

---

## Phase 10 — criterion verdicts

<!-- gate-verdicts -->
| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 10.1 | `npm run build` clean; production bundle runs | **PASS** | `npm run build` → 4 steps green, `verify-dist ok: 5 level(s) and 12 audio file(s) shipped byte-identical`. The bundle *runs* is not a doc claim: `tests/e2e/phase-10-production.spec.ts` boots `dist/` on a real server and **completes level 01 on real keyboard input**, 5 passed. |
| 10.2 | `window.__game`, Playground, Gym and Element Editor absent from `dist/` | **PASS, with its coverage stated** | Three independent gates, not one grep. `verify-dist.mjs` (scene keys, debug symbols, `URLSearchParams`, dev prose); `tools/gen/devSeamGate.mjs` (an exact **file → sentinel manifest**, 27 tokens, none surviving into any emitted chunk *or asset*); the production spec. 🔴 **The Codex implementation review broke the first version of this gate and it is the phase's most important finding** — a bare count of 27 was pad-able. See § 10.2. |
| 10.3 | Build-target and minifier defaults recorded with reversal instructions | **PASS** | `vite.config.ts` records the EXPANSION (`chrome111, edge111, firefox114, safari16.4, ios16.4`), not the moving alias, with reversal instructions and the emitted syntax census beside them. Discharged by diffing the OUTPUT per vault 10.1. **Both halves are now gated**: `verify-dist.mjs` asserts the ES2020+ syntax survives AND pins the four config values — the census alone could not see `target: 'esnext'` dropping every promised browser minimum (Codex impl review, finding 3). Red-proved both ways. |
| 10.4 | Bundle size change explained via raw-vs-gzip ratio | **PASS — with the criterion's own method corrected** | The ratio moved **0.001** across a three-arm A/B in which every `??` disappeared. It is not a discriminator for a target change on this bundle. The syntax census is, and it is what shipped. § 10.4. |
| 10.5 | Build config typechecked as its own program | **PASS — after the gate owner found the claim was false** | `tsconfig.build.json` + `npm run typecheck:build`, run by `npm run build` and pinned by `tests/unit/build-program.test.ts`. It CLAIMED to typecheck the plugin and did not. § 10.5. |
| 10.6 | CSP verified against the **production** header config locally — never the dev server | **PASS locally; the deploy half is OWED** | `vercel.json` → `tools/gen/vercelHeaders.mjs` → both `vite.config.ts` and `tools/dev/prod-server.mjs`. Every directive matched EXACTLY. Red-proved twice. ⚠️ **`curl -sI` against a real deployment has not run** — it cannot until the owner authorises the deploy. § 10.6. |
| 10.7 | `git log --all -p` clean of secrets — history, not the working tree | **PASS, with a stated blind spot and one real finding fixed** | 506 commits, 6,447 reachable objects, unreachable blobs included. Zero named-format secrets. **One real leak found and fixed**: three `anchor.job.json` files shipped a local home directory to the CDN. § 10.7. |
| 10.8 | Licences split: code vs generated assets | **PASS** | `LICENSE` (MIT: `src/`, `tests/`, `tools/`, root config) · `ASSETS-LICENSE.md` (fal.ai output, all rights reserved) · a third-party carve-out for the 215 vendored skill files. § 10.8. |
| 10.9 | 🔴 **AMENDED by owner ruling** — ship-path reproducibility, not asset-rebuild reproducibility | **PASS as amended; the ORIGINAL criterion is NOT met and that is recorded** | Fresh clone → `npm ci` → `npm run build` → **62/62 files byte-identical**. The first run was 61/62 and the 1 was a real defect git could not see. § 10.9 — and the objection to the amendment is recorded verbatim in the phase document. |
| 10.10 | Specs 01–10 all green | **PASS** | `npm run test:e2e` → **141 passed**, read positively and reconciled per project: chromium 60 · chromium-dpr2 7 · chromium-gpu 69 · chromium-prod 5 = 141. Plus unit **2579 passed** and sim-isolated **2576 passed / 3 skipped**. |
| 10.11 | **Every prior phase's acceptance criteria re-verified** | **PASS — and it found two things the PRD had wrong** | 4.27 closed with a wired, red-proved gate. **4.12 closed with the deliberate-removal run it had been owed since Phase 4.** 4.10 dispositioned as superseded. § 10.11. |
| 10.12 | Full playthrough on the production build | **PARTIAL — the gate covers 2 levels and a transition; the 4-level run is a measurement; level 05 and the human half are OPEN** | Levels 01–04 were completed **by playing them** against `dist/`, but the four-level test **flaked in the full suite while passing alone**, so it is recorded as a measurement and the GATE is level 01 → ENTER → level 02 boots and draws. `level-05` resists a position-blind driver even at 240 s and is named unmeasured. § 10.12. |
| 10.13 | Every recorded-but-not-fixed Codex finding from phases 1–9 re-reviewed and dispositioned | **PASS** | All 35 files in `docs/reviews/` enumerated by name (not a `*-plan.md` glob, which misses Phase 5's three split records). 99 disposition lines extracted. `docs/qa/phase-10-ship-02-review-sweep.md`. |
| 10.14 | Codex plan review ran; every finding applied or recorded | **PASS — and it did NOT converge, which is reported rather than dressed up** | Five rounds, all REVISE, hitting `MAX_ROUNDS`. `docs/reviews/phase-10-plan.md` + triage. § 10.14. |
| 10.15 | Codex implementation review ran on the diff; every finding applied or recorded | **PASS** | `docs/reviews/phase-10-impl.md` — verdict REVISE, **2 CRITICAL, 4 HIGH, 2 MEDIUM** on a diff that had already been through six agents and twelve briefs. Every finding applied or recorded; both criticals confirmed by *building the mutation Codex described*. § The implementation review. |

### 🔴 What is NOT closed — four items, named

| item | why |
|---|---|
| **10.6's deploy half** | `curl -sI` against a real preview URL. The local substrate cannot exercise Vercel's route matching, its CDN, or the artifact Vercel rebuilds. Blocked on the owner's authorisation to deploy |
| **10.12's `level-05`** | Not completed by an automated position-blind driver at a 240 s budget. Not claimed completable; not claimed broken. **Unmeasured**, and owed to the owner's hands-on run |
| **10.12's levels 02–04 as a GATE** | They complete on a quiet box and the four-level test flaked in the suite. Recorded as a measurement rather than widened into a green |
| **10.12's human half** | A hands-on criterion is never closed on automated evidence alone *(vault C4)* |
| **2.8's human half** | Same shape, carried from Phase 2, re-verified and dispositioned by 10.11 rather than left silent. On the owner's list at approval |

**Phase 10 is therefore reported NOT DONE.** It is reported at this state, with those four named.
⚠️ The summary here said *"two criteria"* until the Codex implementation review pointed out that a
later section of this same file admitted a third — a log contradicting itself is the shape every
other gate in this phase exists to prevent, and it happened in the record rather than in the code.

---

## The QA gate — six agents, twelve briefs, and a defect in how they were run

| criteria | owner | briefs |
|---|---|---|
| 10.2, 10.4, 10.9, 10.11 | `voltagent-qa-sec:qa-expert` | A (checklist), B (adversarial) |
| 10.5 | `voltagent-qa-sec:code-reviewer` | A, B |
| 10.6, 10.7 | `voltagent-qa-sec:security-auditor` | A, B |

🔴 **The worktrees were created at `main`, not at `phase-10-ship`.** Every agent got its own git
worktree as required — and every worktree checked out the wrong commit, so none of the Phase 10
artifacts were present in it. Four of the six worked around it by reading the real checkout or
`git show phase-10-ship:<path>`; two reported criteria as "unrun/absent" on that basis, which was an
artifact of the harness rather than of the work.

**This is recorded rather than smoothed over, and it is a real limitation on the gate's evidence.**
The findings that landed are sound — each was re-verified locally before being acted on, and the
verification made several sharper than the agent had them. But the *coverage* claim is weaker than
it looks: an agent that could not see the diff cannot have reviewed all of it.

A second limitation: `voltagent-qa-sec:security-auditor` has Read/Grep/Glob and **no Bash**, so it
could not run a single `git` command. The history half of 10.7 was therefore unverifiable *by its
owner* and was run directly instead. Both halves are recorded under § 10.7.

### Findings, and what happened to each *(C11)*

Every finding is applied or recorded with a reason. Nothing was silently dropped.

| finding | disposition |
|---|---|
| **CR-A1** `tsconfig.build.json` claims the plugin is typechecked; it is in no program | **APPLIED** — `allowJs`/`checkJs`, `.mjs` in the include list, `node-shims.d.mts` |
| **CR-A2** the catch-all header lookup exists twice under two comments claiming it exists once | **APPLIED** — `tools/gen/vercelHeaders.mjs`, imported by both |
| **CR-A3** the 10.5 red proof does not discriminate (`vite.config.ts` is in both programs) | **APPLIED** — re-run with a type error in the plugin BODY; `typecheck` green, `typecheck:build` red |
| **CR-A4** the `@types/node` rationale is wrong; `skipLibCheck` widens `PreviewOptions.headers` to `any` | **APPLIED as a recorded shortfall** — the cost is now stated in `tsconfig.build.json` instead of an unexamined `true` |
| **CR-B2** nothing gates `tsconfig.build.json`'s own existence or its `-p` link | **APPLIED** — `tests/unit/build-program.test.ts`, red-proved |
| **CR-B6** the header lookup's two refusals were never watched failing | **APPLIED** — `headersFrom()` split out so both are reachable; both fire in the new test |
| **CR-B4/B8/B9** `devSeamGate.d.mts`'s `Plugin` claim is false; the `.d.mts` include is decorative; no `extends` | **APPLIED** (first two, by putting the body in a program) / **RECORDED** (no `extends`: the two programs deliberately share no options — that is the point of the second one) |
| **S-F2** `frame-ancestors`/`form-action`/`base-uri` have no `default-src` fallback; a typo passes silently | **APPLIED** — exact-match directive map; red-proved with `frame-ancestor` |
| **S-F3** every CSP assertion is a SUBSET check; a loosened `script-src` passes and produces *fewer* violations | **APPLIED** — same fix; red-proved with `'unsafe-inline' 'unsafe-eval'` |
| **S-F4** `cspViolations()`'s `?? []` cannot distinguish "no violations" from "no listener" | **APPLIED** — returns `null`; callers assert `not.toBeNull()` first |
| **S-F8** `startsWith(ROOT)` is a sibling-prefix hole; `decodeURIComponent` kills the server on `GET /%` | **APPLIED** — both fixed and both exercised: `/%` → 400 with the server still alive |
| **S-F5** the `style-src 'unsafe-inline'` rationale is wrong (CSSOM writes are not CSP-governed) | **APPLIED** — corrected to name `index.html`'s own `<style>` block; verified no `innerHTML`/`<style>` injection in `src/` |
| **S-F6** the 404 assertion tests `prod-server.mjs`'s own spread, not Vercel | **RECORDED** — true, and unavoidable locally. It is why the deploy-time `curl -sI` is a separate, still-owed check rather than a formality |
| **S-F9** `blob:` in img-src/media-src may be unearned | **RECORDED, not narrowed** — only dev-only scenes call `createObjectURL` today, but the spec's zero-violations assertion is what would catch a needed one, and removing a permission to chase tidiness risks a silent blank in a path no test covers |
| **S-F10** the `worker-src` claim is unverified against Phaser | **RECORDED** — no `new Worker` in the bundle; the zero-violations assertion is the live check |
| **S-S10** the leak scan skips assets, so `dist/index.html` is unscanned | **APPLIED** — assets decoded and scanned; red-proved by injecting a sentinel into `index.html` |
| Public repo: `.gitignore` has no `.env`/`.vercel/` rules | **APPLIED** |
| Public repo: 215 vendored skill files covered by neither licence | **APPLIED** — carve-out in `LICENSE` |
| **A2/B3** the anchor audit is wired post-spend and bypassed by `assets:build:all` | **APPLIED** — moved into the modules that READ an anchor |
| **A4/B5** the audit exits 0 having measured nothing on any fresh clone | **APPLIED** — ABSENT fatal once `_generated/` exists; red-proved |
| **B6** `anchor-audit.test.ts` claims to cover the wiring and reads no consumer | **APPLIED** — red-proved by unwiring both consumers |
| **A6/B1** `measure-bundle.mjs` and `vite.config.ts` record contradictory `??` counts in one commit | **APPLIED** — re-measured live; 48 and 18, with a `??=` column so they cannot re-merge |
| **A8/B17** the sentinel census counts plain text, so a commented-out seam still counts | **APPLIED** — call-shaped over comment-stripped source, plus uniqueness; red-proved |
| **B11** the four "uncoverable" ternaries are awkward, not uncoverable | **APPLIED** — comma expressions; floor 23 → 27; each red-proved by its own guard |
| **A9** `breakAsset=corrupt` is never exercised and is not in the exclusion list | **APPLIED** — second navigation |
| **A10/B7/B8** the EOL gate is an allowlist; `index.html` is in neither half of 10.9; the vacuity guard is 3× loose | **APPLIED** — inverted to a denylist, `index.html` added, count pinned at 19 |
| **B9** the ordering guard checks a project NAME where the hazard is a port | **APPLIED** — `PROD_PORT` exported and imported; no third copy |
| **B12** the readiness gate fires on `create()`'s first statement | **APPLIED** — a drawn frame is now required; the false "bindings are installed during input setup" comment retired |
| **B10** the red-proof procedure uses `--project` + `-g`, the zero-selection shape, and never says to read the count | **APPLIED** — both expected counts stated, and why `npm run build` is not optional |
| **B14** nothing verifies `dead-sim.patch` still applies | **APPLIED** — `advance-split.test.ts` pins the patch's own anchor line; red-proved by renaming the loop variable |
| **B15** `measure-bundle.mjs` has zero automated consumers | **APPLIED** — `verify-dist.mjs` asserts every ES2020+ feature survives; red-proved with `target: 'es2015'` |
| **A13/B16** `playToExit` uses `waitForTimeout` against §5 with no recorded exception | **RECORDED with the argument** — §5's rule is about waiting for STATE; these are input DURATIONS. There is no page state meaning "the jump has been held long enough" |
| **A1/B2** `docs/qa/phase-10-ship.md` does not exist and eight files cite it | **APPLIED** — this file |
| **A3/B4** PRD.md still records 4.27 open, and 4.10/4.12 as closed | **APPLIED** — see § 10.11; the PRD was wrong about 4.12 and 10.11 is what found it |
| **A7** 10.4 never measured a `main`-vs-branch bundle delta | **RECORDED** — the branch changes no runtime code, and the three-arm A/B on one commit is the measurement that answers the criterion's real question. Named here rather than implied |
| **B10a** `prod-server.mjs` serves a stale `dist/` without complaint | **RECORDED** — `test:e2e` rebuilds; the narrow-run path now says so explicitly in the fixture's procedure |
| **B13** the traversal guard's sibling-prefix hole | **APPLIED** (same as S-F8) |
| **A11** `vite.config.ts` states a false fact about its own imports | **APPLIED** |
| **A12** `.vercelignore` describes a three-step build that is now four | **APPLIED** — and its "tsc errors on a missing named include" claim was itself false; measured twice and corrected |

---

## 10.2 — the dev-seam gate, and what it cannot see

**27 sentinel-marked DEV bodies.** Each `import.meta.env.DEV` guard carries a unique
`'__DEVSEAM_<module>_<body>__'` string literal inside the guarded body. In a production build the
guard folds to `false`, the body is dropped, and the literal goes with it. The gate asserts **no
`__DEVSEAM_` literal survives anywhere in any emitted chunk or asset**.

**Why a sentinel and not a natural token.** A natural token can vanish even with its guard removed —
a second guard downstream makes the value unused and Rolldown drops it — so its absence is not
causally linked to its own guard. Every entry is red-proved by removing **its own** guard, because
one mutation cannot exercise a roster.

**The four ternaries are no longer excepted.** They were reported UNCOVERED on the grounds that a
ternary arm has no statement position. The gate owner pointed out that `devSeam` returns `void`, so
`(devSeam('…'), value)` is legal in all four. That was the honesty clause being used to excuse a
seam it could cover cheaply — a misuse, and it is now named in the gate's own header.
`GameScene`'s dev-action object was the one that mattered: five dev closures with no tell any gate
read, because `verify-dist.mjs` measures those identifiers surviving as empty method stubs either
way.

**What the gate still cannot see.** It reads the emitted `dist/` only. A DEV path that ships because
its guard was never written has no sentinel to leak, and nothing here would know.
`dev-guard-census.test.ts` is the half that counts guards in source; this is the half that proves
they folded. Neither alone is sufficient and the split is deliberate.

### 🔴 The count was pad-able, and the Codex implementation review broke it

The gate asserted `MIN_SENTINELS = 27` — a floor over a **global count**. Codex named the mutation
and I built it, because a finding it could not execute is a claim until a command here confirms it:

```
1. delete the import.meta.env.DEV guard in globals.ts's updateDebugState, taking its devSeam line
2. re-home '__DEVSEAM_globals_updateDebugState__' inside gameDev.ts's already-guarded body
3. npm run build

   [plugin steampunk:dev-seam-gate] dev-seam gate ok: 27 sentinel-marked DEV bodies folded
   verify-dist ok
   __DEVSEAM_ in bundle: false
   updateDebugState body shipped (Object.assign present): TRUE
```

**Both gates printed OK while the DEV body shipped into every production tick** — *the exact leak
this gate exists to close*, the one `verify-dist.mjs` has carried as a documented uncaught mutation
since 2026-08-23, passing the gate that claimed to close it.

The diagnosis is the sharp part: **every recorded red proof was cooperative.** They removed a guard
and left its token behind — which is the mutation the person who wrote the gate naturally reaches
for. A count over a set cannot answer *"is this token still inside the guard it names"*.

So the floor is replaced by `SENTINEL_MANIFEST`: the exact **file → token map**, plus a rule that a
token's `<module>` segment must match its file's basename. Deleting a guard shrinks its file's list;
moving a token fails twice over; adding a seam is a deliberate edit. Re-running Codex's mutation now
fails three ways at once, naming the file each time.

⚠️ **The residual hole is stated rather than papered over.** Moving a token between two guarded
bodies **in the same file** still satisfies the manifest. Closing that needs a parser proving each
sentinel is dominated by its own guard, and `@babel/parser` is approved **test-only** (CLAUDE.md §3)
— using it at build time would be a change to an owner-approved decision, i.e. a STOP-and-ask. The
hole is narrowed from "anywhere in `src/`" to "within one file". Narrowed, not closed.

**Red proofs, all watched and reverted:**

| mutation | result |
|---|---|
| each of the 27 guards removed individually | its own token in the leak report |
| **a guard deleted and its token re-homed elsewhere** | **3 named failures** — was silently green |
| a `devSeam(...)` line commented out | `only 26 dev-seam sentinel(s) found, expected at least 27` |
| a token duplicated | `sentinel token(s) used more than once` |
| a sentinel injected into `index.html` | caught by the asset scan |
| `globals.ts`'s guard removed | build refused — the mutation `verify-dist.mjs` had documented as **uncaught** since 2026-08-23 |

---

## 10.4 — the ratio said nothing, and that is the result

Three arms on the same commit:

| arm | raw | gzip | ratio | `?.` | `??` | `??=` |
|---|---|---|---|---|---|---|
| Vite 8 defaults | 1,441,653 | 377,486 | 3.819 | 70 | 48 | 18 |
| this branch, pinned | 1,441,653 | 377,486 | 3.819 | 70 | 48 | 18 |
| `target: 'es2015'` | 1,446,448 | 378,656 | **3.820** | **19** | **0** | **0** |

Downlevelling **every** `??` in the bundle and two thirds of the optional chaining moved the ratio by
**0.001** and the raw size by 0.33 %. Vault 10.2's own warning — *a statistic that does not order its
own mutation cannot be fixed by moving the bound; replace the statistic* — arriving in the phase
named after it.

So the instrument is the **syntax census**, and it is now asserted by `verify-dist.mjs` rather than
recorded in a comment that goes stale the first time a Vite major moves the target.

The first two arms being byte-identical is the other half of the result: **the pinned values ARE
Vite 8.2.0's current defaults.** Pinning changed nothing today. Its whole value is that a Vite major
can no longer move the browser contract silently, with no diff to review.

⚠️ **`??` was recorded as 66 in one file and 48 in another, inside the same commit.** The census
regex is `/\?\?[^=]/g`, which cannot match `??=`; 66 was `??` + `??=` hand-summed into a row that
counts only the first. Re-measured live. A `??=` column now exists so they cannot be silently
re-merged. *(This is "read the assertion, not the statistic" recurring — the same failure the
project already has a memory note about.)*

**Rolldown refuses any target below ES2015** (*"Rolldown only supports ES2015 (ES6) and later"*),
which is the floor recorded in the reversal instructions.

---

## 10.5 — an unmet half recorded as met

`tsconfig.build.json` said, in its own header: *"the plugin IS typechecked here, through its
declaration."* **It was not.** With `allowJs` off, the include list named `devSeamGate.d.mts` — 18
lines of hand-written assertions *about* the plugin — while `devSeamGate.mjs`, the 190-line body
those assertions describe, was in **no program at all**.

The justification was circular as well: it argued no Node types were needed, while the file opens
with `import { readFileSync, readdirSync, existsSync } from 'node:fs'`. The Node-types *need* had
not been removed; the Node-using *file* had been excluded from the program.

Turning the program on immediately found **seven real type errors** in the plugin, including a
`readdirSync` shim that did not match the call site. That is the marginal coverage the second
program was supposed to provide and had not provided at all — before this, the two configs differed
only in `lib`.

**The red proof now discriminates.** The old one broke `vite.config.ts`, which `tsconfig.json`
already includes, so both programs reddened and the second one proved nothing:

```
const MIN_SENTINELS = countSentinelsInSource(23, 24);
npm run typecheck        → GREEN
npm run typecheck:build  → TS2554: Expected 0-1 arguments, but got 2
```

**Recorded shortfall.** `vite`'s `dist/node/index.d.ts` opens with `/// <reference types="node" />`.
Without `@types/node` — a frozen-dependency STOP-and-ask — that reference is unresolvable and
`skipLibCheck` swallows it. The cost: some Vite types that flow through Node ones degrade, and
`PreviewOptions.headers` widens to `any`, so `preview.headers` is **not** type-checked against
Vite's shape. Measured, accepted, and written into the config rather than left as an unexamined
`true`.

---

## 10.6 — the CSP, and the half that is still owed

One source: `vercel.json` → `tools/gen/vercelHeaders.mjs` → `vite.config.ts` **and**
`tools/dev/prod-server.mjs`. Before this phase's gate, that sentence was written in two files and
true in neither: each did its own catch-all lookup, one typechecked, one not.

**Measured, and a correction to what everyone expected.** Vault 10.5 says a bare `self` blanks the
game. Two mutations were run:

| mutation | result |
|---|---|
| `script-src self` (unquoted) | **page blanks**, 2 tests failed |
| `default-src self` (unquoted) | **game stays fully playable** |

The second is the interesting one. Every resource type this game uses has an **explicit** directive,
and an explicit directive overrides `default-src` for its own type — so breaking `default-src` alone
breaks nothing. The vault item is right about the *class* of failure and would have pointed a reader
at the wrong directive.

**The assertions are exact, not subset.** Every security-critical directive value is written out by
hand in the spec, once, and compared for equality. That IS a second definition of the policy, and it
is deliberate: an expectation read out of the file under test detects **drift**, never **wrongness**
— a policy that is wrong everywhere at once agrees with itself perfectly. Both red proofs pass
through the old assertions and fail the new ones:

| mutation | old assertions | new assertion |
|---|---|---|
| `script-src 'self' 'unsafe-inline' 'unsafe-eval'` | pass (and produce *fewer* violations) | **1 failed** |
| `frame-ancestors` → `frame-ancestor` | pass | **1 failed** |

Added on the auditor's recommendation: `Permissions-Policy` (every sensor and capability denied —
the game uses none) and `Cross-Origin-Resource-Policy: same-origin`.

Server hardening, both exercised: `GET /%` returned **400 with the process still alive** (it used to
throw `URIError` out of the `createServer` callback and kill the server, so every later request got
ECONNREFUSED — a Playwright run would have read a dead port as a broken game); the traversal guard is
`candidate === ROOT || startsWith(ROOT + sep)` rather than a prefix test that `dist-backup` passes.

🔴 **The deploy half has not run.** `curl -sI` against a real preview URL is the
production-relevant check — this local substrate cannot exercise Vercel's route matching, its CDN, or
the artifact Vercel rebuilds on its own machine. It is owed, and it is blocked on the owner's
authorisation to deploy.

---

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

**`level-05` is unmeasured — not claimed completable, not claimed broken.** A position-blind driver
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

| run | result |
|---|---|
| `npm run typecheck` | clean |
| `npm run typecheck:build` | clean |
| `npm test` | **173 files, 2579 tests passed** |
| `npm run test:sim-isolated` | **2576 passed, 3 skipped** — Phaser uninstalled, restored after |
| `npm run build` | 4 steps green · dev-seam gate ok, 27 sentinels folded · verify-dist ok |
| `npm run test:e2e` | **141 passed** — chromium 60 · dpr2 7 · gpu 69 · prod 5, reconciled against `--list` |

Counts are read, not inferred from exit codes. A Playwright run that selects nothing prints
`expected: 0, unexpected: 0` and exits 0; a zero exit through a pipe is `tail`'s exit.

---

## Vault-out — Phase 10

### What the 400-line ceiling cost, and what it bought

**It cost real time, and it never once cost correctness.** `build-assets.mjs` sat at exactly 400
lines; adding a two-line gate call pushed it to 408 and reddened the suite. The fix took five
minutes — a duplicated `node:fs` import merged, two import blocks collapsed — and left the file at
392.

That is the honest shape of the rule: it fires on the *last* change rather than the one that made
the file long, so whoever is holding it pays. What it bought is visible in `src/render/` and
`src/scenes/`: `GameScene` has been extracted seven times, and the seventh took *logic* rather than
trimming lines. Every one of those extractions made an edge case reachable from a unit test that had
previously only been reachable by playing the game.

**The rule's real value is not file length. It is that the ceiling forces the extraction, and the
extraction is what makes a decision testable.**

### Did the sim/render split pay off

**Yes, and this phase is where it paid the most.**

`npm run test:sim-isolated` — 2,576 tests, Phaser uninstalled — is a claim no amount of prose could
make. And the split is what made criterion 10.12 possible *at all*: the production build exposes no
`simWorld`, so proving the game **simulates** had to come from a shipped feature (the save file)
rather than a debug handle. A codebase where the sim was tangled into scenes would have had nothing
to observe.

The split also produced this phase's sharpest single lesson, and it is in CLAUDE.md already:
**a decision function with no consumer is the same defect as a burst of zero particles.** Phase 9
shipped `spriteFeedback.ts` — 221 source lines, a 306-line test file, zero production consumers.
This phase found the same shape twice more: `measure-bundle.mjs` had no automated consumer, and
`vite.config.ts`'s `productionHeaders()` was consumed only by `preview.headers`, which nothing runs.
**Extracting a decision creates a new way to be green and dead.** The split is still right; it just
owes a draw-path gate every time.

### Real fal spend versus quoted rates

Not re-measured this phase — no generation ran. The figure that matters here is the **~$7** of
re-shot clips caused by the ungated anchor, because Phase 10 is where that finally became
impossible to repeat. It was the only Phase 4 rework cause with no gate, which made it the one defect
guaranteed to recur, and it stayed open for five phases *after* the gate that catches it was written.

**A gate nobody runs is a gate that cannot go red.** The cheapest money this project could save was
sitting behind a wiring change, and the wiring change is eight lines.

### Which vault lessons fired

| lesson | how |
|---|---|
| **10.1** diff the OUTPUTS, not the changelog | Vite 8's default target is a **moving alias** whose own source comment says it bumps every major. Pinned as the expansion |
| **10.2** ratio as discriminator | It moved 0.001 while every `??` vanished. The lesson fired by being **wrong for this bundle**, and replacing the statistic is what the vault actually says to do |
| **10.5** quote CSP keywords | Fired — and the *directive* it points at is wrong for a policy with explicit rules for every type |
| **10.6** every number in the README is a claim | Every one was checked |
| **C1 / C2 / C12** watch it fail, commit the fixture, verify the revert | Fifteen red proofs, each watched and each revert confirmed by "content changed AND the original count dropped by one" |
| **C11** apply or record with a reason | 40 findings, every one dispositioned in the table above |
| **A7** two briefs per gate | Six agents, twelve briefs, brief 1's findings withheld from brief 2 — and brief B out-found brief A on every pairing |
| **C4** never close a hands-on criterion on automated evidence | 10.12's human half is explicitly the owner's |
| **4.16 / 4.18** refuse, never substitute; INDETERMINATE is a verdict | 4.12's refusals now have a watched red; ABSENT stayed a distinct status rather than folding into PASS |
| **9.3** record the blind spot | 10.7's entropy oracle missed the one real leak, and that is written down beside the result |

### The Codex protocol's own verdict, across ten phases

This is the reusable number, and it is the one worth carrying forward.

**Plan review is worth more than implementation review — by a lot.** This phase's plan review found
**five blockers before a line of code existed**, and its later rounds were finding defects in
solutions to its earlier findings. That compounding is the whole value: a defect caught at round 1
would have been a defect *in a gate*, and a defect in a gate is invisible by construction.

**But the plan review also has a failure mode nobody had named until this phase: it never
converged.** Five rounds, all REVISE. Reporting that honestly is worth more than a sixth round
engineered to produce an APPROVED, and it is a legitimate outcome rather than a process failure.

**And the strongest finding of all ten phases came from neither review.** It came from the QA gate's
**adversarial** brief — the "how could this be wrong?" one — which found that a config file *claimed*
to typecheck the plugin and did not. Codex read that file four times across five rounds and never
questioned the claim, because the claim was written in a comment and comments read as true.

The lesson, stated for the next project: **a cross-model review checks your reasoning; an adversarial
brief checks your evidence.** They are not substitutes, and the second one is cheaper.

### What is owed forward

| item | why it is not closed here |
|---|---|
| **10.6's deploy half** | `curl -sI` against a real preview URL. Blocked on the owner's authorisation |
| **10.12's `level-05` and its human half** | Not completable by a position-blind driver at 240 s. Unmeasured, not claimed either way — and a hands-on criterion never closes on automated evidence *(C4)* |
| **2.8's human half** | Carried from Phase 2, re-verified and dispositioned rather than left silent |
| **A parser-backed dev-seam gate** | The manifest narrows the hole to "within one file". Closing it needs `@babel/parser` at BUILD time, which is a change to an approved test-only decision — a STOP-and-ask, deliberately not taken |
| **`assets:fetch` / `assets:verify`** | Phase 5 called them binding debt. They are what would make 10.9's original criterion achievable, and until they exist the public repo cannot reconstruct its own art |
| **`_generated/` is the only copy of a non-regenerable input** | 128 MB of clips; the generator is not seed-deterministic. **Archive it outside git.** Losing it freezes the art at its current packing forever |
| **The QA gate's worktrees were at the wrong commit** | Recorded above. The findings are sound; the coverage claim is weaker than it looks |
| **Phase 9's three carried items** | Dispositioned above: all still true, none blocking |
