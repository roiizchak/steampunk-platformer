# Vault-in — Phase 6 — Collectibles, HUD, steampunk UI chrome

Phase 6's slice of [LESSONS-APPLIED.md](../LESSONS-APPLIED.md) §D. The root rule, §A, §B and §C
live there and bind every phase.

**Also binding on this phase:** every §C rule, plus nothing in §A or §B. Read them in the hub —
they are defined once, there.

### Phase 6 — Collectibles, HUD, steampunk UI chrome

- [ ] **6.1** **Zero scroll factor pins an object as the camera pans; it does NOT exempt it from camera
  zoom.** Requires a second, non-zooming camera with **reciprocal and exhaustive ignore lists** — an
  object missing from both renders twice, an object in both renders never.
  *(`Platform & Performance/Screen-space is not zoom-exempt.md`)*
- [ ] **6.2** **A second camera created at an explicit size never auto-resizes.** Phaser's resize
  handler only resizes cameras whose dimensions equal the previous game size; hardcoded at 1280 it
  cropped a whole HUD plate off a phone. **Build it from the live game size.**
  *(`…/A second camera created at an explicit size does not auto-resize.md`, blocker)*
- [ ] **6.3** **A container's own depth is what sorts it against the scene**; children's depths are
  only relative to each other. A menu container left at depth 0 rendered *under* a scrim — which looks
  like a colour choice, not a bug. *(same note)*
- [ ] **6.4** **Gate any HUD cue on what is *drawn*, not only on what is true.** A meter at 98/100 drew
  **315 px of a 318 px bar** — visually full — and the action then refused in total silence. Compress
  an unready fill into the first 92% of the slot; move the readiness decision into one engine-free
  module both sides consult. Mirror bug: a "MAX" label over a bar the entrance animation had scaled to
  zero. *(`Game Feel & Balance/A HUD cue must be gated on what is drawn, not only on what is true.md`, blocker)*
- [ ] **6.5** **A DOM overlay does not block engine input.** Phaser's touch manager listens on `window`
  and forwards any touch whose target is *not* the canvas straight into the input system. **Visibility
  is not interactivity.** Hiding an interactive object must also **deactivate** it — invisible objects
  keep their scene-level listeners. *(`Platform & Performance/A DOM overlay does not block engine input.md`, blocker)*
- [ ] **6.6** **Reshape the game to the device instead of letterboxing it.** Decide which axis the art
  fixes (likely height, if the tileset is height-locked). **Do not centre the canvas twice** — Phaser's
  centring writes CSS margins, a flex/grid parent centres the margin box, and the two compose to park
  it a quarter of the gap off. *(`…/Reshape the game to the device instead of letterboxing it.md`)*
- [ ] **6.7** **`scale.min`/`max` apply to the CSS display size, not render resolution, and the clamp
  runs *before* the parent comparison.** `min.width: 1280` writes `style.width: 1280px` onto an 851 px
  phone with a −215 px margin. **A trap that looks correct on a desktop.**
  *(`…/A minimum-size clamp applied to the CSS size breaks every smaller screen.md`, blocker)*

