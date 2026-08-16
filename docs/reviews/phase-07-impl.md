# Codex implementation review — Phase 7 (Audio)

Run `2026-08-16`, **after** the six gate-owner briefs and after their findings were applied, per
CLAUDE.md §4: applying owner findings changes the diff Codex reads.

Prompted with the `node_repl` + `fs.readFileSync` instruction, because Codex's sandboxed shell
cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`). It confirmed the
limitation in its own words at the end of the review.

**Tally: 5 answers. Applied 1. Recorded 3. Confirmed-clean 1. Rejected 0.**

---

## The review, verbatim

> 1. **F8 not satisfied.** Footstep cadence is locked but not phase-locked. A wall collision zeros
>    `vx` while `state` stays `run`; `advanceStride()` resets the stride counter but
>    `playIfChanged()` leaves the animation untouched, so reversing away without an intervening idle
>    tick restarts the audio cadence from a frame that doesn't coincide with a planted foot.
>    `src/sim/player.ts:118,155,292`, `src/sim/tick.ts:317`, `src/scenes/playAnim.ts:18`. F1–F7 look
>    represented in the code; F9 was resolved as new criterion 7.10, which is a still-unrun gate
>    item, not a code defect (`docs/prd/phase-07-audio.md:79`, `docs/qa/phase-07-audio.md:29`).
>
> 2. No CLAUDE.md §3 violation found: sim files import nothing from Phaser/DOM/clock/`Math.random`;
>    new cadences are integer tick counts (`{walk:24, run:15}`, `src/sim/playerTuning.ts:101`);
>    `window.__game` stays the closed eight-field surface; `GameScene.ts` at 432 lines has a written
>    phase-QA justification for the overage.
>
> 3. **`jumping plays the jump cue, and landing plays the land cue`**
>    (`tests/e2e/phase-07-audio.spec.ts:54`) is a false-green candidate — `waitForCue()` only checks
>    cumulative `includes()`, never order or which tick produced it (`tests/e2e/audioHelpers.ts:135`).
>    Mutation: move `events.landed = true` into the takeoff branch alongside `events.jumped = true`
>    (`src/sim/tick.ts:255,301`) — both cues fire on takeoff, none on touchdown, test still passes.
>
> 4. **Footstep** is the one cue with real wrong-event risk given current code: reversing direction
>    while pinned against a wall in the same gait can desync the audio cadence from the visible
>    foot-plant frame (`src/sim/player.ts:139,155`, `src/scenes/gamePlayerDraw.ts:45`,
>    `src/scenes/playAnim.ts:18`). The other eight cues map to explicit single-fire tick edges with no
>    evidence of double-fire or misrouting; multi-hit/kill/pickup collapsing to one cue is a
>    pre-recorded limitation (D10), not new.
>
> 5. **Most likely subtle ship defect:** footstep desync after stopping against a wall and reversing
>    away in the same gait — untested by the existing "no footsteps while pinned" and "reset on
>    walk↔run" regression tests, neither of which resumes movement from a same-gait zero-velocity
>    wall state or checks the rendered animation frame (`tests/unit/audio-cue-edges.test.ts:338,369`).
>    This sits outside both the six gate-owner briefs and the supplied measurements, since the
>    listening half of criterion 7.10 hasn't run yet.
>
> Codex could not run git, typecheck, unit/e2e tests, builds, generators, runtime mutations, audio
> decoding, or listening checks — file-evidence only, independently re-verify locally. No files were
> modified.

---

## Triage

Every claim re-verified locally before disposition *(C6)*.

| # | Finding | Severity | Disposition |
|---|---|---|---|
| **C1** | F8 satisfied as a cadence but **not as a phase lock**: a wall-pin zeroes the counter while the run animation keeps cycling, so resuming in the same gait restarts the count mid-cycle | High | **RECORDED, with the root cause named.** Verified by reading `playAnim.ts:18` — `playIfChanged` returns early when the key is unchanged, so the animation genuinely keeps running through a pin while `advanceStride` now resets. **Codex is right, and it is a cost of my own fix.** Kept anyway: silence at a standstill is a smaller defect than a footstep every 250 ms at a standstill, which is what shipped before. 🔴 The actual root cause is upstream of audio — `resolveState` takes `movingHorizontally = dir !== 0 \|\| vx !== 0`, so **the character animates a run cycle while motionless**. Fix that and both readings agree. Deliberately not fixed in an audio phase: that term predates Phase 7 and changing it moves every locomotion assertion from Phase 2 on. Now written into `advanceStride`'s docstring. |
| **C2** | No §3 non-negotiable violated — sim boundary, integer ticks, eight-field surface, 400-line rule all clean | — | **CONFIRMED.** Matches the local reading and `npm run test:sim-isolated`. |
| **C3** | The jump/land test is a false green; `waitForCue` checks cumulative `includes()`, never which tick | High | **APPLIED, and Codex's own mutation proved it.** Moving `events.landed = true` into the takeoff branch → **the test passed**. The recorder now records the sim tick per cue and the spec asserts the land cue arrives >20 ticks after the jump cue; the mutation now fails with `land fired -1 ticks after jump`. 🔴 Fixing it exposed a **second** false green Codex did not see: the reverted build *still* read land before jump, because **the player spawns airborne and lands at boot** — the `sfx-land` the original test matched was the spawn landing, so it would have passed on a build where jumping produced no landing cue at all. The recorder is now cleared after the spawn settles. Two false greens in one four-line test. |
| **C4** | Footstep is the only cue with real wrong-event risk; the other eight map to single-fire edges | Medium | **RECORDED.** Same substance as C1. The eight-cue clean bill matches the code-reviewer's independent cue-by-cue trace. |
| **C5** | Most likely subtle ship defect: footstep desync after a wall-pin reverse, untested by either new regression test | High | **RECORDED, not tested.** True: neither new test resumes movement from a same-gait zero-velocity wall state, and neither could check the rendered animation frame from `src/sim/`. A test that asserted the phase relationship would have to reach across the sim/render boundary, which is the one thing the architecture forbids. It is a listening judgement, and it is on the 7.10 list. |

## Codex's own blind spots, preserved *(9.3)*

It could not run git, typecheck, any suite, any build, any generator, any runtime mutation, could
not decode audio, and could not listen. Every finding above is file evidence. C3's mutation was
re-run locally rather than believed — which is how the second false green underneath it was found.

Notably, it did **not** re-find anything the six gate-owner briefs had already fixed, which is
weak evidence that the applied fixes read as intended in the code rather than only in the commit
messages.
