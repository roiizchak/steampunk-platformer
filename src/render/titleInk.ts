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

/** The one choice line, `ENTER choose a level`. Unchanged — 7.07:1. */
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
  // ⚠️ The two keys are separated. Written as `[ ] volume`, the pair rendered as two adjacent
  // brackets with nothing between them — an empty checkbox or a missing glyph, not "press `[` to
  // lower and `]` to raise". Criterion 11.12 brief A, finding 1, against the shipped screen.
  const level = muted ? 'muted' : `${Math.round(volume * 100)}%`;
  return `M mute   ·   [ / ] volume   ${level}`;
}

/**
 * The catalog key of the generated title plate — `assets/backgrounds/title.png`.
 *
 * ⚠️ **A `TITLE_DRIFT_PX_PER_TICK` used to stand here**, with three parallax layers behind the
 * band and a gate pinning its drift to `frameClock.drainTicks`. The owner chose the generated
 * backdrop on 2026-08-29 (variant B, the rooftop canyon; variant A had the compositing band painted
 * into it, because the prompt described it). A single plate cannot drift — it does not tile, so
 * scrolling would expose its own edge — so the constant and its gate are gone rather than left
 * guarding motion that no longer exists.
 */
export const TITLE_BACKDROP_KEY = 'title-backdrop';

/**
 * Where each of the four text rows sits, as a fraction of the live canvas height, in the order the
 * scene creates them — the same order as `TITLE_INKS`.
 *
 * 🔴 **It lives here so the contrast sweep can check its own premise.** That sweep's whole claim is
 * that every glyph sits on `SCRIM_ALPHA` of `SCRIM_COLOUR`, which holds only while every row is
 * drawn INSIDE the panel. With the rows written as a literal inside `applyLayout`, shrinking
 * `panelSize` to 0.30 would have pushed the heading and the hint out onto the raw backdrop —
 * invalidating every contrast figure — and left the unit sweep, both pixel ratios and the whole e2e
 * suite green. Codex implementation review of the redesign, finding 3.
 */
export const TITLE_ROWS: readonly number[] = [0.34, 0.455, 0.569, 0.683];

/**
 * ⚠️ **These were `[0.34, 0.45, 0.61, 0.72]`, and BOTH criterion 11.12 briefs found the same
 * defect in them independently** — the strongest signal a brief pair can give.
 *
 * The gaps were **0.11 / 0.16 / 0.11**: the middle one 45 % wider than its neighbours, leaving a
 * visible empty band between the subtitle and the choice line that reads as a row having gone
 * missing. Which is exactly what happened — the second choice line went when ENTER became the only
 * way in — and the first re-spread shrank the hole rather than closing it, under a comment claiming
 * it had been avoided.
 *
 * Brief A found the matching half: the OUTER margins were asymmetric too. The band spans 0.22 to
 * 0.78; measured to the glyph box rather than the row centre, the heading cleared the top rule by
 * 0.087 of the height while the hint cleared the bottom rule by 0.050 — the hint crowding a rule the
 * title had nearly twice the room from.
 *
 * The values above solve both at once, against the four `designPx` in {@link TITLE_INKS}: equal
 * gaps of 0.1143, and equal optical margins of **0.0867** at top and bottom. Derived, not nudged —
 * from `r₁ - h₁/2 - 0.22 = 0.78 - (r₄ + h₄/2)` with the three gaps equal.
 */

/**
 * The panel behind the text, as a fraction of the live canvas.
 *
 * 🔴 **It exists so the contrast bound stays exactly what `title-contrast.test.ts` measures.** The
 * sweep's whole premise is that every glyph sits on `SCRIM_ALPHA` of `SCRIM_COLOUR` over an
 * arbitrary bright pixel. Dimming the full canvas made that trivially true and made the backdrop
 * unreadable, which is what the owner objected to. A panel keeps the premise and gives it back the
 * picture — but only if no ink is ever drawn outside the panel, which is why the size is derived
 * here and `applyLayout` positions the rows inside it rather than the other way round.
 *
 * 🔴 **FULL WIDTH, deliberately.** The first version was inset to 0.72 of the width, and its two
 * vertical edges cut straight down through the boiler art — it read as a rendering fault rather than
 * a design. A band that runs edge to edge has only horizontal edges, parallel to the frame, which is
 * the letterbox shape a title card already implies.
 *
 * The four rows span 0.34 to 0.72 of the height, so 0.56 covers them with margin either side.
 */
export function panelSize(width: number, height: number): { w: number; h: number } {
  return { w: width, h: Math.round(height * 0.56) };
}

/**
 * The hairlines at the band edges, in the heading ink.
 *
 * Two 3 px rules turn a flat alpha band into something deliberate, and they are the cheapest
 * Victorian-industrial cue available without spending a generation — brass on soot, which is
 * STYLE.md §1 in two lines of code.
 */
export const RULE_PX = 3;
export const RULE_ALPHA = 0.55;
