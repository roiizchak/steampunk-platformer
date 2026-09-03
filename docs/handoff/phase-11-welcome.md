[← HANDOFF.md index](../HANDOFF.md)


# Session handoff — Phase 11, the welcome screen and the volume repair

> # ✅ Phase 11 is COMPLETE — every criterion has a verdict and every verdict is a pass.
>
> The owner walked all four hands-on criteria on 2026-08-29 and **broke one of them by playing**:
> at volume 50 the game was barely audible. That is now fixed, measured, and gated. Merged to `main`.
>
> Three things in this phase were found by a human at the keyboard and by nothing else: the volume
> keys answering on **both** the Hebrew and the English layout, the first build reading as *"not
> looking good"*, and the loudness defect. **No gate in this repo could have produced any of them.**

## What shipped

**The volume bug, root-caused by measurement.** Phaser dispatches on `event.keyCode`
(`KeyboardPlugin.js:747`) — layout-dependent for punctuation, stable for letters, which is exactly
the split the owner reported (`M` worked, `[` / `]` did not). Audio keys now go through a raw DOM
listener on `event.code`, with its own `event.repeat` guard in **two** places, because the shared
mapper cannot share one.

**The welcome screen**, in both `config.ts` arms, as a parallel scene over a PAUSED `Game`. Redesigned
2026-08-29 after the owner said the first build *"is not looking good"*: a single static fal plate,
a full-width dimmed band, and ENTER to the level menu as the only way in.

**The mix repair — the defect the gate could not see.** `MIX_DB` was applied to peak-normalised
signals for the ten WAV cues and to the raw file for the two OGG beds, because Node cannot decode
OGG and `normalise` falls back to 1. With a 19 dB crest factor a `-13` landed ~19 dB lower on a bed
than on a one-shot. Beds are now mixed by measured RMS: **+12.05 dB**, −43.6 → −31.6 dBFS RMS
together, criterion 7.2 re-measured at −3.33 against its −1.0 ceiling.

## The traps, and they are not visible in the code

**`gameHarness.dismissTitle` SKIPS the screen through `__phaserGame`.** It does not press the keys a
player presses, and its docstring says why: walking the real route changes which level loads (menu
opens on the furthest unlocked, boot resolves the saved one) and when the sim starts. ~40 specs
depend on both. The player route is covered by exactly one spec, in
`phase-11-title-routes.spec.ts` — **do not delete it**, it is the only thing standing between a
broken `LevelSelectScene.play()` and a green suite.

**The `dismissed` latch in `TitleScene` has NO live gate**, deliberately and recorded. The sequence
it was written against needed `onPlay`, which is gone. Its docstring carries the reasoning; do not
"fix" the test that no longer gates it by inventing an assertion.

**`polishSeries.installRecorder` waits out the SPAWN's landing shake.** The spawn is a touchdown,
`landedTick` is 0, and `SHAKE.land` runs three ticks. The recorder was installing on tick 2. That
race was always there — the welcome screen only changed which side of it we landed on.

**`prodTitle` presses ENTER TWICE**, with a measured darkening bound between the presses as the
barrier. Production ships no debug surface, so pixels are the only signal.

🔴 **The audio gate that let a 25 dB defect ship was `max(bed.gain) < min(cue.gain)`** — the
same unit mismatch as the bug, so it was green the whole time. It is replaced, not re-bounded, and
**my first replacement was also wrong** in the other direction. Both mistakes are written into
`tests/unit/shipped-audio.test.ts`'s own docstring before you touch it.

⚠️ **The title plate must not contain a band.** The screen composites its own 0.82 scrim over the
middle third. Variant A was unusable because the prompt mentioned the compositing and the model drew
it. Describe what the IMAGE contains, never what will be laid over it.

## What is still owed — carried forward, not part of this phase

- **A fal ceiling FIGURE.** Spend is $55.50 against a last-stated ceiling of $55. Every overrun is
  cleared by an explicit owner decision; no new number has ever been named, and the log refuses to
  invent one.
- **No cancel route out of `LevelSelectScene`** — accepted in the plan, still true.

## The step size and the readout — fixed after the phase closed

The owner said *"yeah, fix it"* on 2026-08-29, so the deliberate non-fix became a fix. Two things:

**`VOLUME_STEP = 0.1` was an even step in the wrong unit.** Loudness is logarithmic; a tenth of gain
is 0.92 dB at the top of the range and 6.02 dB at the bottom, from the same key. It is now
`VOLUME_LADDER` — ten stops ~3 dB apart. ⚠️ **The printed percentages are deliberately uneven**
(100, 71, 50, 35…) because the *ratio* is what the ear hears; a ladder whose numbers look even is
the one that failed.

**The controls banner now prints the level**, which is the only readout in play and the whole answer
to *"`]` does nothing at 100 %"*.

⚠️ **Desktop only from 2026-09-01 (owner decision).** A touch device draws **no banner at all** — `helpLine` returns `''` there, above the DEV suffix. The volume is not the game's to report on a phone: the player sets it with the hardware keys and the OS draws its own overlay. Everything below describes the keyboard build, which is unchanged. `gameInput` emits `AUDIO_CHANGED`; `HelpBannerLayer` marks itself
dirty and its next **layout** re-reads a content provider.

🔴 **Re-reading on layout rather than on the event is load-bearing, and the first version got it
wrong.** `attachHud` runs **before** `createAudio` in `GameScene.create()`, so a layer that only
re-read on the audio event drew a banner with no level in it until the player pressed a key — with
every unit gate green, because the fake's provider is ready immediately. An e2e test caught it.

## Two perf gates flake under full-suite load

`phase-05-perf` 5.11 and `phase-06-perf` 6.9 both failed one full `test:e2e` run and **both pass in
isolation**. GPU-ratio statistics whose denominator collapses when the box is busy — the shape
`docs/QA-LOG.md` already records. The final run before the merge failed `phase-09-polish` 9.1 and
`phase-10-production`'s dev-seam budget instead; both passed alone, 4 and 6 specs, at the same
sitting. **The full suite's wall-clock-bounded specs read a busy box as a broken game** — the rule
in CLAUDE.md §5 is not advisory.

---
