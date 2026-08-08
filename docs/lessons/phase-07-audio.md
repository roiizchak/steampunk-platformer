# Vault-in — Phase 7 — Audio

Phase 7's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus nothing in §A or §B. Read them in the hub —
they are defined once, there.

### Phase 7 — Audio

- [ ] **7.1** **Ask for the physical event, not the category.** *"Very short and clean"* returned
  literal silence (−37.9 dBFS floor); *"sharp percussive attack, clearly audible and punchy"* worked.
  **Trim each cue to its first event** — but a cue with a wind-up needs the trim to reach back before
  the loudest moment. *(`Art & Audio Pipeline/Ask for the physical event, not the category.md`)*
- [ ] **7.2** **Probe one model on one cue before committing a batch.** The model whose name promised
  audio measured **−29 dBFS with no transient** against −4.3 dBFS for a dedicated SFX model, at 2.5×
  the price. *(`…/Probe one model on one cue before committing a batch.md`)*
- [ ] **7.3** **Measure hot masters with a 32-bit float decode.** A +2.00 dBFS master decoded as 16-bit
  integer reports its peak as exactly 0.0 — **the instrument saturates at the value it is supposed to
  detect.** *(`…/Measure hot masters with a float decode.md`, blocker)*
- [ ] **7.4** **Cue volume is a clipping budget and the ceiling is measured, not chosen.** Three cues on
  one frame summed to **+3.9 dBFS** at full volume, on the game's most important moment.
  *(`Platform & Performance/Cue volume is a clipping budget and the ceiling is measured.md`)*
- [ ] **7.5** **A WebAudio getter is not a readback.** On a context that has not resumed (every context
  before the first gesture) the write is scheduled and the read returns the old value. **Never assert
  on `mute` or `volume`** — keep your own flag. Teardown: unsubscribe the *exact* unlock handler and
  **remove** long-running tracks from the manager. *(`…/A WebAudio getter is not a readback.md`)*
- [ ] **7.6** Emit audio cues from inside the tick that produced them — see **2.5**.

