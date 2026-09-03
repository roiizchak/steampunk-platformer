# QA log — Phase 10 (Build and ship)

Branch `phase-10-ship`, off `main` at `ab4334f`. Executed 2026-08-26 → 2026-08-27.

The gate table is the record. Everything under it is the evidence, and where a criterion's own
stated method turned out to be wrong, the correction is recorded rather than the method quietly
swapped.

## This log, split into parts

**This log reached 1271 lines.** On 2026-09-03 the journal below the gate table was split into
three flat siblings, per CLAUDE.md §6 — `docs/qa/` splits into **flat siblings**, never a
subdirectory, because `tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively.

The criterion table and the vault-out stayed here: `docs-contract.test.ts` slices this file between
the phase heading and the vault-out heading and reads the criterion rows out of that slice, so
neither heading is free to move — and this paragraph deliberately does not quote either one
verbatim, because `between()` takes the FIRST match of its start marker.

| Part | What is in it |
|---|---|
| [02 — the extension sweep](phase-10-ship-02-review-sweep.md) | written during the gate round, before this split; kept at its original number |
| [03 — the gate agents](phase-10-ship-03-gate-agents.md) | the six agents and twelve briefs, and the defect in how they were run · 10.2's dev-seam gate · 10.4 · 10.5 · 10.6's CSP |
| [04 — the remaining criteria](phase-10-ship-04-criteria.md) | 10.7's sweep · 10.8's licence split · 10.9 · 10.11 · 10.12 played · 10.14's non-converging plan review · the implementation review · the regression |
| [05 — the 60 Hz defect and the owner's closures](phase-10-ship-05-sixty-hz.md) | the camera defect found by playing production, and the four criteria the owner closed on 2026-08-27 |

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
| 10.6 | CSP verified against the **production** header config locally — never the dev server | **PASS — both halves, closed 2026-08-27 against a real Vercel edge response** | `vercel.json` → `tools/gen/vercelHeaders.mjs` → both `vite.config.ts` and `tools/dev/prod-server.mjs`. Every directive matched EXACTLY; three red proofs. 🔴 **A preview deploy ran and FAILED on a defect no local gate could see** — `.vercelignore` had removed `public/assets/` from the build box. Fixed and gated. The CSP as SERVED is still unobserved: the preview is behind Vercel Deployment Protection and 302s to SSO. § 10.6. |
| 10.7 | `git log --all -p` clean of secrets — history, not the working tree | **PASS, with a stated blind spot and one real finding fixed** | 506 commits, 6,447 reachable objects, unreachable blobs included. Zero named-format secrets. **One real leak found and fixed**: three `anchor.job.json` files shipped a local home directory to the CDN. § 10.7. |
| 10.8 | Licences split: code vs generated assets | **PASS** | `LICENSE` (MIT: `src/`, `tests/`, `tools/`, root config) · `ASSETS-LICENSE.md` (fal.ai output, all rights reserved) · a third-party carve-out for the 215 vendored skill files. § 10.8. |
| 10.9 | 🔴 **AMENDED by owner ruling** — ship-path reproducibility, not asset-rebuild reproducibility | **PASS as amended; the ORIGINAL criterion is NOT met and that is recorded** | Fresh clone → `npm ci` → `npm run build` → **62/62 files byte-identical**. The first run was 61/62 and the 1 was a real defect git could not see. § 10.9 — and the objection to the amendment is recorded verbatim in the phase document. |
| 10.10 | Specs 01–10 all green | **PASS** | `npm run test:e2e` → **141 passed**, read positively and reconciled per project: chromium 60 · chromium-dpr2 7 · chromium-gpu 69 · chromium-prod 5 = 141. Plus unit **2579 passed** and sim-isolated **2576 passed / 3 skipped**. |
| 10.11 | **Every prior phase's acceptance criteria re-verified** | **PASS — and it found two things the PRD had wrong** | 4.27 closed with a wired, red-proved gate. **4.12 closed with the deliberate-removal run it had been owed since Phase 4.** 4.10 dispositioned as superseded. § 10.11. |
| 10.12 | Full playthrough on the production build | **PASS — all five levels completed to the exit by the owner, 2026-08-27** | Three layers, and the third is the one no gate could supply. **Sim**: `level-completable.test.ts` proves every level completable in the exact shipped world, enemies live, under three disjoint gate seeds with a `jumpVelocity`-0 negative control. **Production e2e**: `phase-10-campaign.spec.ts` against `dist/` — level 01 completes under real keyboard input, ENTER advances, level 02 boots AND draws. **Hands-on**: the owner played all five to the exit on the live deployment. The automated driver is position-blind and stops at 04; that is a driver limit, not a level defect, and the correction to an earlier overstatement of this is recorded in § 10.12.
| 10.13 | Every recorded-but-not-fixed Codex finding from phases 1–9 re-reviewed and dispositioned | **PASS** | All 35 files in `docs/reviews/` enumerated by name (not a `*-plan.md` glob, which misses Phase 5's three split records). 99 disposition lines extracted. `docs/qa/phase-10-ship-02-review-sweep.md`. |
| 10.14 | Codex plan review ran; every finding applied or recorded | **PASS — and it did NOT converge, which is reported rather than dressed up** | Five rounds, all REVISE, hitting `MAX_ROUNDS`. `docs/reviews/phase-10-plan.md` + triage. § 10.14. |
| 10.15 | Codex implementation review ran on the diff; every finding applied or recorded | **PASS** | `docs/reviews/phase-10-impl.md` — verdict REVISE, **2 CRITICAL, 4 HIGH, 2 MEDIUM** on a diff that had already been through six agents and twelve briefs. Every finding applied or recorded; both criticals confirmed by *building the mutation Codex described*. § The implementation review. |

### 🔴 What is NOT closed — four items, named

| item | why |
|---|---|
| **10.6's deploy half** | The deploy RAN and found a real defect. But the preview is behind **Vercel Deployment Protection** — every request 302s to SSO — so the CSP as served is still unobserved. Turning protection off makes the deployment publicly reachable: the owner's call |
| ~~**10.12's `level-05`**~~ | **CLOSED 2026-08-27, and it should never have been opened.** `level-completable.test.ts` proves it completable in the exact shipped world under all three gate seeds, with a `jumpVelocity`-1 margin and a `jumpVelocity`-0 negative control. What the browser driver could not do was navigate — a driver limit, not a level defect. See § 10.12's correction |
| **10.12's levels 02–04 as a GATE** | They complete on a quiet box and the four-level test flaked in the suite. Recorded as a measurement rather than widened into a green |
| **10.12's human half** | A hands-on criterion is never closed on automated evidence alone *(vault C4)* |
| **2.8's human half** | Same shape, carried from Phase 2, re-verified and dispositioned by 10.11 rather than left silent. On the owner's list at approval |

**Phase 10 is therefore reported NOT DONE.** It is reported at this state, with those four named.
⚠️ The summary here said *"two criteria"* until the Codex implementation review pointed out that a
later section of this same file admitted a third — a log contradicting itself is the shape every
other gate in this phase exists to prevent, and it happened in the record rather than in the code.


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
| **10.12's human half** | The mechanical half is proved — `level-05` included, corrected 2026-08-27. A hands-on criterion never closes on automated evidence *(C4)*, and that is all that remains here |
| **2.8's human half** | Carried from Phase 2, re-verified and dispositioned rather than left silent |
| **A parser-backed dev-seam gate** | The manifest narrows the hole to "within one file". Closing it needs `@babel/parser` at BUILD time, which is a change to an approved test-only decision — a STOP-and-ask, deliberately not taken |
| **`assets:fetch` / `assets:verify`** | Phase 5 called them binding debt. They are what would make 10.9's original criterion achievable, and until they exist the public repo cannot reconstruct its own art |
| **`_generated/` is the only copy of a non-regenerable input** | 128 MB of clips; the generator is not seed-deterministic. **Archive it outside git.** Losing it freezes the art at its current packing forever |
| **The QA gate's worktrees were at the wrong commit** | Recorded above. The findings are sound; the coverage claim is weaker than it looks |
| **Phase 9's three carried items** | Dispositioned above: all still true, none blocking |
