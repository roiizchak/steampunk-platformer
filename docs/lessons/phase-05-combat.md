# Vault-in — Phase 5 — Enemies, hazards, combat + Enemy Gym

Phase 5's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus nothing in §A or §B. Read them in the hub —
they are defined once, there.

### Phase 5 — Enemies, hazards, combat + Enemy Gym

- [ ] **5.1** Episode-committed AI decisions — see **2.9**. **Direct hazard for enemy patrol AI.**
- [ ] **5.2** **Equal duty cycle is not equal difficulty.** Committing to episodes kept the marginal
  probability identical and moved per-window variance from **4.95 to ~99**. A player fights the
  distribution, not the mean. *(`Game Feel & Balance/Equal duty cycle is not equal difficulty.md`)*
- [ ] **5.3** **Two definitions of one concept is where the bug lives.** When a test or tool needs a
  judgement production already makes, **import it**. A restated predicate drifts — and it drifts in the
  direction that makes your numbers look good. Cost: every strength number in a shipped phase
  (63.2% → 30.1% against a repaired benchmark).
  *(`Architecture/Two definitions of one concept is where the bug lives.md`, blocker)*
- [ ] **5.4** **Whenever a result is "X versus Y", Y needs the same scrutiny as X.** The benchmark
  opponent entered block-stun **0 times across 48 matches while taking 1,169 hits**, and its docstring
  called it "a competent human". **A benchmark harness feels like infrastructure rather than code
  under test.** *(`Testing/The benchmark opponent is half of every measurement.md`, blocker)*
- [ ] **5.5** **When a measurement is exactly 0 or exactly 100%, ask whether the branch ran at all.**
  A fixture seeded 1..20 passed the first probability check every time and never reached the branch
  under test. **0 of 20 reads exactly like a dead feature.**
  *(`Testing/A fixture can switch off the branch it is testing.md`, blocker)*
- [ ] **5.6** **A golden/characterisation hash is silent about coverage.** Pair every golden file with:
  *which branches did this scenario actually execute, and how many times.*
  *(`Testing/A characterisation hash is only as good as the code paths its fixture reaches.md`, blocker)*
- [ ] **5.7** **Tune on one seed set and gate on another**, and **report the spread, not the headline**
  — a set spanning 53.0–65.8% with σ 4.8 and one block below the floor is concealed entirely by a
  single in-range number. When a comparison ties, **lengthen the measurement; do not loosen `<` to
  `<=`.** *(`Testing/Tune on one seed set and gate on another.md`)*
- [ ] **5.8** **Any cross-entity comparison of an absolute stat is suspect.** A round timer compared
  raw health when one character had 105 and others 100 — two fighters who never touched each other
  ended 2–0 on time, through 299 unit + 72 browser tests. **A test comparing two entities must use two
  *different* entities; a symmetric fixture is not a test of a comparison.**
  *(`Game Feel & Balance/Any cross-character comparison of an absolute stat is suspect.md`, blocker)*
- [ ] **5.9** **Closing a measurement gap is a balance decision, not a repair.** Setting every hitbox
  to match its art would have given the widest character the worst effective reach and brought back
  the original complaint. **The measurement was correct and the repair was a nerf.**
  *(`Game Feel & Balance/Closing a measurement gap is a balance decision, not a repair.md`)*
- [ ] **5.10** **A global content change must be expressed in the variable the invariant is written
  in.** Additive preserves differences, multiplicative preserves ratios, **normalisation preserves
  neither**. *(`Game Feel & Balance/A roster-wide reach change must be a uniform delta.md`, blocker)*
- [ ] **5.11** **Check that waste is waste before you remove it** — partition the population and check
  each part. A "fix" for a 0.3% case un-exempted a category that was **32% of the volume and doing
  exactly its job**: fourteen points of win rate that would have shipped as a bug fix.
  *(`Game Feel & Balance/Check that waste is waste before you remove it.md`, blocker)*

