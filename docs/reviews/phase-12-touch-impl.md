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

**Nothing was silently dropped** *(C11)*. Two findings are recorded-not-applied with the reason above;
one did not survive local verification and is recorded as unconfirmed.
