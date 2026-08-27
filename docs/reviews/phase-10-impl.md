# Codex implementation review — Phase 10 (Build and ship)

**Model** `gpt-5.6-sol`, high reasoning effort, read-only sandbox.
**Skill** `claudex-loop:codex-review` — the owner-authorised substitution for `/codex:rescue`, for
both of this phase's Codex reviews. Recorded in `docs/reviews/phase-10-plan.md` and in
`docs/prd/phase-10-ship.md` §4.
**Subject** the full branch diff `main...phase-10-ship`, 65 files, 4,333 insertions, run **after**
the QA gate's six agents and their forty findings had been applied.
**Thread** `01a0416e-460d-71c2-a8b8-5a4ad8b4b8b9`
**Verdict** `REVISE` — 2 CRITICAL, 4 HIGH, 2 MEDIUM.

⚠️ **Codex's sandboxed shell cannot spawn processes on this machine** (`CreateProcessAsUserW failed:
5`, permanent). The prompt directed it to `node_repl` + `fs.readFileSync`, which restores file
*reading* and not command *execution*. Its findings are **file evidence only**, and Codex said so
itself in its opening line. **Every one was re-verified locally before being acted on**, and in the
two critical cases the verification meant *building the mutation Codex described and running it*.

---

## The verbatim review

> File-evidence-only review; I could not execute builds, tests, mutations, browsers, Git, or Vercel.
> The CSP runtime consequence noted below requires local confirmation.
>
> 1. **CRITICAL — the pre-submission anchor gate is vacuous on a clean clone.** `anchorAudit.mjs:158`
>    permits every anchor to be `ABSENT` when `_generated/` does not exist. `submit-clips.mjs:29`
>    runs that permissive audit, then creates `_generated/` at line 40 and prints paid commands using
>    the remote `job.anchorUrl` at lines 83–90 without reading or hash-checking the audited local
>    source. The declared SHA is explicitly "data, not a runtime check" in `clipAnchors.mjs:94`.
>    Therefore criterion 4.27 can print a generation command having measured zero submitted bytes.
>    Worse, `anchor-audit.test.ts:79` only regexes for `auditOrThrow(`, so commenting out either call
>    leaves the wiring test green. This invalidates the 4.27/10.11 PASS in `phase-10-ship.md:343`.
>    **Fix:** At submission, require each selected anchor source, verify its SHA-256, run G1 on those
>    exact bytes, and replace the wiring regex with executable/AST-based reachability proof.
>
> 2. **CRITICAL — the 27-sentinel gate is a pad-able count, not guard-to-sentinel coverage.**
>    `devSeamGate.mjs:182` inventories arbitrary call-shaped literals and accepts any unique set of at
>    least 27 at lines 271–289; it never proves that each token remains inside its named guard. Move
>    `__DEVSEAM_globals_updateDebugState__` from `globals.ts:74` into another guarded body, then
>    remove lines 71–73: the count remains 27, the moved token folds out, no token leaks, and
>    `Object.assign(state, patch)` ships — the exact leak `verify-dist` already documents as
>    invisible. The recorded mutation removed only the guard while deliberately leaving its token, so
>    it tested the cooperative mutation, not the property.
>    **Fix:** Maintain an exact guard/body manifest and use an AST check proving every sentinel is
>    immediately dominated by its corresponding production-false guard.
>
> 3. **HIGH — criterion 10.3 does not gate the pinned browser contract.** `verify-dist.mjs:217`
>    requires only that three ES2020+ regex counts remain nonzero. Changing `vite.config.ts:81` to
>    `BROWSER_TARGET = ['esnext']` drops the promised Chrome/Edge/Firefox/Safari minimums while
>    leaving all those syntax counts present, so the gate stays green. The regexes in
>    `measure-bundle.mjs:59` can also be satisfied by string contents.
>    **Fix:** Semantically assert the exact target expansion, minifier, and sourcemap values; use a
>    controlled transform fixture for emitted-syntax behavior.
>
> 4. **HIGH — the "exact" CSP comparison loses duplicate directives.**
>    `phase-10-production.spec.ts:184` converts directives with `Object.fromEntries`, silently
>    retaining only the last duplicate. Prepending `script-src *;` before the existing exact
>    `script-src 'self'` leaves the resulting object equal to `REQUIRED_DIRECTIVES`, passes the
>    unquoted-keyword check, and produces no extra violation. CSP processors use the first duplicate
>    directive, so the effective policy would be loosened while this gate stays green; I could not
>    execute that browser mutation here.
>    **Fix:** Reject duplicate directive names before comparison and add this exact mutation to the
>    watched-red set.
>
> 5. **HIGH — the QA log closes playthrough criteria that its own evidence says are open.** The game
>    has five levels (`README.md:3`), but the production harness hardcodes only `level-01`
>    (`prodHarness.ts:62`) and the production test proves only that level's completion
>    (`phase-10-production.spec.ts:203`). More directly, the log marks 10.12 PASS and says only
>    10.6/10.15 remain open at `phase-10-ship.md:27`, while later admitting the mandatory human half
>    is unperformed at line 442. The prior-criteria sweep also says criterion 2.8's human half remains
>    unperformed (`phase-10-ship-02-review-sweep.md:76`), contradicting 10.11's PASS.
>    **Fix:** Mark 10.11/10.12 pending until the human checks run and either play all five production
>    levels or formally amend "full playthrough."
>
> 6. **HIGH — the build-program reach test can be satisfied by comments.**
>    `build-program.test.ts:55` reads JSONC as raw text and uses `.toContain`; its `allowJs` and
>    `checkJs` assertions do the same at lines 66–70. Replace `"tools/gen/devSeamGate.mjs"` in the
>    actual include array with a comment containing that string: the plugin body leaves the program,
>    while this test remains green and TypeScript resolves the hand-written declaration again.
>    **Fix:** Parse the JSONC with TypeScript's config parser and assert the resolved program's actual
>    root/file names and effective compiler options.
>
> 7. **MEDIUM — the claimed single catch-all lookup still exists twice.** `prodHarness.ts:71` directly
>    performs `vercel.headers.find(h => h.source === '/(.*)')`, duplicating both the lookup algorithm
>    and path literal that `vercelHeaders.mjs:77` supposedly owns exclusively. This is not the
>    deliberate second CSP policy definition; it is duplicate plumbing.
>    **Fix:** Import `productionHeaders()` or `headersFrom()` and `CATCH_ALL_SOURCE` in the harness.
>
> 8. **MEDIUM — the committed dead-sim fixture's applicability gate does not prove the patch
>    applies.** `advance-split.test.ts:154` extracts only the removed loop line and checks
>    `.toContain`. The patch also depends on the surrounding context in `dead-sim.patch:37`;
>    reformatting or renaming adjacent context while retaining the loop header leaves the unit test
>    green but can make `git apply` fail. The QA statement that a stopped-applying patch necessarily
>    turns red is therefore unsupported.
>    **Fix:** Make CI perform a non-mutating patch applicability check, or parse and apply the fixture
>    to an in-memory copy in the unit test.
>
> VERDICT: REVISE

---

## Triage — every finding applied or recorded *(C11)*

### 2 — CRITICAL, and it is the most important finding of the phase

**CONFIRMED BY BUILDING IT.** Codex could not run anything; I ran exactly the mutation it described:

```
1. delete the `import.meta.env.DEV` guard in globals.ts's updateDebugState, taking its devSeam line
2. re-home '__DEVSEAM_globals_updateDebugState__' inside gameDev.ts's already-guarded body
3. npm run build
   → [plugin steampunk:dev-seam-gate] dev-seam gate ok: 27 sentinel-marked DEV bodies folded
   → verify-dist ok
   → __DEVSEAM_ in bundle: false
   → updateDebugState body shipped (Object.assign present): TRUE
```

**Both gates printed OK while the DEV body shipped into every production tick.** That is *the exact
leak this gate exists to close* — the one `verify-dist.mjs` has carried as a documented uncaught
mutation since 2026-08-23 — passing the gate that claimed to close it.

Codex's diagnosis of *why* is the sharp part and it is correct: the recorded red proofs removed a
guard **while leaving its token behind**, which is the cooperative mutation. A count over a set
cannot answer "is this token still inside the guard it names".

**APPLIED.** `MIN_SENTINELS` is replaced by `SENTINEL_MANIFEST` — the exact **file → token map** —
plus a naming rule that a token's `<module>` segment must match its file's basename. Re-running
Codex's mutation now fails three ways at once:

```
dev-seam gate FAILED — criterion 10.2:
  - src/debug/globals.ts no longer carries __DEVSEAM_globals_updateDebugState__ …
  - src/scenes/gameDev.ts carries __DEVSEAM_globals_updateDebugState__, which the manifest does not
    list for it …
  - __DEVSEAM_globals_updateDebugState__ is in src/scenes/gameDev.ts but names module "globals" …
```

⚠️ **Codex's recommended AST check was deferred, not refused — and it was BUILT the same day.**
`@babel/parser` was approved **test-only** (CLAUDE.md §3), so reaching for it at build time was a
change to an owner-approved decision, i.e. a STOP-and-ask. The residual hole was therefore stated in
the gate's own header rather than papered over: *moving a token between two guarded bodies in the
same file still satisfies the manifest.*

**The owner authorised the widening on 2026-08-27 and `tools/gen/devSeamAst.mjs` closes it.** The
gate now pins each sentinel's **enclosing function** and asserts a DEV guard dominates it. Codex was
right about the mechanism and right that the manifest alone was not enough; it is worth recording
that **dominance alone would still not have caught the same-file move** — both ends of it are
guarded — so the *site* is the rule that closes the hole, and the AST is what makes the site
readable. Red-proved both ways, watched failing, reverted. See `docs/qa/phase-10-ship.md` § 10.2.

### 1 — CRITICAL, confirmed in both halves

**Half (a) — the spend-point audit was permissive on a clean clone: CONFIRMED.** Verified by reading
`submit-clips.mjs`: `auditOrThrow` runs at line 29 and `mkdirSync(PROMPT_OUT_DIR)` at line 40, so on
a clean clone `_generated/` does not exist **at audit time** — the very script then creates the tree.
The `generatedRoot` heuristic said "no pipeline here, stand aside" on the one path where standing
aside means printing a paid generation command having measured nothing.

Worse, my own comment at that call site asserted the opposite: *"`requirePresent` is implicit: if
`_generated/` exists at all (and it must, for anchors to be submitted)"*. **It must not, and it did
not.** That is the fourth time this phase that a comment asserted a property the code beside it did
not have.

**APPLIED.** `auditOrThrow({ requirePresent: true })` at the submission point — absence there is
never context, because you cannot submit an anchor you do not have. The comment is corrected to say
why.

**Half (b) — the wiring test is satisfied by a comment: CONFIRMED.** `sourceOf()` returned raw text
and the assertion was `/auditOrThrow\(/`. Comment the call out: wiring gone, test green.

**APPLIED** — comments stripped before matching. And it is worth naming what this was: **the same
defect the sentinel census had, two commits earlier, fixed there and not here.** A text gate that
cannot tell code from prose. Fixing a lesson in one place and not the other is how a lesson stays
local.

**PARTIALLY DECLINED — the SHA-256 verification.** Codex recommends hashing each anchor at
submission. `clipAnchors.mjs` is explicit that the declared sha is *"data, not a runtime check"*, and
turning it into one changes an existing recorded decision about what that table means. That is a
STOP-and-ask, not a fix, and it is **recorded for the owner** rather than done. What is closed is the
gap Codex actually demonstrated: the audit can no longer pass having read zero bytes.

### 3 — HIGH, confirmed and red-proved

**CONFIRMED.** The census answers *"was anything downlevelled"*. It cannot answer *"which browsers
were promised"*, because the target is a value in the config and appears nowhere in the output.
`target: 'esnext'` drops every promised minimum and leaves the census **greener**.

**APPLIED.** `verify-dist.mjs` pins the four config lines that criterion 10.3 says are recorded —
`BROWSER_TARGET`'s expansion, `target:`, `minify:` and `sourcemap:`. Red-proved:

```
verify-dist FAILED:
  - vite.config.ts no longer contains `target: BROWSER_TARGET,` …
```

Codex's second half — that the census regexes can be satisfied by string contents — is **RECORDED,
not fixed**: `measure-bundle.mjs`'s own header already states it is a regex count and not a parse,
and the alternative is the build-time parser that §3 forbids.

### 4 — HIGH, confirmed and red-proved in a real browser

**CONFIRMED, including the part Codex flagged it could not execute.** A CSP processor enforces the
**first** occurrence of a directive; `Object.fromEntries` keeps the **last**. So the exact-match map
that had just been added to close findings F2 and F3 did **not** close this.

**APPLIED** — duplicates rejected before the comparison. Red-proved with Codex's exact mutation:

```
vercel.json:  "script-src *; default-src 'self'; script-src 'self'; …"
→ Error: the CSP declares a directive twice. A browser enforces the FIRST occurrence …
  1 failed
reverted → 1 passed
```

This is the phase's best argument for a second reviewer: the exact-match map was itself a fix for two
earlier findings, and it shipped with a hole a different reader found immediately.

### 5 — HIGH, confirmed, and it changed the work rather than the wording

**CONFIRMED and ACTED ON.** The criterion says *full playthrough*; the spec proved one level of five.

Rather than reword the criterion, the driver was extended and the result measured:

| levels | budget/level | result |
|---|---|---|
| 01 | 60 s | completes, 18.5–22.9 s |
| 01→02 | 60 s | **stopped at 02** |
| 01→03 | 60 s + a back-up move | reaches 04 |
| 01→04 | 120 s + a back-up move | reaches 05 |
| 05 | 240 s | **not completed** |

The back-up move — release RIGHT, hold LEFT for 420 ms, resume — is what a stuck player does, and it
took the automated set from **one level to four**. `level-05` resists a position-blind driver even at
four minutes, and that is where the automated evidence stops.

**APPLIED, with the boundary stated rather than papered over.** The spec now completes levels 01–04
against `dist/` through the shipped ENTER-to-advance flow and asserts progression carried the run
onto level-05. Level 05 is **named as unmeasured** — not claimed completable, not claimed broken —
and is owed to the owner's hands-on run.

⚠️ **Widening the budget until level 05 happens to pass was explicitly rejected.** A driver that
succeeds by luck on a long timeout is a flake, and the table above is the record of how much budget
bought how much coverage.

**QA-log consistency: APPLIED.** The summary line said two criteria were open while a later section
admitted a third. It now names all four open items, including 2.8's human half.

**Codex's "10.11 is contradicted by 2.8": RECORDED, and respectfully disagreed with.** 10.11 asks
that every prior criterion be **re-verified**, not that every one be **closed**. 2.8's human half is
re-verified and dispositioned — *"still true and owner-facing"* — in the review sweep. A criterion
whose verdict is "owed to the owner" is a disposition; silence would have been the failure. 10.11
stands, and the item is on the owner's list at approval where it belongs.

### 6 — HIGH, confirmed

**CONFIRMED.** Same class as 1(b). **APPLIED** — comments stripped before matching, in both tests, in
the same commit, so the lesson does not stay local a second time.

**Codex's recommended fix — TypeScript's config parser — is NOT available here and this is worth
recording**, because it is a trap a future editor will hit: TS 7 is the Go port. `require('typescript')`
exports only `version` and `versionMajorMinor`; `unstable/ast` is a scanner with no parser entry
point; `unstable/sync` drives the native `tsgo` binary. There is no `parseJsonConfigFileContent` to
call. This is already recorded in CLAUDE.md §3 as the reason `@babel/parser` is a dependency rather
than an import — checked, not assumed.

### 7 — MEDIUM, confirmed

**CONFIRMED, and it is embarrassing in a useful way**: `prodHarness.ts` did its own catch-all lookup
with the path literal spelled out a third time, **inside the phase that had just consolidated exactly
that lookup for exactly that reason**, under a header claiming the single-source property.

**APPLIED** — `expectedHeaders()` is now `headersFrom(vercel)`.

Codex's distinction is exactly right and is preserved in the comment: the spec's restatement of the
directive **values** is a deliberate second definition of the *policy* (it is what turns a drift
check into a correctness check); this was duplicate *plumbing*, which is not the same thing.

### 8 — MEDIUM, confirmed

**CONFIRMED.** The pin extracted only the `-` line. `git apply` matches on context too, so
reformatting an adjacent line leaves the test green and the patch inapplicable — the red proof
silently stops existing, which is the exact failure the test was added to prevent.

**APPLIED** — every anchor line of the hunk (`-` and context) is pinned. Red-proved by renaming the
loop variable.

**Codex's alternative — apply the patch in-memory — DECLINED with a reason:** it would need a diff
applier in a project with a frozen dependency list, and pinning the lines `git apply` matches on is
the same property with no new code.

---

## What this review says about the protocol

Eight findings on a diff that had already been through **six agents and twelve briefs**, and two of
them were CRITICAL. The sentinel-manifest finding in particular was invisible to every earlier
reading *because the red proofs were cooperative* — they removed a guard and left its token, which is
the mutation a person who wrote the gate naturally reaches for.

**That is the argument for a reviewer who did not write the gate**, and it is the counterpart to this
phase's other protocol lesson: the QA gate's adversarial brief found a false claim Codex read past
four times, and Codex found a false gate the adversarial briefs read past twelve times.

Neither is a substitute for the other. Both were cheap relative to what they found.
