# QA log — Phase 12 (Touch and responsive support)

Branch `phase-12-touch`, off `main` at `7f339ad`. Executed 2026-08-29.

The gate table below is the record. Everything under it is the evidence for one row.

⚠️ **This phase ships GREY-BOX controls.** Two fal generations were bought and **neither was
adopted**; the decision is the owner's and is set out in `docs/generations/phase-12-touch-plate.md`.
Criterion 12.17 asks for five shipped PNGs and is therefore **NOT MET** — recorded as failing rather
than reinterpreted.

---

## Phase 12 — criterion verdicts

<!-- gate-verdicts -->
| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 12.19 | Every new gate watched failing under the mutation it names | **PASS** | § The mutation matrix. 22 rows, each applied, watched, reverted; 2 holes found and closed. |
| 12.20 | `dist/` carries no dev-only scene key, debug symbol or dev prose | **PASS** | § Regression evidence. `verify-dist ok`, 28 DEV bodies folded out, 5 levels + 12 audio byte-identical. |
| 12.21 | No file over 400 lines without a `SIZE-EXEMPTION:` line | **PASS** | § Regression evidence. Sweep over the lint's own glob returns nothing above 400; largest is 400. No exemption taken. |

---

## The mutation matrix

Every row applied, verified applied by *"content changed AND the original count dropped by one"*,
gated, reverted, and the revert verified. The per-row outcomes are tabulated in
[`docs/prd/phase-12-touch.md` § 6](../prd/phase-12-touch.md#6-qa-gate); what follows is what the run
cost and what it found.

**Two rows reddened nothing.** *A row that reds nothing is a hole in the gate, not a mutation to
drop* — so both produced a new gate rather than an edited matrix.

- **M2b** — deleting `session.deactivate()` from `attachUiTouch`'s `destroy()` left the whole suite
  green. `touch-session.test.ts` drives the session against a fake layer and never imports
  `attachUiTouch`; `touch-draw-path.test.ts` drives the layer directly and never imports the session.
  The seam between them was visible to neither, and it is where the defect lives: `UIScene` is reused
  across a level-select round trip (`Systems.js:760-788`), so a session still holding a destroyed
  layer hands the *next* `Game` scene's binding to the corpse, which subscribes four lifecycle
  handlers that can never reach anything drawn. `tests/unit/ui-touch.test.ts` — 5 tests — asserts
  that after teardown, binding a fresh `Game` scene registers nothing on it. **RED 1/5** under M2b.
- **M13** — no gate read a project's `use` block at all. `phase-12-perf.spec.ts` builds both arms
  itself from `browser.newContext({ hasTouch })`, so `chromium-touch-gpu`'s value never reaches it —
  and the spec's own docstring claimed the opposite. The claim is corrected in place rather than
  deleted, because the precondition it sits under is still load-bearing for a different question.
  `tests/unit/playwright-projects.test.ts` now reads the blocks directly. **M13b** — the same drop on
  `chromium-touch`, whose specs *do* use the project context — reds it too. **RED 1/5** each.

### ⚠️ The runner's own defect, which is the whole argument for the count guard

Nine rows were briefly recorded as holes before the report was read properly. The cause was not the
gates: **a lowercase drive letter as the child process's `cwd`** makes vitest fail to collect with
*"Cannot read properties of undefined (reading `config`)"* and write a report of
`numTotalTestSuites: 1, numFailedTestSuites: 1, numTotalTests: 0`. Measured, one command, one
character apart:

| `cwd` | tests selected |
|---|---|
| `C:/Claude/Steampunk Platformer` | **10** |
| `c:/Claude/Steampunk Platformer` | **0** |

A run that selected nothing has a failed suite and a non-zero exit, and reads exactly like a
mutation that reddened something. Only *"detect greenness positively, **including the test
COUNT**"* separates the two. Two wrong root causes were written down and disproved before the right
one — an MSYS path-translation theory and a shell theory — and both comments were corrected rather
than left standing.

---

## Regression evidence

| gate | result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **201 files, 2929 tests, 0 failed** (2923 before this phase's gate repairs) |
| `npm run build` | `dev-seam gate ok: 28 sentinel-marked DEV bodies folded out`; `verify-dist ok: 5 level(s) and 12 audio file(s) shipped byte-identical, no DEV-only scene key or debug surface` |
| 400-line sweep | nothing over 400 across `src/**/*.ts`, `tools/**/*.mjs`, `tests/**/*.ts`, root `*.config.ts`. Largest: `tools/gen/levelBuilder.mjs` and three others at exactly 400; `src/scenes/GameScene.ts` 399. |

---

## Vault-out — Phase 12

**A gate can be green because it never ran.** The nine false holes above all had a failed suite and a
non-zero exit; nothing but the test count told them apart from a real red. This is the one §5 rule
that checks the assumption every other rule makes.

**Two modules can each be fully tested and the seam between them ungated.** M2b's hole was not a
missing assertion inside either file — both were well covered. It was that no test imported both.
The general form: *coverage is per-file, and defects live between files.*

**A test that builds its own fixture cannot gate the config that would otherwise build it.**
`phase-12-perf.spec.ts` overrides `hasTouch` per context for good reasons, and in doing so made the
project's `hasTouch` unobservable from the only spec that ran in that project.
