[← Phase 12 QA log index](phase-12-touch.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-12-touch.md)

### 🔴 The rotate overlay — three causes, two reports, and a repair written from arithmetic twice

The owner turned the phone to landscape and the prompt stayed up. Twice. And read a subline cut off
at both ends, then — after the first repair — a subline overlapping the headline.

**The lesson is not that the code was wrong. It is that two repairs were deployed without ever
reproducing the defect**, and both were plausible readings of the symptom that happened to be
incomplete. *(C4, and the vault note that a repeat report means reproduce first — which was in
memory, and was not followed until the third round.)*

| # | cause | why the previous repair missed it |
|---|---|---|
| 1 | **The decision read `Phaser.ScaleManager.displaySize`, which is a cache.** Every consumer — the prompt, `touchControlsLayer`, `touchRoutes` — read the same stale number, so one stale value froze all three | Repair 1 added a per-frame poll of that same value. **Re-reading a cache more often does not make it current.** |
| 2 | **Phaser subscribes to `window.resize` and a parent-bounds poll, and to nothing else.** It never listens to `orientationchange`, and never to `visualViewport` — which iOS Safari needs, because it does not reliably fire `resize` when the device turns or the toolbars slide | Nothing in the repo said this. The sibling project at `C:\Claude\Street-Fighter` wires all three in `src/main.ts` and says why; the owner pointed at it, and that is where the answer was |
| 3 | **One overlay class, more than one `RotatePrompt`.** `TitleScene` and `LevelSelectScene` attach their own; `UIScene` builds another. Each cached "am I showing?" privately, so the title screen's teardown cleared the class while the UI's prompt still believed it was up | Invisible to arithmetic entirely. Found by the **e2e reproduction**, on the first run of it |

**And the copy was sized in CSS pixels while being positioned in GAME pixels.** Those units do not
move together: at phone portrait the subline renders at `18 / 0.203 = 89` game px while its offset
from centre stays at 56. Repair 1 added word wrap, which fixed the clipping and turned it into a
collision with the headline — the second report. The copy is DOM text now, laid out by `flex`,
`gap`, `padding` and a `max-width`, and none of that arithmetic exists any more.

**What changed structurally.** `RotatePrompt` draws nothing; it toggles `html.rotate`, and
`index.html` owns the overlay. The decision is `rotateOverlayWanted(innerWidth, innerHeight, …)` —
raw viewport in, one shared predicate out. `rotateGuard.ts` wires `resize`, `orientationchange` and
`visualViewport.resize`, and calls `ScaleManager.refresh()` behind a re-entrancy guard so the
Phaser-side input gating stops being live on the same event rather than up to half a second later.

⚠️ **The re-entrancy guard is not a nicety.** `refresh()` emits RESIZE synchronously and this
function is subscribed to RESIZE; without the guard the page died with `RangeError: Maximum call
stack size exceeded` on the first e2e run. Street-Fighter's `main.ts` carries the same guard for the
same reason — which is a second thing that reading it first would have supplied.

#### ✅ The owner's device, 2026-09-01: the touch build plays

After the fullscreen repair the owner reported the game **working on the phone** — the rotate
overlay clears, fullscreen is granted, and the controls are usable. They also reported *"a few
small issues"* deferred to the next session and **authorised the merge to `main` and a production
deploy** in the same message.

⚠️ **12.13 and 12.24 are therefore NOT closed by this.** The owner confirmed the build plays; they
did not report running 12.13's four gesture checks (drag off a control's edge and back, two-finger
pinch across the cluster, double-tap the jump plate, a drag ending past the canvas edge) or 12.24's
five-level no-keyboard journey, and they named unresolved issues without enumerating them. Recording
this as a pass would be reading *"ran"* as *"passed"*, which is the exact failure the verdict rule
in this phase's plan was written to prevent. Both stay open, with the deferred issues to be
enumerated at the start of the next session.

⚠️ **One regression was caught by the full e2e sweep run before the merge, and by nothing else.**
`installFullscreenOnTap` had no touch guard, so a desktop CLICK on the wrapper entered fullscreen
and `session-help-banner.spec.ts` — a spec with nothing to do with touch — failed on
`page.setViewportSize`. **M94** reds it. The lesson is the sweep itself: a phone repair broke a
desktop spec three files away, and every targeted run stayed green.

⚠️ **And the mutation trap fired again.** `git checkout -- src/game/fullscreenOnTap.ts` to revert
M94 destroyed the uncommitted guard, because the guard had not been committed first. That is the
third occurrence of a trap this phase's own plan names in bold. The rule is not *"commit often"* —
it is **commit the fix before running the mutation that reverts its file**.

#### ✅ What the instrument found: the overlay was right for four sessions

The owner turned the phone to landscape and read the line back:

```
portrait   384x727 | 384x727 | portrait-primary  | 2008
landscape  798x283 | 799x283 | landscape-primary | 2225
```

Both explanations died at once. The count rose 2008 → 2225, so **the poll was alive**; the
orientation read `landscape-primary` and the viewport flipped, so **the numbers were current**. The
overlay was up in landscape because it was **correct** to be:

| | |
|---|---|
| viewport | 798 x 283 — Brave keeps its address bar, which eats ~a quarter of the short side |
| aspect | 2.82:1, **wider** than the 16:9 design surface, so under `Scale.FIT` **height binds** |
| canvas | `min(798, 283 x 16/9)` = **503 px** wide |
| CSS scale | 503 / 1920 = **0.262** |
| a `TOUCH_BOX_PX` control | 160 x 0.262 = **41.9 CSS px** against the 44 px floor |

**2.1 pixels.** Every landscape viewport in the table this phase reasoned from — 844x390 down to
640x300 — clears the floor, and none of them is what a browser with a persistent bottom bar
actually reports. Three of the four repairs made between the first report and this one fixed real
defects (M87, M88, M89); none of them was this one, and none of them could have been, because the
symptom they were chasing was not a defect.

**Owner decision, 2026-09-01: request fullscreen on tap.** The chrome is removed rather than the
game shrunk around it — the same device measures roughly 798x360 with the bars gone, a 640 px
canvas, and controls at **53.3 CSS px**. The alternative put to the owner was raising
`TOUCH_BOX_PX` 160 → 176, which buys 46.1 px on this device but still fails on a browser leaving
260 px, and costs 10 % larger controls on every device plus a matching enlargement of the
level-select band. Rejected on both counts.

⚠️ **A refusal is not fatal and the affordance is not one-shot.** iOS Safari has no fullscreen for
an arbitrary element (Phaser answers `FULLSCREEN_UNSUPPORTED`) and Android may refuse an untrusted
request; the letterboxed layout is correct either way and the next tap asks again, so a player who
swipes out of fullscreen is one tap from back in. The listener is on `#game`, the **wrapper**,
because the tap that matters is the one on the `#rotate` div and Phaser's input never sees it.
**M91, M92 and M93** red the three ways that wiring can be silently wrong.

#### 🔴 The fourth report — and the decision to stop reasoning and measure

The owner reported the overlay stuck in landscape for the **fourth** time, after the DOM rewrite that
M88 and M89 gate. Three causes have been found and fixed and the symptom has not moved.

What was checked this round, before writing anything:

- `rotateOverlayWanted` returns `false` at **every** landscape viewport a phone can report —
  844x390, 896x414, 932x430, 800x360, and 640x300 with both toolbars up, where a 160 px control
  still draws at 44.4 CSS px. It returns `true` only at 390x844 and 412x892. The arithmetic is not
  the defect.
- Both wiring paths re-read `window.innerWidth` **every frame**: `TitleScene` and `LevelSelectScene`
  through `attachRotatePrompt`'s `SCENE_UPDATE` subscription, `UIScene` through `UIScene.update()`
  calling `touchUi.refresh()`. The per-scene DOM-listener gap — `uiTouch.ts` wires none — adds
  nothing a per-frame poll does not already cover, so closing it would have been a fourth repair
  written from the same kind of reasoning as the first three.
- `index.html`'s cascade is a single `html.rotate #rotate { display: flex }` against a `display: none`
  base, and nothing else writes the class.

Two explanations survive: **the viewport this code reads is not what it assumes on that hardware**,
or **`refresh()` is not running there**. Nothing in the repository distinguishes them, and the
recorded rule for a repeated report is to reproduce before repairing — which is not possible on a
device this session cannot reach.

So this round ships an **instrument, not a repair**: the overlay prints
`innerWidth x innerHeight | visualViewport | screen.orientation | refresh count` under its copy,
digits only so `verify-dist.mjs`'s shipped-prose sweep stays clean. A count that stops rising while
the phone is turned means the poll is dead; a count that rises while the numbers stay portrait means
the viewport is. **M90** reds the readout.

⚠️ **Superseded 2026-09-01 — the instrument is DEV-only now.** It answered its question: the shortfall was 2.1 px of browser chrome, not an arithmetic error. On owner instruction the readout was withdrawn from production; the `<div class="diag">` left `index.html` entirely and is injected by `browserHost().report()` under `import.meta.env.DEV`. Injecting rather than merely guarding the write is the load-bearing half: deleting the markup while leaving `report()` calling `getElementById` would have made the DEV instrument silently inert behind its own `el !== null` guard — a decision function with no consumer, which is the defect M90 exists to catch. M90's DEV half is now the `the DEV diagnostic node` cases (behavioural, against a hand-rolled fake document — `environment: 'node'` and frozen deps rule out jsdom); its production half is the `rotate-diag` entry in `verify-dist.mjs`'s DEV-symbol sweep, which also covers `dist/index.html` so a re-added static div is caught by the same line.

**M88 and M89 red the two halves**, and M89's first attempt stayed green and is recorded as such:
`white-space: nowrap` at the shipped 14 px does not overflow a 320 px phone, because a 14 px DOM
string is not wide enough to. The gate measures overflow and the mutation has to produce some.

#### 🔴 Codex round 20 — the implementation review (12.23), `VERDICT: REVISE`

Nine findings — **six applied as code, three as record.** This is the last review round of the phase
by owner decision on 2026-08-31, and the reason is worth writing down rather than leaving implicit.

⚠️ **The loop had stopped converging, and the shape of why is structural.** Rounds 14–20 were almost
entirely about ONE artefact: the family-consistency gate, introduced in round 15 as a precondition on
the whole-plate redesign. Each round added a summary statistic and the next round found what that
statistic averages away — scalars are spatially blind, a radial profile is angularly blind, two
marginals are not a joint distribution, and a joint grid is blind inside its own cells. **Any finite
set of statistics has a blind spot, so an adversarial reviewer will always have a finding.** The
findings stayed genuine; the marginal value did not. The gate now catches a drifting family six ways,
which is what it was built for, and the residue below is recorded as a known limit rather than chased.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **12.19 was falsely PASS.** The criterion requires every matrix row to red, and **M82** sat in the table reporting `GREEN 0/24` — the criterion passing over its own contradiction. The counts were stale with it: 23 GREEN rows against a claim of 22 | **APPLIED.** M82 is **withdrawn** from the matrix to a note that says why: it was a probe that found dead code, not a mutation of a live gate. 22 GREEN rows is now true rather than nearly true, and the hole is M82b's |
| 2 | 🔴 **The grid discards every pixel inside `OUTER_R0`**, so a bezel or patina drift confined to the middle of a face is invisible to all 24 cells, and `r = 0.5` is not a semantic mark boundary | **APPLIED.** `coreLuma` / `coreWarmth` over the brightest 40 % of the core — the brass around the glyph, common to the family by construction, which is how the mark is excluded without classifying it. Bounds `43` / `37`, the approved 2.5x of a measured worst of 17.2 / 14.9. **M83** reds it |
| 3 | 🔴 **The joint grid is blind to rearrangement WITHIN a cell.** `n`, a mean and a mean are a function of the cell's histogram, and a permutation leaves that histogram identical — a smooth highlight becomes a blotch for free | **APPLIED, and not with a standard deviation**, which a permutation also preserves. `grain` is the mean luminance step between TOUCHING pixels, so it is not a histogram statistic at all. Bound `9.5`, the approved 2.5x of a measured worst of 3.8. **M83** reds it |
| 4 | 🔴 **`measurePlateRows` cannot validate a two-run sheet.** One step has zero deviation from its own mean, so the drift check cannot fire and `round(h / pitch)` reads asymmetric margins as empty grid rows — a plausible two-row redesign split as three | **APPLIED.** The inferred grid must EXPLAIN the sheet: the leftover margin has to be a whole number of pitches, or the row count is ambiguous and the sheet is refused. **M84** reds it |
| 5 | **Coherent six-face drift is unbounded** — six faces shifted together pass every comparison | **RECORDED, with the scope stated below.** This gate asks whether the six are one family, not whether that family is the right one. A drift they all share is a question about family IDENTITY, and identity is 12.14's judgement half, which is a human looking at the art |
| 6 | 🔴 **`MIN_CELL_PX` is a catastrophe guard, not the fill invariant it claimed to be.** The adopted minimum is 483 and production permits 100, so four fifths of a cell's interior could go behind an intact edge | **APPLIED.** Occupancy is compared RELATIVE to the other five at 21 %, the approved 2.5x of a measured worst of 8.5 %. `MIN_CELL_PX` stays, described as what it is. **M83** reds it |
| 7 | **The row test promised a stray-speck case that did not exist**, and production treated one alpha-qualified pixel on a scanline as an occupied row | **APPLIED.** A scanline needs half a percent of the width, and the promised fixture exists. **M84** reds it |
| 8 | **The missing-neighbour gate asserted only that an error was thrown.** "It threw" is not "it wrote nothing" | **APPLIED.** Both directories are snapshotted before the call and every surviving byte compared after it. **M85b** reds it — and **M85 alone could not**, because that path throws in `requireFile`, upstream of the write loop |
| 9 | **The 12.23 row stopped one review short of the summary beside it**, for the second time | **APPLIED.** Rounds 19 and 20 are both in the row |

##### What this gate does NOT claim, stated once

- **It is an INTERNAL consistency check.** Six faces that drift together — a whole plate rendered in
  pewter, or lit from a new angle as a set — pass every comparison in it, because every comparison
  is against the other five. Family **identity** is 12.14, and 12.14's judgement half is a person
  looking at the art. *(Finding 5.)*
- **`grain` is contrast-proportional, so it is weakest where the brass is flattest.** Permuting each
  of the 24 cells in turn crosses the bound in **18**; the six that survive are the whole of ring 0,
  the innermost band, whose median grain is 1.5–3.0. Recorded rather than fixed by moving a bound
  that was set before any of these mutations existed. *(Finding 3.)*
- **Every bound is `2.5x` a within-family worst measured on the adopted six**, which is a provisional
  multiple the owner approved on 2026-08-31 with the whole-plate redesign as the held-out set. If the
  redesign reds one honestly, that is a finding to bring to the owner, not a licence to move it.

#### 🔴 Codex round 19 — the implementation review (12.23), `VERDICT: REVISE`

Seven findings, **all seven applied**. Findings 2 and 3 turned out to have one answer, and applying
it replaced the spatial half of the family gate for the third time in three rounds.

**The theme is that each repair was a weaker claim than the sentence describing it.** The gate said
"spatial" and compared two marginals. It said the mark was excluded and used a threshold a drifted
face could move. `--cell` said it judged the family and judged whatever files happened to be there.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **`--cell` still accepted an INCOMPLETE family.** Neighbours were loaded `if (existsSync)`, so a directory missing four cuts judged a family of two and wrote the candidate — the check passing because nothing was left to disagree with it | **APPLIED.** Every descriptor's cut is required. **M82b** reds it. ⚠️ A second "the merged set is exactly six" assertion was written and was **dead** — `requireFile` throws first, so **M82 left it green**. Deleted rather than gated: a check that cannot go red is decoration, and defensive decoration reads to the next person as a guarantee |
| 2 | 🔴 **Two depleted faces could still erase a slice, and one legitimately larger glyph false-redded.** Eligibility derived from how many faces survived their own luminance threshold | **APPLIED, by removing the concept.** The compared region is **fixed geometry** — the outer half of the radius — so no face can vote a cell out, and there is nothing to be eligible for |
| 3 | 🔴 **A radial profile and an angular profile side by side are two MARGINALS, not a spatial invariant.** A cross-swap preserves both exactly while the lighting is visibly rearranged | **APPLIED.** A **joint** polar grid, 3 rings x 8 sectors, and each face measured against the **median of the others** — the outlier question this gate actually asks, where a spread is dragged toward admitting its own suspect. **M81** reds it |
| 4 | 🔴 **The row estimator had no direct caller and a hard-coded `3` passed every fixture** — every plate in the suite was a three-row sheet. It also averaged unequal spacings and rounded, so uneven gaps invented a grid | **APPLIED.** `touch-plate-rows.test.ts` drives genuine two-, three- and four-row sheets, an empty last row, a flush top edge, a single stray run and uneven spacing; `measurePlateRows` **refuses** a drift over 15 % rather than gridding it. **M80** reds it 2/24 |
| 5 | **The owner-approved provisional constants were prose.** Raising them toward the mutation's values would keep both the art and the mutations green while relaxing an approved policy | **APPLIED.** `touch-family-policy.test.ts` pins every one, and pins the derivation — `2.5x` the measured within-family worst — so changing a bound without its rationale reds. A red there is an approval checkpoint |
| 6 | 🔴 **Only half the redesign precondition had landed.** The whole-plate prompt still asked for a glyph *"deeply cut and filled with dark shadow"* — the exact clause blamed for the fragmented wrench — while `FLAT_GLYPH` was used only by the single-cell path | **APPLIED.** Both prompts compose the same `FLAT_GLYPH`. The test that asserted the plate prompt *still carried* the clause was correct while take 3 was the adopted plate and is wrong now; it asserts the opposite, and that the two prompts share one sentence rather than two that agree |
| 7 | **Four statements still described deleted behaviour** — "9 rows" for nine takes across four entries, the summary missing round 18, the "skip if any face is short" rule, and `TOUCH_PLATE_SHEET_ROWS` called the production decision | **APPLIED** |

⚠️ **One claim is narrower than the finding asked for, and is recorded as such.** Finding 3's fix
calls for a mutation preserving **both** marginals. The cross-swap built here preserves the radial
one exactly and moves the angular one by 28.4 — over the superseded angular bound — so it
demonstrates the grid beating the radial marginal and not both at once. A rearrangement of
photographed brass that preserves both exactly was **not achieved**. What needs no test: the grid
*refines* both marginals, since each is a weighted average of its cells, so anything either can see
the grid can see; only the strict direction needs evidence, and the half-turn case supplies it.

#### 🔴 Codex round 18 — the implementation review (12.23), `VERDICT: REVISE`

Seven findings. **Six applied, one resolved by owner decision.** Two of them — the angular profile
and the empty-output assertion — were applied **mid-round**, from Codex's own reasoning trace rather
than its report, so its numbered findings 2 and 4 arrived already fixed.

**The theme is that the gate kept being weaker than the sentence describing it.** Finding 1 is an
invariant with a documented bypass. Finding 3 is a comparison that could be switched off by the very
drift it exists to catch. Finding 4 is *"throws before writing"* proved by a throw. Finding 5 is a
threshold chosen to make its own test red.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **Single-cell adoption bypassed the family invariant** — and `--cell` is the path that overwrites the cut oracle AND the shipped face, the documented workflow every re-shoot in this phase went through. It was exempt on the reasoning that a set of one is a family by construction: true, and beside the point | **APPLIED.** The candidate is merged with the five committed cuts and the **six** are judged. A new case proves an out-of-family cell is refused *and* that the cut it would have replaced is byte-unchanged |
| 2 | **The "spatial" gate was angularly blind** — each annulus reduces to one mean, so moving the highlight from one side to the other leaves every statistic identical, and the round-17 mutation reversed radial order rather than lighting direction | **APPLIED MID-ROUND**, before the report arrived. Eight angular sectors beside the eight annuli, and a half-turn rotation case that asserts the radial checks stay **quiet** while the angular one fires — so it proves the new profile rather than riding on the old one |
| 3 | 🔴 **A drift could erase the evidence against it.** A slice was skipped whenever ANY face fell under the retained-pixel minimum, so darkening one annulus past the mark threshold **deleted the slice that disagreed**, while the brightest-40 % scalars barely moved | **APPLIED.** Eligibility is decided by the OTHER faces; a lone depleted face is the finding, not a reason to stop looking. Slices also carry their whole opaque area, counted before the mark is dropped |
| 4 | **M79 did not prove the check happens before writes.** *"Throws before writing anything"* asserted only the exception — a builder that wrote three faces and then refused the fourth throws the same error | **APPLIED MID-ROUND and extended.** The output directory must be empty **and** every staged cut byte-unchanged |
| 5 | 🔴 **The band threshold was fitted to the mutation after observing it.** 25/40 passed the radial-inversion case; 15/25 was then selected so it would red, and *"the statistic almost ordered its mutation"* was an exception invented to permit it | **OWNER DECISION, 2026-08-31: approved as PROVISIONAL, with the whole-plate redesign as the held-out set.** That plate does not exist yet, so it cannot have influenced the number, and it is the art these bounds were built for. **If it reds them honestly, that is a finding to bring to the owner — never a licence to move the bound.** Written into `touchFamily.mjs` beside the constants, including the fact that the exception was invented on the spot |
| 6 | **The 12.23 row stopped at round 16** while the summary below it named round 17 | **APPLIED.** Rounds 14-18 all named in the row |
| 7 | **Two reconciliation counts were false** — 27 matrix *rows* went green where 22 rows produced 27 green *attempts*, and "nine rows" in `GENERATION-LOG.md` is nine takes across four entries | **APPLIED** |

⚠️ **Also landed this round, and not from a finding:** `plateCells` measures the sheet's row
**pitch** instead of assuming three. That is round 15 finding 4's precondition on the redesign — the
prompt asks for two rows and take 3 drew three, so a two-row sheet split by three cuts every button
in half and no downstream gate compares a face to anything that would notice. Take 3 still measures
3, and the unit suite's synthetic plates (two rows drawn in a three-row grid) measure 3 as well,
which is why the count had to come from the pitch and not from the number of drawn rows.

#### 🔴 Codex round 17 — the implementation review (12.23), `VERDICT: REVISE`

Seven findings, every one re-verified locally before being acted on. **All seven applied.** Three of
them are about the family gate built one round earlier — which is the argument for building it
before the redesign rather than after.

**The theme is that a new gate arrives with its own new holes.** Finding 1 is a gated decision
function with an ungated caller — the same defect as a decision function with no consumer, one layer
up. Finding 2 is a test quietly enforcing a stricter policy than production. Finding 3 is a
statistic that measures the right quantity over the wrong domain.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **The family decision function was tested; its production seam was not.** Nothing drove an out-of-family set through `runBuild`'s call, so deleting those six lines left all four M77 cases red-capable while the builder adopted anything | **APPLIED.** A builder case stages an out-of-family cut set and asserts `main([])` throws **before writing**. **M79** deletes the call and reds that case *only* — M77's five stay green, which is the hole drawn in one line |
| 2 | 🔴 **The "sanity checks" enforced a stricter policy than production.** They required roundness under `0.03` and warmth over `80` where the builder permits `0.06` and `40`, so a redesigned family legal to the builder would have false-redded the suite. *"Calling assertions 'not a bound' does not make them cease being bounds"* | **APPLIED.** Both literals gone; the case now imports `MAX_FACE_ROUNDNESS` and `MIN_FACE_WARMTH` from the module that enforces them. **This is the same shape as round 15 finding 8** — a rule widened, or here narrowed, without the owner |
| 3 | 🔴 **The statistics could not detect the drift they claimed to gate.** `bodyLuma` and `bodyWarmth` are means over an *unordered bag* of pixels: permute a face's brass spatially and both are unchanged to the last decimal, so a button lit from below, a patina moved from rim to centre, or a different inner bezel inside the same outline all passed. The mark was also not excluded despite the docstring implying it | **APPLIED.** A **radial profile** — mean luminance and warmth in each of eight annuli, over non-mark pixels — and the mark exclusion is now explicit and described as what it is: a per-face luminance threshold, **not** a semantic mask. ⚠️ **The band bounds were 4x the observed spread and could not order their own mutation**; the radial-inversion case moved the worst band by 30 and the bound admitted it. At 2.5x it reds and the clean set keeps its margin |
| 4 | **`assertArmsDiffer` was both false-green and false-red capable.** It checked a zone COUNT, so one missing touch zone plus one unrelated zone passed; and `toEqual([])` over the bare arm's zones false-reds on any legitimate non-touch zone. It also never checked drawn touch faces on the bare arm | **APPLIED.** Every `TOUCH_IDS` zone asserted by name exactly once, unrelated zones ignored, and the bare arm must have neither a live touch zone nor a **drawn** touch face. The face half was applied mid-round, from Codex's own reasoning trace |
| 5 | 🔴 **The generation record was still unreconciled internally.** Round 16 fixed its header; its required-columns table still ended at take 7 with takes 5 and 6 marked ADOPTED, and the file still closed on a `$1.05` total | **APPLIED.** Take 8 and take nine takes across four entries added with `request_id`s and measured dimensions, takes 5 and 6 marked SUPERSEDED with the reason, terminal total `$1.35`. **12.18 was falsely PASS three times: rounds 14, 16 and 17.** A header is not a record; the rows are |
| 6 | **The summary still contradicted its own verdict evidence** — *"four faces re-shot"* for three faces over five takes, *"NOT MET on both halves"* over a row saying the measurable half passes, and round 16 missing from the review history | **APPLIED** |
| 7 | **Source verification skipped every present source when any one was absent.** One all-or-nothing `present` left a partial cache entirely unconstrained | **APPLIED.** Each source is hash-checked when present; only the reproduction case needs the complete set |

#### 🔴 Codex round 16 — the implementation review (12.23), `VERDICT: REVISE`

Eight findings on the round-15 repairs, every one re-verified locally before being acted on. **All
eight applied.** Round 16 was launched before the family gate and the 12.14 amendment landed, so it
reviewed neither; its closing note that *"the planned family-consistency gate must land before
adoption"* is satisfied by `tools/gen/touchFamily.mjs`.

**The theme is that a repair is not the same thing as a gate.** Four findings — 2, 4, 6 and 8 — are
all the same shape: the fix went in, the claim about the fix went into a document, and nothing could
tell whether the fix was still there.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **12.18 was falsely PASS a SECOND time.** `docs/generations/phase-12-touch-plate.md:3` still read *"7 generations · $1.05"* with takes 5 and 6 recorded as adopted, and `GENERATION-LOG.md` said the same, against the QA log's reconciled nine takes / $1.35. **Round 14 found this criterion false and only half of it was repaired** | **APPLIED.** Takes 8 and 9 logged with their `request_id`s and their **measured** 2048 × 2048; takes 4-6 marked superseded; both documents read nine takes / **$1.35** |
| 2 | 🔴 **The drain-window repair had no deletion-resistant gate.** `stopSubmitting` was optional on the handle and called through `?.`, so deleting it silently restored drain-frame submission — and whether any numeric gate noticed depended on the next noisy run | **APPLIED.** The method is required, the timer counts every query it opens, and `sampleArm` asserts **zero** opened after the window closed. **M78** reds it, and prints the size of what was being contaminated: **8 queries per sample** |
| 3 | 🔴 **The red proofs imposed a per-pair rule their policy does not.** Each required every pair positive on top of the median, so an amplified run clearing the bound with one quantized pair a shade negative would have been called a failure — a red proof stricter than the gate it proves is an unowned gate | **APPLIED.** The positivity loops are gone; the positive **median** assertion stays, because `withinBudget` is two-sided and a red satisfied by it alone could be satisfied by breaking the instrument |
| 4 | **The QA claim that all three specs run the same preconditions was false.** The clean gate checked zone count, every face by name, interactivity and an empty bare arm; the GPU proof checked faces only, the CPU proof checked only that its hook fired | **APPLIED.** One `assertArmsDiffer`, run by `makeArms` itself — so a spec cannot have a weaker set by omission, which is how this drifted |
| 5 | **One setup step was still in ROLE order.** `hideTexts(touch)` always preceded `hideTexts(bare)`, so whatever the first of the two calls costs a page landed on the touch arm every time | **APPLIED.** Both run in physical first/second order before roles exist. The 30-tick settle probably absorbed it; *probably* is the word `touchArms.ts` exists to remove |
| 6 | **The adoption test proved determinism, not production reproduction** — one execution against another of the same code over regenerated synthetic inputs. The production claim was manual evidence tied to no particular bytes | **APPLIED.** Every recorded source carries a pinned SHA-256, and on a machine holding them `main(['--adopt'])` from **those exact bytes** reproduces the committed cuts byte for byte. The synthetic gate next door still always runs |
| 7 | **The summary contradicted its own table** — *"one NOT MET and three UNRUN"* over a table reading 12.14 and 12.23 NOT MET, and round 15 described as producing no verdict in one place and `REVISE` in another | **APPLIED.** Two NOT MET, two UNRUN, and rounds 15 and 16 recorded once each |
| 8 | **Withdrawn prose still live.** The log still called `MAX_TOUCH_CPU_PAIR_MS = 2` the current collapse guard, and the clean spec still said both statistics get per-pair checks | **APPLIED** |

#### 🔴 Codex round 15 — the implementation review (12.23), `VERDICT: REVISE`

Eleven findings on the round-14 repairs, every one re-verified locally before being acted on.
**Seven applied, one blocks the redesign, three are owner decisions.**

Two of them are the same failure mode: **a repair that quietly extends its own remit**. Finding 1
is a bound the evidence had WITHDRAWN, resurrected by the fix for finding 14.3; finding 8 is an
approved criterion widened by a gate rather than by the owner. Neither is a wrong repair — both are
right repairs that were not authorised to be that wide.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **The withdrawn per-pair CPU bound still executed.** Sharing one evaluator between the clean gate and the red proofs re-applied per-pair rejection at ±0.5 ms to the main-thread deltas — the band a held-out sweep had already retired, because `workMedianMs` is a median over Chrome's 0.1 ms grid of a 0.8–0.9 ms quantity and one pair read exactly −0.5000 while the median of the same four read −0.1000 | **APPLIED.** `withinBudget` takes an explicit `policy`: GPU is `median-and-pairs`, CPU is `median-only`. **My own repair introduced this**, which is why the rationale and the code disagreed |
| 2 | 🔴 **M72 and M73 bypassed the clean gate's counterbalance** — both red proofs created the touch context first and kept it first for the whole run, the exact confound `touchArms.ts` exists to remove, and the CPU proof omitted the `hideTexts` `stillVisible === 0` checks entirely | **APPLIED.** Both proofs run the same two `makeArms` blocks, the same preconditions and the same pooling as the clean gate |
| 3 | 🔴 **The `--adopt` test passed without exercising adoption.** The recorded sources are gitignored 4 MB plates, so it caught its own ENOENT and returned green on any fresh clone; with the sources present it asserted a write count and left byte reproduction to a manual check | **APPLIED.** `sourceCells` takes `plateSource`/`cellSources` through `dirs` — production passes neither. The test injects a synthetic plate and one override cell, compares all twelve outputs against a second run, and asserts the override was honoured rather than recut. **M76** reds it |
| 4 | 🔴 **The requested whole-plate redesign is unsafe through the current manifest** — it still points at take 3 plus three single-cell overrides that adoption reapplies, `TOUCH_PLATE_SHEET_ROWS` assumes three physical rows, and the whole-plate prompt still mandates the *"deeply cut and filled with dark shadow"* clause already blamed for the fragmented marks | **BLOCKS THE REDESIGN.** Recorded as its precondition: one atomic manifest change — new plate source, **measured** physical row count, empty override map, repaired flat-glyph prompt — **before** any spend or cut |
| 5 | **GPU samples included drain-frame renders.** The bounded drain called `onFrameTop()` on every one of its frames, re-arming the timer, so `prerender` opened fresh queries after the window had closed | **APPLIED.** `stopSubmitting()` disarms without finishing, and `sample()` takes it as an **opt-in** — Phases 5–8 fixed their bounds against the contaminated median, and flipping it globally would silently re-found four phases' numbers |
| 6 | **A fresh whole plate reduces family drift but does not establish the family invariant.** Every cell is independently keyed, bounded, cropped and rescaled; nothing compares bezel, silhouette, lighting or patina across cells, so one sheet can still hold six visibly different buttons | **RESOLVED — owner decision, 2026-08-31: build the family-consistency gate BEFORE adopting the redesign.** It measures bezel geometry and the brass/patina tone across all six cut cells and refuses a plate whose buttons disagree. A redesign is exactly when it pays, and it is a precondition of the spend, not a follow-up |
| 7 | **12.19 was PASS with no red proof for `MIN_TOUCH_ARM_CPU_MS`.** The floor replaced a per-pair guard that could not detect a collapse, and nothing in the matrix collapsed an arm | **APPLIED as M75**, and the mutation is *both* arms rather than one: zeroing one arm reds the delta bound too and proves nothing about the floor. Zeroing both leaves the delta at 0.0000 — the case a paired statistic is blind to by construction — and **only the floor fired** |
| 8 | 🔴 **The live-size sweep widened 12.14 without amending it.** The approved criterion says *"at the smallest in-scope viewport"*; the gate now rejects a failure at any integer size from 44 through 48, and it demonstrably rejected art that passed at 44 | **RESOLVED — the owner amended the criterion, 2026-08-31.** 12.14 now reads *"at every integer CSS size in the live band, 44 through 48 px"* in both documents. The gate is unchanged; what changed is that it is now authorised. **The gate was enforcing more than the criterion said for the whole of round 15** |
| 9 | **Component scoring is not a semantic-action mask**, and six new glyphs make that matter more, not less | **RESOLVED — owner decision, 2026-08-31: keep the statistic, labelled diagnostic support.** The per-stroke figure stays in the log as a **box-filter proxy** and supporting evidence; the readability *judgement* is the `ui-ux-tester` briefs' and always was. No semantic mask is invented at the end of a phase — which is what round 8 did |
| 10 | **The QA log contradicted itself materially** — header vs 12.18 on takes and spend, table vs summary on 12.23, superseded pause/walk evidence, and 23 holes in the PRD against 27 here | **APPLIED.** One final-source-of-truth sweep; 12.23 reads **NOT MET** in both places and nowhere UNRUN |
| 11 | **The prose sweep missed direct falsehoods** — five controls in 12.12's criterion and its QA row, *"all five"* in the e2e title, 48 px as the presentation floor in two art comments | **APPLIED.** `TOUCH_IDS` is named as the authority instead of a number, and the proxy is described as the 44–48 px band |

✅ **All three owner decisions were taken on 2026-08-31** and are recorded in the rows above: amend
12.14 to the live band; build the family-consistency gate before adopting the redesign; keep the
per-stroke contrast figure as labelled diagnostic support.

⚠️ **Finding 4 still blocks the redesign** and is not an owner call — it is a precondition. One
atomic manifest change: new plate source, **measured** physical row count (`TOUCH_PLATE_SHEET_ROWS`
assumes three because the model drew three, and a new plate may not), empty override map, and a
prompt with the *"deeply cut and filled with dark shadow"* clause removed. Nothing is generated
before that lands **and the family gate is written**.

#### 🔴 Codex round 14 — the implementation review (12.23), `VERDICT: REVISE`

Thirteen findings, every one re-verified locally before being acted on. **Nine applied, four
recorded.**

| # | finding | disposition |
|---|---|---|
| 1 | **The live-size sweep was dead code** — `LIVE_SIZES_PX` exported and never imported, so the known 47 px failure stayed green | **APPLIED.** True at the moment it was read: the sweep had been reverted to run a diagnostic band probe and not restored |
| 2 | **`touchArms` counterbalanced almost nothing.** Context creation alternated, but the touch page was always created, driven, booted, GPU-checked and timed **first** — and the renderer process, WebGL context, swap chain and JIT warm-up are made by the page and boot work, not by an empty context | **APPLIED.** Every setup step now runs in physical first/second order; roles are assigned only afterwards |
| 3 | **M72 and M73 did not prove the CLEAN gate can go red.** Each proof asserted its own opposite inequality against the same constant, so blanking the clean gate's expectations left both proofs green | **APPLIED.** One `withinBudget` evaluator: the clean gate asserts `ok`, each proof asserts `!ok` on amplified data through that exact function |
| 4 | 🔴 **12.18 was falsely PASS, twice over** — the row said 3 takes / $0.45 with six more bought, and `GENERATION-LOG.md` said *"the last ceiling anyone named is $55"* against `PRD.md:91`'s `$60` owner raise. **The criterion whose entire content is that the figures agree** | **APPLIED.** Both reconciled; the row now records that it was false |
| 5 | The 12.14 row's evidence was obsolete — it described the cogwheel's 2.91:1 while production had moved on | **APPLIED** (this rewrite) |
| 6 | **Four single-cell re-shoots destroy the whole-plate family invariant with no gate.** The prompt asks the model to keep the brass, bezel and patina; a prompt is not an invariant, and adopt replaces the entire cut face, so every downstream gate accepts an altered bezel or silhouette | **RECORDED, not applied.** *Reason: the fix is to composite only the glyph onto the original plate face and assert every non-mark pixel byte-identical — a pipeline change, not a gate, and it would re-open four adopted faces at the end of a phase already reported failing. It is the right next repair and it is written down as one* |
| 7 | **`drawnFaces` returned only `visible`**, which stays true at alpha 0 or zero display size — so the perf precondition could time an arm rendering no controls | **APPLIED.** It returns `willRender(camera)`, alpha and drawn size, and all three are asserted |
| 8 | GPU queries keep opening during the drain, so the median includes frames outside the captured window | **RECORDED, not applied.** *Reason: `perfSampler.ts` and `gpuTimer.ts` are shared with Phases 5-8, whose bounds were fixed against the current behaviour; changing it silently re-founds four other phases' numbers. It needs its own session with those gates re-confirmed* |
| 9 | **The 2 ms per-pair CPU "collapse guard" could not detect a collapse** — the arms measure 0.8-0.9 ms, so an arm falling to zero yields ~0.9 ms and passes comfortably | **APPLIED.** Replaced by `MIN_TOUCH_ARM_CPU_MS`, an absolute floor on each arm's own median. A collapse is a property of one arm, so it is checked as one |
| 10 | The amended 12.8 called the title a discrete target requiring containment, which its own gate does not check | **APPLIED.** The title is a whole-screen route and is now classified as one — applying the owner's rule, not changing it |
| 11 | **`--adopt` had no behavioural test at all**, and the `--cell` test staged only `cutDir`, so a mutation sweeping the five shipped faces passed | **APPLIED.** Both directories staged, the five untouched faces asserted byte-identical, and a new case drives `main(['--adopt'])` and asserts the sweep |
| 12 | *"Every connected stroke must pass"* is neither the approved criterion nor what the statistic enforces — connectivity is not semantics, and `strokeContrast` takes the best pixel in a component | **RECORDED, not applied.** *Reason: replacing it needs an owner-approved semantic mask naming which parts of each glyph communicate the action. That is a real improvement and a real decision; inventing the mask at the end of a gate is what round 8 did* |
| 13 | Stale comments: pause described as a gear, "48 px", "all five drawn" | **APPLIED** |

#### What the four original repairs measured, which was the GREY BOX


Both briefs measured rather than judged, and four defects were **applied**.

🔴 **The marks are drawn now, not typed.** Brief 1 parsed the real outlines out of `cour.ttf` and
`consola.ttf` — what iOS Safari and Chrome/Windows resolve `monospace` to — and measured what reached
the glass at 0.347:

| mark | ink, CSS px | share of the 55.6 px plate |
|---|---|---|
| `<` `>` | 10.7 x 11.2 | 3.9 % of area |
| `A` | 13.0 x 12.7 | 5.5 % |
| **`^`** | **8.4 x 5.9** | **1.2 %**, floating 5.0 CSS px above centre |
| two pipes | two **0.9 px** hairlines, 26.7 px apart | not a pause icon |

`^` is the jump button, and `setOrigin(0.5, 0.5)` centres a text object's *box* while the circumflex
sits high — so the mark floated in the top half of an otherwise empty plate. Scaling the font fixes
the size and not the shape, and a black-triangle or crossed-swords codepoint trades a small mark for
a possible tofu box on phone fonts this project cannot test. **A drawn shape has neither failure.**

🔴 **Two inks, from this repo's own method.** The plate was one fill at alpha 0.55 and the glyph had
no stroke: **2.65:1** over `far.png`'s brightest pixel, **1.00:1** over a mid-grey, glyph **2.13:1**,
against 1.4.11's 3:1. A single ink cannot pass, because every fixed colour has a background it
vanishes against. `hud.ts` solved this for the gear counter and wrote the method down; the marks
reuse the same pair, which is what makes `contrast-floor.test.ts`'s measured **3.80:1** floor apply.

🔴 **And the alpha stays at 0.55, because the first repair got that wrong.** Raising it to 0.86 made
the fill a fill — and brief 2 measured the cost from the shipped level data, sampling the player
standing on every solid surface in all five `.tmj` files every 96 px: **175 of 878 positions (19.9 %)
have a hazard, an enemy or the goal drawn under a control plate.** A `brass-sentry` that is actively
shooting sits behind the pause plate for nine consecutive positions on level-01; on level-04 the goal
sits under the jump plate for nine more. At 0.55 that content is dim and readable; at 0.86 it is
gone. Now pinned by a gate (M21 red), with the figure and the method in the test.

🔴 **The play scene told a phone player to press eight keys it does not have.** `helpLine` was the
only instructional surface in the game with no touch branch, while five unlabelled plates sat at the
bottom of the screen that nothing named — and the two contradicted each other, the banner saying
attack was `F / L` while the plate showed the letter `A`.

**Recorded, not applied:**

- 🔴 **The pause glyph promises pause and delivers abandon-the-run.** It routes to `openLevelSelect`,
  a hard `scene.start` with no confirmation and no checkpoint, so a player 90 % through level 5 who
  taps it to answer a message loses the run. It is also the control most likely to be hit while
  adjusting grip. *Reason: either a real pause or a relabel, and both are the owner's call — ESC is
  at least a key labelled ESCAPE.*
- **The rotate prompt's scrim is the same colour as the page background**, so a portrait phone shows
  a uniformly black screen with two small lines and no visible canvas boundary — it reads as a page
  that failed to load. *Reason: a panel behind the copy is a design change; the legibility half is
  fixed.*
- **The completion prompt reuses `#8f8776` over a 0.72 scrim** for a measured worst case of 2.25:1.
  `titleInk.ts` already records this fill shipping bare as a defect. *Reason: `hudFade.ts` is Phase 8
  surface, outside this phase's scope.*
- **Level ids are filenames** — `1. level-01 · best 0 / 7`. There are no level names in the catalog.

### 12.16 — the draw path (`code-reviewer`)

🔴 **`touchTargetsDisjoint` had zero production consumers.** Verified locally. Blanking it to
`return true` reddened nothing behavioural and left the game byte-identical — the `spriteFeedback.ts`
shape this criterion exists to forbid. It was redundant too: `separation` returns 0 for overlapping
boxes and `0 * scale < 8` is **true** at every scale, so `touchTargetsFit` already refuses them.
(This sentence said *false* in three places — here and two comments — which inverts the reasoning
while reaching the right conclusion. Corrected 2026-08-29 after the Codex re-review.)
**Deleted**, with the reasoning left where it stood.

**Also applied:** `TOUCH_CONTROL_IDS`, a re-export alias whose only reference was its own declaration,
under a comment claiming a consumer that did not exist; the fake's `press()` now refuses a disabled
zone, without which `disableInteractive()` could be a complete no-op in production and every unit
case still passed, carried by the `isLive` belt inside the handler; the two `void` statements under a
comment claiming they stopped the harness accepting a wrong event name — a `void` expression enforces
nothing, and the comment stated the opposite of the truth — are real dispatchers now; faces record
depth, alpha, angle and stroke; the zone fake's dead shadow object is gone; and three re-baselined
PNGs under `docs/evidence/` were restored from `main`, because a full e2e run overwrites Phase 10's
approved evidence and `99c754e` had committed a Phase 12 build over it.

**Recorded, not applied:**

- **Every `setDepth()` in the new code is ungated.** The load-bearing one is `ROTATE_PROMPT_DEPTH`:
  the viewport spec proves the controls go non-interactive under the prompt but never that the prompt
  draws **over** them. The fake now records depth, so the gate is one line — *reason: it belongs with
  a prompt-layering assertion rather than bolted onto a passing test at the end of a gate.*
- **The fake's `off` ignores `fn` and `context`**, so a teardown that removed the *wrong* function
  reference still reads as clean. *Reason: a real weakness in the M14 gate; the leak it guards is
  behaviourally covered by the destroy case.*
- **`tools/gen/promptTouch.mjs` is orphaned** — no npm script, no importer — and its header names
  `buildTouchAtlas.mjs` five times as its consumer. **That file was never written.** *Reason:
  deleting a file is a STOP-and-ask, and the tool is the record of what the two takes asked for.*
- ~~**A `rotate-prompt.test.ts` case cannot go red**: it filters faces the first prompt already left
  in the array, against a `>=` bound a hardcoded scrim satisfies.~~ **REPAIRED**, after the Codex
  round-4 review found the missing behaviour behind it: `refresh()` re-sized only the fonts, so the
  case was decoration over a defect rather than only over nothing. `RotatePrompt.place()` re-sizes
  the scrim and re-centres both lines, the case refreshes the SAME prompt, and it asserts each line
  moved by half the change in its dimension — a delta, not the private `48`/`56` offsets, which
  would pin tuning no criterion approves. **M32 red 1/10.**
- **Six file:line citations in new prose were invalidated by this same diff**, including
  `gameInput.ts:359-362`, which is the justifying evidence for the whole `inputMerge` extraction and
  now points at the `if (!enabled)` branch. That one is corrected; the rest are recorded.
- **Test-only production API**: `TouchContacts.size` and `NO_KEYBOARD_HELD`.

