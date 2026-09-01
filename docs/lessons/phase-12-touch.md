# Vault-in — Phase 12 — Touch and responsive support

Phase 12's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus **B5** (browser-harness mechanics) and **A7**
(two briefs per agent-owned gate). Read them in the hub — they are defined once, there.

### Phase 12 — Touch and responsive support

- [ ] **12.1** **A feature is not shipped until the whole path to it is shipped.** The plan's first
  Codex blocker was that all three terminal screens — title, level menu, level-complete — are
  keyboard-only, so in-play controls alone would have produced a phone build nobody could start.
  Ask what the player must do *before* reaching the thing being built.
  *(`Process/Ship the path, not just the feature.md`, blocker)*
- [ ] **12.2** **A decision function used as its own oracle cannot fail.** Sharing one predicate
  between production and its test stops two copies drifting and simultaneously makes the gate blind:
  a pure layout predicate is green with nothing drawn. Measure the live objects, and keep the shared
  function on the production side only. *(vault 2.12 + C2, blocker)*
- [ ] **12.3** **Never infer a generated image's dimensions from its aspect label.** `nano-banana-pro`
  returns UNMEASURED dimensions and `16:9 @ 2K` once came back `2752 × 1536`. This phase wrote a
  hardcoded crop constant *twice* before the review caught it. Decode, measure, record, then crop.
  *(4.11, blocker)*
- [ ] **12.4** **Anything the ENGINE applies per rendered frame or per presented pixel is outside the
  tick rule.** Phase 10 learned this twice; here it is the FIT scale, which turns a game-pixel button
  into a CSS-pixel touch target that shrinks to 20 % on a phone. A size in game pixels is not a size.
  *(Phase 10 traps 10 and 11)*
- [ ] **12.5** **`scene.launch` always queues; scene shutdown preserves the instance.** So "first
  launch is deferred, relaunch is immediate" is wrong — both are deferred, and a stale readiness flag
  binds onto a destroyed layer. One path, with the flag reset on SHUTDOWN.
  *(`Engine/Phaser scene lifecycle is queued, not synchronous.md`, blocker)*
- [ ] **12.6** **Phaser cleans up its own listeners and nothing else.** `InputPlugin` removes its
  scene listeners on shutdown; a subscription on `game.events` survives and holds the dead object
  alive. Every external listener needs an explicit teardown and a mutation proving it.
  *(vault 9.3)*
- [ ] **12.7** **A criterion that a correct implementation cannot satisfy is a defect in the gate.**
  "Tick unchanged under the rotate prompt" was unsatisfiable — `Game` is RUNNING there by design.
  Read a new criterion against the behaviour it is asserting, not only against the bug it is
  preventing. *(C2)*
- [ ] **12.8** **A partition must be total by construction.** `(?!perf)` for behaviour plus an exact
  perf regex leaves a future `phase-12-perf-b.spec.ts` matching neither project — `0 passed`, exit 0,
  indistinguishable from a clean run. Define one set and subtract. *(Phase 9, C2)*
- [ ] **12.9** **Detect greenness positively, including the count**, and never through a pipe. New
  Playwright projects make this sharper: assert the per-project collection count. *(C2, Phase 9)*
- [ ] **12.10** **Grey-box before art**, and the ceiling before the first generation. The touch-UI
  `$5` is recorded in Global Constraints before a byte is spent, and the art ceiling's three-session
  overrun is settled in the same edit. *(4.2b)*
- [ ] **12.11** Kill every server by port before reporting done — 5173 and 4173. *(C13)*
