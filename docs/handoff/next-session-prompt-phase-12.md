# Next-session prompt — Phase 12 close-out

Paste the block below as the first message of the next session. Everything above the line is context
for whoever is reading this file; the prompt itself starts at **"Finish Phase 12"**.

**Where things stand.** Branch `phase-12-touch`, **not merged**, 13 Codex implementation-review
rounds applied. 2993 unit tests, 216 e2e across five projects, build + verify-dist clean, 75 mutation
rows with 23 holes found and closed. The phase is reported **FAILING** — 4 criteria NOT MET (12.8,
12.10, 12.11, 12.17) and 4 UNRUN (12.13, 12.14, 12.23, 12.24). Nothing here is a code emergency; all
four NOT-METs are wording-versus-art disputes or a named-but-unbuilt replacement gate.

---

Finish Phase 12 on the Steampunk Platformer (`c:\Claude\Steampunk Platformer`, branch
`phase-12-touch`, **do not merge to `main` without my approval**). Read `docs/HANDOFF.md`,
`docs/qa/phase-12-touch.md` and `docs/reviews/phase-12-touch-impl.md` first — thirteen review rounds
are recorded there and every trap below is written up in one of them.

There are four jobs, in this order.

## 1. Re-shoot the wrench cell — my decision on 12.14

`shipped-touch-contrast.test.ts` splits each mark into its pre-halo strokes and measures every one at
48 CSS px over every background. Five faces are 3.32:1 at rest and 3.85:1 pressed. `touch-attack` is
not: separating the wrench isolates four small fragments of its shading, and the smallest — an
11-pixel seed — reaches **2.86:1**. It is named in `KNOWN_SHORTFALL` and pinned at 2.8 so it cannot
quietly worsen. **I have chosen the re-shoot over accepting it.**

- Budget: the touch-UI ceiling is **$5**, `$0.45` spent over three takes. One `nano-banana-pro`
  generation is `$0.15`. **STOP and ask before any batch over 5 generations or any spend crossing
  $5.** Log every generation and its `request_id` in `docs/GENERATION-LOG.md` with the MEASURED
  dimensions read off the file — never off the aspect label (`FAL-MODELS.md:115-122`).
- Re-run `genmedia schema` before generating; a documented schema is a snapshot.
- ⚠️ **Decide the shape of the re-shoot before spending.** The plate is a 3×3 grid cut into six
  faces, so a new full plate replaces all six and puts the other five back through every gate. A
  single-button generation is the smaller blast radius but needs a one-cell prompt variant in
  `promptTouch.mjs` and a one-key adopt path in `buildTouchAtlas.mjs`. Work out which, say which, and
  then spend.
- ⚠️ **Cutting from the plate is `--adopt` now** (`npm run assets:touch:adopt`). The ordinary
  `npm run assets:touch` reads the committed cut faces in `tests/fixtures/touch-cut/` and inks them;
  it must not rewrite them. That separation is Codex round-13's fix and re-baselining it silently is
  the defect it exists to prevent.
- No parameter tuning will save the current fragment — measured: `KEYLINE_PX` 4 leaves it at 2.86,
  `BOLD_PX` 3 and 4 make it 1.93 and 1.37. Do not re-litigate that; re-shoot or come back to me.
- After adopting: re-run the full art battery, delete `KNOWN_SHORTFALL`'s entry if the new cell
  clears 3:1, and re-capture `docs/evidence/phase-12-touch-art.png` at 667 × 325.

## 2. Build 12.11's replacement, the one NOT MET that is code

12.11 (frame budget with the controls drawn) is NOT MET because *the statistic cannot order its own
mutation* — the replacement is already named in `docs/qa/phase-12-touch.md` § 12.11. Build it, watch
it fail under the mutation it names, confirm the revert by "content changed AND the original count
dropped by one", and only then claim it.

⚠️ Perf rules that have each cost a false result here: a bound is chosen on one set of runs and
confirmed on a **held-out** set; only same-session interleaved A/Bs decide a performance question
(SwiftShader inflates headless milliseconds ~21×); **one Playwright run at a time and nothing heavy
beside it**; and greenness is read positively including the test COUNT.

## 3. The three criteria whose wording, not whose code, is the problem

Bring me each with the options and a recommendation — do **not** amend an approved criterion, and do
not weaken a gate to fit the art. All three are written up already:

| # | the dispute |
|---|---|
| 12.8 | The approved wording asks every live target to lie inside the canvas rect and be pairwise disjoint. The five controls and five menu rows pass at ten viewports; the two **full-screen** zones (title, completion) cannot be "disjoint" from anything by design. |
| 12.10 | The prompt and every route share one predicate, so they cannot disagree — but the criterion's "iff" is over *every* live target and the shipped code implements D1 (rotate on phone portrait). |
| 12.17 | Says six distinct **silhouettes**; the adopted art is one round brass disc per button with a different engraving on each, so the outlines are identical on purpose. The gate measures the **marks** — 70.4 %–82.9 % differing across all fifteen pairs, a copied glyph scoring 0. |

## 4. The phone test, then the Vercel preview

12.13 (a drag is not stolen by browser pan / pinch / double-tap zoom) and 12.24 (played start to
finish by touch, no keyboard) can only close with my hands on a real phone. **Deploy the build to a
Vercel preview so I can open it on my phone**, and give me the URL plus a short list of what to try.

- Build first: `npm run build` must end in `verify-dist ok`. It is a static Vite build — `dist/` is
  the whole artefact, no server, no env vars, no data.
- ⚠️ **Ask me before the deploy actually goes out.** A preview URL is public to anyone holding the
  link; that is fine by me for this game, but confirm the deploy, do not assume it.
- The Vercel CLI on this machine is **56.5.0 and outdated** (59.10.0 is current) — say so, and let me
  decide whether to upgrade before deploying.
- ⚠️ Dev-only scenes must not be in the bundle. `verify-dist` already fails the build on any
  dev-only scene key, debug symbol or `window.__game` surface, so a green build is the gate; do not
  deploy a build that has not passed it.

## Then, and only then

Run the **Codex implementation review** (12.23) on the final diff — session
`01a04e7b-2a1f-72b3-81cd-2de24ea25431`, `-c sandbox_mode="read-only"`, and every prompt MUST tell it
to use the `node_repl` MCP tool with `fs.readFileSync`, because its sandboxed shell cannot spawn
processes on this machine (`CreateProcessAsUserW failed: 5`, permanent). Every finding is applied or
recorded with a one-line reason. Its findings are file-evidence only — re-verify each one locally
before acting.

Then vault-out, kill ports 5173 and 4173, and show me the final diff. **A phase with a failing or
unrun criterion is reported failing, never as done.**

## Traps that have already cost this phase a run

- **Commit before running any mutation.** The mutation loop reverts with `git checkout -- <file>`,
  which destroys uncommitted work in that file. It has happened twice.
- **`npm test` and `npx playwright test` output is hijacked by a wrapper.** Redirect stdout to a log
  file and grep the `N passed` line; piping gives you the wrapper's truncated config dump, and a zero
  exit through a pipe is `tail`'s exit.
- **Only one Playwright run at a time.** Three specs once failed for no reason but three concurrent
  jobs.
- **Never edit a locked hash** to clear a red `style-lock` or `docs-contract`. A red hash is an
  approval checkpoint.
- **STOP and ask** before a new dependency, deleting a file, a fal batch over 5 generations, a spend
  crossing $5, or contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md — and before widening any
  existing architectural rule or gate.
