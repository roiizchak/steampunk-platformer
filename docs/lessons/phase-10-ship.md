# Vault-in — Phase 10 — Build & ship

Phase 10's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus **B5** (browser-harness mechanics). Read them
in the hub — they are defined once, there.

### Phase 10 — Build & ship

- [ ] **10.1** **After a toolchain upgrade, diff the *outputs*, not only the changelog** — compilation
  target, module format, minifier defaults. A Vite major raised the default browser target to
  chrome111/safari16.4, **moving a user-facing contract nobody chose**. Write the accepted value down
  with reversal instructions attached. *(`Deployment & Tooling/A dependency upgrade can move your minimum browser contract.md`)*
- [ ] **10.2** **A post-upgrade size change is a hypothesis, not a finding.** The raw-vs-compressed
  ratio is a fast discriminator: real content removal moves both, syntax downlevelling moves mostly
  raw. *(`…/Check downlevel-helper counts before calling a size drop a regression.md`)*
- [ ] **10.3** **Typecheck the build config as a separate program with Node types**, and include the
  plugin directory in the test include list. *"The rigour applied to a file should follow what the file
  decides, not where it sits in the tree."* *(`…/Config files typechecked by nothing…md`, blocker)*
- [ ] **10.4** **A push to main is a production deploy.** Say what you are deploying; a push is a
  release, not a save. **Learn the rollback command before you need it** — the build-with-production-
  config command creates a production deployment *and moves the domain onto it*; it would have shipped
  mid-audit. *(`…/A push to main is a production deploy.md`; `The deploy command that reads like a dry run is a release.md`, blocker)*
- [ ] **10.5** **CSP details that cost time:** image sources need `data:` and `blob:`; `connect-src`
  needs `'self'` (the loader is XHR-based for JSON *and* images); **keywords must be quoted** — bare
  `self` is a hostname pattern and **blanks the game rather than erroring**; `style-src 'unsafe-inline'`
  is load-bearing because the scale manager writes inline margins.
  *(`…/A preview deploy behind SSO cannot gate a security header.md`, blocker)*
- [ ] **10.6** **Split licensing before the repo is public** — MIT for code, a separate
  `ASSETS-LICENSE.md` for generated art. **Check the full history (`git log --all -p`) for secrets,
  not the working tree.** **Hide dev-only chrome or the demo looks like a dev build** — a shipped
  on-screen legend advertised debug keys that don't exist in production.
  → **Binds `window.__game`, the Playground, and the Gym.**
  *(`…/A public repo means a push is also publication.md`; `The README is a public promise and its numbers are claims.md`)*
- [ ] **10.7** **Anything a human will watch needs a second driver.** A deterministic pump and
  real-time capture are fundamentally opposed — under the pump the sim runs ~1000× wall clock while
  every tween crawls. **Disable window-occlusion optimisation on Windows** or any window covering the
  browser freezes both the capture and the game's animation loop.
  *(`…/The test pump is the wrong tool for video capture.md`)*
- [ ] **10.8** **20 MB of assets loading inside a capture produced ~1 second of black**, and the
  duration moves with disk cache. The only recorded number about asset weight. *(same note)*
- [ ] **10.9** Reproducible asset rebuild (see **4.15**) verified from a fresh clone.

