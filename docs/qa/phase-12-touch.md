# QA log — Phase 12 (Touch and responsive support)

Branch `phase-12-touch`, off `main` at `7f339ad`. Executed 2026-08-29.

The gate table below is the record. Everything under it is the evidence for one row.

✅ **This phase ships the GENERATED faces.** **Nine** fal takes at $0.15 each: three whole plates on
`nano-banana-pro` (take 3 adopted, and it is still the source of `touch-left`, `touch-right` and
`touch-jump`) and six single-cell edits on `nano-banana-pro/edit` (takes 7, 8 and 9 adopted for
`touch-walk`, `touch-attack` and `touch-pause`). Six 160 × 160 PNGs in `public/assets/ui/`, cut by
`tools/gen/buildTouchAtlas.mjs`, catalogued in `public/assets/index.json` and gated on the shipped
bytes by `tests/unit/shipped-touch.test.ts`. The takes and their `request_id`s are in
`docs/generations/phase-12-touch-plate.md`; **$2.10 of the $5** touch-UI ceiling.

⚠️ **This paragraph said "three plates, take 3 adopted, $0.45" while six more takes had been bought**
— the same drift that made 12.18 falsely PASS. Codex round 15, finding 10.

⚠️ **The header above used to say the opposite** — *"ships GREY-BOX controls, two
generations, neither adopted, 12.17 NOT MET for five PNGs"* — three revisions after the art
landed and the row said PASS. A log whose summary contradicts its own table is worse than one that
says nothing, and a reader checks the summary first. Found by the Codex round-6 review.

---

## Phase 12 — criterion verdicts

<!-- gate-verdicts -->
| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 12.1 | Touch-only journey, real contacts at measured coordinates | **PASS** | `phase-12-journey.spec.ts`. M5a/M5b/M5c each red it 1/1. |
| 12.2 | A jump contact fires at a NAMED tick | **PASS** | `phase-12-touch.spec.ts` 12.2. Bound ≤2 ticks, measured inside the page. |
| 12.3 | Multi-touch, raw dispatch | **PASS** | 12.3, two live contacts, `activePointers: 4` verified against `Config.js`. |
| 12.4 | Touch and keyboard merge, GameScene calls it live | **PASS — one hole found and closed** | § 12.4. `readHeldKeys` extracted and gated; M18/M18b red. Two open findings recorded. |
| 12.5 | Contact identity and every loss path, registrations asserted | **PASS — two holes found and closed** | § 12.5. Exact-set assertion + six loss paths fired; M19/M20 red. Three recorded. |
| 12.6 | A level transition rebinds idempotently | **PASS** | `touch-draw-path.test.ts` rebind case; M2b red after its gate was written. |
| 12.7 | Nothing drawn or interactive on a desktop pointer | **PASS** | 12.7 in a `hasTouch:false` context; Phase 2 suite unregressed. |
| 12.8 | Discrete targets inside the canvas and disjoint; whole-screen routes measured for COVERAGE | **PASS — criterion amended 2026-08-31, owner decision** | The five play controls and the five level-menu rows are inside the canvas and pairwise disjoint at 10 viewports (M11 red 8/11, M11b 7/11, M29 2/21). The **title and completion zones are whole-screen routes** — the title is the whole canvas, the completion zone is deliberately 64 px larger than it — and both are measured for coverage, no reachable strip of canvas left unroutable, which is what `phase-12-viewport.spec.ts:217` already asserts. ⚠️ **The first version of this amendment listed the title as a discrete target requiring containment, which its own gate does not check** — Codex round 14, finding 10. Corrected: the title is a route, and classifying it as one is applying the owner's rule rather than changing it. **No gate changed; the sentence did.** § 12.8. |
| 12.9 | ≥44 CSS px, ≥8 CSS px gaps, from measured bounds | **PASS — after a BLOCKER repair** | § 12.9. The menu rows were 38.5–42.2 CSS px on every real phone. All five target kinds measured; § 12.8. |
| 12.10 | The prompt appears iff any target that would have to be hittable on this screen falls under 44 CSS px | **PASS — criterion amended 2026-08-31, owner decision** | The prompt and every route share ONE predicate (M31 red 1/9), so they cannot disagree. That predicate weighs the screen's own route **and** the play controls, which is decision **D1** and is now what the criterion says: a portrait title screen shows the prompt because the controls behind it would be 32.5 CSS px, not because its own 390 × 219 zone is small. **No gate changed; the sentence did.** § 12.10. |
| 12.11 | Frame budget unregressed with the controls drawn | **PASS** | § 12.11. The frames-served ratio was replaced, not re-bounded — it returns exactly 1.000 or 0.500 against a vsync-locked display. The statistic is now the paired per-frame GPU and main-thread delta against ±0.5 ms, with absolute per-arm ceilings at 8 ms. Red-proved both ways: **M72** 2.09 ms, **M73** 0.85 ms, each after a recorded GREEN that was a real hole. Confirmed on a held-out `test:e2e` sweep, **218 passed, 0 failed**. Both `performance-engineer` briefs run *(A7)*; brief 2's finding 1 — the touch role pinned to one browser context all run — is applied in `touchArms.ts` and was the cause of an offset this log had recorded as noise. |
| 12.12 | Controls hidden AND disabled whenever they must not be live | **PASS** | 12.12 taps every `TOUCH_IDS` coordinate; M8 red. |
| 12.13 | A drag is not stolen by browser pan / pinch / zoom | **NOT MET — two hands-on passes, and the rotate gate needed rewriting rather than repairing** | Preview deployed 2026-08-31 and 2026-09-01 and run on the owner's phone. **The same two findings were reported twice**, because the first repair to each was written from arithmetic and shipped without a reproduction. *(See § the rotate overlay for the full account.)* The overlay is DOM now, not Phaser objects, and both defects have e2e reproductions in `phase-12-viewport.spec.ts` that were watched red. ⚠️ **The gesture checks themselves — drag off the edge, pinch, double-tap — have still not been run**, so the criterion stays NOT MET. |
| 12.14 | The button art is readable at true size at every integer CSS size in the 44-48 px live band *(amended 2026-08-31, owner decision)* | **NOT MET — and the measurable half can no longer be measured** | 🔴 **The whole plate was redesigned on 2026-08-31 by owner decision** — *"new designs for all the buttons, in the style of the gate asset"* — so all six faces are take 14's cells and the three single-cell re-shoots this row used to describe ship nothing. **The per-stroke contrast gate is DELETED, not failing.** It found the glyph with `luma < INK_DARK_MAX` inside the central half, which held while the button was a pale disc whose glyph was the only dark thing on it; the redesign puts verdigris in every recess and shadow along the lower-right, so the detector reads **12 to 37 "strokes" per face** where the six used to have 1 to 4. Its figures were not low, they were meaningless — the mask is no longer the mark. Owner decision, taken on the measurement: report the criterion NOT MET rather than rebuild the statistic after seeing the art it would judge, which is the post-data selection this phase kept catching. ⚠️ **So there is now NO automated evidence for 12.14 at all**, and the criterion rests entirely on the hands-on pass, which is what it always required and has never had. `ui-ux-tester` has not run against these bytes either. Screenshot at 540 x 365: `docs/evidence/phase-12-touch-art.png`. **Seven earlier versions of this row were wrong and every one was caught by review** — see § 12.14's history. |
| 12.15 | `src/sim/` boundary intact, whole suite with Phaser uninstalled | **PASS** | § Regression evidence. **Re-run on the round-16 diff, 2026-08-31: 3016 passed, 13 skipped of 3029**, Phaser restored to 4.2.1 afterwards. Re-run because the close-out session added four modules under `tools/gen/` and three test files, any of which could have reached for Phaser. |
| 12.16 | Draw-path: a blanked body or a deleted consumer reds a behavioural gate | **PASS — one orphan deleted** | § 12.16. `touchTargetsDisjoint` had zero consumers. M10 red 2/25. |
| 12.17 | Shipped bytes: six PNGs, alpha, six distinct **marks**, own key | **PASS — criterion amended 2026-08-31, owner decision** | Everything measurable passes on the shipped bytes (§ 12.17): six 160×160 PNGs, a two-sided alpha band, six pairwise-distinct engraved marks, each bound to its own key. The two amended words are **five → six** and **silhouettes → marks**: the six deliberately share one round brass disc, so the outline is the same by design and the distinctness that exists to be asserted is of the mark. **The distinctness gate was not loosened** — it already compared marks. § 12.17b. ⚠️ **Re-stated 2026-08-31 with the redesign:** the alpha claim is now **two** bands, a keyed field and an opaque button, because `bakePlateAlpha` is deleted and the bytes are no longer pre-faded — the old three-band assertion would have gone on passing on rim antialiasing alone, which is a gate passing for a reason unrelated to its claim. And the distinctness mask, which came from `keylineMarks`, is now a **fixed central square**: the six are the same button, so inside that square only the glyph can differ, which is a sounder oracle than the one it replaces rather than a weaker one. |
| 12.18 | Every generation logged; the two ceilings agree | **PASS — after a correction, and it was falsely PASS before it** | `GENERATION-LOG.md`, **fourteen takes across five entries, $2.10 of $5**. ⚠️ This row read *"3 rows, $0.45 of $5"* while six more takes had been bought, and `GENERATION-LOG.md` separately said *"the last ceiling anyone named is $55"* against `PRD.md:91`'s `$60` owner raise of 2026-08-29 — **two disagreements at once, in the criterion whose whole content is that the figures agree**. Found by the Codex round-14 implementation review; both reconciled 2026-08-31. |
| 12.19 | Every gate watched failing under its named mutation | **PASS 2026-09-02 — the thirteen are triaged, and the three replacement gates now have red proofs** | § The mutation matrix. **109 rows** (this said *"92"*, which described neither the table it pointed at nor any subset of it — see § the row count); 22 of them went green before they reddened, over 27 green attempts, all closed. M22–M33 cover the four Codex rounds, M34–M40 the owner's three requests and the adopted art, M41–M45 the round-6 review, M46–M50 the round-7 one, M51–M54 the round-8 one, M55–M57 the round-9 one, M58–M59 the round-10 one, M60–M63 the round-11 one, M64–M65 the round-12 one, M66–M69 the round-13 one, M70–M71 the repair round 13 recorded but never landed plus the single-cell path it unlocked, M72 12.11's replacement GPU bound, M73 its main-thread bound, and M74 the live-size sweep that found a 2.740:1 stroke a pinned gate could not see. **M75, M76 and M77 close the round-15 gaps**: the CPU instrument floor shipped with no red proof of its own, `--adopt`'s override map had none either, the new family gate is watched failing on four built out-of-family faces, **M78** reds the GPU window boundary that round 16 found had no gate at all, **M79** reds the family gate's production SEAM — which M77 alone could not, because a gated decision function with an ungated caller is the same defect one layer up — and **M80-M82b** cover the row estimator, the joint grid and the partial-family hole. **M83-M85b close Codex round 20**: the three within-face statistics, the row estimator's speck and two-run holes, and the atomicity of a refusal. **M86 and M87 are the owner's two phone findings**, and both are *(C4)* in its purest form — 3042 unit cases, 218 e2e cases and five Codex rounds over the rotate prompt, and neither defect was visible from any of them. 🔴 **M82 is WITHDRAWN from the matrix.** It came back GREEN and stayed green, and this criterion requires every row to red — so a row reporting `GREEN 0/24` made 12.19 PASS over its own contradiction (Codex round 20, finding 1). M82 was a probe that found dead code, not a mutation of a live gate; the dead code is deleted and the hole is M82b's, which reds. 🔴 **Thirteen more rows were withdrawn for the same reason, and that is what held this criterion open. Closed 2026-09-02.** M46, M47, M55-M57, M60-M63, M65, M68, M69 and M74 each reddened a gate the owner's redesign deleted along with the ink pass. Each was triaged by one question — does the code it edits still exist, and does a live gate still claim its property? **Five were rebuilt and red** (M46 → **M99**, M61 → **M100**, M62 → **M101**, M60 → **M103**, M47 → **M104**); **eight are RETIRED** (M55, M56, M57, M63, M65, M68, M69, M74) because the code they edit is deleted, which makes them **unbuildable rather than green** — the distinction M82 established. The three replacement gates now carry the red proofs they lacked: two-band alpha ← M99 RED 2/15 and M100 RED 2/15; byte-for-byte cut-face equality ← M101 RED 1/15 and M103 RED 1/15; central-square distinctness ← **M45 re-run** against the fixed-square mask, RED 2/15 at 0.0 %. ⚠️ **M101 measured the thing the criterion is about**: it reds the equality gate while the two-band claim stays GREEN with all three of its counts byte-identical, so the two-band partition demonstrably cannot order M62's damage — a replaced statistic, proved replaced rather than assumed. 🔴 **And the cost is on the record**: the per-stroke contrast gate is not rebuilt (owner decision, 2026-09-02), so the 44–48 CSS px readability band has no automated cover and 12.14 rests on `ui-ux-tester` plus a hands-on pass. § The 12.19 repair. |
| 12.20 | `dist/` carries no dev-only key, symbol or prose | **PASS** | § Regression evidence. |
| 12.21 | No file over 400 lines without a `SIZE-EXEMPTION:` | **PASS** | **Six** splits taken rather than an exemption: `touchAtlasCli`, `perfRenderer`, `touch-atlas-argv`, `touch-family-builder`, `touchFamilyPolicy` and `touchPlateRows`. |
| 12.22 | Codex PLAN review converged before any code | **PASS** | `VERDICT: APPROVED`, round 4 of 5. `docs/reviews/phase-12-touch-plan.md`. |
| 12.23 | Codex IMPLEMENTATION review on the final diff | **NOT MET** | **Round 14 ran and returned `VERDICT: REVISE`** — 13 findings, nine applied and four recorded with reasons (§ Codex round 14). *Executed with an unresolved verdict is NOT MET, not UNRUN.* **Round 15 then ran on the repaired diff and returned `VERDICT: REVISE`** — 11 findings, seven applied, one recorded as a precondition on the redesign, three taken to the owner (§ Codex round 15). **Round 16 ran on the round-15 repairs and returned `VERDICT: REVISE`** — 8 findings, all applied (§ Codex round 16). **Round 17 returned `VERDICT: REVISE`** — 7 findings, all applied (§ Codex round 17). **Round 18 returned `VERDICT: REVISE`** — 7 findings, all applied (§ Codex round 18). **Round 19 returned `VERDICT: REVISE`** — 7 findings, all applied (§ Codex round 19). **Round 20 returned `VERDICT: REVISE`** — 9 findings, six applied as code and three as record (§ Codex round 20). ⚠️ **This row has now twice stopped one review short of the summary beside it** — round 16 against a summary naming 17 (round 18, finding 6), then round 18 against a summary naming 19 (round 20, finding 9). |
| 12.24 | Owner played it by touch on a real device, no keyboard | **PASS 2026-09-02 — owner** | Hands-on *(C4)*. Closed across **three** preview rounds on the owner's own phone, in fullscreen, with no keyboard in reach: 2026-09-01 (the six-item report), 2026-09-02 (the touch-control inset and the gear counter), and 2026-09-02 again (the welcome screen's audio line). Each round produced specific, reproducible defects against screens reached BY TOUCH — the level menu, the play controls, the HUD, the welcome screen — which is evidence the touch route works, not merely that it was looked at; a route that did not work could not have produced them. The owner then ruled it shipped and it is live in production. ⚠️ **The *start to finish* clause rests on the owner's word, not on a captured artifact.** No screenshot or recording of a level completed by touch is filed. That is what a `play` criterion is — see [session-mobile-polish-02-device-report.md](session-mobile-polish-02-device-report.md) for the three rounds. |

**STATUS 2026-09-02, the close-out session.** ⚠️ This line has now been wrong **twice**, both times
by lagging the table above it. It read *"one NOT MET and three UNRUN"* while the table already said
12.14 and 12.23 NOT MET (Codex round 16, finding 7), and was then left at *"Three criteria are NOT
MET and two are UNRUN"* through 2026-09-02, by which time 12.24 had passed. **A summary that
disagrees with the table above it is the failure this log's own header records**, so it is written
against the table and dated every time it moves.

**Derived from the table above, 2026-09-02 mid-session:** 12.19 PASS. **12.14 and 12.23 NOT MET;
12.13 and 12.14b UNRUN — both need the owner's phone. The phase is reported FAILING** until they move.

- **12.14 is NOT MET on its judgement half; its measurable half PASSES.** The wrench re-shoot did what it was bought to do — every
  stroke of all six faces clears 3:1 at every size in the live 44-48 band, with no exception table —
  but the `ui-ux-tester`
  briefs found that `pause` and `walk` did not say their actions at any size, and that **48 was not
  the worst reachable size**. **All three findings are now fixed in the art** — takes 7, 8 and 9, and
  a gate that sweeps the whole live `[44, 48]` band — and 12.14 stays NOT MET because those briefs
  have not run against the final bytes and their remaining findings are recorded rather than applied.
- **12.13 and 12.24 are UNRUN** — hands-on on a real phone *(C4)*, and cannot be closed from here.
- **12.23 is NOT MET, not UNRUN.** Codex rounds 14 through 20 all ran and all returned
  `VERDICT: REVISE`. *Executed with an unresolved verdict is NOT MET* — the one state rule, applied
  to the row that most tempts an exception.
- **12.8, 12.10 and 12.17 are now PASS.** The owner amended all three on 2026-08-31; no gate moved.
- **12.11 is now PASS.** The frames-served statistic was replaced with absolute paired per-frame
  deltas, red-proved in both directions (M72, M73), confirmed on a held-out full sweep, with both `performance-engineer` briefs run and every finding applied or
  recorded.

Every other row passed, several only after a repair.

### ✅ 12.17b — the criterion said five distinct SILHOUETTES, and the art has one

**Resolved 2026-08-31: the owner amended the criterion.** It now reads *"six 160x160 PNGs, alpha
present, six distinct **marks**, each bound to its own key"*. Nothing in the gate moved — it already
compared marks — and the two changed words bring the sentence to what the art has always been. The
analysis that produced the decision is kept below.

12.17 as approved reads *"five 160x160 PNGs, alpha present, five **distinct silhouettes**, each
bound to its own key"* (`docs/prd/phase-12-touch.md:114`). Two words in it no longer describe the
thing being checked, and the Codex round-7 review was right that reporting PASS against a sentence
the test does not test is the move this project forbids.

- **five → six.** The owner asked for a walk/run control on 2026-08-30, after the criterion was
  written. That half is not a reinterpretation; it is the owner's own change, and every gate,
  mutation and document already counts six.
- **silhouettes → marks.** This half is real. The adopted plate draws six buttons as one round
  brass disc with a different engraving on each, so the *outlines* are deliberately identical and
  the criterion cannot be satisfied by the art that shipped. `shipped-touch.test.ts` measures the
  MARKS instead — over the pipeline's own mark mask, **70.4 %-82.9 %** differing across all fifteen
  pairs, a copied glyph scoring 0 (M45), a copied file scoring 0 (M40). *(⚠️ This line read
  "91.4 %-96.2 %, masked to the central 50 %" until round 11; that was measured before the keyline
  and bolden passes and before the mask replaced the square.)*

**Amending the criterion to fit the art is not mine to do.** The options:

1. **Amend 12.17** to *"six 160x160 PNGs, alpha present, six distinct **marks**, each bound to its
   own key"*, which is what is built, gated and mutated today. Recommended: a shared plate with
   distinct engravings is the STYLE.md brass-and-glass idiom, and a per-button silhouette would mean
   six differently-shaped buttons, which is a different design.
2. **Hold 12.17 as written** and re-shoot the plate so each control has its own outline — another
   $0.15 take at minimum, a new cut, and every contrast and mark measurement re-founded.

Until you pick, 12.17 is **NOT MET**.

#### And two bounds I removed rather than defend

The Codex round-10 review was right that two numbers in the gates were mine and not the criteria's,
and that a test quietly requiring more than the approved rule is the STOP-and-ask CLAUDE.md § 3
names. Both are now relaxed to what the rule actually says, with the measurements kept in the tests'
prose so the drift stays visible. Say the word if you want either adopted as a real floor:

| what | was | now | measured today |
|---|---|---|---|
| mark distinctness, `shipped-touch.test.ts` | 15 % of mark pixels differing | **> 0** — the criterion says *distinct* and names no share | 70.4 %–82.9 % across all fifteen pairs |
| engraving thickening, `touch-atlas-ink.test.ts` | 1.3× dark-pixel growth | **> 1** — 12.14 asks for a readable mark, and readability is measured on the shipped bytes | ~1.78× on the fixture |

Both still catch the failures their mutations build — a mark cut from the wrong cell scores 0 (M45),
a copied face scores 0 (M40), a missing `grow` scores exactly 1.0 (M55) — and the readability claim
itself now rests on the true-size contrast gate, which is a measurement rather than a judgement.

🔴 **12.14 was recorded as “PASS for the grey-box — art UNRUN” and the Codex implementation review
was right to reject that.** A criterion about *the button art* cannot be passed by the placeholder
that stands where the art would be. The measurement is real and is kept below; the verdict is not.

### ✅ 12.10 — the prompt was right and the criterion's wording was wrong

**Resolved 2026-08-31: the owner amended the criterion** to *"the prompt appears iff any target that
would have to be hittable on this screen — the screen's own route and the play controls — falls under
44 CSS px"*, which is D1 and what the one shared predicate computes. No gate changed. The analysis
that produced the decision is kept below.

12.10 says the prompt appears **iff** a live measured target falls under 44 CSS px. On a portrait
phone at the title screen, the only live target is the full-screen title zone at **390 × 219 CSS
px** — over every floor — and the prompt appears anyway, because `rotatePromptWanted` also weighs the
five play controls, which would be 32.5 CSS px.

**That is decision D1 working as intended.** The game is unplayable in portrait; a player who taps
past the title only to meet the prompt one screen later has been told to rotate a screen too late.
And the route under the prompt has to be dead while the prompt covers it, which was the round-1
BLOCKER. Both halves come from the same predicate, and `M22`/`M31` red on either being dropped.

So the code is what D1 asks for and 12.10's *iff* is the sentence that is wrong. **Withdrawing the
behaviour to satisfy the wording would be a product regression; quietly rewording the criterion is
the move this project forbids.** NOT MET until the owner picks:

1. **Amend 12.10** to *"the prompt appears iff any target that would have to be hittable on this
   screen — the screen's own route and the play controls — falls under 44 CSS px"*. That is what
   ships, what D1 asks for, and what the shared predicate computes.
2. **Narrow the prompt to each screen's own targets**, accepting that a portrait phone reaches the
   level menu before anything says to rotate.

Recommendation: **1**.

### ✅ 12.8 — the completion zone could not satisfy the criterion as written

**Resolved 2026-08-31: the owner amended the criterion.** Containment and disjointness apply to
discrete targets; a whole-screen route zone is measured for **coverage** — no reachable strip of
canvas left unroutable — which is what both route zones already assert. No gate was weakened; the
oversized completion zone stays oversized for the reason below. The analysis is kept below.

12.8 says every live target's measured bounds *"lie fully inside the measured canvas CSS rect"*. The
five play controls, the five level-menu rows and the title zone all do, at ten viewports. The
**completion zone does not, on purpose**: `gameComplete.ts:161-168` sizes it to the view **plus 64 px
on every side**, because `GameScene`'s camera is displaced to `(-10, -8)` for shake headroom and a
shake in progress moves it further — a zone sized exactly to the view leaves a live strip of screen
along two edges that a tap falls through.

⚠️ **The first repair asserted COVERAGE instead of containment for the two full-screen zones, and
the Codex re-review was right to call that a weakening rather than a fix.** Quietly redefining what
an approved criterion measures is the same move as editing a locked hash to clear a red test. The
measurement stays — both zones are measured now, and neither leaves a reachable strip of canvas — but
the verdict is **NOT MET** until the owner decides between:

1. **Amend 12.8** so containment applies to discrete targets and whole-screen route zones are
   measured for coverage. This is what the code does and what the comment argues for.
2. **Size the completion zone to the view exactly** and accept the edge strip during a shake, or
   correct it per frame the way `helpBannerLayer.ts:174, 255` does for its own anchoring.

Recommendation: **1**. The zone is not a button a thumb has to find; it is *anywhere*, and 64 px of
overhang is the cheapest correct answer to a camera that moves.

---

## The agent gate — twelve briefs, and what they cost

Six agent-owned criteria, **two briefs each** *(A7)*, brief 1's findings withheld from brief 2. Every
finding is applied below or recorded with a reason. Nothing was silently dropped *(C11)*.

⚠️ **Every agent claim below was re-verified locally before being acted on.** *A subagent's summary is
a claim, not evidence.*

### 12.4 — the merge (`qa-expert`)

🔴 **`walkHeld: false` survived every gate in the repository.** Brief 2 built the mutation and traced
it: `npm test`, `npm run test:e2e`, `npm run build` and `verify-dist` all green. SHIFT is a shipped
control `gameDev.ts` advertises on the help banner, `walkMax / runMax` is **0.400** — a 60 % speed
change — and the mutation also makes the `walk` player state unreachable via `tick.ts`, which makes
`brass-courier/walk` dead art.

Verified locally: nothing in the repo executed `sampleHeldKeys`. The two files naming `gameInput.ts`
read it as **source text**; `input-merge.test.ts` deliberately does not import it (and says why); no
e2e spec anywhere presses Shift. **Applied** — `readHeldKeys` is now in the engine-free half with a
parametrised gate over all four fields, plus a case asserting each field reads its own list. M18 and
M18b both red.

**Recorded, not applied:**

- **`input$` is early-bound while its two siblings are providers.** Correct today, because
  `this.input$ = createSnapshot()` runs once in `create()` before the binding is built — but a future
  respawn that reassigns the field would kill touch jump and attack while touch movement kept
  working, because movement travels the late-bound path. *Reason: changing it is a design change to a
  Codex-approved binding shape, not a defect repair.*
- **`left` is never pressed in any e2e spec**; `attack` and `pause` are only tapped to assert they do
  nothing. *Reason: the chain is proved behaviourally for `right` and `jump`; two more contact specs
  are worth adding but are not what makes 12.4 true.*
- **No gate catches a TYPE-ONLY Phaser import in `src/scenes/inputMerge.ts`.** `test:sim-isolated`
  runs no `tsc`, and esbuild erases `import type` before resolution. A **value** import does red it.
  *Reason: the narrower invariant is genuinely enforced; the wider one is convention, and saying so
  is the fix.*

### 12.5 — contact identity (`qa-expert`)

🔴 **Three of the four Game-scene lifecycle registrations were unasserted.** The gate said
`toContain(SCENE_PAUSE)`. Verified locally with a repo-wide grep: `SCENE_SLEEP`, `SCENE_SHUTDOWN` and
`SCENE_DESTROY` appeared in no test outside `engine-literals.test.ts`, which pins the *string value*
and not the *subscription*. The teardown gate does not backstop it — it asserts the array reaches
length 0, and the fake's `off` is a silent no-op for a name never registered, so three registrations
and four removals still end at zero. **Applied**: an exact-set assertion. M19 reds it 2/29.

🔴 **Seven of the nine subscriptions were asserted by name only.** Only `POINTER_UP` and `BLUR` were
ever invoked by a test. Wiring the right event name to the wrong handler — the ordinary copy-paste
error in a block of five near-identical `on()` calls — passed everything. `fireGameSceneEvent`
already existed in the harness and was called by **nothing**. **Applied**: six loss paths are now
fired and observed, plus `POINTER_UP_OUTSIDE`, a different branch of Phaser's release dispatch that
had never been driven at all. M20 reds it.

**Recorded, not applied:**

- 🔴 **`GAME_OUT` drops EVERY contact, and on a pillarboxed phone a thumb drifting a few millimetres
  past the canvas edge fires it.** `InputManager.onTouchMove` runs `document.elementFromPoint` per
  finger per move and calls `setCanvasOut` when the topmost element is not the canvas — so the jump
  the *other* hand is holding is cancelled. The brief's fix is to delete the subscription, since a
  finger leaving the canvas still delivers `touchend` and `POINTER_UP` clears it per pointer. **This
  is persuasive and it is the owner's call**: `GAME_OUT` is named in criterion 12.5's own text, and
  narrowing an approved criterion is a STOP-and-ask. Flagged in place at the subscription.
- **The cancel-before-disable rationale is factually wrong about Phaser.** Three files say
  `disableInteractive()` removes the object from `_over`, *"which suppresses the later object-level
  release"*. `processUpEvents` hit-tests into `_temp`, never `_over`, and emits `POINTER_UP`
  unconditionally. The ORDER is still correct and worth keeping; the reason given for it is not the
  real one. *Reason: a prose correction across three files, recorded here so it is not lost.*
- **`POINTER_UP_OUTSIDE` is unreachable for touch.** `Pointer.touchend` sets `upElement` to the
  element the touch STARTED on, which is always the canvas. Live only for a mouse on a hybrid laptop.
- **`bind()` silently disowns a finger that is still down.** A player who held RIGHT through the exit
  starts the next level standing still until they lift and re-press. *Reason: a design decision —
  keep contacts across a rebind, or not — rather than a defect.*
- **`UIScene` tears down on SHUTDOWN only, and `Systems.destroy()` never emits SHUTDOWN.** Reachable
  only at page teardown today. *Reason: latent; the one-line `DESTROY` subscription belongs with the
  `GAME_OUT` decision above.*

### 12.9 — target size (`accessibility-tester`)

🔴 **BLOCKER, applied. The menu rows were under the floor on every real phone in landscape, with no
prompt.** Two target sets had two different thresholds — a 160 px control needs a scale of 0.275, a
128 px row needs 0.344 — and *everything* that asked "are the targets big enough" asked it about the
controls. Between those two numbers the rows were under-floor, fully interactive and unannounced.

| posture | viewport | scale | row |
|---|---|---|---|
| iPhone SE landscape, the number the spec tested | 667x375 | 0.3472 | 44.4 ✅ |
| iPhone SE landscape, **Safari's real viewport** | 540x365 | 0.3009 | **38.5 ❌** |
| Pixel 7 landscape, **Chrome's real viewport** | 892x356 | 0.3296 | **42.2 ❌** |

`page.setViewportSize()` hands the test the whole screen. A real browser keeps a URL bar, and
`index.html`'s `#game { height: 100% }` means the page never scrolls, so **that bar never collapses**
— the reduced viewport is permanent, not transient. The old margin was **0.44 CSS px, 1.0 %**.

**Applied, both halves.** `TOUCH_MENU_ROW_H_PX` is now `TOUCH_BOX_PX`, so the two target sets share
one threshold by construction and the blind band cannot exist; the band's margins pay for it — five
rows at 160 plus four gaps at 32 is 928 of the 930 that 90 and 60 leave. And `attachTapRoutes` runs
`rotatePromptWanted` — which weighs its own targets **as well as** the play controls. Three
chrome-reduced viewports are now in the matrix.

⚠️ **An earlier version of this paragraph claimed the 200 % browser-zoom title case was repaired by
gating on the route's own targets alone. It was not, and the claim is withdrawn.** That version
re-opened the tap-through the round-1 BLOCKER named; the two-term predicate is what shipped, and it
still blocks a large title zone whenever the play controls would be too small. That is deliberate
— see § 12.10 — but it is not what the sentence said.

Also applied: the locked-row ink (**2.64:1** at 11.8 CSS px — and four of five rows are locked on
first launch, with the word `locked`, the only thing explaining why a tap does nothing, in the ink
the player cannot read), and the hint line (7.6 CSS px, naming UP / DOWN / ENTER to a reader with no
keyboard).

**Recorded, not applied:**

- 🔴 **WCAG 1.3.4 Orientation (AA): the rotate prompt has no override.** A user with rotation lock on,
  a mounted device, or who simply cannot rotate, has no path into the game. 1.3.4 permits a single
  orientation only where it is **essential**, and that determination has to be *made and recorded*.
  **This log is that record**: a 160 px control is **32.5 CSS px** at 390x844, the canvas is 219 px
  tall, and no button size fixes it — a thumb-sized control would eat a third of the visible game. The
  claim is that landscape is essential for this game. It is the owner's to accept or reject.
- **Split-screen and Slide Over are landscape and still say "rotate your device".** iPad 1/3 Split
  View is 375x834 at scale 0.195; the remedy is to resize the window, which the copy never mentions.
  *Reason: real, a one-line copy branch, and outside the phone/tablet postures the phase scoped.*
- **Four constants are shared between production and the assertion** — `TOUCH_MIN_CSS_PX`,
  `TOUCH_MIN_GAP_CSS_PX`, `GAME_WIDTH`, `GAME_HEIGHT`. The measurement itself is genuinely
  non-circular (bounds off the live display list, denominator off `getBoundingClientRect`), but
  editing `44` to `20` would make production and the gate permissive together. *Reason: this wants a
  prose-pin like `tuning-prose.test.ts`, not an invention at the end of a gate.*
- **`measuredTargets` assumes origin (0,0) and unit scale rather than reading `getBounds()`.** True
  today because every zone sets it; the criterion's own word is "bounds".
- **The gap floor is unreachable in production.** It turns over at scale 0.250, always below the size
  floor of 0.275, so `touchTargetsFit`'s second loop can never be the failing term for the shipped
  layout. Asserted, never binding.
- **Android's 48 dp guideline is stricter than the cited 44 px**, and `Pixel 7 landscape` is in the
  matrix. At the new 160 px row height every in-scope Android posture clears 48 dp.
- **`TOUCH_EDGE_PX` is 22.2 CSS px, inside the iOS home-indicator and Android gesture-nav strip.**
  Untested and unrecorded until now. *Reason: needs a real device — it is 12.13's and 12.24's.*

### 12.11 — the frame budget (`performance-engineer`)

✅ **The replacement is BUILT and green in both directions, 2026-08-31.** What follows first is the
analysis that condemned the original statistic — kept, because it is the reasoning the replacement
rests on — and then what replaced it and the three corrections the runs forced.

🔴 **The original statistic was NOT MET, and the reason is the statistic.** Both briefs reached it
independently.

At 240 Hz the frame period is 4.1667 ms. A frame either makes its deadline or costs a whole period,
so served rate is `R / (1 + p)` and red at 0.9 needs **p ≥ 11.1 %**. A *constant* per-frame cost —
which is exactly what extra display-list entries are — never produces a partial `p`: below the
headroom the ratio is **1.000**, above it **0.500**, and nothing lands between. The 10 % bound is
therefore never load-bearing; 0.60, 0.75 and 0.95 would all behave identically.

| substrate | frame budget | 2.7 ms is | the gate says |
|---|---|---|---|
| this box, 240 Hz RTX 4080 | 4.167 ms | 65 % of it | 100.0 % |
| the owner's 60 Hz laptop | 16.667 ms | 16 % of it | 100.0 % |
| a mid-range phone | 16.667 ms | a drop to ~30 fps | 100.0 % |

That is *owner plays on 60 Hz, dev box is 240* in its exact recorded form. **The mutation matrix has
no row that injects a per-frame cost and watches this bound go red, and on this analysis none could.**

**Applied** — three real defects in the surrounding gate, each verified locally:

- `assertRealGpu` had **two sentinels that both passed**: `'no-webgl-context'` (Phaser fell back to
  the CPU Canvas renderer, the exact case the helper exists to refuse) and
  `'no-debug-renderer-info'`. Neither contains any of the four software-renderer substrings.
- The precondition asserted **zones, not faces**. A `Zone` renders nothing, so deleting the
  `setVisible(wanted)` loop leaves five interactive zones, a passing precondition, and an arm drawing
  zero extra pixels — the criterion's own named failure mode passing its own guard.
- The ratio had **no absolute floor**. Halve the frame rate in both arms and it stays 1.0. This is
  Phase 7's G32 finding: `audioCues` left in both arms moved each median 2 ms and the delta stayed
  0.000.

**The replacement is named, not invented**: `tests/e2e/gpuTimer.ts`'s `installGpuTimer` with a paired
**absolute** per-frame delta in milliseconds against a 16.667 ms budget — the shape of
`phase-08-gpu-delta.spec.ts`, which was red-proved on a held-out set. Not built this session, because
choosing its bound needs a selection set and a held-out set and neither exists yet.

**Recorded:** the two arms **share a GPU** — both contexts stay alive and rendering, and Playwright
ships `--disable-backgrounding-occluded-windows` — so system load is `2·base + C` in both samples and
a GPU-bound cost divides out exactly. The arms are interleaved but **not counterbalanced**: window
z-order and focus are fixed and perfectly correlated with arm. And the controls **ship only to touch
devices**, so this gate runs on the one platform the feature is absent from; there is no mobile
timing evidence anywhere in this repo.

#### ✅ What replaced it, and the three things the runs corrected

The criterion-bearing statistics are now **absolute paired per-frame deltas in milliseconds**, GPU
and main thread, in `tests/e2e/touchPerf.ts`, fixed as a policy before any selection run:
`MAX_TOUCH_GPU_DELTA_MS` and `MAX_TOUCH_CPU_DELTA_MS` at **0.5** (3 % of the 60 Hz budget, and the
figure Phase 8 fixed for `MAX_LEVEL_GPU_DELTA_MS`), `MAX_TOUCH_ARM_GPU_MS` and
`MAX_TOUCH_ARM_CPU_MS` at **8** as absolute per-arm ceilings a delta structurally cannot give.
`sampleArm` stops the idle page's game loop and **asserts its tick frozen** across the window, so the
shared-GPU cancellation is observed rather than commanded. The frames-served ratio and the baseline
floor are kept, not swapped out.

**Three corrections, none of which reading the code would have produced:**

| # | what a run showed | the fix |
|---|---|---|
| 1 | every GPU pair NEGATIVE — the touch arm cheaper than the bare one, backwards for an arm drawing six extra faces | `helpLine()` prints ~130 glyphs of 44 px bold text on a keyboard device and ~35 on a touch one. *An A/B toggle bounds only what differs between the arms*, and a genuine +0.5 ms regression would have landed at +0.35 ms and passed. `hideTexts` equalises it — and the first version swept only `UI` while `gameHud.ts:79` builds the banner against **`Game`**, which moved the median -0.119 → -0.107 and was the tell |
| 2 | the red proof could not go red | 40 copies per control moved the delta **0.0563 ms** against a 0.5 ms bound. 800 read 0.706 ms isolated and **0.5007 ms** inside the full sweep — a coin flip, not a proof. **2000**: 1.795 ms, every pair over 1.35 |
| 3 | the held-out sweep FALSE-REDDED the per-pair CPU bound | one pair read exactly **-0.5000 ms** (failing on float dust, `0.5000000238414941`) while the median of the same four read -0.1000. `workMedianMs` is a median over Chrome's 0.1 ms `performance.now()` grid of a quantity that is itself 0.8-0.9 ms, so ±0.5 per pair is ±5 quanta of nine. The criterion-bearing claim moved to the median, and the main thread is **`median-only`** — GPU stays `median-and-pairs`, whose per-pair spread is ±0.2 against a 0.5 bound. ⚠️ The per-pair check first became `MAX_TOUCH_CPU_PAIR_MS = 2`, a "collapse guard" that **could not detect a collapse**: the arms measure 0.8-0.9 ms, so an arm falling to zero yields ~0.9 ms and passes comfortably. It is gone, replaced by `MIN_TOUCH_ARM_CPU_MS`, an absolute floor on each arm's own median — red-proved by **M75** |

#### 🔴 What the gate can actually resolve, measured rather than assumed

After `hideTexts`, both arms' display lists were dumped and diffed: they differ by **exactly the six
control faces**, 160 × 160 at alpha 0.85, plus three objects already invisible. Nothing else. Six
such faces are ~0.5 % of a 1920 × 1080 frame, and M72 measures 4800 of them at 0.706 ms, so **the
whole feature costs on the order of 0.001 ms** against a ±0.2 ms per-pair noise floor between two
browser contexts. The residual -0.06 to -0.18 ms offset is a context-identity artefact and does not
shrink when more is equalised.

So the gate does **not** claim the controls cost under 0.5 ms — that is true by three orders of
magnitude and needs no gate. It claims no **absolute** half-millisecond regression has appeared on
the touch arm: a filter, a per-frame re-render, a full-screen overdraw, a `refresh()` moved into
`update()`. That is the class of defect 12.11 is about, and it is now written into the spec header
rather than implied.

#### The `performance-engineer` briefs, round 2 *(A7)*

Two briefs, brief 1's findings withheld from brief 2.

**Brief 1 — checklist. Four findings, all applied:**

1. 🔴 **`MAX_TOUCH_CPU_DELTA_MS` had never been watched failing.** The GPU red proof amplifies fill
   rate and asserts only `gpuDelta`; nothing drove the main-thread delta across its bound, so the
   statistic called criterion-bearing rested on prose. *A gate that cannot go red is decoration* —
   and this phase had already shipped that shape twice, at 40 face copies and at a per-pair CPU band
   its own noise saturated. **Applied: M73**, `phase-12-perf-cpu-delta.spec.ts`, which runs the
   controls' **own** `TouchSession.refresh()` `REFRESH_COPIES` extra times per frame. That is the
   exact regression `touchPerf.ts` names, not a busy loop — a stand-in proves the timer sees
   wall-clock work, the mistake Phase 8 paid for with 240 scrims.
2. 🔴 **No absolute ceiling on either arm's own main-thread median** — the CPU twin of
   `MAX_TOUCH_ARM_GPU_MS`, missing. A cost added to *both* arms divides out of a delta (Phase 7's
   G32). **Applied: `MAX_TOUCH_ARM_CPU_MS = 8`**, the figure `perfBudget.ts:179` fixed for
   `MAX_FLEET_WORK_MS` for the same job.
3. **This § was stale** — it still read NOT MET and described the replacement as unbuilt. **Applied**
   (this rewrite).
4. **The spec header said the controls are "ten DRAWN objects"** while the same file's measured
   display-list diff says six. **Applied.**

Brief 1 also recorded, as sound: the M72 proof runs the identical instrument rather than a cheaper
one; the bounds are pre-registered; the isolation is observed and not merely commanded; every
precondition is asserted per arm per pair; the routing is pinned by name; AB/BA is correct for an
even `PAIRS`.

### 12.14 — readability (`ui-ux-tester`)

#### ✅ The re-shoot, and the five corrections that preceded it

**Every figure this row has ever carried was wrong until the one it carries now, and review caught
all five.** Kept because the sequence is the lesson, not the number:

| round | the claim | why it was false |
|---|---|---|
| 8 | 3.47:1 over the WHOLE FACE | `walk` passed on a decorative highlight while its own bars measured **1.12:1** |
| 9 | 3.64:1 on the mark | measured on 160 px SOURCE TEXELS; at the 48 CSS px the smallest viewport presents, the 1 px keyline averaged away and the marks fell to **1.63–2.85:1** |
| 10 | — | the gate rolled its OWN box filter, partitioning the source differently from `resize.mjs`; it measures through the shared `downscale` now |
| 11 | 3.32:1 | the mark mask was discovered from the SHIPPED file, so erasing the engraving and leaving two ink cells standing shrank the mask with the damage and still scored 3.09:1. It comes from the committed cut face now (M60 red 3/8) |
| 13 | 3.32:1 for every stroke | the strokes were labelled on the FINISHED mask, so the halo merged the strokes it was meant to separate. Splitting by pre-halo seeds isolated four fragments of `attack`'s shading, the smallest at **2.86:1** (M67 red 1/1) |

Round 13's split is what found a shortfall in the **art** rather than in a gate, and the owner chose
the re-shoot over accepting it. The cause was the prompt — the plate asks for a glyph *"deeply cut
and filled with dark shadow"*, and that shading is what fragments. Take 4 asked for a flat glyph and
got a **hollow outlined** wrench: nine strokes, five under 3:1, the worst a two-cell fragment at
**1.008:1**. Take 5 states the fill positively and produces **three** strokes, all at 3.318:1 /
3.846:1. `docs/generations/phase-12-touch-plate.md` carries both `request_id`s and the full request
contract; $0.75 of the $5 touch-UI ceiling.

⚠️ **`KNOWN_SHORTFALL` was deleted BEFORE the candidate was adopted.** Its 2.8 floor would otherwise
have let a 2.81 candidate pass the very gate that exists to decide whether the re-shoot worked.

⚠️ **And the candidate was judged by the REAL battery, not a staged copy of part of it.** The plan
called for a re-implemented validator against a temp directory; `shipped-touch.test.ts` enforces the
two-sided alpha band, exact ink reproduction and six-way distinctness besides the contrast sweep, and
a re-implemented subset would have validated the candidate against a different claim. The candidate
was adopted into a committed tree and run through the whole suite, with `git checkout` as an exact
rollback. **Exactly two files changed**; the other five faces are byte-identical, and `--adopt` still
reproduces all six byte for byte because `TOUCH_CELL_SOURCES` records the new source.

#### 🔴 The `ui-ux-tester` briefs, and why 12.14 is still NOT MET *(A7)*

Two briefs on the re-shot faces, brief 1's findings withheld from brief 2. **They disagreed on the
first question, and the disagreement was resolved by looking**, not by preferring a brief: brief 1
called the new wrench a clean family match; brief 2 called it visibly bolder. Brief 2 is right —
`touch-jump` and `touch-pause` draw **hollow outlined** glyphs with a cream interior, and
`touch-attack` now draws a **solid filled** silhouette. *A subagent's summary is a claim, not
evidence*, and that applies to the agreeable one too.

**Verdict: 12.14 remains NOT MET.** Contrast is green and unconditional; readability is not.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **`pause` draws a cog and `walk` draws two stacked bars.** A cog is the universal glyph for *settings*; two bars evoke nothing about locomotion. Neither says its action at any size, so this is not a size problem contrast could ever have caught. **Both briefs found this independently** | **RECORDED, owner decision.** Two more single-cell re-shoots, $0.30, taking the touch-UI figure to $1.05 of $5. Outside the wrench-only scope authorised on 2026-08-31 |
| 2 | 🔴 **The gate measures 48 CSS px; controls go live at 44.** `TRUE_SIZE_PX` is `160 × 325 / 1080 = 48`, from two real-browser measurements, but `touchTargetsFit` shows and enables a control down to `TOUCH_MIN_CSS_PX = 44` and the hit box IS the face box (`touchLayout.ts:156`). The 44-48 px band is reachable and has never been measured — and round 9 recorded contrast falling from 3.32:1 to 1.63-2.85:1 over a few output pixels | 🔴 **MEASURED, and it FAILS. See below.** |
| 3 | The re-shot wrench is a **solid fill** where the other five are **outlines** — the direct consequence of `FLAT_GLYPH`, and nothing gates stroke weight across the set | **RECORDED, owner decision.** At 48 px a filled shape reads *better* than an outline, so this trades set coherence for legibility. Verified by eye on the shipped bytes |
| 4 | `left` and `right` are mirror-image triangles a thumb-width apart — the only pair distinguished by orientation alone | **RECORDED, not fixed.** Position disambiguates them (bottom-left pair) and no brief called it a blocker |
| 5 | The sweep is over a **flat** grey ramp, per 1.4.11's own solid-colour model, while STYLE.md mandates dense dithered detail behind every plate, and M21 found 175/878 sampled positions with a hazard, enemy or goal under a control | **RECORDED.** WCAG's model is flat; a per-pixel-noise statistic is not defined by the standard being cited |
| 6 | The box-filter proxy's error probably runs **optimistic**: production hands a >3× downscale of the whole canvas to the browser at `image-rendering: auto`, which some mobile GPUs do more cheaply than a box average, and the pale keyline halo carrying most of the measured contrast is what would alias away | **RECORDED, and the label sharpened.** The proxy label already existed; what it did not say is which direction the error runs |

⚠️ **Findings 1, 3 and 6 are recorded rather than applied, and each needs an owner call, not a
patch.** Findings 4 and 5 are recorded as accepted. Finding 2 was measured rather than argued.

##### 🔴 Finding 2, measured: at the real live floor the art does NOT clear 3:1

`TRUE_SIZE_PX` was set to **44** and the shipped battery re-run against the shipped bytes:

```
AssertionError: stroke 1 of touch-pause at alpha 0.85 reaches only 2.91:1 at 44 CSS px
```

So the gate's 48 px figure is not the worst reachable case, and at the worst reachable case one
stroke of `touch-pause` is **2.91:1** against 1.4.11's 3:1. The 48 comes from `160 × 325 / 1080`,
iPhone SE landscape as Safari gives it; `touchTargetsFit` shows and enables a control down to
`TOUCH_MIN_CSS_PX = 44`, and the hit box **is** the face box (`touchLayout.ts:156`), so any browser
whose chrome is taller than Safari's — none of which has been surveyed — lands in a live band the
contrast gate has never measured.

⚠️ **The probe was run on a committed tree and reverted with `git checkout`; `TRUE_SIZE_PX` is
unchanged in the shipped test.** Nothing here was greened by moving a number.

**Three options, and this is an owner call because two of them change shipped behaviour:**

| | what it does | cost |
|---|---|---|
| **A — raise `TOUCH_MIN_CSS_PX` to 48** *(recommended)* | no control is ever live below 48, so the gate's existing measurement becomes the worst case and the criterion's sentence becomes true as written. Still ≥ 44, so **12.9 is unaffected**, and 48 is Android's own dp guideline, which this log already records as stricter than the 44 cited | a device between 44 and 48 CSS px gets the rotate prompt instead of controls it can barely hit — which is what the prompt is for |
| **B — re-shoot `touch-pause` for a heavier mark** | fixes the art rather than the threshold, and would fold into the `pause`-glyph re-shoot finding 1 already asks for | $0.15, and it fixes one face while leaving the band unmeasured for the other five |
| **C — measure at 44 and record the shortfall** | most honest about what is known | leaves a WCAG 1.4.11 failure shipping, and re-introduces the exception table that was just deleted |

Until one is taken, **12.14 is NOT MET on the measurable half as well as the judgement half.**


#### 🔴 The `ui-ux-tester` briefs, ROUND 2 — and the finding that reddened a green gate

Two more briefs *(A7)* against takes 5-7, brief 1's findings withheld from brief 2. Both reached the
pause finding independently, and brief 2 found something no one had looked for.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **The pause bars were the universal mark for "this suspends play", and the button does not.** `touchControlsLayer.ts:381` routes it to `openLevelSelect()` — a hard scene teardown that abandons the run, no confirmation, no checkpoint. *Both briefs, independently.* The cogwheel was vaguely wrong; the bars were **confidently** wrong, which is worse | **APPLIED, owner decision.** Take 9: a 2 x 2 grid of squares, which says *the level menu* — where the button actually goes |
| 2 | 🔴 **`downscale` is not monotonic in output size, so pinning one size proved one point of a band.** Destination cells are `Math.floor`-partitioned (`resize.mjs:44-49`), so at `160/44 = 3.636` some cells average three source pixels and some four, and that alias pattern shifts between adjacent target sizes | **APPLIED, and it reddened the gate on its first run.** Swept, `touch-attack` stroke 2 read **2.740:1 at 47 CSS px** between two sizes that both read 3.318:1. `LIVE_SIZES_PX = [44..48]`, worst taken |
| 3 | `TRUE_SIZE_PX = TOUCH_MIN_CSS_PX` means a future lowering of the production floor silently re-founds the contrast claim at a smaller, unreviewed size | **RECORDED, not applied.** *Reason: this wants a prose-pin like `tuning-prose.test.ts`, which is the same repair § 12.9's four-shared-constants finding is already waiting on — one pin for both, not two inventions* |
| 4 | The set is mixed solid-fill and outline, and the heaviest mark is now on the most consequential button | **RECORDED, owner decision.** Widened from the `attack`-only note |
| 5 | A boot names *feet*, not a walk/run **toggle** | **RECORDED.** *Reason: no conventional glyph distinguishes a gait toggle from locomotion; the lit/unlit plate carries the state* |
| 6 | Pressed feedback is alpha-only and happens under the thumb | **RECORDED.** *Reason: a cue outside the box bounds is a layout change, not an art one* |

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

---
## The mutation matrix

Every row applied, verified applied by *"content changed AND the original count dropped by one"*,
gated, reverted, and the revert verified. The per-row outcomes are tabulated in
[`docs/prd/phase-12-touch.md` § 6](../prd/phase-12-touch.md#6-qa-gate); what follows is what the run
cost and what it found.

### The 12.19 repair, 2026-09-02

**What was open.** Thirteen rows — M46, M47, M55-M57, M60-M63, M65, M68, M69, M74 — each reddened a
gate that commit `949abb1` deleted with the ink pass (`tools/gen/touchInk.mjs`,
`shipped-touch-contrast.test.ts`, `touch-atlas-ink.test.ts`, `touch-strokes.test.ts`, and the two
ink-derived assertions in `shipped-touch.test.ts`). Three gates replaced them and **none of the
three had ever been watched failing.**

**The triage rule, decided before any mutation was built.** One question per row: *does the code the
row edits still exist, and does a live gate still claim its property?* Not *which mutation is easy to
build against something* — that is how the first 22 green rows happened, and the handoff says so in
as many words. The answer sorts every row into rebuilt or retired, and nothing else.

**Rebuilt — five, all red.**

| new | from | what it does | measured |
|---|---|---|---|
| **M99** | M46 | all six faces flat at one alpha, keyed field included | RED 2/15; `clear` **5314 → 0** on every face |
| **M100** | M61 | every non-mark pixel of `pause` to alpha 1 | RED 2/15; **19 191** pixels, `clear` **5281 → 0** |
| **M101** | M62 | 2 014 pixels outside `left`'s mark, dark and opaque | RED 1/15 — equality only; **two-band GREEN, counts byte-identical** |
| **M103** | M60 | `walk`'s mark erased to plate brass, two 4×4 ink cells kept | RED 1/15; **6 367** pixels |
| **M104** | M47 | the face drawn at `PLATE_ALPHA * PLATE_ALPHA` | RED 1/40 |

and **M45 re-run** against the fixed-central-square mask that replaced `keylineMarks`: `touch-walk`'s
central square copied onto `touch-left`, **RED 2/15 at 0.0 %**. A row does not carry over a redesign
of the gate it names; it is re-measured or it is decoration.

**Retired — eight.** M55, M56, M57, M63, M65, M68, M69, M74. The code each one edits is deleted, so
they are **unbuildable, not green**, and that distinction is the whole reason they can be retired
where M82 had to be: a row reporting `GREEN 0/n` contradicts the criterion; a row naming an edit to a
file that does not exist reports nothing at all. Each row states which deleted gate it reddened.

🔴 **M101 is the measurement, not the mutation, that mattered.** It reds byte-for-byte cut-face
equality and leaves the two-band alpha claim GREEN — with all three of its counts *byte-identical*
(5314 clear / 19 873 solid / 413 partial). So the two-band partition **provably cannot order M62's
damage**, which is the §5 rule's case exactly: a statistic that does not order its own mutation is
replaced, never re-bounded. The replacement had already been made when the ink pass went; M101 is the
evidence it was the right one rather than an assertion that it was.

🔴 **M102 went GREEN and is recorded as a probe, not a hole.** Raising every non-transparent
pixel to full alpha in the six shipped faces *and* the six committed cuts together — a pipeline
change faithfully re-cut, which is M63's mutation as the current build can express it — passes all
15. That is the designed split: `PLATE_ALPHA_BAKED` is deleted, the bytes ship unfaded, and the fade
is a draw-time value whose gate is the one **M104** reds. The property moved; it did not vanish. What
remains uncovered is M64's already-stated limit of a committed oracle — a builder change that is
faithfully re-cut moves both files together — and the independent statement against it is the pinned
key/row/col literal in `shipped-touch.test.ts`. Same call as M82: a probe that found the code it
aimed at was gone.

🔴 **What the retirement costs, said plainly.** The per-stroke contrast statistic is not being
rebuilt — owner decision, 2026-09-02, because inventing a statistic after seeing the art it will
judge is the post-data selection this phase kept catching. M74 is the row that used to sweep the live
44–48 CSS px band. With it retired, **the readability of the six glyphs across that band has no
automated cover at all.** 12.14 rests on `ui-ux-tester` and a hands-on pass, which is what that
criterion always required and never had.

**How the runs were driven.** From the shell, never from a Node parent. Each run reported
`suites / tests / passed / failed` positively from the JSON reporter, with a zero-test run called out
explicitly rather than read as a pass — the lowercase-drive-letter defect below is why. Byte
mutations were verified applied by *"content changed"* (a SHA-256 over all twelve PNGs, plus
`git status` naming the modified files) **and** by the named pixel statistic moving; reverted with
`git checkout --`, and the revert confirmed by the tree hash returning to its original value with
`git status` reporting the files clean. M104, a source edit, used the occurrence count directly:
applied when `face.setAlpha(PLATE_ALPHA);` dropped **1 → 0** with the file changed, reverted when it
returned to **1**.

### The row count

⚠️ **This log and `HANDOFF.md` both said the matrix carried 92 rows. It carried 103, and now carries
109.** 93 of the original ids were plain numeric, which is the likely source of the off-by-one; the
rest is simply a figure nobody re-derived. `M52`, `M82`, `M95` and `M96` are absent — **`M82` is
retired and must not be reused** — and the tail is not id-sorted (`M79` before `M78`, `M94` after
`M98`). A criterion whose content is *"every row reds at least one named gate"* cannot be checked
against a count of the rows that is wrong, which is why this is recorded rather than quietly fixed.

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

---

## Regression evidence

| gate | result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **205 files, 2979 tests, 0 failed** (2923 before this phase's gate repairs) |
| `npm run test:sim-isolated` | **203 files, 2969 tests, 0 failed** with Phaser uninstalled — 2956 passed, 13 skipped, measured before the round-8 repairs added two files. Same file and test COUNT as the normal run, which is what makes the skips a deliberate arm and not a silent deselection. |
| e2e | **215 passed, 0 failed**, across all six projects, run one group at a time with nothing beside them: `chromium` + `chromium-gpu` + `chromium-dpr2` **180** (24.6 min), then `chromium-touch` + `chromium-touch-gpu` + `chromium-prod` **35** (5.2 min). Split because a single `npm run test:e2e` exceeds the shell's one-hour ceiling on this box — a timeout, never a failure, and the project counts add to the whole. ⚠️ The run before the Codex repairs landed reported three failures: the new title-zone test (a real defect — it waited on `__game.sceneKey === 'Title'`, and the title plate is a PARALLEL scene, so that read never changes), plus `phase-06-perf` and `phase-10-production`, neither of which reproduced once the box was not also running a timing-out spec. Recorded rather than dropped. |
| e2e, final pass | **216 passed** across the six projects after the round-13 changes, run in groups one at a time: `chromium` **104**, `chromium-touch` + `chromium-touch-gpu` **30**, `chromium-gpu` **69**, `chromium-dpr2` + `chromium-prod` **13**. ⚠️ `phase-06-perf`'s HUD GPU delta failed **once more** on the round-13 sweep — 0.2417 ms against the 0.2 ms bound, ratio 2.257× — and passed **2/2 alone** immediately after, which is the fourth instance of the same shape and changes nothing about the reading below. Earlier full pass, before round 13: **215**, in three groups: `chromium` + `chromium-touch` **133**, `chromium-gpu` **68 + 1**, `chromium-dpr2` + `chromium-touch-gpu` + `chromium-prod` **14**. ⚠️ **Three specs failed once each across the phase's final runs and passed alone every time**, and all three are wall-clock perf gates: `phase-06-perf`'s HUD GPU delta (1.039 ms against a 0.2 ms bound) when two headed GPU projects shared one invocation; `session-help-banner`'s "captures the placement at every supported size" (a 30 s timeout) in a combined run, then 4/4 alone; and `phase-05-perf`'s 20-enemy bound, then 1/1 alone **twice**. Recorded rather than dropped. The reading is the one §5 already states — *"only one Playwright run at a time, and nothing heavy beside it"*, because a wall-clock-bounded spec reads a busy box as a broken game. It is not proof the specs are sound: a perf gate that fails under load and passes alone is a gate whose bound is close to this machine's noise, which is the standing 12.11 finding in another file. |
| `npm run build` | `dev-seam gate ok: 28 sentinel-marked DEV bodies folded out`; `verify-dist ok: 5 level(s) and 12 audio file(s) shipped byte-identical, no DEV-only scene key or debug surface` |
| 400-line sweep | nothing over 400 across `src/**/*.ts`, `tools/**/*.mjs`, `tests/**/*.ts`, root `*.config.ts`. Largest: `tools/gen/levelBuilder.mjs`, `tests/unit/audio-cue-edges.test.ts`, `tests/e2e/phase-01-boot.spec.ts` and `tests/e2e/effectBudget.ts` at exactly 400; `src/scenes/GameScene.ts` 399. Four splits were taken this phase rather than an exemption — `touchMarks.ts`, `touchTypes.ts`, `touchSceneObjects.ts` and `touch-plate-ink.test.ts`. |

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
