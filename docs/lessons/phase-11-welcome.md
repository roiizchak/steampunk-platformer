# Vault-in — Phase 11 — Welcome screen & volume repair

Phase 11's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus **B5** (browser-harness mechanics). Read them
in the hub — they are defined once, there.

### Phase 11 — Welcome screen & volume repair

- [ ] **11.1** **Reproduce in the running game before touching a line, and instrument rather than
  argue** — the fifth report of an invisible blocker was our own previous fix, and this phase's bug
  had three plausible causes that only a measurement could separate. When two explanations disagree,
  the instrument costs less than the argument. *(`Process/When two plausible fixes disagree,
  instrument instead of choosing.md`, blocker)*
- [ ] **11.2** **A gate watched failing is the only gate worth having**, and the mutation must be
  confirmed both applied and reverted — by "content changed AND the original count dropped by one",
  never by "the count is now zero". *(`Testing/A regression test you have not watched fail is
  decoration.md`, blocker)*
- [ ] **11.3** **A green suite proves only what it pressed.** Every existing audio spec drove a
  US-layout key, so the whole suite was green against a build whose volume controls did not work on
  the owner's keyboard. Play it, on the hardware the player has. *(`Process/Only playing it
  found this.md`, blocker)*
- [ ] **11.4** **A comment describing a mechanism that does not exist turns nothing red.** The audio
  block's comment explained a gate that the fix moved; correct it in place rather than leaving a
  true-sounding sentence about a binding that is gone. *(`Testing/A comment describing a mechanism
  that does not exist turns nothing red.md`, blocker)*
- [ ] **11.5** **Record what was decided not to fix, with the measurement.** The volume step is
  linear and 0.1 wide, so one press near the top is about 1 dB and the ceiling press is a clamped
  no-op — real, separate from the dispatch defect, and deliberately not fixed here.
  *(`Process/Record what you decided not to fix, with the measurement.md`)*
- [ ] **11.6** Kill every server by port before reporting done — 5173 and 4173. *(C13)*
