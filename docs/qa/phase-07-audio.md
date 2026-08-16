# Phase 7 — Audio: QA log

Nine SFX cues, two looping beds, keyboard mute and volume that persist. All fal spend `$0.23` of a
`$5` ceiling declared **before** the first generation.

Companion documents:
[`phase-07-audio-02-gate-owners.md`](phase-07-audio-02-gate-owners.md) (all six briefs, finding by
finding) · [`../generations/phase-07-audio.md`](../generations/phase-07-audio.md) (every
`request_id`) · [`../reviews/phase-07-plan.md`](../reviews/phase-07-plan.md) and
[`../reviews/phase-07-impl.md`](../reviews/phase-07-impl.md) (Codex).

## Phase 7 — the gate

Every measurement below was taken on `chromium-gpu`, headed, renderer
`angle (nvidia, nvidia geforce rtx 4080 (0x00002704) direct3d11 vs_5_0 ps_5_0, d3d11)`. No Phase 7
number comes from headless SwiftShader.

| # | Criterion | Owner | State | Evidence |
|---|---|---|---|---|
| 7.1 | Every cue plays at its event; no unloaded-sound errors, including death by kill plane | `e2e` | ✅ | `phase-07-audio.spec.ts`, 6 tests. Cues sampled from Phaser's own `sounds` list, not from a `play()` return. 11 audio files requested and served; zero audio console errors. |
| 7.2 | Worst-case simultaneous stack ≤ −1.0 dBFS, one calculation over both containers | `qa-expert` ×2 | ✅ | **−4.46 dBFS**, browser, eight sources, WAV + OGG through one `AudioContext`. RED at **+8.80 dBFS** with every gain forced to 1. |
| 7.3 | No cue is silent — measured, never listened-to | `qa-expert` ×2 | ✅ | `shipped-audio.test.ts` runs `measureCue` over the bytes in `public/`. Peaks −11.48 to −0.00 dBFS; vault 7.1's failure was −37.9. |
| 7.4 | Mute/volume persist across reload **and are re-applied to playback** | `qa-expert` ×2 | ✅ | `localStorage` for the flag; an `AnalyserNode` on `masterVolumeNode` for the playback half. Nothing reads a WebAudio getter *(vault 7.5)*. |
| 7.5 | A scene round-trip does not accumulate tracks | `qa-expert` ×2 | ✅ | Five Boot restarts leave exactly `bed-ambience, bed-music`. |
| 7.5b | Every cue catalogued, every generation has a `request_id`, **and the bytes reached `dist/`** | — | ✅ | `verify-dist.mjs` existence- **and** byte-checks all 11. All `request_id`s in the generation log. |
| 7.6 | Cues emitted from the producing tick, not a state comparison | `code-reviewer` ×2 | ✅ | Traced cue by cue in brief 1; both death paths set the edge. |
| 7.7 | No file > 400 lines without justification; diff review; adversarial pass; frame budget | `code-reviewer` ×2 + `performance-engineer` ×2 | ✅ | Justification below. Frame budget: **0.000 ms** added, **0 frames** lost of 479. Two watched red runs. |
| 7.8 | Codex **plan** review ran; every finding applied or recorded | — | ✅ | [`../reviews/phase-07-plan.md`](../reviews/phase-07-plan.md) — applied 9, recorded 1, rejected 0. |
| 7.9 | Codex **implementation** review ran on the diff | `codex` | ✅ | [`../reviews/phase-07-impl.md`](../reviews/phase-07-impl.md) — 5 answers, applied 1, recorded 3, confirmed-clean 1. Its C3 mutation was re-run locally and **passed**, proving the false green; fixing it exposed a second one underneath. |
| 7.10 | Every cue heard in context: right event, no clipped wind-up, bed loops without a seam | `play` | ✅ | **Owner listened and passed it, 2026-08-16**, on `docs/evidence/phase-07-audition.html` — every cue at its shipped gain, the six-cue worst case, and both beds at their loop point. Verdict: *"it sounds good to me."* Measurable half below. |

**Every criterion passes.** 7.10 was the last, and it is the one criterion in this phase that no
measurement could close — which is exactly why Codex's plan review (F9) argued for adding it.

The two things the numbers flagged as most likely to be wrong — the **−27.5 dBFS ambience loop
seam** and **`sfx-jump`'s 0.084 first sample** — were put in front of the owner explicitly, in that
order, and neither was heard as a defect. That is the honest scope of the pass: a human listened to
the shipped bytes at the shipped gains and accepted them. It is not a claim that the seam is
inaudible on every system, and the measured figures stay in this log so a future complaint has a
number to start from.

🔴 **The owner's first attempt at 7.10 paid for itself before it even reached a verdict.** The audition page
was silent, and diagnosing why produced a wrong hypothesis before a right one: the shipped mix puts
`footstep` at **−21.8 dBFS, only 3.8 dB above the ambience bed**, which looked like the cause. It was
not. The owner reported the game itself sounds correct in play, which outranks any measurement taken
against the audition page, and **no gain was changed**. The real cause was the page fetching a
`data:` URI, which the artifact CSP blocks under `connect-src` while leaving `<audio src="data:">`
alone — so the beds played and the cues did not. Recorded because the near-miss is the lesson: a
hands-on criterion produced a real finding on its first contact, and the finding was nearly acted on
in the wrong direction.

The `footstep` headroom figure stands as an observation worth a listening judgement in its own
right. It is **not** logged as a defect.

### 7.7 — the 400-line justification

`src/scenes/GameScene.ts` is **432 lines**, over the ceiling. `tests/unit/file-size.test.ts` permits
one such file when a `docs/qa/*.md` log names it; this is that record.

Phase 7 added four things to it: an `audio` field, `protected catalog()`, the `createAudio` call,
and one line in `update()`. Twenty-seven lines including their docstrings, on a file that stood at
386 on `main`.

**The honest position is that this file should be split, and it was not.** The seam is real —
`gameInput.ts` and `gameDev.ts` were both carved out of it for exactly this reason, and the
rendering helpers (`renderPlayer`, `renderHud`, `renderParallax`, `createParallax`, `drawLevel`,
`followPlayer`) are a coherent third group. That work was left undone because it touches every Phase
2–6 spec's scene surface and belongs in a session that can re-run the full regression against it,
not appended to an audio phase at the end of its gate.

🔴 **And the mechanical gate could not have caught the crossing.** `file-size.test.ts` accepts an
over-limit file whose path appears in **any** `docs/qa/*.md`, and `docs/qa/phase-04-art.md:239`
already named `GameScene.ts` — justifying **459 lines** on Phase 4 grounds that say nothing about
audio. So the file crossed 400 in this phase with the gate green, on a citation two phases stale.
Found by the code-reviewer's adversarial brief. The rule's *intent* is now satisfied by this
section; the *test's* inability to tell a current justification from an expired one is recorded as
a deliberate non-fix — tightening it would re-open every existing citation, which is a change for
the session that does the split.

`src/sim/types.ts` reached 402 lines while this was being written and was brought back to 398 by
moving a docstring to the function it describes. Nothing was deleted to get under the limit.

### 7.10 — what was measured, and what was not

Attack, silence to peak, decoded in Chromium from the shipped bytes:

| footstep | land | hurt | pickup | hit | attack | jump | kill | death |
|---|---|---|---|---|---|---|---|---|
| 33 ms | 32 | 35 | 35 | 46 | 66 | 79 | 842 | 1580 |

No wind-up is clipped. But **`sfx-jump`'s first sample is 0.084** where every other cue starts under
0.007, so it steps off silence and may click on trigger. Flagged, not fixed: whether it clicks is a
listening judgement.

Bed loop seams — the discontinuity a looping buffer jumps across, end to start:

| `bed-music` | **−49.9 dBFS** | inaudible |
|---|---|---|
| `bed-ambience` | **−27.5 dBFS** | 4 % of the bed's own peak — the one defect the numbers say is plausible |

The plan accepted one seam per loop and said 7.10 would *"listen for it and record it honestly"*.
This is that record with a number attached rather than a shrug.

`docs/evidence/phase-07-audition.html` (built by `tools/gen/build-audition.mjs`) plays every cue at
its catalog gain, fires the exact six-cue worst case with a live peak readout, and cues both beds to
four seconds before their loop point. It exists so the listening judgement takes two minutes.

## Measurements

### The mix is solved, not chosen by ear

Every master peaks at or near full scale, and four exceed it: at unit gain, `hurt` +0.18, `hit`
+1.81, `kill` +0.09, `bed-ambience` +0.21 dBFS. **Eight of them summed reach +7.82 dBFS.** So
per-cue gain is arithmetic, not polish. `build-audio.mjs` normalises each master to its own peak,
applies a role weight, and solves one headroom scalar (−10.82 dB) for the whole set.

🔴 **Vault 7.3 paid for itself here.** A 16-bit integer decode saturates at exactly the value it is
meant to detect, so all four of those over-scale masters would have reported a tidy 0.00 dBFS.
Everything in `audioGate.mjs` is float and nothing clamps.

### 7.2 — the beds were only ever tested at their opening

`sumPeakDbfs` aligns every source from sample zero. Correct for the six one-shot cues, which really
do trigger on the same tick. **Wrong for a bed**, which is already looping when a cue fires, so the
cue lands on an arbitrary phase of a 120-second track — and with cues at most 2.03 s long, a
zero-aligned sum only ever measured the first two seconds. 118 of every 120 went untested, and the
beds peak at **96.2 s and 17.8 s**. Each bed now contributes the window around its own peak.

| | |
|---|---|
| zero-aligned | −4.48 dBFS |
| peak-aligned (shipped) | **−4.46 dBFS** |
| every gain forced to 1 | **+8.80 dBFS** — RED |

The conclusion did not move, because the beds are mixed 24–30 dB down. It is now a conclusion about
the case that can actually occur.

### 7.7 — the percentile that could not see a 30 ms stall

The frame-budget gate was rebuilt twice, each time because a mutation said the statistic was wrong.

Draft one asserted on `workMedianMs`; its proving mutation (each cue played **50×**) passed. Draft
two added `workP95Ms`; a mutation of **30 ms of blocking work per cue** moved the p95 by 0.400 ms.

The cause is arithmetic and it generalises: **this machine serves ~479 rAF frames per 120 sim
ticks** — ~240 fps against a 60 Hz sim. A cue fires ~8 times per window, so cue frames are **1.9 %
of frames**, and the 95th percentile is the 21st slowest of 479. It never lands on one.

Frames-served can see it, because blocking the main thread costs frames directly:

| | frames with audio | without | ratio |
|---|---|---|---|
| shipped | 479 / 479 / 479 | 479 / 478 / 479 | 1.0000× |
| 30 ms stall per cue | 425 / 437 / 437 | 479 / 479 / 479 | **1.0961× RED** |

54 lost frames at a 4.4 ms interval is 238 ms — the eight 30 ms stalls, recovered almost exactly.

### 7.7 — and the millisecond bound was decoration until the toggle changed

The performance owner flagged `MAX_AUDIO_WORK_DELTA_MS` as never red-proved against the every-frame
leak its comment claimed it caught. Measuring it found worse than untested. The old A/B emptied the
sfx cache, so `audioCues()` and `playCues()` ran in **both** arms; 2 ms of per-frame work moved the
median from 0.500 to **2.600 ms in both arms** and left the delta at **0.000 ms**.

`GameScene.update()` calls `this.audio?.playCues(audioCues(events))`, and optional chaining
short-circuits the whole call expression — so the toggle now detaches `GameScene.audio` and the off
arm runs no audio code at all.

| | median on / off | delta | frame loss |
|---|---|---|---|
| shipped | 0.700 / 0.600 ms | 0.100 | 0.9979× |
| 2 ms/frame leak | 2.400 / 0.400 ms | **2.000 RED** | 1.0021× |

**Stated floor:** `sound.play()` is so cheap that **500× the shipped call rate stayed invisible** to
every statistic here. This gate catches stalls, not call counts.

## Deviations and defects recorded

| # | What | Disposition |
|---|---|---|
| D1 | PRD §5 names `tools/gen/audio-gate.ts`; shipped as `audioGate.mjs` + hand-written `.d.mts` | **Deliberate.** `tools/gen` holds 47 `.mjs` and zero `.ts`, and is outside `tsconfig`'s `include` — a `.ts` there would neither typecheck nor run. Codex confirmed in the plan review. |
| D2 | `stable-audio-3/small` rejects `duration: 180` with HTTP 422, undocumented | **Recorded.** Beds re-run at 120 s. Neither `genmedia schema` nor FAL-MODELS.md §6 records the cap; the generation log is the only place it is written down. |
| D3 | `bed-ambience` was generated on the **SFX** endpoint, not the music one the plan named | **Recorded, kept.** The result is good and `$0.0011` cheaper. The plan and the artefact disagree; the artefact wins. |
| D4 | `hit` (the vault 7.2 probe) has no generation log JSON, so **its seed is lost** | **Recorded.** `request_id` survives in the master's filename; `build-audio.mjs:104` carries the `probe-hit → hit` mapping in code rather than in memory. |
| D5 | `favicon.ico` 404s on every page load | **Pre-existing, not fixed.** Cosmetic, unrelated to audio, and invisible to `page.on('response')` because the browser issues it outside the page's request graph — which is why two probes appeared to disagree. Diagnosed rather than filtered. |
| D6 | `npx vitest run <file>` prints `PASS (0) FAIL (0)` and **exits 0** on an unimportable file | **Recorded, no fix.** It is this terminal's output wrapper, not vitest — the JSON reporter correctly reports `success: false`. `npm test <file>` gives the honest `Tests N failed` line. The same wrapper swallows Playwright `console.log`. A false-green surface worth knowing about. |
| D7 | `GameScene.ts` at 432 lines, not split | **Recorded above**, with the reason and the stale-citation hole it exposed. |
| D8 | **Phase 6's criterion 6.9 fails under full-suite load and passes in isolation** — twice failing, three times passing on this branch | **Pre-existing, and PROVEN so rather than asserted.** The full suite was re-run on pre-audio `main` in a worktree (zero audio rows in the catalog) and **the same spec failed there too** — on the main-thread ratio at 2.333× rather than the GPU one, which is the same instability wearing a different hat. So Phase 7 is not the cause. On this branch the two failures disagreed with each other as well: 0.037 → 0.092 ms (2.5×), then 0.176 → 0.623 ms (3.53×) — one baseline five times *below* the documented 0.171–0.198 ms and one inside it. Numbers that unstable are measuring the machine, not the HUD. The GPU project alone passes 38/38, so the trigger is the 47 preceding headless tests. Corroborates the performance owner's finding G37 that a gate whose clean margin is one frame in 479 is noise-sensitive in both directions. **Flagged to the owner as a real defect in Phase 6's gate, out of Phase 7's scope to fix.** |
| D8b | **Criterion 4.23 (`phase-04-assets.spec.ts:150`) now FAILS: the drawn bottom sits 14.75 px off the sim feet y while the player is not moving vertically** | **Pre-existing, PROVEN, and a real open defect — but not Phase 7's.** Verified on pre-audio `main` in a worktree: it fails there at **14.70 px** against this branch's **14.75 px**, the same defect to within a rounding. It also **passed earlier in this same session** and began failing after `npm ci` rebuilt `node_modules`, so the trigger is environmental — a dependency or Chromium version resolved differently by a clean install — not a source change on either branch. Reproducible in isolation, so it is not load-related like D8. ⚠️ **This is a merged phase's criterion silently going red and it needs its own session.** Recorded here rather than fixed because diagnosing a foot-plant regression inside an audio phase's gate is exactly the scope creep the phase workflow exists to prevent. |
| D9 | `file-size.test.ts` cannot tell a current justification from an expired one | **Deliberate non-fix.** Tightening it re-opens every existing citation; it belongs to the session that splits `GameScene.ts`. |
| D10 | A cue's *count* is not the tick's count | **By design, recorded.** `advance()` ORs `TickEvents` over up to `MAX_TICKS_PER_FRAME` ticks, so two pickups in one rendered frame play one cue. Cadence cues cannot be lost (15 ticks > 5), but simultaneous hits collapse. |

## The gate owners

Six briefs, three owners, two each, with brief 1's findings withheld from brief 2 *(A7)*. Every
finding applied or recorded with a reason *(C11)* — full detail in
[`phase-07-audio-02-gate-owners.md`](phase-07-audio-02-gate-owners.md).

**The two that mattered most were gameplay defects, not gate defects:**

- **A footstep every 250 ms while standing still.** `resolveState` takes
  `movingHorizontally = dir !== 0 || vx !== 0`, so holding a direction into a wall keeps the state at
  `run` after collision zeroes `vx`. Measured: 13 footsteps in 200 ticks at a standstill. The
  existing "does not fire while standing still" test drives IDLE input, so it tests idle, not
  standstill, and never could have caught it.
- **An out-of-phase footstep on every walk↔run change.** Two cadences (24 and 15 ticks) shared one
  counter, so releasing the walk key at a count of 20 fired instantly — on the same tick
  `playIfChanged` restarted the sprite at frame 0, putting the cue at the *start* of a stride
  instead of on a plant.

🔴 **One reviewer's headline measurement was wrong, and re-verifying is why it did not ship.** A
brief reported the beds as 7.5 s from `ffprobe` and built a blocker on it. The browser decodes them
at **119.982 s** and **119.988 s**, and the browser is the runtime. The duration claim was wrong;
the *method* claim underneath it — that zero-aligning a bed only ever tests its opening — was right,
and is larger at 120 s than it would have been at 7.5 s. A subagent's summary is a claim, not
evidence.

## Vault-out — Phase 7

**7.1 — the physical event, not the category.** Every SFX prompt names a physical event and ends
`immediate loud attack, dry, close microphone`. Nine cues, nine first-try successes, none silent.

**7.2 — probe one model first.** `hit` was generated alone, measured, and every hook built against
it before the remaining ten. Cost of being wrong: `$0.02`.

**7.3 — decode to float.** Vindicated concretely: four shipped masters exceed 0 dBFS at unit gain
and a 16-bit path would have reported all four as 0.00.

**7.4 — cue volume is a clipping budget.** Eight sources sum to +7.82 dBFS unscaled. Solved, not
tuned by ear.

**7.5 — a WebAudio getter is not a readback.** Nothing in `src/` or `tests/` reads `mute` or
`volume` back from Phaser. Criterion 7.4 asserts on `localStorage` and on an `AnalyserNode`.

**7.6 — emit cues from the producing tick.** Four new `TickEvents` fields; both death paths set the
edge; nothing is reconstructed from a state comparison.

### New, for the vault

**A percentile is blind to a minority-of-frames cost, and nobody checks the ratio.** At ~240 fps
against a 60 Hz sim, a per-tick event is 25 % of frames and a per-cue event under 2 %. `workP95Ms`
could not see 30 ms of blocking per cue. **Any spec reducing `sample()` with a percentile must check
its event rate against the frame rate first** — and `MAX_BURST_RATIO` in Phase 5 is flagged as
likely blind for the same reason, against an event that is ~0.3 % of frames.

**An A/B toggle bounds what the comparison can ever show.** Whatever both arms run divides out. The
sfx-cache toggle left `audioCues` and `playCues` in both arms, so its millisecond delta could not go
red for any defect. Choose the toggle from the widest thing the criterion names, not the narrowest
thing that is convenient to switch.

**A silent decode failure is the worst kind.** Phaser's `onProcessError` logs, emits no event, and
does not increment `totalFailed`. Images, sheets and levels each had a verification pass; audio did
not, and would have shipped a game that boots clean with no sound. Every new asset **kind** needs
its own refuse-to-route pass, and adding one is not done until a corrupt fixture has been watched
turning the boot red.
