# Vault-in — Phase 1 — Boot (Vite + Phaser 4.2.1 + TS + vitest + Playwright)

Phase 1's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus **A8** (the Vite config loader) and **B5**
(browser-harness mechanics). Read them in the hub — they are defined once, there.

### Phase 1 — Boot (Vite + Phaser 4.2.1 + TS + vitest + Playwright)

- [ ] **1.1** `src/sim/` imports **nothing** from Phaser — no `Date.now`, no `Math.random`, no DOM.
  Mechanical test: **can the sim suite run with Phaser uninstalled?** If not, the boundary is
  aspirational. This is what made vitest usable at all last game.
  *(`Architecture/The simulation imports nothing from the engine.md`, blocker)*
- [ ] **1.2** Vite config loader: `.ts` extension, not `.js`. See **A8**.
- [ ] **1.3** **The asset loader must refuse to route past boot if any expected texture is missing** —
  blocking a 404 *and* a corrupt 200. *(`Art & Audio Pipeline/A silent fallback for a missing input is the bug.md`, blocker)*
- [ ] **1.4** Loader has **no timeout by default**; a request that never resolves hangs boot forever.
  Last project measured this and **deliberately did not fix it** — the failure direction is safe.
  Decide consciously and record the decision.
  *(`Process/Re-derive a finding's blast radius before accepting its framing.md`)*
- [ ] **1.5** **Decide pixel-art vs. smooth filtering ONCE and assert it.** Phaser's scale-mode
  constants are reversed from intuition (linear = 0 and default, nearest = 1) — the pinning assertion
  needs a comment. A **CSS pixel-snapping property silently contradicted the engine-side decision on
  every phone** last time. *(`Platform & Performance/Mipmaps exist only for power-of-two textures.md`, costly)*
- [ ] **1.6** **Decide per seam, up front, which side of the build gate it lives on.** Production is a
  real build; dev seams are absent, so you cannot reach for a debug seam to diagnose production.
  → Applies to `window.__game`. *(`Deployment & Tooling/A push to main is a production deploy.md`, blocker)*
- [ ] **1.7** Reset scene state in the **`init` hook, not the constructor**; scene starts are queued.
  Both facts turned into real defects last time. *(`Process/Invoke the tools a spec names…md`)*

