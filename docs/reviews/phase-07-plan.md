# Codex plan review — Phase 7 (Audio)

← [reviews index](../PRD.md#the-codex-review-protocol) · phase doc: [prd/phase-07-audio.md](../prd/phase-07-audio.md)

**Review 1 of 2.** Run 2026-08-16, `/codex:rescue --wait --fresh`, before the first line of Phase 7
code. Reviewed the phase doc **together with** the concrete implementation plan written for it
(outside the repo, at `~/.claude/plans/do-not-forget-the-cheerful-rainbow.md`).

The prompt carried the mandatory `node_repl` preamble *(PRD.md § The Codex review protocol)*, and
additionally named the five owner decisions taken in the same session as **settled scope**, so the
reviewer would spend its attention on the plan as written rather than re-litigating them:

1. Audio spend ceiling is `$5`, declared in PRD Global Constraints before the first generation.
2. No separate grey-box phase; vault 7.2's mandatory single-cue probe serves as the placeholder.
3. Cue set is the PRD six plus a footstep cue and an ambience bed; `pickup` and the gear chime are
   one cue, not two.
4. Mute and volume are keyboard-only (`M`, `[`, `]`) — deliberately no new HUD object, to avoid
   re-opening Phase 6's measured criteria 6.5, 6.6 and 6.9.
5. The 7 short cues ship as WAV (they need trimming per vault 7.1); the 2 beds ship as OGG.

Beyond the five standard review-1 questions, the prompt carried the **two phase-specific questions
the phase doc itself asks** (`prd/phase-07-audio.md:57-59`) — which criterion is verified by listening
rather than measurement, and whether any assertion reads state back from the WebAudio API — plus five
named areas of concern, each verified locally before being put to Codex.

Node REPL file access succeeded. No files were modified.

---

## The review, verbatim

1. **Medium — non-goal deliverables.** Section 1 requires audible behavior and persistent controls, not a particular module/test layout. Therefore `src/sim/audioCues.ts`, `tools/gen/audio-gate.ts`, `tests/unit/audio-cues.test.ts`, and `tests/e2e/phase-07-audio.spec.ts` are architecture or verification machinery rather than goal-required product deliverables. `src/game/audio.ts` and `public/assets/audio/` directly implement the goal. [phase-07-audio.md:7] [phase-07-audio.md:61]

   The deviation from `audio-gate.ts` to `audioGate.mjs` is correct: the established filesystem bridge deliberately lives outside the TypeScript program as `.mjs` with a `.d.mts` declaration, while `tsconfig.json` includes only `src`, `tests`, and the two root configs. [png.mjs:11] [tsconfig.json:19] [do-not-forget-the-cheerful-rainbow.md:129]

2. **Acceptance criteria that can pass while broken, ranked by severity:**

   - **Blocker — 7.2 can pass with an underestimated stack.** The declared "worst case" includes `enemy-kill` but omits `hit`; however, an enemy kill occurs inside `applyPlayerAttack`, and any such strike increments the hit count, which makes `events.hitLanded` true. Thus `enemyKilled` necessarily stacks with the hit cue. [do-not-forget-the-cheerful-rainbow.md:200] [playerAttack.ts:101] [tick.ts:271]

   - **Blocker — 7.2 also has a cross-format measurement gap.** WAV cues are decoded in Node and OGG beds in Playwright, but the plan never identifies one calculation that combines both decoded sample sets, even though its claimed stack includes both beds. Each half could pass independently without measuring the shipped mixed stack. [do-not-forget-the-cheerful-rainbow.md:135] [do-not-forget-the-cheerful-rainbow.md:147] [do-not-forget-the-cheerful-rainbow.md:200]

   - **High — 7.1 can miss a death path.** The plan treats propagation of `damagePlayer`'s boolean as the fix for hurt/death cues, but kill-plane death bypasses `damagePlayer`, calls `killPlayer`, and returns. A test using ordinary lethal damage could pass while falling out of the world remains silent. [do-not-forget-the-cheerful-rainbow.md:47] [do-not-forget-the-cheerful-rainbow.md:53] [worldDamage.ts:114] [worldDamage.ts:117]

   - **High — 7.4 can prove storage while playback ignores it.** The plan makes `localStorage` both persistence and the asserted "own flag." Reading the saved object after reload can pass even if that value is never reapplied to actual playback. [do-not-forget-the-cheerful-rainbow.md:77] [do-not-forget-the-cheerful-rainbow.md:79]

   - **High — 7.5b can pass while audio is absent from `dist/`.** The criterion checks catalog rows and generation request IDs, neither of which proves deployed bytes. The current production check verifies only catalogued levels and images. [phase-07-audio.md:74] [verify-dist.mjs:46] [verify-dist.mjs:121]

   - **High — 7.6's claimed automatic test extension is vacuous for new events.** Adding fields is runtime-safe once they are added to `noEvents()`: both accumulation layers iterate that record. The test also discovers those names automatically, but its comparison passes on `false === false`; its non-vacuity assertion explicitly names only four existing events. New `playerHurt`, `playerDied`, `enemyKilled`, or `footstep` fields could therefore never fire and still pass this test. [tick.ts:109] [tick.ts:368] [advanceSplit.ts:38] [tick-events.test.ts:139] [tick-events.test.ts:171]

3. **Blocker — vault 7.4 is claimed but not satisfied.** Vault 7.4 requires measuring the actual clipping budget of the cue set. The plan labels an incomplete combination as the worst case: `enemy-kill` necessarily brings `hitLanded`, yet `hit` is omitted, and the Node/browser split does not specify a combined WAV-plus-OGG measurement. [phase-07-audio.md:22] [phase-07-audio.md:70] [do-not-forget-the-cheerful-rainbow.md:200] [tick.ts:271]

4. **High — it depends on an authoritative foot-contact cadence that no earlier phase produces.** The plan acknowledges that the sim has no stride or cadence concept, then treats `stridePxPerCycle` as that missing authority. But the asset's own record says those stride figures were replaced, are retained only historically, and nothing reads them for timing anymore. The current contract instead uses whole tick dwell plus measured `footPxPerFrame`; neither produces a foot-contact edge. [do-not-forget-the-cheerful-rainbow.md:49] [do-not-forget-the-cheerful-rainbow.md:57] [character-bounds.json:16] [character-bounds.json:20] [playerTuning.ts:78] [playerTuning.ts:89]

5. **High — the most likely subtle shipment is footsteps audibly drifting out of phase with the animation.** `FOOTSTEP_PX = 140` is derived from superseded 254/320-cycle figures. The shipped walk/run loops are currently 48 and 30 ticks, while their planted movement is governed by 9/18 pixels per drawn frame held for two ticks; that implies current loop travel of 216/270 px, not 254/320. A single 140 px trigger therefore cannot represent two evenly spaced footfalls for both loops. [do-not-forget-the-cheerful-rainbow.md:57] [index.json:53] [index.json:64] [playerTuning.ts:87] [playerTuning.ts:98]

   This does **not** violate the integer-duration constraint: 140 is a pixel distance, and the accumulator advances inside discrete ticks without introducing seconds or `deltaTime`. The derivation is unsound; its units are legal. [PRD.md:60] [do-not-forget-the-cheerful-rainbow.md:57]

6. **High — none of the §6 audio criteria is verified by listening.** Criterion 7.1 is e2e event/playback instrumentation, 7.2–7.3 are numeric decoding, and the rest are state/count/audit/review checks. The plan's only listening is the later hands-on playtest, outside the acceptance table. Consequently, a loud but semantically wrong cue, a badly cut wind-up, or a visibly measurable but ugly loop can clear every numbered audio criterion. [phase-07-audio.md:66] [do-not-forget-the-cheerful-rainbow.md:187] [do-not-forget-the-cheerful-rainbow.md:246]

7. **No WebAudio-readback violation found in the plan.** The persistence assertion reads the project-owned `localStorage` record, while track accumulation reads Phaser's sound collection or PLAY events. `this.sound.locked` is used only to choose the unlock path; no planned assertion reads `mute` or `volume` back from WebAudio. [do-not-forget-the-cheerful-rainbow.md:77] [do-not-forget-the-cheerful-rainbow.md:79] [do-not-forget-the-cheerful-rainbow.md:82] [do-not-forget-the-cheerful-rainbow.md:84]

### What Codex could not check — preserved verbatim

> Node REPL file access succeeded. Codex states it could not check generated audio by listening,
> inspect future implementation assertions, run the suites, or independently verify the live fal
> schema, invoice, or generated WAV/OGG encoding. No files were modified.

---

## Triage

Every finding was re-verified locally against the files it cites before disposition. Codex reads here
but cannot run anything, so its findings are file-evidence until reproduced *(PRD.md:214-217)*.

| # | Finding | Severity | Disposition |
|---|---|---|---|
| **F1** | 7.2's worst-case stack omits `hit`; an enemy kill necessarily sets `hitLanded` too | Blocker | **APPLIED.** Verified locally at `playerAttack.ts:100-111` — `strike()` runs `enemy.hp = Math.max(0, enemy.hp - PLAYER_ATTACK_DAMAGE)` and then `hits += 1` unconditionally, so the killing blow is counted like any other and `tick.ts:271` sets `hitLanded`. There is no kill that is not also a hit. The worst-case stack is corrected from six sources to **eight**: land + footstep + hurt + hit + enemy-kill + pickup, over both beds |
| **F2** | The Node-WAV / browser-OGG split never combines both into one calculation, so each half can pass while the mixed stack is never summed | Blocker | **APPLIED.** The split was real and the gap was real: the stack includes both beds, which are OGG, and every cue, which is WAV. Criterion 7.2 is now computed **once, in the browser**, where `AudioContext.decodeAudioData` returns `Float32Array` for both containers and measures the exact shipped bytes. Node keeps 7.3's per-cue floors, where no cross-format sum is involved |
| **F3** | Vault 7.4 claimed but not satisfied, being F1 + F2 together | Blocker | **APPLIED** via F1 and F2. Recorded separately because the vault item is cited by the phase doc and a reader checking that citation should find the disposition, not have to infer it |
| **F4** | Kill-plane death bypasses `damagePlayer`, so propagating its boolean leaves falling out of the world silent | High | **APPLIED.** Verified locally at `worldDamage.ts:117-120`: `if (belowKillPlane(...)) { killPlayer(player); return; }` — an early return before `damagePlayer` is ever reached. This is the most common death in a platformer and the plan would have shipped it silent while every ordinary-lethal-damage test passed. `playerDied` is set at **both** sites, and the fall-death case is named explicitly in criterion 7.1 |
| **F5** | 7.4 can prove storage while playback ignores the stored value | High | **APPLIED.** The criterion now has two halves: the `localStorage` record survives the reload, **and** playback is actually attenuated afterwards. Asserted on our own flag and on audible behaviour, never on the WebAudio getter *(7.5)* |
| **F6** | 7.5b can pass while audio is absent from `dist/` | High | **APPLIED.** Verified locally: `verify-dist.mjs` existence-checks `catalog.levels` (`:52-55`) and `catalog.images` (`:125-128`) and nothing else, and `describeCatalogProblem` ignores unknown top-level keys. A catalog row and a `request_id` prove authorship, not deployment. The `catalog.audio` existence check is confirmed load-bearing rather than tidiness |
| **F7** | `tick-events.test.ts` non-vacuity names only four existing events, so a new field that never fires still passes | High | **APPLIED.** Verified locally at `tick-events.test.ts:171` — the guard names `respawned, attackStarted, hitActive, hitLanded`. The OR-contract test above it does discover new fields automatically, but it compares `false === false` and is therefore silent about an edge that never fires. All four new names join the non-vacuity list, with scenarios that genuinely reach them: fall below the kill plane, kill an enemy, take a hazard hit, walk far enough for a footstep |
| **F8** | `FOOTSTEP_PX = 140` derives from `stridePxPerCycle`, which is superseded and read by nothing | High | **APPLIED, and it changed the design.** Verified locally: `animTiming.ts:190-196` records `stridePxPerCycle` as "no longer used for timing", kept only because the asset file still holds the measurement; the live mirror is `FOOT_PX_PER_FRAME = { run: 18.0, walk: 9.0 }` (`playerTuning.ts:98`), pinned to the shipped asset by `foot-plant.test.ts`. Re-derived from the catalog: walk is 24 frames × 2 ticks = 48-tick cycle, run 15 × 2 = 30. Two footfalls per cycle gives **`FOOTSTEP_TICKS = { walk: 24, run: 15 }`** — an integer count of 60 Hz ticks, phase-locked to the animation, which no single distance constant can be for both loops (108 px vs 135 px) |
| **F9** | No §6 criterion is verified by listening; a semantically wrong cue clears the whole gate | High | **APPLIED.** This is the phase doc's own question answered against the phase doc's own gate. Measurement cannot hear a jump cue fired on a landing, a wind-up trimmed off its own attack, or a loop seam. New criterion **7.10**, owner `play`, method naming `playwright-cli` — the pairing `docs-contract.test.ts:193-198` enforces for every `play`-owned row |
| **Q1** | `audioCues.ts`, the gate tool and both test files are verification machinery, not goal-required deliverables | Medium | **RECORDED, kept.** Codex is right that §1 names none of them. But §3's non-negotiables require the sim boundary that `audioCues.ts` exists to honour, and §5's testing rules require a gate that can be red-proved. The deviation Codex was asked about in the same finding — `audio-gate.ts` → `audioGate.mjs` — it confirmed correct, citing `tsconfig.json:19` |
| **Q7** | No WebAudio-readback violation found | — | No action, and it is worth recording as a *pass* rather than as silence. `localStorage` is the flag; `this.sound.locked` only selects the unlock path; track counting reads Phaser's own collection and PLAY events, not `mute` or `volume` |

**Applied: 9. Recorded: 1. Rejected: 0.**

Two findings changed the design rather than the tests. **F8** replaced a distance accumulator built on
a retired measurement with a tick counter derived from the shipped catalog — the plan had reached for
the number that was still written down instead of the number that is still read. **F2** collapsed a
two-instrument measurement into one, which is the same mistake in a different medium: two correct
halves that never meet do not measure the whole.

**F4 is the one that would have shipped.** Falling out of the world is the most common death in a
platformer, and it takes an early return that no ordinary-damage test would ever reach.
