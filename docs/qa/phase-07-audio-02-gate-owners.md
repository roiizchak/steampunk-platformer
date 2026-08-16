# Phase 7 — the six gate-owner briefs, finding by finding

Companion to [`phase-07-audio.md`](phase-07-audio.md). Three owners, **two briefs each** *(A7)*,
dispatched in parallel so brief 1's findings could not reach brief 2. Every finding is **applied**
or **recorded with a one-line reason** *(C11)*; none is silently dropped.

**Tally: 31 findings. Applied 18. Recorded 12. Rejected 1.**

Every claim was re-verified locally before disposition *(C6)*. One was wrong — see G12.

---

## `voltagent-qa-sec:qa-expert` — criteria 7.2, 7.3, 7.4, 7.5

### Brief 1 (checklist) — verdicts: 7.2 PASS · 7.3 PASS · 7.4 PASS · 7.5 PASS

The owner independently re-derived the eight-source worst case against the mechanics — `advanceStride`
requires `walk`/`run` so `attack` is excluded; `worldDamage` makes `hurt`/`died` mutually exclusive;
the buffered-jump rule excludes same-tick `jump`+`land` — and it matched. It also ran the suites
itself: 86 unit tests, 13 e2e on `chromium-gpu`, and killed the dev server afterwards *(C13)*.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| G1 | MEDIUM | `WORST_CASE_STACK` written out identically in `build-audio.mjs` and `phase-07-clipping.spec.ts`, with nothing asserting they agree. A ninth simultaneous source added to one and not the other leaves the gain solver optimising a mix the gate no longer measures — Codex F2's shape, one level up: list identity instead of arithmetic identity. | **APPLIED.** `audioGate.mjs` owns the list; both import it. |
| G2 | LOW | The two containers get differently-shaped floor checks: WAV cues pre-gain per file at −20 dBFS, OGG beds only post-gain inside the mixed stack at −40. No independent check on a bed's own file-level peak. | **RECORDED.** Verified not live: a −37.9 dBFS master plus the beds' catalog gain lands at −54 to −64 dBFS, well under −40. The margin currently comes from the beds' gain being large, not from an instrument. |
| G3 | INFO | The "eight sources is the true worst case" claim rests on three sim invariants that hold today and are documented, but nothing goes red if a future `src/sim/` change breaks one. | **RECORDED.** Noted in `audioGate.mjs`'s docstring beside the list. |

### Brief 2 (adversarial) — *how could every gate be green while the feature is broken?*

| # | Severity | Finding | Disposition |
|---|---|---|---|
| G4 | BLOCKER | 7.2 sums every source frame-aligned from sample zero. Right for one-shot cues, wrong for a looping bed: a cue lands on an arbitrary phase of the loop, so a zero-aligned sum only ever tests the bed's opening. | **APPLIED** — and it is the single most valuable finding of the six briefs. Each bed now contributes the window around its own peak. The beds peak at 96.2 s and 17.8 s; neither was in the old window. −4.48 → **−4.46 dBFS**; red run moved +7.00 → **+8.80**. |
| G5 | — | The same brief reported the beds as **7.53 s / 7.62 s** from `ffprobe` and built G4's severity on it. | **REJECTED on the measurement, ACCEPTED on the method.** The browser decodes them at **119.982 s** and **119.988 s**, and the browser is the runtime. Re-verified before acting: the duration was wrong, and the method flaw underneath it is *larger* at 120 s. |
| G6 | MEDIUM | `playCues` has no `sound.locked` guard, unlike `startBeds`. `BaseSound.play` sets `isPlaying` unconditionally, and `manager.locked` only clears on the update after `context.resume()` settles — so a cue fired by the very first gesture can be scheduled on a suspended context. `bootToGame` clicks the canvas first, so no spec can ever reach it. | **RECORDED, not fixed.** The brief itself could not establish the audible consequence, and WebAudio semantics suggest the cue is delayed rather than dropped. Fixing it blind would add a guard nothing can exercise. Listed for 7.10. |
| G7 | — | Checked clean: the `AnalyserNode` tap on `masterVolumeNode` genuinely reads post-mute output — Phaser's graph is `source → gain → masterMuteNode → masterVolumeNode → destination`, verified in the Phaser source. | No action. |
| G8 | — | Checked clean: dev scenes bypass `BootScene` but `createAudio` self-guards by calling `destroyAudio` at its own top, so no accumulation off the Boot path. | No action. |

---

## `voltagent-qa-sec:code-reviewer` — criteria 7.6, 7.7

### Brief 1 (checklist) — verdicts: **7.6 PASS · 7.7 FAIL**

7.6 was traced cue by cue against `tick.ts`, and both death paths confirmed: the kill plane's
`killPlayer` + early return at `worldDamage.ts`, and lethal damage, with `wasDead` and
`damagePlayer`'s `state === 'death'` refusal preventing a double edge on either.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| G9 | BLOCKER | `MAX_AUDIO_WORK_DELTA_MS = -1` in the working tree against a committed `0.5` — an unreverted red-run mutation. | **TRANSIENT, already reverted.** The brief read a live tree mid-experiment. Real per *(C12)* as a process observation, and the reason the revert discipline exists. |
| G10 | HIGH | The working tree was dirty and the uncommitted half was the toggle rework, so `git diff main...HEAD` — what Codex reads for 7.9 — was not the diff on disk. | **APPLIED.** Committed before the Codex review was dispatched. |
| G11 | HIGH | `docs/qa/phase-07-audio.md` does not exist, so 7.7's written justification is missing and `bootAssets.ts` cites a dangling file *(C9)*. | **APPLIED.** This document and its parent. |
| G12 | HIGH | `file-size.test.ts` accepts `GameScene.ts` because `phase-04-art.md` names it — a citation justifying 459 lines on grounds that say nothing about audio. The gate is green on a crossing it exists to catch. | **APPLIED in part, RECORDED in part.** Current justification written; the test's inability to tell current from expired is D9, deliberately deferred. |
| G13 | MEDIUM | Boot has no audio verification step. Phaser's decode failure is silent — `onProcessError` logs, emits nothing, does not increment `totalFailed` — so a build boots clean and ships with no sound. | **APPLIED.** `verifyAudio` added to `bootAssets.ts` and wired into `BootScene.create()`. Red-proved with a valid-length file of garbage bytes: `[boot] refused to route: audio "sfx-hurt" did not decode`. |
| G14 | MEDIUM | `window.localStorage` evaluated at the argument position, outside every guard. The **property getter** throws on a storage-refused origin, inside `GameScene.create()` — the `ready:false`/`bootError:null` hang. | **APPLIED.** `safeLocalStorage()` in `audioSettings.ts`; read/write accept `null`. |
| G15 | LOW | `build-audio.mjs`'s printed "shipped stack" figure is computed from unclamped, unrounded gains, so it would over-state the mix the moment the clamp bites. | **RECORDED.** All gains are currently < 1 so the two agree. |
| G16 | LOW | Beds enter the gain solve as a constant block assumed to peak at full scale, and get `normalise = 1` while cues are peak-normalised, so `MIX_DB` means different things for the two groups. | **RECORDED.** The browser measurement (7.2) is the authority on the shipped mix and is now bed-peak-aligned; the solver's model only has to err conservatively. |
| G17 | LOW | Master selection is `readdirSync(...).find(startsWith(prefix))`, so two masters for one cue makes the "idempotent" claim in the header false and the choice OS-dependent. | **RECORDED.** One master per cue today. |
| G18 | LOW | `audio-cue-edges.test.ts` asserted `state === 'death'` twice where the second was meant to assert the kill plane raises no hurt edge; `hurtOn` was returned and destructured away. | **APPLIED.** Now `expect(hurtOn).toEqual([])`. |
| G19 | LOW | `measureCue`'s `floorDbfs` is near-tautological — the quietest non-zero sample in any 16-bit file is one LSB, so `peakDbfs > -20` is the only assertion carrying 7.3. | **RECORDED.** True and worth knowing; the peak assertion is the one that matters and it is the one that would catch vault 7.1's failure. |
| G20 | LOW | `waitForCue`'s failure message stringified an unawaited Promise, printing `Recorded: {}` — on the failure path, where the message is the whole point. | **APPLIED.** Awaited. |
| G21 | LOW | `playCues` is not gated on `sound.locked`. | **RECORDED** — same as G6, found independently. |
| G22 | LOW | `FOOTSTEP_TICKS` is pinned as a *cadence* against the catalog, but the docstring's "the sound lands with the frame the player is watching" is a *phase* claim resting on the assumption that frames 12 and 0 are the plant frames. | **RECORDED.** Only 7.10 can settle it; listed there. |
| G23 | LOW | `verify-dist.mjs` used `catalog.audio ?? []`, so a dist catalog that lost its audio array passed with "0 audio file(s) shipped byte-identical". | **APPLIED.** A missing or empty array is now a failure. |
| G24 | LOW | The audio key bindings decided whether to exist from `this.audio`'s value at bind time — correct only because `createAudio` runs two lines earlier. | **APPLIED.** The getter is passed unconditionally; `gameInput.ts` null-checks per press. |

### Brief 2 (adversarial) — *what did the author get wrong that the tests agree with?*

| # | Severity | Finding | Disposition |
|---|---|---|---|
| G25 | HIGH | **A footstep every 250 ms while standing still against a wall.** Measured: 13 in 200 ticks, `vx` exactly 0, state `run`. | **APPLIED.** `advanceStride` tests `vx` directly. Red-proved: footsteps at ticks 135/150/165/180/195 before the fix. |
| G26 | MEDIUM-HIGH | **A walk↔run change carries the counter** and fires on the first tick of the new gait, while `playIfChanged` restarts the sprite at frame 0 — the cue lands at the start of a stride instead of on a plant. | **APPLIED.** `PlayerSim.strideGait` remembers the gait; a change restarts the count. Red-proved (my first attempt at the failing test proved nothing — the player spent 16 ticks falling and the counter only reached 7). |
| G27 | MEDIUM | The 7.2 stack contains `land + footstep`, which the sim cannot produce, and the shipped gains were solved against it. Measured: −4.55 dBFS with it, −4.72 without. | **RECORDED, kept, comment corrected.** Over-conservative by 0.17 dB is the only direction a worst case may err in. The test comment claiming "every pair is individually reachable" was false and is fixed. |
| G28 | MEDIUM | 7.7 is calibrated on the lightest cue profile the game produces — a straight sprint, never more than one cue on a tick — and the stated-limits block does not name it. | **RECORDED.** Named in the spec's limits and here. Raised independently by the performance owner (G31). |
| G29 | MEDIUM | `playerHurt` and `playerDied` are exclusive per **tick** but `mergeEvents` ORs up to five ticks into one frame, so a hazard hit at T and a kill plane at T+1 play both cues — the outcome the per-tick exclusion exists to prevent. | **APPLIED.** Suppression added in `audioCues`, the only layer that sees the batch. Red-proved. |
| G30 | LOW | `attack` is excluded from the 7.2 stack on a justification that does not hold — what clips is what is *sounding*, not what *started*, and `attack.wav` (230 ms) overlaps `hit`/`kill` on every finishing blow. The owner measured it anyway: +attack costs 0.06 dB, and staggering at real 6/26/46-tick offsets *reduces* the sum to −5.23 dBFS. | **RECORDED.** Safe by ~3 dB. Recorded so the next reader does not re-derive it. |
| — | LOW | `PlaygroundScene` inherits the audio keys and leaves `playerInputEnabled` true, so a mute toggled in a dev scene writes the player's real `localStorage`. `GymScene` binds `M` to zoom. | **RECORDED.** Both dev-only and absent from `dist/`. |
| — | LOW | Every `GameScene.create()` restarts both beds from zero, so a dev scene toggle cuts the music. 7.5 counts tracks, not continuity. | **RECORDED.** No level transition exists yet; it becomes real in Phase 8. |
| — | LOW | Three hardcoded line counts in comments, all wrong in both directions over time. | **APPLIED.** Deleted rather than corrected — a line count in a comment is a fact with an expiry date and no test. |

Checked and reported clean: `playerAttack`'s `kills` (a corpse is skipped before anything
increments); `worldDamage`'s per-tick hurt/died exclusivity; `audioCues` ordering determinism and
its completeness gate; `destroyAudio` idempotency.

---

## `voltagent-qa-sec:performance-engineer` — criterion 7.7's frame budget

### Brief 1 (checklist)

Found the frames-served instrument sound, `MAX_AUDIO_FRAME_LOSS_RATIO = 1.02` defensible at ~10× the
one-frame noise floor, and the A/B toggle honest *at the time* — see G31 for what changed.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| G31 | HIGH | **Cross-phase:** the percentile-blindness diagnosis generalises to `MAX_BURST_RATIO` in `phase-05-perf.spec.ts`. Ten sentries volley on **one tick**, ~2 of ~720 frames (~0.3 %) — below even the 1.9 % this phase proved invisible. Its only red-proof on record is a *per-frame* O(n²) sweep, which the median catches on its own; nobody ever injected a burst confined to the volley tick and watched `burstRatio` respond. | **RECORDED, not fixed.** A merged phase's gate is out of Phase 7's scope, and re-proving it needs its own session and its own mutation. **Flagged to the owner as the most valuable finding of the six briefs.** Phase 6 is unaffected — it never gates main-thread p95. |
| G32 | MEDIUM | `MAX_AUDIO_WORK_DELTA_MS`'s stated purpose — an every-frame leak — was never mutated and watched fail. | **APPLIED, and it was worse than untested.** Measuring it showed the old toggle left `audioCues`/`playCues` in both arms, so 2 ms/frame moved the median to 2.600 ms in *both* and the delta stayed 0.000. Toggle replaced with a whole-feature detach; bound now red-proves at 2.000 ms. |
| G33 | MEDIUM | No criterion measures decoded-audio-buffer memory residency; 7.5 counts live playing `Sound` instances, a different leak shape. | **RECORDED.** Genuinely unmeasured. |
| G34 | LOW | Boot decode cost is unmeasured project-wide; `BOOT_TIMEOUT` is a hang detector, not a budget. | **RECORDED.** Not this criterion's job; worth a phase of its own. |

### Brief 2 (adversarial) — *this concluded audio is free. How is that wrong?*

| # | Severity | Finding | Disposition |
|---|---|---|---|
| G35 | HIGH | The measured cue pattern is a straight sprint — one cue every 15 ticks. The game's own defined worst case is **eight simultaneous cues on one tick**, which is 1 frame in 479 and invisible to every statistic used. | **RECORDED.** Same as G28, found independently by a second owner, which is the point of running two. The honest scope of the 7.7 result is "the spread-cue profile". |
| G36 | HIGH | Not shown to transfer off this machine: ~240 fps on an RTX 4080. At 60 fps the frame budget is 4× tighter and GC pressure from per-cue allocation scales with allocation, not with CPU headroom. | **RECORDED.** True of every performance number in this project; CLAUDE.md §5 already says only same-session interleaved A/Bs decide anything. |
| G37 | HIGH | Frames-served is noise-sensitive in both directions: the clean margin is **one frame in 479** inside a bound tolerating ~9. A stray GC in the on-window is a false red; in the off-window, a false green. | **RECORDED.** Corroborated the same evening by D8 — Phase 6's GPU ratio failing once in a full-suite run and passing twice in isolation. |
| G38 | MEDIUM | `resetRun` does not reset `strideCounter`, `state` or `facing`, so leftover cadence phase carries into the same arm position each pair rather than cancelling — contradicting the comment's "every window starts identically". | **RECORDED, not fixed.** Real gap between claim and code; impact on a 0.000 ms delta is nil, and `strideCounter` is now reset by `advanceStride` on the settle ticks anyway. |
| G39 | MEDIUM | Audio-thread cost is structurally invisible and its only backstop is 7.10, which had not run. | **RECORDED.** 7.10's measurable half has now run; the listening half is still owed. |
| G40 | LOW | Confirmed clean: `playCues` runs the identical `exists()` check in both arms, so the on arm is a strict superset; `setCues` is awaited before `sample()` so it cannot contaminate the window. | No action — and superseded, the toggle was replaced under G32. |
| G41 | — | Could not verify the "500× stayed invisible" claim, since re-running it needs an edit to `audio.ts` the brief forbade. | **Fair.** Re-measured locally and recorded in the parent log. |
