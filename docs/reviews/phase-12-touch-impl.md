# Phase 12 — Codex implementation review

Session `01a04e7b-2a1f-72b3-81cd-2de24ea25431`, `gpt-5.6-sol`, read-only, `node_repl` + `fs.readFileSync`
for every file read (⚠️ its sandboxed shell cannot spawn processes on this machine, so **every finding
below is file-evidence until a command in this repository confirmed it** — each one was re-verified
locally before being acted on, and one did not survive that check).

## Round 1 — `VERDICT: REVISE`

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | **BLOCKER** | The rotate prompt can be tapped through: tapping "ROTATE YOUR DEVICE" dismissed the title or advanced the completion screen underneath it | **Applied.** Reproduced locally. `promptIsUp()` is two terms now — the prompt's own predicate OR the route's own targets. M22 red 1/11, M24 red 1/12. |
| 2 | HIGH | `PLATE_ALPHA_PRESSED = 1` re-opened the 19.9 % occlusion problem the resting alpha exists to solve | **Applied.** See round 2 #5 — the first repair's 0.78 was itself unbacked and is now derived. |
| 3 | HIGH | 12.8/12.9 name the title and completion zones and neither was measured | **Applied**, then corrected again in round 2 #3. |
| 4 | MEDIUM | 12.14's "PASS for the grey-box — art UNRUN" is not a pass | **Applied.** NOT MET. A criterion about *the button art* cannot be passed by the placeholder standing where the art would be. |
| 5 | MEDIUM | A stale duplicate table fragment at `docs/qa/phase-12-touch.md:48-51` claims "22 rows, 2 holes" | **Applied.** Deleted; the 27-row table above it was already authoritative. |
| 6 | MEDIUM | `declaresTouch` matches commented-out configuration | **Applied.** Line comments stripped — and, after round 2, block comments too. M28 red 1/5. |
| 7 | MEDIUM | Desktop title navigation was changed — scope creep | **NOT CONFIRMED.** `git diff main...HEAD -- src/scenes/TitleScene.ts` grepped for `dismiss`/`onLevelSelect`/`ENTER` returns zero lines. Recorded, not applied. |
| 8 | LOW | `hasTouch: true` on both touch projects is a widening | **Recorded, not applied.** The approved plan mandates it on both, and `phase-12-perf.spec.ts` builds its own contexts. Removing it would contradict an approved plan without asking the owner. |

## Round 2 — `VERDICT: REVISE`, on the repaired diff

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | HIGH | Two fingers can trigger two level starts; the "multi-finger" gate presses **pointer 1 twice** | **Applied — and the repair's own gate was decoration twice before it could go red.** `LevelSelectScene.play()` latches. See § M25 in the QA log: two awaited `contactDown` calls are not two simultaneous fingers, and a fresh save unlocks only one level. With both corrected and the latch deleted the player lands on **level-02**. M25 red 1/10. |
| 2 | MEDIUM | Multi-contact pressed feedback lies: releasing one finger unlights a plate the other still holds | **Applied.** `onRelease` now passes `contacts.isHeld(id)`. The contact-identity defect this phase gated in the sim, on the side the player can see. M26 red 1/4. |
| 3 | **BLOCKER** | 12.8 was *weakened*, not fixed — coverage replaced containment for the two full-screen zones | **Applied as a verdict change.** Redefining what an approved criterion measures is the same move as editing a locked hash. 12.8 is **NOT MET** pending an owner decision; both options are written up in the QA log. |
| 4 | HIGH | The two-term predicate disagrees with `RotatePrompt`: a route can be dead with no prompt shown | **Partly applied.** The false comment claiming *"exactly the frames `RotatePrompt` covers"* is corrected. The divergence is unreachable through the three shipped screens — none passes a target under `TOUCH_BOX_PX` — so 12.10's "iff" holds for everything that ships. Making `RotatePrompt` consume the combined predicate would surface a prompt for a target that cannot exist yet; **not done**, and recorded here rather than silently. |
| 5 | HIGH | The new pressed-alpha gate still admits **0.86**, the value measured to erase the level | **Applied.** The bound is computed from the resting alpha now — a pressed plate keeps ≥ 60 % of the measured-readable residual transparency, so ≤ 0.73 — and the value is **0.72**. M27 sets 0.86 and reds it, 1/4. |
| 6 | MEDIUM | The `hasTouch` scan still accepts `hasTouch: false /* hasTouch: true */` | **Applied.** Both comment forms stripped. M28 red 1/5. |
| 7 | MEDIUM | `touch-layout.test.ts` has an assertion-free test; `0 * scale < 8` is stated backwards in three places; the PRD says "three" zero-red rows while the table says four | **Applied, all three.** The disjointness test has an independent pairwise assertion (M29 red 2/21), the comparison reads *true* in all three places, and the count is five now. |

## Round 3 — `VERDICT: REVISE`

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | **BLOCKER** | `LevelSelectScene`'s two-finger latch was a **field initialiser**, and Phaser preserves the scene instance across a shutdown (`Systems.js:760-788`) — so after one level was chosen the latch stayed set and the menu was dead on every later visit, to touch **and** to ENTER, until reload | **Applied.** Reproduced locally. A repair for a rare two-finger race that broke the ordinary one-finger case. Reset in `init()`; gated by 12.6b. |
| 2 | HIGH | 12.5d demanded level-01, enforcing a first-contact-wins rule 12.5 does not state | **Applied.** It counts `scene.start` calls now and accepts either unlocked row. |
| 3 | HIGH | The prompt asked only about the play controls while the route asked both terms — a sixth catalog level would have killed the menu route with **no prompt shown** | **Applied.** `rotatePromptWanted()` is one shared definition called with the same targets by `RotatePrompt` and `attachTapRoutes`, so 12.10's "iff" holds by construction. |
| 4 | MEDIUM | The pressed-alpha bound derived from the live `PLATE_ALPHA` — an active oracle that would validate any pair of unmeasured numbers | **Applied.** It pins the measured 0.55. |
| 5 | LOW | Three false comments (this module does not arbitrate between fingers; a gated tap was not always explained; 40 game px at scale 1 is 40 CSS px, not 20) | **Applied**, all three. |

## Round 4 — `VERDICT: REVISE`

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | HIGH | `refresh()` re-sized only the **fonts**, while the case named *"re-places itself when the design size changes"* built a SECOND prompt and searched an array still holding the first one's stale scrim — it passed either way | **Applied.** The behaviour is implemented and the gate asserts exact geometry on the objects it refreshed. |
| 2 | MEDIUM | `cssScaleFor` returns 0 for a collapsed canvas by design, and `Math.round(28 / 0)` is `Infinity` | **Applied.** Guarded; the last finite size is kept and visibility is unaffected. |
| 3 | LOW | Two more comment errors — the fourth `0 * scale < 8` site, and a claim that the completion route shares its targets | **Applied.** That zone is the view plus 64 px, so only the play-controls term can fire there. |
| 4 | MEDIUM | The level-menu cases belong in their own spec | **Applied.** `phase-12-menu.spec.ts`, at the 400-line ceiling; the partition picks it up with no config edit, which is what the partition test asserts. |

## Round 5 — `VERDICT: REVISE`

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | HIGH | The round-4 repair shipped **continuous work on every touch device**: `UIScene` polls `refresh()` every frame and `Rectangle.setSize` rebuilds geometry, path data and display origin on every call — and 12.11 cannot measure it, because the prompt is hidden while it times | **Applied.** Re-placed only when the design size actually changed. The gate asserts the **delta**, not the private -48/+56 offsets, so a legal change to line spacing that kept the prompt centred cannot false-red. |
| 2 | HIGH | 12.11's "all five drawn" precondition counted **faces against zones** — true by accident only while the grey box drew a plate plus marks per control | **Applied.** One generated image per control makes the counts equal and the bound false-redded a build drawing strictly better pixels. The claim was never a ratio, so it is asserted per control **by name** — also stronger: six visible faces all belonging to one plate passed the old form. |
| 3 | MEDIUM | 12.10's approved wording is an "iff" over *every* live target; the shipped code implements D1's rotate-on-phone-portrait | **Recorded.** 12.10 is **NOT MET** pending an owner call, written up in the QA log rather than reworded. |

## Round 6 — `VERDICT: REVISE`

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | **BLOCKER** | The walk latch lived on `TouchControlsLayer.walking`, and `UIScene`'s SHUTDOWN destroys that layer — choosing to walk, opening the level menu and coming back silently resumed **running**, with a dark plate. The test meant to cover it asked the DESTROYED layer what it held, which proves the field and not the persistence | **Applied.** The latch moves to `TouchSession`, a field on `UIScene`, which survives. `activate()` restores the gait onto every replacement layer **before** binding; `deactivate()` unwires the callback and deliberately keeps the choice. M41–M43. |
| 2 | HIGH | `buildTouchAtlas.mjs`'s CLI guard used `new URL().pathname`, which keeps the space in "Steampunk Platformer" as `%20` — so `main()` had **never once run** and the shipped faces were cut by hand | **Applied.** `fileURLToPath`. |
| 3 | MEDIUM | The walk latch flipped after the redraw | **Applied.** Before. |
| 4 | MEDIUM | `drawFace`'s `setDisplaySize` had no reachable consumer — M39 stayed green twice | **Applied.** Verified unreachable (`create()` ends in `refresh()`) and deleted; M39 repointed at `refresh()`. |

## Round 7 — `VERDICT: REVISE`

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | HIGH | **One flat alpha cannot be both see-through and readable.** Drawn at `PLATE_ALPHA` the whole generated face fades together and the best ink reaches only **2.43–2.47:1** against WCAG 1.4.11's 3:1. The grey box never had this problem — its marks were opaque over a translucent plate | **Applied.** The split is baked into the bytes: brass keeps `PLATE_ALPHA / ART_ALPHA` of its alpha, ink keeps all of it. Ink is the two **ends** of the luminance range (`< 32` or `> 208`), the two-ink method `hud.ts` uses; at 16/224 the worst case falls to 2.88:1, so 32/208 sits two steps clear. Three new gates on the shipped bytes. |
| 2 | HIGH | Two fingers on `walk` toggled it on and straight back off; two on `pause` opened the level menu twice | **Applied.** `begin()` is true per POINTER — right for a movement plate and a repeatable swing, wrong for a toggle and a route. Gated on the 0→1 transition; jump and attack deliberately stay per-pointer. |
| 3 | MEDIUM | The builder's count guard was circular (`cells.size` against the array that built it) and left stale PNGs behind | **Applied.** Produced keys are checked against the **catalog**, and the directory is swept. |
| 4 | MEDIUM | `TOUCH_PLATE_CELLS` had no test at all; 12.6c's bounds were one-sided | **Applied**, both. |
| 5 | LOW | Prose still said five controls, two takes, $0.30 | **Applied.** Six, three takes, $0.45. |

## Round 8 — `VERDICT: REVISE`

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | HIGH | **The contrast gate passed on a highlight outside the mark.** Scanning the whole face and keeping the best pixel let a decorative brass highlight carry the pass: `walk` scored 3.67:1 that way while its own bars — 725 near-black pixels and not one pale one — bottomed out at **1.12:1**. Invisible on a dark background | **Applied.** `keylineMarks()` gives every dark engraving a pale keyline in `MARK_INK`, and the gate measures the **mark mask** — opaque pixels inside the central 50 %, nothing else — with a count assertion so an empty mask cannot pass silently. |
| 2 | MEDIUM | The stale-PNG sweep deleted **every** `.png` in the directory, not just `touch-*` — dormant today, destructive the moment another UI image lands there | **Applied.** Prefix-guarded. |
| 3 | MEDIUM | The CLI entry guard had no gate at all — reverting it left everything green | **Applied.** `isCliEntry` is exported and driven by `touch-atlas-cli.test.ts` with a path containing a space, which is the whole round-6 bug in one argument. M53/M54. |
| 4 | MEDIUM | The alpha-band test demanded coverage percentages no criterion approves, which would false-red a legal face | **Applied.** Narrowed to presence of all three bands plus a translucent-bulk disc; readability belongs to the contrast gate, distinctness to the marks gate. |
| 5 | LOW | Three prose errors — the art does not carry "the SAME ALPHA", `faceAlpha` is Phaser's object alpha, cell keys are prefixed | **Applied.** |

## Round 9 — `VERDICT: REVISE`

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | HIGH | **A hairline is not a contrast mechanism, and this repo already said so.** Round 8's 3.64:1 was measured on 160 px SOURCE TEXELS; the smallest in-scope viewport shows a face at **48 CSS px**, a 3.3× downscale a fractional canvas scale deliberately SMOOTHS — the 1 px keyline averaged away and the marks fell to **1.63–2.85:1**, `walk` worst. `contrast-floor.test.ts` already refuses a 1 px stroke as *"an anti-aliasing artefact, not a contrast mechanism"* | **Applied.** The engraving is thickened (`BOLD_PX 2`) as well as keylined (`KEYLINE_PX 3`), both restricted to the central mark region — the first version keylined every dark pixel anywhere, repainting the outer rim while the measured mark stayed thin. The gate measures at true size too. |
| 2 | MEDIUM | Two invented thresholds — `plate/(plate+ink) > 0.5` and `marked > 100` | **Applied.** Removed: the occlusion measurement establishes an alpha, not a pixel share, and one pixel is enough to prove a mask non-empty. |
| 3 | MEDIUM | `buildTouchAtlas.mjs` crossed 400 lines | **Applied.** The two pure pixel passes split into `tools/gen/touchInk.mjs`, driven by `touch-atlas-ink.test.ts` on a synthetic face. |
| 4 | MEDIUM | Deleting the `keylineMarks()` call could redden nothing — the shipped bytes already carried the keyline | **Applied.** M55–M57; two of the three were green until the fixture could reach the guard (a bar running the full width of a small disc), and a genuinely dead region guard beside it was deleted. |

## Round 10 — `VERDICT: REVISE`

| # | sev | finding | verdict |
|---|---|---|---|
| 1 | HIGH | **A modal alpha is an average.** The plate-alpha gate read only the MODAL translucent alpha, so making 9 717 outer brass pixels of `pause` fully opaque — a plate that hides the level it is drawn over — left it green, with contrast and distinctness unchanged | **Applied.** A per-pixel invariant: ink inside the mark region is 255, every other non-transparent pixel is within ±1 of the baked 165. M58 red 1/7. ⚠️ The ink half is restricted to the mark region because 643–660 pixels per face at ink luminance live in the disc's keyed rim ramp — measured, every one of them outside the mark region and none inside. |
| 2 | HIGH | **A best pixel is an average too.** The contrast gate kept the single best output pixel, so fading `walk`'s engraving down to 32 remaining pixels still scored over 3:1 | **Applied.** The mark must survive the downscale. M59 red 2/7. |
| 3 | MEDIUM | The true-size gate rolled its own box filter, partitioning the source differently from `resize.mjs` | **Applied.** It measures through the shared `downscale`; the figures move to **3.32:1 at rest** and **3.85:1 pressed**. |
| 4 | MEDIUM | Two bounds in the gates are mine and not the criteria's — a test quietly enforcing more than an approved rule is the STOP-and-ask CLAUDE.md § 3 names | **Applied.** `MIN_DIFFERING_SHARE` 0.15 → 0 and the 1.3× thickening ratio → > 1, both with today's measurements (70.4–82.9 %, ~1.78×) kept in the tests' prose and written up as owner decisions in the QA log. |
| 5 | LOW | Stale figures in four files | **Applied.** Swept. |

**Nothing was silently dropped** *(C11)*. Two findings are recorded-not-applied with the reason above;
one did not survive local verification and is recorded as unconfirmed.
