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

## This log, split into parts

**This log reached 1603 lines.** On 2026-09-03 it was split into four flat siblings, per
CLAUDE.md §6: `docs/qa/` splits into **flat siblings**, never a subdirectory, because
`tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively.

The criterion table, the regression evidence and the vault-out stayed here. `docs-contract.test.ts`
slices this file between the phase heading and the vault-out heading and reads the criterion rows
out of that slice, so neither heading is free to move — and this paragraph deliberately does not
quote either one verbatim, because `between()` takes the FIRST match of its start marker.

| Part | What is in it |
|---|---|
| [02 — the agent gate](phase-12-touch-02-agent-gate.md) | twelve briefs: 12.4's merge · 12.5's contact identity · 12.9's target size · 12.11's frame budget · 12.14's readability |
| [03 — the rotate overlay and the device pass](phase-12-touch-03-rotate-and-device.md) | the rotate overlay's three causes and two repairs written from arithmetic · 12.16's draw path · the close-out regression · the merge and deploy · the owner's device trip (12.13, 12.14, 12.14b) |
| [04 — the mutation matrix](phase-12-touch-04-mutation-matrix.md) | every row of the matrix, the `chromium-touch` geometry flake, and the 12.19 repair |
| [05 — the mutation matrix, continued](phase-12-touch-05-mutation-matrix-2.md) | the pinch and double-tap zoom neither of which can go red on Chromium · the round-13 repair that never landed · the single-cell re-shoot · the rows the two Codex reviews added |

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
| 12.13 | A drag is not stolen by browser pan / pinch / zoom | **PASS 2026-09-03 — owner, on the device; the machine half is pinned and one real defect fell out of building it** | 🔴 **Closed on the owner's own device, 2026-09-03, against the branch preview `steampunk-platformer-q68tkwhdn`** — the four gestures, the six glyphs and the two hazard plates run as one trip per § the device pass. The owner's report, verbatim and in full: *"I played and it worked as expected."* ⚠️ **That is one sentence covering three criteria, where § the device pass asks for pass or fail in the owner's words for each**, and it is recorded as what it is rather than expanded into per-check detail nobody supplied. It is a PASS on the owner's authority — the strongest evidence this project accepts *(C4)* and the only evidence that exists for any of these three — and it is thinner than the three preview rounds that closed 12.24, each of which returned specific defects. The four gestures include the one with a real defect behind it: `INPUT_GAME_OUT` was deleted this session because a thumb rolling past the canvas edge dropped the jump the other hand was holding, and check 2 is that repair's only confirmation on hardware. It is also the only test `TOUCH_EDGE_PX` = **22.2 CSS px** has ever had — it sits inside the iOS home-indicator and Android gesture strips, and nothing but a phone could say whether the OS claims that drag first.  Preview deployed 2026-08-31 and 2026-09-01 and run on the owner's phone. **The same two findings were reported twice**, because the first repair to each was written from arithmetic and shipped without a reproduction. *(See § the rotate overlay for the full account.)* The overlay is DOM now, not Phaser objects, and both defects have e2e reproductions in `phase-12-viewport.spec.ts` that were watched red. ⚠️ **The gesture checks themselves — drag off the edge, pinch, double-tap — had never been run.** 2026-09-02: the machine half is now pinned in three places — `tests/unit/gesture-prevention.test.ts` (the source CSS, M105/M106 red), `verify-dist.mjs` (the same rules in `dist/index.html`, M105/M106 red) and `tests/e2e/phase-12-gestures.spec.ts` (five cases: `defaultPrevented` on every `touchmove`, the contact surviving the canvas edge, a drag off the button and back, and — **with their zoom halves explicitly NOT counted, because synthetic touches do not drive native gesture recognition** — a two-finger pinch and a double tap). 🔴 **The edge-drag case found a real defect and it is fixed** — see § 12.13, the GAME_OUT contact drop. **The criterion still needs the device**, which is what `play` means. |
| 12.14 | The button art is readable at true size at every integer CSS size in the 44-48 px live band *(amended 2026-08-31, owner decision)* | **PASS 2026-09-03 — agent half MET 2026-09-02, owner half on the device** | 🔴 **Closed on the owner's own device, 2026-09-03, against the branch preview `steampunk-platformer-q68tkwhdn`** — the four gestures, the six glyphs and the two hazard plates run as one trip per § the device pass. The owner's report, verbatim and in full: *"I played and it worked as expected."* ⚠️ **That is one sentence covering three criteria, where § the device pass asks for pass or fail in the owner's words for each**, and it is recorded as what it is rather than expanded into per-check detail nobody supplied. It is a PASS on the owner's authority — the strongest evidence this project accepts *(C4)* and the only evidence that exists for any of these three — and it is thinner than the three preview rounds that closed 12.24, each of which returned specific defects. 🔴 **This criterion has no automated cover at all and is not getting any**: the per-stroke contrast gate was deleted rather than failing (the 2026-08-31 redesign put verdigris in every recess, so the ink mask stopped being the mark and read 12–37 "strokes" per face where six had 1–4), and rebuilding a statistic after seeing the art it would judge is the post-data selection this phase kept catching. Owner decision, 2026-09-02. So the evidence is exactly two things: both `ui-ux-tester` briefs at 44–48 CSS px on Chromium **and** WebKit, resting and pressed, and the sentence above.  🔴 **The whole plate was redesigned on 2026-08-31 by owner decision** — *"new designs for all the buttons, in the style of the gate asset"* — so all six faces are take 14's cells and the three single-cell re-shoots this row used to describe ship nothing. **The per-stroke contrast gate is DELETED, not failing.** It found the glyph with `luma < INK_DARK_MAX` inside the central half, which held while the button was a pale disc whose glyph was the only dark thing on it; the redesign puts verdigris in every recess and shadow along the lower-right, so the detector reads **12 to 37 "strokes" per face** where the six used to have 1 to 4. Its figures were not low, they were meaningless — the mask is no longer the mark. Owner decision, taken on the measurement: report the criterion NOT MET rather than rebuild the statistic after seeing the art it would judge, which is the post-data selection this phase kept catching. ⚠️ **So there is NO automated evidence for 12.14 at all**, and the criterion rests entirely on judgement — which is what it always required and, until 2026-09-02, had never had. **Both briefs have now run against these bytes** *(A7, brief 1's findings withheld from brief 2)*, and four of brief 2's eight findings were closed by measurement rather than argued away — see § 12.14, the two briefs. What is left is the owner's own eyes on their own phone. Screenshot at 540 x 365: `docs/evidence/phase-12-touch-art.png`. **Seven earlier versions of this row were wrong and every one was caught by review** — see § 12.14's history. |
| 12.14b | The occlusion bound is WITHDRAWN; a hands-on hazard pass replaces it *(2026-09-01, owner decision)* | **PASS 2026-09-03 — owner, on the device. `PLATE_ALPHA` stays at 0.9** | 🔴 **Closed on the owner's own device, 2026-09-03, against the branch preview `steampunk-platformer-q68tkwhdn`** — the four gestures, the six glyphs and the two hazard plates run as one trip per § the device pass. The owner's report, verbatim and in full: *"I played and it worked as expected."* ⚠️ **That is one sentence covering three criteria, where § the device pass asks for pass or fail in the owner's words for each**, and it is recorded as what it is rather than expanded into per-check detail nobody supplied. It is a PASS on the owner's authority — the strongest evidence this project accepts *(C4)* and the only evidence that exists for any of these three — and it is thinner than the three preview rounds that closed 12.24, each of which returned specific defects. **So 0.9 does not come back down**, and that was the whole agreement the number was accepted under. ⚠️ **The measurement it overrode is unchanged and stays on the record**: 0.10 residual against the measured-readable 0.45 is 22 % where the rule said 60 %, 0.9 is past the 0.86 measured to erase what is underneath, and 175 of 878 standing positions (19.9 %) put a hazard, an enemy or the goal behind a plate (`touchMarks.ts:69-90`). Codex round 23 named this the likeliest way the phase still ships something subtly wrong. A person looked and said it plays; that is what the criterion asks for, and it is not the same as the bound being met.  🔴 **This row did not exist until 2026-09-03**, and the table jumped from 12.14 to 12.15 while the criterion sat in the PRD gate. Codex round 21, finding 1. `PLATE_ALPHA` is **0.9**, which abandons the 60 %-residual rule rather than weakening it — 0.10 against the measured-readable 0.45 is **22 %**, and 0.9 is past the **0.86 measured to erase the content underneath**. The evidence is unchanged and stays in `touchMarks.ts:69-90`: 175 of 878 standing positions carry a hazard, an enemy or the goal behind a plate. The two device checks that replace the bound are written out in § the device pass. **If either is unplayable, 0.9 comes back down.** |
| 12.15 | `src/sim/` boundary intact, whole suite with Phaser uninstalled | **PASS** | § Regression evidence. **Re-run on the round-16 diff, 2026-08-31: 3016 passed, 13 skipped of 3029**, Phaser restored to 4.2.1 afterwards. Re-run because the close-out session added four modules under `tools/gen/` and three test files, any of which could have reached for Phaser. |
| 12.16 | Draw-path: a blanked body or a deleted consumer reds a behavioural gate | **PASS — one orphan deleted** | § 12.16. `touchTargetsDisjoint` had zero consumers. M10 red 2/25. |
| 12.17 | Shipped bytes: six PNGs, alpha, six distinct **marks**, own key | **PASS — criterion amended 2026-08-31, owner decision** | Everything measurable passes on the shipped bytes (§ 12.17): six 160×160 PNGs, a two-sided alpha band, six pairwise-distinct engraved marks, each bound to its own key. The two amended words are **five → six** and **silhouettes → marks**: the six deliberately share one round brass disc, so the outline is the same by design and the distinctness that exists to be asserted is of the mark. **The distinctness gate was not loosened** — it already compared marks. § 12.17b. ⚠️ **Re-stated 2026-08-31 with the redesign:** the alpha claim is now **two** bands, a keyed field and an opaque button, because `bakePlateAlpha` is deleted and the bytes are no longer pre-faded — the old three-band assertion would have gone on passing on rim antialiasing alone, which is a gate passing for a reason unrelated to its claim. And the distinctness mask, which came from `keylineMarks`, is now a **fixed central square**: the six are the same button, so inside that square only the glyph can differ, which is a sounder oracle than the one it replaces rather than a weaker one. |
| 12.18 | Every generation logged; the two ceilings agree | **PASS — after a correction, and it was falsely PASS before it** | `GENERATION-LOG.md`, **fourteen takes across five entries, $2.10 of $5**. ⚠️ This row read *"3 rows, $0.45 of $5"* while six more takes had been bought, and `GENERATION-LOG.md` separately said *"the last ceiling anyone named is $55"* against `PRD.md:91`'s `$60` owner raise of 2026-08-29 — **two disagreements at once, in the criterion whose whole content is that the figures agree**. Found by the Codex round-14 implementation review; both reconciled 2026-08-31. |
| 12.19 | Every gate watched failing under its named mutation | **PASS 2026-09-03 — the thirteen are triaged, the three replacement gates have red proofs, and the nine rows the three Codex rounds asked for are proved** | § The mutation matrix. **122 rows** (this said *"92"*, then *"109"* — see § the row count, which is about exactly this); 22 of them went green before they reddened, over 27 green attempts, all closed. M22–M33 cover the four Codex rounds, M34–M40 the owner's three requests and the adopted art, M41–M45 the round-6 review, M46–M50 the round-7 one, M51–M54 the round-8 one, M55–M57 the round-9 one, M58–M59 the round-10 one, M60–M63 the round-11 one, M64–M65 the round-12 one, M66–M69 the round-13 one, M70–M71 the repair round 13 recorded but never landed plus the single-cell path it unlocked, M72 12.11's replacement GPU bound, M73 its main-thread bound, and M74 the live-size sweep that found a 2.740:1 stroke a pinned gate could not see. **M75, M76 and M77 close the round-15 gaps**: the CPU instrument floor shipped with no red proof of its own, `--adopt`'s override map had none either, the new family gate is watched failing on four built out-of-family faces, **M78** reds the GPU window boundary that round 16 found had no gate at all, **M79** reds the family gate's production SEAM — which M77 alone could not, because a gated decision function with an ungated caller is the same defect one layer up — and **M80-M82b** cover the row estimator, the joint grid and the partial-family hole. **M83-M85b close Codex round 20**: the three within-face statistics, the row estimator's speck and two-run holes, and the atomicity of a refusal. **M86 and M87 are the owner's two phone findings**, and both are *(C4)* in its purest form — 3042 unit cases, 218 e2e cases and five Codex rounds over the rotate prompt, and neither defect was visible from any of them. 🔴 **M82 is WITHDRAWN from the matrix.** It came back GREEN and stayed green, and this criterion requires every row to red — so a row reporting `GREEN 0/24` made 12.19 PASS over its own contradiction (Codex round 20, finding 1). M82 was a probe that found dead code, not a mutation of a live gate; the dead code is deleted and the hole is M82b's, which reds. 🔴 **Thirteen more rows were withdrawn for the same reason, and that is what held this criterion open. Closed 2026-09-02.** M46, M47, M55-M57, M60-M63, M65, M68, M69 and M74 each reddened a gate the owner's redesign deleted along with the ink pass. Each was triaged by one question — does the code it edits still exist, and does a live gate still claim its property? **Five were rebuilt and red** (M46 → **M99**, M61 → **M100**, M62 → **M101**, M60 → **M103**, M47 → **M104**); **eight are RETIRED** (M55, M56, M57, M63, M65, M68, M69, M74) because the code they edit is deleted, which makes them **unbuildable rather than green** — the distinction M82 established. The three replacement gates now carry the red proofs they lacked: two-band alpha ← M99 RED 2/15 and M100 RED 2/15; byte-for-byte cut-face equality ← M101 RED 1/15 and M103 RED 1/15; central-square distinctness ← **M45 re-run** against the fixed-square mask, RED 2/15 at 0.0 %. ⚠️ **M101 measured the thing the criterion is about**: it reds the equality gate while the two-band claim stays GREEN with all three of its counts byte-identical, so the two-band partition demonstrably cannot order M62's damage — a replaced statistic, proved replaced rather than assumed. 🔴 **And the cost is on the record**: the per-stroke contrast gate is not rebuilt (owner decision, 2026-09-02), so the 44–48 CSS px readability band has no automated cover and 12.14 rests on `ui-ux-tester` plus a hands-on pass. § The 12.19 repair. |
| 12.20 | `dist/` carries no dev-only key, symbol or prose | **PASS** | § Regression evidence. |
| 12.21 | No file over 400 lines without a `SIZE-EXEMPTION:` | **PASS 2026-09-03 — after the sweep was found not to cover the file that violated it** | **Six** splits taken rather than an exemption: `touchAtlasCli`, `perfRenderer`, `touch-atlas-argv`, `touch-family-builder`, `touchFamilyPolicy` and `touchPlateRows`. 🔴 **And it was falsely PASS the whole time.** `file-size.test.ts`'s glob covered `src/**/*.ts`, `tools/**/*.mjs`, `tests/**/*.ts` and the root configs — **no HTML** — while `tools/gen/audition-template.html` sat at **442 lines**, read by `build-audition.mjs` on every run. Five phases of this criterion passed over it. Codex round 21, finding 7. The glob covers `tools/**` HTML now, and the file is **split at its own seams** rather than exempted, because raising the size ratchet off zero opens a hole `file-size.test.ts` documents at length. **M114** reds both halves 6/15; **M115** and **M116** red the builder's join and order, after M115 was GREEN on its first attempt against four cases that described the parts and never read the code that concatenates them. |
| 12.22 | Codex PLAN review converged before any code | **PASS** | `VERDICT: APPROVED`, round 4 of 5. `docs/reviews/phase-12-touch-plan.md`. |
| 12.23 | Codex IMPLEMENTATION review on the final diff | **NOT MET — OPEN, AND ACCEPTED OPEN BY THE OWNER 2026-09-03** | 🔴 **The owner accepted the phase with this criterion open**, rather than lifting the three-round cap for a round 24. That is a decision, not a pass, and it is recorded here so no later reader mistakes the phase's `done` for this row's. The standard is unchanged and unmet: `VERDICT: APPROVED`. | **Round 14 ran and returned `VERDICT: REVISE`** — 13 findings, nine applied and four recorded with reasons (§ Codex round 14). *Executed with an unresolved verdict is NOT MET, not UNRUN.* **Round 15 then ran on the repaired diff and returned `VERDICT: REVISE`** — 11 findings, seven applied, one recorded as a precondition on the redesign, three taken to the owner (§ Codex round 15). **Round 16 ran on the round-15 repairs and returned `VERDICT: REVISE`** — 8 findings, all applied (§ Codex round 16). **Round 17 returned `VERDICT: REVISE`** — 7 findings, all applied (§ Codex round 17). **Round 18 returned `VERDICT: REVISE`** — 7 findings, all applied (§ Codex round 18). **Round 19 returned `VERDICT: REVISE`** — 7 findings, all applied (§ Codex round 19). **Round 20 returned `VERDICT: REVISE`** — 9 findings, six applied as code and three as record (§ Codex round 20). 🔴 **NOT MET at the cap. Rounds 21, 22 and 23 all ran on 2026-09-03, on the close-out diff, and ALL THREE returned `VERDICT: REVISE`** — the owner capped this phase at three rounds. Every finding from all three is applied; the row's standard is `VERDICT: APPROVED`, and an executed review with an unresolved verdict is NOT MET, not UNRUN. **None of the three was a formality**: round 21 found three of this session's own new gates green under the mutation they name and a criterion resting on a glob that could not see the file violating it; round 22 found a six-case gate that passed while the pipeline it described moved nothing; round 23 found the SAME pipeline gate still passing under `.slice(0, 0)`, which is what finally moved the concatenation somewhere a test could run it (§ Codex round 23). Round 22 first confirmed all seven of round 21's repairs genuinely applied, then found three more (§ Codex round 22): a six-case gate that passed while the pipeline it described moved nothing (**M117**), a row count stale by eleven, and a blind spot disclaimed for the pinch and not for the identical double tap. All three applied. Round 21 — 7 findings, **six applied as code and one confirmed as already-recorded** (§ Codex round 21). It is the most productive round since 14: three of this session's own new gates were green under the mutation they name, and a criterion that had read PASS for five phases was found resting on a glob that could not see the file violating it. ⚠️ **This row has twice stopped one review short of the summary beside it** — round 16 against a summary naming 17 (round 18, finding 6), then round 18 against a summary naming 19 (round 20, finding 9). **The round that ran is 21, and this row and every summary in this file say 21.** |
| 12.24 | Owner played it by touch on a real device, no keyboard | **PASS 2026-09-02 — owner** | Hands-on *(C4)*. Closed across **three** preview rounds on the owner's own phone, in fullscreen, with no keyboard in reach: 2026-09-01 (the six-item report), 2026-09-02 (the touch-control inset and the gear counter), and 2026-09-02 again (the welcome screen's audio line). Each round produced specific, reproducible defects against screens reached BY TOUCH — the level menu, the play controls, the HUD, the welcome screen — which is evidence the touch route works, not merely that it was looked at; a route that did not work could not have produced them. The owner then ruled it shipped and it is live in production. ⚠️ **The *start to finish* clause rests on the owner's word, not on a captured artifact.** No screenshot or recording of a level completed by touch is filed. That is what a `play` criterion is — see [session-mobile-polish-02-device-report.md](session-mobile-polish-02-device-report.md) for the three rounds. |

**STATUS 2026-09-02, the close-out session.** ⚠️ This line has now been wrong **twice**, both times
by lagging the table above it. It read *"one NOT MET and three UNRUN"* while the table already said
12.14 and 12.23 NOT MET (Codex round 16, finding 7), and was then left at *"Three criteria are NOT
MET and two are UNRUN"* through 2026-09-02, by which time 12.24 had passed. **A summary that
disagrees with the table above it is the failure this log's own header records**, so it is written
against the table and dated every time it moves.

**Derived from the table above, 2026-09-03, final:** **24 of 25 PASS.** 12.19 PASS. 12.21 PASS, after being found falsely so. **12.13, 12.14 and 12.14b PASS on the owner's device.** **12.23 is NOT MET and is ACCEPTED OPEN by the owner** — three Codex rounds, three `REVISE`, every finding applied, the cap not lifted. 🔴 **The phase is reported DONE on that acceptance, and CLAUDE.md §3 says a phase with a failing criterion is reported failing.** The owner overrode that rule explicitly and the override is recorded here rather than dissolved: **Phase 12 ships with one criterion open, by decision, not by convergence.** The older derivation below is superseded and kept for the trail.

**Superseded — derived mid-session, 2026-09-03:** 12.19 PASS. 12.21 PASS, after being found falsely so.
12.13's machine half is built and red-proved; 12.14's agent half is MET, both briefs run.
**12.23 is NOT MET and is ACCEPTED OPEN by the owner on 2026-09-03 — rounds 21, 22 and 23 all ran and all three returned `VERDICT: REVISE`, which is the cap the owner set. Every finding from all three is applied, and the owner chose to accept rather than lift the cap. 12.13, 12.14 and 12.14b all await
the owner's phone. The phase is reported FAILING**, and every one of those four is a real reason
rather than a formality.

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
