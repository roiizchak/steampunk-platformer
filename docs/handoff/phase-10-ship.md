[← HANDOFF.md index](../HANDOFF.md)

# Session handoff — Phase 10 (build and ship)

> ## ✅ Phase 10 is DONE. 15 of 15 criteria PASS, merged to `main`, live in production.
> 
> **▶ Play it:** `https://steampunk-platformer-2n08tumsc-rois-projects-f9d9895d.vercel.app`
> 
> `main` at `266f0df`+, pushed. The owner has played **all five levels to the exit** on the
> production build, on both a 60 Hz and a 240 Hz display, and confirms the feel: *weighty and
> responsive, no dropped inputs*. That closed **10.12** and **2.8**, the latter carried open
> since Phase 2.
> 
> ### The two defects that only PLAYING could find — read these first
> 
> | | defect | why no gate here could see it |
> |---|---|---|
> | 1 | `FOLLOW_LERP` applied per **rendered frame** — camera 4x less responsive at 60 Hz than
> on the 240 Hz box it was tuned on: 66 px of trail instead of 16.5, and a **264 px** character
> swing per jump | every gate runs at ~240 fps, where it is four times smaller |
> | 2 | `pixelArt` never governed the **canvas→screen** resample. `FIT` keeps a 1920x1080 buffer
> and restyles only the CSS size, so nearest-neighbour at a fractional ratio **drops pixel
> columns whose positions MOVE as the world scrolls** | nothing in the suite looked at the
> canvas's presented geometry at all |
> 
> Both were reported in the same five words — *"blurry or smeared while moving"* — and fix 1
> genuinely helped, which is exactly what made fix 2 easy to mistake for its remainder.
> 
> ⚠️ **Anything the ENGINE applies per rendered frame, or per presented pixel, sits outside
> this project's tick rule** — which is written about `src/sim/`. The principle was never
> narrower than the rule; the rule's wording was, and that is what let a frame-rate dependency
> survive ten phases of review.
> 
> ### Outstanding, and none of it blocks
> 
> | item | status |
> |---|---|
> | **the rollback** | verbs confirmed from CLI 56.5.0's own `--help`, but **NOT rehearsed** —
> and rehearsing it moves the live alias, so it needs a deliberate decision |
> | **`.tmj` MIME** | Vercel serves `application/octet-stream`, `prod-server.mjs` says
> `application/json`. Harmless, but the substrate is more generous than production |
> | **Deployment Protection** | may be re-enabled; 10.6's evidence is already captured. With it
> on, README's "Play it" link works only for the owner |
> | **`_generated/`** | not archived, by owner decision. Production never reads it |

> Full record: [qa/phase-10-ship.md](../qa/phase-10-ship.md) (including **§ Vault-out — Phase 10** and
> the ten-phase Codex-protocol verdict) · [plan review](../reviews/phase-10-plan.md) ·
> [implementation review](../reviews/phase-10-impl.md) ·
> [review sweep](../qa/phase-10-ship-02-review-sweep.md)

## The traps this phase paid for — read these before touching the same ground

**1. A bare `vercel deploy` targets PRODUCTION on this project, and nothing on the command line says
so.** There is no git integration, so the CLI defaults to the production target. `vercel ls` shows
the first attempt as `Environment: Production` — it would have **bypassed the STOP gate entirely**,
and the only thing that stopped it was that it errored on trap 2. **Always `--target=preview`.**

**2. `.vercelignore` uses gitignore syntax, so an unanchored pattern matches at ANY depth.** A bare
`assets/`, meant for the 96 MB of root reference art, also matched `public/assets/` — **48 of the 60
files under `public/`**, i.e. every sprite sheet, tile set, parallax layer, portrait and sound. The
build box got the game without its art. **Every local gate was green**, because locally the files are
simply there. It failed loudly only by luck (`tsconfig.json` includes `tests/`, and the tests import
the catalog); otherwise it would have been a green build at a live URL serving a blank canvas.
Anchored now, and `tests/unit/vercelignore.test.ts` red-proves on any unanchored pattern.

**3. A gate can measure the wrong thing and look rigorous doing it.** The dev-seam gate asserted
`MIN_SENTINELS = 27` — a floor over a *global count*. Delete a guard, re-home its token in another
guarded body: count still 27, no token leaks, and the DEV body **ships**. Both gates printed OK. The
Codex implementation review found it; the mutation was built and run to confirm. The cause is worth
carrying: **every recorded red proof had been cooperative** — remove the guard, leave the token —
which is the mutation the person who wrote the gate naturally reaches for. It is now an exact
file→token manifest, and `tools/gen/devSeamManifest.mjs` is what you edit to add a seam.

**4. A comment that asserts a property is not the property, and this phase found FOUR.**
`tsconfig.build.json` said the plugin *"IS typechecked here"* — it was in no program at all.
`submit-clips.mjs` said `requirePresent` was *"implicit"* — it was not, and the script creates
`_generated/` itself moments later. `vite.config.ts` said neither of its imports touched `node:*` —
both do. `prodHarness.ts` claimed the single-source lookup while doing its own. Treat every 🔴 and ⚠️
paragraph as a claim to check, not as context.

**5. Two source-text gates were satisfied by a COMMENT.** The sentinel census counted
`__DEVSEAM_…__` anywhere in a file, comments included; the anchor-wiring and build-program tests
matched raw text. Comment the thing out and the gate stays green. All three strip comments now — and
the lesson is that fixing this in one place and not the others is how a lesson stays local.

**6. `Object.fromEntries` keeps the LAST duplicate key; a browser enforces the FIRST duplicate CSP
directive.** So `script-src *; … script-src 'self'` produced an object equal to the expected map,
passed the quoting check, raised no violation — and the enforced policy was `*`.

**7. A test that passes alone and fails in the suite is a flake generator, not a gate.** The
four-level playthrough completed levels 01–04 on a quiet box and stopped at level 03 inside
`npm run test:e2e`. Widening the budget until it stops would be measuring the box. The gate is now
level 01 → ENTER → level 02 boots and draws; the four-level run is recorded as a *measurement*.

**8. The QA gate's agent worktrees were created at `main`, not at the branch.** Every agent got its
own worktree as required and none of them contained the diff. Four worked around it by reading the
real checkout; two reported criteria as "unrun". The findings that landed are sound — each was
re-verified locally — but the *coverage* claim is weaker than it looks. If you re-run that gate,
check the worktree's commit first. Also: `voltagent-qa-sec:security-auditor` has **no Bash**, so it
cannot run `git` and cannot do the history half of a secret sweep.

**9. Two GPU perf gates false-red under full-suite load, and it is a DIFFERENT one each run.** Run 1
failed 9.5's cost-exponent floor at k = 0.893 (floor 0.9); run 2 passed 9.5 at k = 0.963 and failed
6.9's HUD GPU delta at 0.974 ms (bound 0.2). **Both pass alone, immediately after.** A code
regression does not alternate between two unrelated specs and then decline to reproduce in
isolation — and `git diff --name-only 048dae5..HEAD` touches **zero files under `src/`**. Do not
widen either bound: that is measuring the box, and 9.5's own failure text says *"do not move this
floor"*. What would refute the diagnosis: the same gate failing repeatedly, or failing in isolation
on a quiet box. Run 3 (after the camera fix) failed a THIRD spec — 10.12's campaign — which then
passed alone in 34.8 s against a 60 s budget. The production driver is position-blind (holds RIGHT,
taps Space on a cadence, reads `localStorage`), so a camera change cannot alter its decisions, and
the first two failures predate that change entirely.

**10. A camera lerp is applied PER RENDERED FRAME, so a constant is a frame-rate dependency — and
this project tunes on a 240 Hz box.** `FOLLOW_LERP = 0.12` gave a 35 ms time constant at 240 Hz and
**139 ms at 60 Hz**. On a 60 Hz screen the character sat 66 px off centre while running (16.5 px on
the dev box) and swung **264 px — a quarter of the screen height — on every jump** (96 px on the dev
box). The owner found it by PLAYING the shipped production build; **no gate here could have**, because
they all run at ~240 fps where the defect is four times smaller. Fixed by `followLerpForFrame`, which
re-bases it on elapsed time and returns 0.12 exactly at 240 Hz so the tuned feel is reproduced rather
than approximated. ⚠️ Two things stated rather than left to be discovered: an 18 % residual survives
(zero-order hold, ~3 px, half a source art pixel) and **sample-and-hold blur at 60 Hz is 4x that at
240 Hz as pure physics** — some difference between the displays will always remain. § the QA log's
60 Hz section. **The general lesson is bigger than the camera: anything Phaser applies per frame is
outside this project's tick rule, and the rule's wording — not its principle — is what let it
through.**

**11. `pixelArt: true` does NOT govern how the canvas is scaled to the screen.** It governs texture
sampling. `Phaser.Scale.FIT` leaves the backing store at 1920x1080 and restyles only the CSS size, so
the browser rescales it at a fractional ratio — and `image-rendering: pixelated` makes that
nearest-neighbour, which **drops and duplicates whole pixel columns whose positions MOVE as the world
scrolls**. Sharp when still, mush in motion. Measured, not modelled: with the fix disabled the boot
gate refuses with *"FRACTIONAL scale (1920x1080 buffer in 1280x720 css)"*. Now conditional — crisp at
an integer scale, smooth only where nearest cannot be exact. ⚠️ **And `?breakFilter=1` had quietly
stopped being a break**: it hardcoded `'auto'`, which became the CORRECT value at a fractional scale,
so on any non-multiple window the mutation set the right value and the red proof proved nothing while
still being counted green.

⚠️ **Traps 10 and 11 are the same lesson twice: anything the ENGINE applies per rendered frame, or
per presented pixel, sits outside this project's tick rule** — which is written about `src/sim/`.
The principle was never narrower than the rule; the rule's wording was. And *"it's physics"* is a
conclusion that ends investigation: I reached it from a model after trap 10 and it was premature,
because the model was silent about trap 11 entirely.

## Verification at the tip (`ef1eb9b`)

| run | result |
|---|---|
| `npm run typecheck` | clean |
| `npm run typecheck:build` | clean |
| `npm test` | **176 files, 2613 tests passed** |
| `npm run test:sim-isolated` | 2610 passed, 3 skipped — Phaser uninstalled, restored after |
| `npm run build` | 4 steps green · dev-seam gate ok, 27 sentinels folded, each dominated and sited · verify-dist ok |
| `npm run test:e2e` | **140 passed, 1 failed — a DIFFERENT spec on each of THREE runs, every one passing alone.** See trap 9 |

Counts are read, not inferred from exit codes.

## What is outstanding

- The four open items in the box above.
- **`README.md` still carries a `<!-- deployed-url -->` placeholder.** It gets the real URL once you
  decide what the real URL is.
- **`assets:fetch` / `assets:verify`** — Phase 5 called them binding debt and they still do not
  exist. They are what would make 10.9's *original* criterion achievable; until then the public repo
  cannot reconstruct its own art from its recorded provenance.
- ~~`_generated/` is the only copy of a non-regenerable input~~ — **owner decision 2026-08-27: not
  archived.** Production never reads it and the shipped game rebuilds from a clean clone forever;
  what the archive would have protected is *changing* the art later (re-cutting a sheet, re-shooting
  `brass-courier/fall`), which needs the ~115 MB of `.mp4` clips and ~18 MB of audio masters that
  fal cannot reproduce. Nothing is deleted; it is simply not duplicated. See the QA log.
- ~~The dev-seam gate's residual hole~~ — **closed 2026-08-27**, see the box at the top.
- Phase 9's three carried items (the perf-spec split, 9.5's absent bound, 9.3's three narrowings) —
  dispositioned in the QA log: all still true, none blocking.

