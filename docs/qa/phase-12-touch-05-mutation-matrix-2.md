[← Phase 12 QA log index](phase-12-touch.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-12-touch.md)

### Neither the pinch NOR the double-tap zoom can go red on Chromium, and both are recorded rather than counted

12.13d dispatches a two-finger pinch and asserts `visualViewport.scale`, `window.innerWidth` and the
document scroll are unmoved. **Nothing can make those assertions fail in headless Chromium**:
synthetic `TouchEvent`s do not drive native gesture recognition, so the page would not zoom even with
every CSS rule deleted. Codex round 21, finding 5, and the case's own docstring already said as much.

🔴 **And the same is true of 12.13e's zoom half, which this log credited without noticing.** Round 21
disclaimed only the pinch; round 22, finding 5, pointed out that native **double-tap** zoom is not
synthesised from those events either, so 12.13e's `visualViewport.scale` assertion is exactly as
blind as 12.13d's. The evidence table said *"…a two-finger pinch measured on `visualViewport.scale`,
and a double tap"* as though both were machine-proved. **They are not**, and disclaiming one of two
identical blind spots is worse than disclaiming neither, because it reads as though the other was
checked.

What each of those two cases DOES prove is narrower, and is what they are now credited with:
12.13d, that a six-move pinch does not crash, drop the contacts or stop the tick; 12.13e, that the
sim received the gesture (the player left the ground), that nothing routed away, and that no contact
was left down. *A gate that cannot go red is decoration (C2)*, so the zoom halves of both are kept as
tripwires — for the day a future Playwright or Chromium does synthesise gestures — and are not
counted. **The zoom claim's real evidence is the CSS gates, which DO red (M105, M106, M111), and the
device.** Written down rather than left as a green tick nobody had questioned.



**Five rows reddened nothing.** *A row that reds nothing is a hole in the gate, not a mutation to
drop* — so each produced a new gate rather than an edited matrix.

- **M2b** — deleting `session.deactivate()` from `attachUiTouch`'s `destroy()` left the whole suite
  green. `touch-session.test.ts` drives the session against a fake layer and never imports
  `attachUiTouch`; `touch-draw-path.test.ts` drives the layer directly and never imports the session.
  The seam between them was visible to neither, and it is where the defect lives: `UIScene` is reused
  across a level-select round trip (`Systems.js:760-788`), so a session still holding a destroyed
  layer hands the *next* `Game` scene's binding to the corpse, which subscribes four lifecycle
  handlers that can never reach anything drawn. `tests/unit/ui-touch.test.ts` — 5 tests — asserts
  that after teardown, binding a fresh `Game` scene registers nothing on it. **RED 1/5** under M2b.
- **M21** — `PLATE_ALPHA = 1` reddened nothing, so the 19.9 %-occlusion measurement that chose 0.55
  could have been undone by one character with the suite green. Gated now, with the figure and its
  method in the test. The gate needed a fake that could see it: `add.rectangle`'s `fillAlpha`
  argument was dropped on the floor, so every plate reported fully opaque and the assertion would
  have measured the fake's own default rather than the layer's choice.
- **M13** — no gate read a project's `use` block at all. `phase-12-perf.spec.ts` builds both arms
  itself from `browser.newContext({ hasTouch })`, so `chromium-touch-gpu`'s value never reaches it —
  and the spec's own docstring claimed the opposite. The claim is corrected in place rather than
  deleted, because the precondition it sits under is still load-bearing for a different question.
  `tests/unit/playwright-projects.test.ts` now reads the blocks directly. **M13b** — the same drop on
  `chromium-touch`, whose specs *do* use the project context — reds it too. **RED 1/5** each.

- **M24** — deleting the SECOND term of `promptIsUp()` in `touchRoutes.ts` left the whole suite
  green, which would have made the two-term predicate the Codex implementation review asked for a
  one-term predicate wearing a two-term comment. The term is genuinely unreachable through the three
  shipped screens — no caller passes a target under `TOUCH_BOX_PX` — and that is the argument *for*
  a gate rather than against the term: the contract is *`attachTapRoutes` refuses a target too small
  to aim at*, and a fourth caller with a smaller one must not have to discover the guard was quietly
  dropped. Gated with a 40 game px target at desktop scale (**40.0** CSS px at a scale of 1, against 160.0 for the play
  controls), so only the second term can refuse it. **RED 1/12.**

- **M25** — and this one is the sharpest lesson in the phase, because the hole was in a gate **I had
  just written for a defect Codex had just found**, and it stayed green through two separate
  reasons before it could go red:
  1. **Two awaited `contactDown` calls are not two simultaneous fingers.** Each is its own CDP round
     trip, so the first is fully processed — `scene.start` included — before the second is
     dispatched. `contactsDown()` fires both inside one `page.evaluate`, which is where Phaser's
     input queue drains them in a single frame.
  2. **A fresh save unlocks only level-01.** `play()` refused the second row before the latch was
     ever consulted, so the gate was measuring a refusal, not a latch. The spec seeds a save with
     level-01 completed and **asserts two rows are unlocked** before it touches anything.

  With both corrected and the latch deleted, the defect reproduces exactly as described: two fingers,
  two queued `scene.start` ops, and the player lands on **level-02**. **RED 1/10.** *A gate must be
  watched failing* is not a formality — the first two versions of this one would have shipped a
  green tick over a live defect.

### 🔴 The round-13 repair that was recorded applied and never landed

**Found 2026-08-31 by reading the diff of the commit that claimed it.** Codex round-13 finding 5
asked for the plate cut to move behind `--adopt` so the ordinary build could not rewrite the
committed cut faces. `82fe755`'s message says it did; `docs/reviews/phase-12-touch-impl.md` recorded
it **Applied**; the handoff prompt told the next session to rely on it. The commit changed
`package.json` by one line and `tools/gen/buildTouchAtlas.mjs` **not at all**. `main()` took no
arguments, so `npm run assets:touch` and `npm run assets:touch:adopt` were the same command.

That is not a cosmetic slip. `tests/fixtures/touch-cut/` is the oracle `shipped-touch.test.ts` and
`shipped-touch-contrast.test.ts` both measure against — the whole point of committing it (round 11)
was that a gate must not discover its own answer from the file it is judging. While the ordinary
build rewrote it, a change to `keyOut`, the crop or the downscale re-baselined the fixture and the
shipped face in one run and every gate downstream followed the change.

⚠️ **Nothing could have caught it, and that is the transferable part.** The claim is about a WRITE
SET. Both commands produced byte-identical output, so no inspection of the filesystem afterwards
distinguishes a file rewritten identically from one that was never opened. Every other round-13
finding landed with a gate that would red if undone; this one was recorded as a workflow change with
no gate, and *a workflow change with no gate is indistinguishable from one that never happened.*

**Applied in `44e3472`.** Three modes with the grammar and the source manifest in
`tools/gen/touchAtlasCli.mjs` (split out at 301 of 400 lines, importing one way only);
`main(argv, dirs)` exported and driven with real writes into a temp directory; the assertion taken
over the returned write set rather than the resulting files. `TOUCH_CELL_SOURCES` ships empty, so a
later single-cell re-shoot cannot be silently undone by `--adopt` recutting take-3 over it. Both
paths reproduce the six shipped PNGs byte for byte. **M70 red 2/18** — 12 files written where 6 were
claimed — reverted, and the revert confirmed by the original count returning to 1.

### The single-cell re-shoot, and how a candidate is judged before it is adopted

The owner chose the re-shoot over accepting `attack` stroke 2's 2.86:1 on 2026-08-31, and chose the
**single-cell** shape over a new full plate: five faces measure 3.32:1 at rest and 3.85:1 pressed
today, and a new plate re-founds all six on a fresh draw to fix one.

**The fix is the prompt, not the roll.** The plate prompt asks for a glyph *"deeply cut and filled
with dark shadow"*, and that sentence is the shortfall — the four fragments the round-13 stroke split
isolates ARE the wrench's shading. Re-shooting with the same clause is $0.15 for another coin flip.
So `touchButtonPrompt` composes its own glyph sentence, stated positively per STYLE.md §6 (*"no
internal shading"* is a phrase about shading): one continuous inlay, one flat tone, one even depth,
one unbroken outline. `touch-prompt.test.ts` asserts the old clause is absent from the new prompt and
still present in the plate prompt, so this is a difference rather than a sweep.

**And the endpoint is `fal-ai/nano-banana-pro/edit`, not the base model.** `FAL-MODELS.md` § 2 records
it as *"the lever for identity consistency"* at the same $0.15 — vault 4.1, *change the reference,
not the wording*. `promptTouch.mjs`'s own header says why it matters here: separately generated
buttons give separately drifting interpretations of "brass", and these six sit next to each other on
screen where a mismatch is the most visible failure available. Found by the Codex plan review, which
was right that a fresh text-to-image ignores the repository's own recorded mechanism.

That needed a seam nothing here had. `extractPlateCell` returns the RAW plate cell — pre-keying,
pre-crop, pre-downscale — because every existing path reached a cell through `cutFace`, which
resamples it to 160 px. A reference image wants the model's own pixels at the model's own
resolution.

#### 🔴 How the candidate is judged, and why it is not a hand-built staging validator

The plan called for staging the candidate to a temp directory and running a re-implemented battery
there. **That was replaced with something smaller and stronger, and the change is recorded rather
than made quietly.** The battery is not one gate — `shipped-touch.test.ts` enforces the two-sided
alpha band, exact ink reproduction from the cut face and six-way mark distinctness; the contrast
sweep is a fourth. Re-implementing a subset of those against staged paths would validate the
candidate against a different claim than the one the shipped bytes answer to.

So the candidate is adopted into a **committed** working tree and judged by the real suite, with
`git checkout -- public/assets/ui tests/fixtures/touch-cut` as an exact rollback if it fails. The
index is the backup, the gates are the real gates, and nothing is re-implemented.

⚠️ **`KNOWN_SHORTFALL`'s entry is deleted BEFORE the candidate is adopted, not after.** Otherwise the
2.8 floor it installs would let a 2.81 candidate pass the very gate that exists to decide whether the
re-shoot worked. Named by the Codex plan review, round 2.

⚠️ What the mechanism does not give: the bytes are on disk while the suite runs, so an interruption
between adopt and revert leaves unvalidated art in the tree. It is visible in `git status` and the
rollback stays exact, which is the trade taken.

#### The contrast sweep now has one definition and two callers

The swept-background per-stroke measurement lived inside a Vitest case body, so parameterising
`touchFaces.ts`'s loaders — which is what the plan asked for — would not have let anything else
reach the algorithm. It is `strokeContrast()` in `touchFaces.ts` now, and `shippedFace` and
`cutFace` take an explicit root that defaults to what production ships. Codex plan review, round 3.

**M71 red 1/18.** The `--cell` build's output routed to a fixed key instead of the requested one:
nothing in the pipeline can tell a wrench from a triangle — `cutFace` checks component count,
coverage, edges and dimensions — so the routing is what a mutation can order, and glyph identity
stays 12.14's and 12.24's, which is where this repository has always put it.

### The rows the two Codex implementation reviews added

**M22** drops the PROMPT term and reds the tap-through case (1/11); **M23** makes the pressed plate
opaque and reds the pressed-alpha case (1/3); **M24** and **M25** are the holes above. **M26**
unlights a plate a second finger is still holding (1/4); **M27** sets the pressed alpha to **0.86**,
the one value § 12.14 measured as erasing the content underneath, which the first repair's `< 0.9`
bound still admitted (1/4); **M28** hides `hasTouch: false` behind a block comment claiming `true`
(1/5); **M29** stacks the level rows at half pitch (2/21), which is what gives the previously
assertion-free *"keeps the rows disjoint"* test something it can fail on. M21's gate moved with the
plate-ink cases when `touch-draw-path.test.ts` crossed 400 lines, and was re-run there: **RED 2/3**.

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

