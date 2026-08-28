/**
 * The welcome screen's inks, and the scrim that makes them measurable — Phase 11.
 *
 * ## Why these live outside the scene
 *
 * `TitleScene.ts` value-imports `phaser` on line 1, so nothing in it can be reached by a unit test
 * with the engine uninstalled. These constants are the numbers a contrast gate has to read, so they
 * live where `tests/unit/title-contrast.test.ts` can import them directly — the same split
 * `src/render/hud.ts` already makes for `COUNTER_FILL` / `COUNTER_STROKE`.
 *
 * ## 🔴 The scrim is what makes a 4.5:1 bar reachable at all
 *
 * `src/render/helpBanner.ts` states the ceiling for text over the live world: swept across every
 * possible background luminance, *"even pure white over this stroke tops out at 4.27:1... the only
 * thing that beats it is a scrim that makes the background KNOWN rather than arbitrary."*
 *
 * This screen has that scrim. At `SCRIM_ALPHA` the darkest thing behind can only reach the scrim's
 * own luminance and the brightest can only reach `0.82 × scrim + 0.18 × white` — so the background
 * is a **bounded interval**, not an arbitrary value, and a fill can be chosen to clear the small-text
 * bar over the whole of it. That is why the banner settles for 3.80:1 and this screen does not.
 *
 * ## What the numbers were, and why two of them moved
 *
 * Measured with the same WCAG method `contrast-floor.test.ts` runs, against the brightest background
 * the scrim admits (`L = 0.0441`):
 *
 * | role | ink | ratio | verdict |
 * |---|---|---|---|
 * | title | `#f0d79a` | 7.91:1 | kept |
 * | choice | `#d9cdb0` | 7.07:1 | kept |
 * | subtitle | `#7fb2c8` | **4.84:1** | replaced — passes, but on 7 % headroom |
 * | hint | `#8f8776` | **3.13:1** | replaced — **fails the 4.5:1 small-text bar** |
 *
 * ⚠️ **`#8f8776` is not a coincidence.** It is the exact fill `helpBanner.ts` records as having
 * shipped bare and failed: *"a 852×480 production capture measured 8 CSS px of ink."* It reached this
 * file by being copied from `LevelSelectScene`, where it is safe **only because that scene stops
 * `Game` and draws over the config's opaque `#12100e`** — 5.33:1. Copying the colour without the
 * opaque background copied the number and dropped the guarantee.
 *
 * And a stroke would not have rescued it: the banner's own note explains why — *"adding a stroke
 * under the old muted fill would still have failed, because the fill is mid-luminance itself and a
 * stroke only helps where the fill does not."* So the fill moved, which is the half that works.
 */

/** The heading. Unchanged — 7.91:1 over the worst background the scrim admits. */
export const TITLE_FILL = '#f0d79a';

/**
 * The line under the heading. Was `#7fb2c8` at 4.84:1 — passing, with 7 % of headroom.
 *
 * ⚠️ This used to justify the change by saying the bound came from *sampled* level pixels and a
 * brighter unseen frame could defeat it. **That was wrong**, and the same file says why two blocks
 * up: the bound is computed against a **pure-white** underlying pixel, which is the strict maximum,
 * so no frame can beat it. The honest reason it moved is thinner: 7 % is a small margin on a
 * derivation that also carries model risk — the sRGB compositing assumption, and the possibility of
 * a future `SCRIM_ALPHA` change — and the lighter blue costs nothing. Corrected by the Codex
 * implementation review, which caught the file contradicting itself.
 */
export const SUB_FILL = '#9cc6d8';

/** `ENTER begin` / `L choose a level`. Unchanged — 7.07:1. */
export const CHOICE_FILL = '#d9cdb0';

/**
 * The audio-keys hint. **The one that actually failed**, at 3.13:1 against a 4.5:1 bar. Lightened to
 * 5.24:1 while staying a clear step below `CHOICE_FILL` (0.443 vs 0.616 relative luminance), so the
 * visual hierarchy survives the repair.
 */
export const HINT_FILL = '#bab19c';

/**
 * The scrim. Alpha rather than an opaque fill on purpose: the reason this screen pauses `Game`
 * instead of hiding it is that the world stays visible behind the title.
 *
 * 🔴 **`SCRIM_ALPHA` is load-bearing, not decoration.** Every ratio above is computed through it.
 * Lowering it widens the background interval and can take an ink under the bar without touching a
 * single colour — which is why `title-contrast.test.ts` reads this value rather than assuming one.
 */
export const SCRIM_COLOUR = 0x12100e;
export const SCRIM_ALPHA = 0.82;

/**
 * Every ink the screen draws, with the size it is authored at in DESIGN pixels.
 *
 * The size is here because it DECIDES the bar, and `title-contrast.test.ts` derives the bar from it
 * rather than declaring one. WCAG's large-text allowance is **24 px regular** or 14 pt bold; at the
 * smallest supported window each of these scales by 852/1920 = 0.444.
 *
 * ⚠️ The second column used to be labelled "physical px". These are **displayed CSS pixels** —
 * what the browser lays out after `Phaser.Scale.FIT` letterboxes the fixed 1920x1080 canvas — not
 * device pixels, which a high-DPR screen multiplies again. WCAG's thresholds are CSS pixels, so the
 * arithmetic was always right and only the name was wrong. Codex implementation review round 3.
 *
 * | role | design px | displayed CSS px | bar |
 * |---|---|---|---|
 * | title | 72 | 31.9 | 3:1 — **large text** |
 * | choice | 34 | 15.1 | 4.5:1 |
 * | subtitle | 26 | 11.5 | 4.5:1 |
 * | hint | 22 | 9.8 | 4.5:1 |
 *
 * ⚠️ This block used to claim all four were small text *"because none is bold"*. **False** — the
 * bold threshold is the 14 pt one; regular text becomes large at 24 px, and the heading is through
 * that door at 31.9. Codex implementation review. It changes nothing in practice, because the
 * heading measures 7.91:1 and the test asserts all four clear 4.5 regardless — but a wrong reason
 * beside a right number is the kind of comment this project treats as worse than none.
 */
export const TITLE_INKS: ReadonlyArray<{ role: string; fill: string; designPx: number }> = [
  { role: 'title', fill: TITLE_FILL, designPx: 72 },
  { role: 'subtitle', fill: SUB_FILL, designPx: 26 },
  { role: 'choice', fill: CHOICE_FILL, designPx: 34 },
  { role: 'hint', fill: HINT_FILL, designPx: 22 },
];

/**
 * The audio hint line, rendered from the CURRENT state rather than as a fixed string.
 *
 * 🔴 **A screen that advertises a control owes the player the control's value.** Nothing else in the
 * game shows the volume — not the HUD, not the level menu — and at the shipped default of
 * `volume: 1`, `stepVolume(1, +1)` clamps, so the first press of `]` does nothing at all. A player
 * who tries the key this screen just taught them gets silence, with no way to tell "already at
 * maximum" from "still broken" — which is exactly the reading the owner reported before the dispatch
 * bug was found. Found by the criterion 11.12 adversarial brief.
 *
 * ⚠️ **It lives here, not in `TitleScene`, so a unit test can drive it.** A source-text gate could
 * only prove the scene *calls* something named `audioHint`; an implementation that ignored both
 * arguments and returned a fixed `100%` would have satisfied it. Codex implementation review round 3,
 * finding 4. `title-contrast.test.ts` now asserts the two arguments actually reach the string.
 */
export function audioHint(muted: boolean, volume: number): string {
  const level = muted ? 'muted' : `${Math.round(volume * 100)}%`;
  return `M mute   ·   [ ] volume   ${level}`;
}
