[← Phase 10 QA log index](phase-10-ship.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-10-ship.md)

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

### The residual hole was stated, then the owner authorised closing it — 2026-08-27

The per-file map left one move: take a token out of one guarded body and paste it into another
**in the same file**. Same file, same token, same count, and *both ends are guarded* — so a
dominance check alone would not have caught it either. The gate header said so and called it
"narrowed, not closed", because closing it needs a parser and `@babel/parser` was approved
**test-only** (CLAUDE.md §3).

**The owner widened that approval to build time on 2026-08-27.** `tools/gen/devSeamAst.mjs` parses
each file and reports, per sentinel, the **enclosing function** and whether reaching it implies
`import.meta.env.DEV`. Two rules follow:

| rule | what it catches |
|---|---|
| **SITE** — the sentinel must sit in the function `SENTINEL_SITES` names | the same-file re-homing; **this is the one that closes the hole** |
| **DOMINANCE** — reaching the sentinel must imply DEV | a sentinel with no guard over it, which never folds and so proves nothing by being absent |

⚠️ **The site rule, not the dominance rule, is the fix** — worth stating because dominance is the
intuitive answer and it is the wrong one here.

The parser also replaced the hand-rolled comment lexer the census used, so a `devSeam(` inside a
string, inside a comment, or written as something that is not a call are now distinguished rather
than approximated. `@babel/parser` stays a devDependency and reaches `dist/` never: the gate is a
`generateBundle` hook, not a transform.

**Five files carry a sentinel with no local guard** — `render/enemyTuning.ts`, `devFeelTuner.ts`,
`devMotionProbe.ts`, `devSpawn.ts`, `gymKeys.ts`. They are DEV-only *modules*, guarded at every call
site, and a blanket dominance rule false-reds all five — the exact failure mode of the
`renderedLength` rule this gate deleted on 2026-08-26. They are declared in `DEV_ONLY_MODULES`, and
that is not a loophole: each of their callers carries its own dominated sentinel.

**Red proofs, all watched and reverted:**

| mutation | result |
|---|---|
| each of the 27 guards removed individually | its own token in the leak report |
| **a guard deleted and its token re-homed to ANOTHER FILE** | **3 named failures** — was silently green |
| **a guard deleted and its token re-homed WITHIN globals.ts** | **named**: *"is in `installDebugGlobals` but SENTINEL_SITES says `updateDebugState`"*, build exit 1, no bundle emitted — and the per-file rule stayed silent on it, which is the proof that the site rule is what caught it |
| **`gameLevelPick.ts`'s guard removed, token left in place** | **named**: *"reaches … without an `import.meta.env.DEV` guard over it"* |

Both new mutations were confirmed applied by *content changed AND the guard count dropped by one*
*(C12)* — never by "the count is now zero" — driven from the shell, and both reverted to a clean
`git diff` before the green was re-read.
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

### 🔴 The deploy ran, and it justified every word of "the local substrate cannot see this"

A preview deploy was made on 2026-08-27. **It failed on the first attempt, for a reason no local gate
could have found**, and that failure is the strongest single piece of evidence this phase produced
about why 10.6 has two halves:

```
Downloading 740 deployment files...
tests/unit/audio-catalog.test.ts(20,21): error TS2307:
  Cannot find module '../../public/assets/index.json'
Error: Command "npm run build" exited with 1
```

**`.vercelignore` had removed the game's art from the build box.** It uses gitignore syntax, in which
a pattern with no leading slash matches at **any depth**. The file carried a bare `assets/` — meant
for the 96 MB of Phase 0 reference art at the repository root — and it also matched
**`public/assets/`: 48 of the 60 files under `public/`**, every sprite sheet, tile set, parallax
layer, portrait and sound the game loads.

The header three lines above that rule said, in capitals, that `public/` must stay because *"it IS
the game"*. The rule below it removed most of `public/`. **Every local gate was green** — `npm run
build`, `verify-dist`, 2,579 unit tests, 141 e2e tests — because locally the files are simply there.

It failed **loudly** only by luck: `tsconfig.json` includes `tests/`, and the tests import the
catalog. Had they not, this would have produced a green build at a live URL serving a blank canvas.

Verified with git's own matcher rather than reasoned about:

| pattern | hides `public/assets/index.json` | hides `assets/x.png` |
|---|---|---|
| `assets/` | **YES** | YES |
| `/assets/` | no | YES |

Fixed by anchoring every directory pattern, and gated by `tests/unit/vercelignore.test.ts`, which
red-proves on an un-anchored pattern.

### ⚠️ The near-miss: a bare `vercel deploy` targets PRODUCTION on this project

`vercel ls` reports that first, failed deployment as **Environment: Production**. A bare
`vercel deploy` on a project with no git integration defaults to the production target — so it would
have gone **straight to production, bypassing the owner's STOP gate**, and the only reason it did not
is that it errored on the `.vercelignore` bug.

The successful deploy was made with an explicit `--target=preview`. **A bare `vercel deploy` must
never be run on this project**; this is recorded in HANDOFF.md as well, because it is a trap that is
invisible from the command line.

### 🔴 And the CSP as served is STILL unobserved — for a second, different reason

```
GET /                    -> 302   location: https://vercel.com/sso-api?url=…
GET /assets/index.json   -> 302   location: https://vercel.com/sso-api?url=…
GET /no-such-file-here   -> 302   location: https://vercel.com/sso-api?url=…
  content-security-policy: *** ABSENT ***   (on all three)
  strict-transport-security: max-age=63072000; includeSubDomains; preload
```

The deployment is behind **Vercel Deployment Protection**. Every request 302s to the SSO endpoint
before the header rules apply, so the policy cannot be read off the real content and the playthrough
cannot run against the preview either. HSTS is the one header observable, and it is applied by the
platform rather than by `vercel.json`.

**Turning protection off makes the deployment publicly reachable. That is the owner's decision, not
mine**, and it is why 10.6's deploy half remains open rather than being worked around with a
protection-bypass token — generating one is the same class of project-settings change.

**Preview URL** — `https://steampunk-platformer-97o1gq0tk-rois-projects-f9d9895d.vercel.app`

### ✅ The PRODUCTION deploy ran — 2026-08-27, on the owner's authorisation

```
target:     production
readyState: READY
id:         dpl_5Kbru3jg6WR6T5zyXXxSor4vAuHq
url:        https://steampunk-platformer-jvtgpyug9-rois-projects-f9d9895d.vercel.app
```

**And Vercel's own build log is the strongest evidence this phase has that the shipped artifact is
whole** — all four gates ran on Vercel's machine, not this one:

```
> tsc --noEmit && tsc --noEmit -p tsconfig.build.json && vite build && node tools/gen/verify-dist.mjs
vite v8.2.0 building client environment for production...
[plugin steampunk:dev-seam-gate] dev-seam gate ok: 27 sentinel-marked DEV body/bodies folded out of dist/
✓ built in 955ms
verify-dist ok: 5 level(s) and 12 audio file(s) shipped byte-identical, no DEV-only scene key
                or debug surface in 1 bundle(s)
Build Completed in /vercel/output [8s]
```

That line is what would have caught the `.vercelignore` regression had it come back, and it is the
answer to *"is the remote artifact the same game"*: **five levels and twelve audio files, byte for
byte, with no dev surface**, verified by the remote build rather than inferred from the local one.

### 🔴 The CSP as served is STILL unobserved — for a THIRD reason, and it is not the game's

The header probe against the production URL could not be run from this session: the sandbox's
permission classifier refused both the `vercel` subcommands and the outbound HTTPS probe. Nothing
about the deployment blocked it and nothing about `vercel.json` is in doubt locally — five e2e specs
assert the exact header set against a server that reads `vercel.json` itself, with duplicate
directives rejected before comparison.

**What is owed is one command against the live URL**, and it is the owner's to run:

```
curl -sI https://steampunk-platformer-jvtgpyug9-rois-projects-f9d9895d.vercel.app | \
  grep -i 'content-security-policy\|x-content-type-options\|referrer-policy\|permissions-policy'
```

Expected, from `vercel.json`'s single catch-all rule:

```
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; font-src 'self';
  object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'
x-content-type-options: nosniff
referrer-policy: same-origin
permissions-policy: accelerometer=(), camera=(), … xr-spatial-tracking=()
cross-origin-resource-policy: same-origin
```

⚠️ **A missing CSP means the header rule did not match, not that the game is broken** — the two
failure modes are opposite and should not be conflated. A *wrong* CSP blanks the canvas; an *absent*
one leaves a working game with no policy. Both are 10.6 failures; only one is visible by playing.

### The rollback, rehearsed as far as it can be without a production alias

| verb | command | notes |
|---|---|---|
| roll back | `vercel rollback <url\|deploymentId>` | `--timeout` defaults to 3m; `-y` skips prompts |
| watch it | `vercel rollback status [project]` | the rollback is asynchronous; this is how you know it landed |
| go forward | `vercel promote <url\|deploymentId>` | promotes an existing deployment to current |

Confirmed against **CLI 56.5.0's own `--help`**, not from memory — and ⚠️ note that the CLI is
outdated (59.x is current) and that `vercel deploy` reported itself as **Vercel CLI 59.3.0** when it
ran remotely, so the local and remote CLIs are different versions.

⚠️ **The rollback is NOT rehearsed, and the vault is specific about why that matters**: the warning
is about the deployment *that moves the domain*, and a preview-only exercise does not rehearse the
production alias path. The staged rehearsal — verify the alias moved, then verify the rollback verb
moves it back — can only happen immediately after `--prod` is authorised, and it must happen before
anything else.

---

