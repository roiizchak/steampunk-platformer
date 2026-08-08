# Vault-in — Phase 9 — Polish, juice, particles

Phase 9's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus **B1** (no vault coverage of performance or
particle cost). Read them in the hub — they are defined once, there.

### Phase 9 — Polish, juice, particles

- [ ] **9.1** **Hang game logic on the delta-driven clock; keep tweens decorative.** Phaser's tween
  manager reads the system clock and **does not advance under a pumped test clock at all** — anything
  sequenced off a tween completion is untestable *and* one interrupted tween from deadlock.
  **Killing tweens by target kills every tween on that target**: an entry fade and a selection scale
  sharing an object left menu cards permanently at alpha 0, invisible, **with the full suite green**.
  Track the specific tween; have a fade force-settle its end value on stop as well as on complete.
  *(`Platform & Performance/Tweens run on the wall clock; the frame clock runs on the delta.md`, blocker, phaser)*
- [ ] **9.2** **Pick a threshold from what is correct, not from what currently passes.** A tolerance of
  60 with four shipped sheets at exactly 60 and a strict comparison = an unreachable failing branch.
  Four-part rule: pick from correct; commit fixtures on **both** sides; have the fixture call the
  **real gate**; **pin the threshold as a literal in its own assertion.**
  *(`Testing/A threshold set to the worst observed value has an unreachable branch.md`, blocker)*
- [ ] **9.3** **Say plainly what a gate does not cover, and prefer an honest recorded number to a gate
  that cannot fail.** A blob count that found the third leg was **deliberately not shipped as a gate**
  because no threshold would mean anything. Animation checks were **advisory (always exit 0)** by
  design; box-vs-art was a **hard gate** because it had a defensible threshold.
  *(`Process/Say plainly what a gate does not cover.md`; `Prefer an honest recorded number to a gate that cannot fail.md`)*
- [ ] **9.4** **B1 applies: the vault has nothing on particle cost or frame budget.** Phase 9 generates
  new lessons. Beware summary statistics — *"frame rate cannot distinguish 'fast' from 'not drawing
  anything'."* *(`Game Feel & Balance/A win rate cannot tell stronger from more passive.md`)*

