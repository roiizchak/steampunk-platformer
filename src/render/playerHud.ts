/**
 * The player's HUD health bar — engine-free geometry for the fill drawn over `hud-health`.
 *
 * ## Why this exists
 *
 * `hud-health` is a single generated image: medallion plus an empty gold bar. `GameScene` drew it
 * and nothing else, so **the player's health bar was decoration** — a full gold bar at 20 of 100 hp,
 * found by playtesting at the end of step 2h and invisible to every gate in the suite, because
 * nothing in it looks at the HUD.
 *
 * That is the same defect criterion 5.7 exists to prevent, on the bar that matters most. So the fill
 * goes through **the same `healthBarFillWidth`** the enemy bars use: one definition, three consumers
 * *(vault 5.3)*, and the "never empty above 0 hp" rule *(vault 6.4)* is inherited rather than
 * re-stated. A player on their last hit sees a sliver, not an empty slot that reads as already dead.
 *
 * ## The slot geometry, and its honesty problem
 *
 * The numbers below are **measured from the shipped `hud-health.png`**, by scanning for its gold
 * pixels in the browser. That is uncomfortably close to what vault A5 forbids — deriving a constant
 * from regenerable art — and the mitigation is that it is *declared here with its provenance* rather
 * than re-measured at runtime, so a re-shot HUD produces a visibly wrong bar rather than silently
 * moving the geometry under everything else.
 *
 * **If `hud-health` is regenerated, re-measure these four numbers.** Phase 6 regenerated it and this
 * warning came true to the pixel — see `HUD_SLOT` below.
 *
 * `tests/unit/shipped-hud.test.ts` now measures the shipped PNG against `HUD_PLATE` and asserts the
 * slot lies inside it with a bezel margin, so a re-shoot can no longer land in silence. What no gate
 * can still see is whether the slot lands **on the amber** — the fill would simply sit slightly off
 * inside the frame, which is a thing only an eye can see. That is criterion 6.8, owner `play`.
 */

import { healthBarFillWidth } from './enemyHealthBar';

/**
 * The interior of the gold bar in `hud-health.png`, in SOURCE pixels of a **413 × 128** image.
 *
 * **Re-measured 2026-08-15**, when the HUD was re-generated in Phase 6. The plate came back
 * **413 × 128 rather than 305 × 128** — the model is not seed-deterministic (STYLE.md §2b), so a
 * re-shoot is a new composition, not the same one again. The previous value was
 * `{ x: 140, y: 46, w: 156, h: 30 }` against the retired plate.
 *
 * ## How it was measured, and why the first method was wrong
 *
 * The documented method — scan for `r > 190, g > 140, b < 130` at alpha > 200, right of the
 * medallion — returned x 128–411, which runs off the end of the bar and into the **rounded brass
 * end cap**: polished brass passes a gold test. Measuring that way would have put the fill's right
 * edge 40 px past the bezel, drawn over the cap, and looked like a rendering bug rather than a
 * measurement one.
 *
 * So the fill is isolated by **hue and saturation** instead: saturation > 0.62, hue 25°–50°, value
 * > 150 — which separates the saturated amber fill from the pale desaturated brass around it. The
 * largest contiguous run of columns carrying that colour is x 129–373, y 45–83. Inset by 3 px on
 * each side so the fill sits inside the bezel rather than overpainting it.
 *
 * Confirmed by drawing the rectangle back onto the plate and looking at it *(vault C4 — no gate can
 * see a stale slot; the fill would simply sit slightly off inside the frame)*.
 *
 * 🔴 **If `hud-health` is regenerated again, re-measure these four numbers and `HUD_PLATE`.**
 */
export const HUD_SLOT = { x: 132, y: 48, w: 239, h: 33 } as const;

/**
 * **Criterion 6.4.** The most of the slot a bar below full health may draw.
 *
 * ## The defect
 *
 * Uncompressed, `healthBarFillWidth(99, 100, 156)` returned **154 of 156 px**. Two pixels of a
 * 156 px bar is not a difference anyone can see, so a player one hit from full looked untouched.
 * The vault's own case is a meter at 98/100 drawing 315 px of a 318 px bar, after which the action
 * it gated refused in total silence — the bar said ready, the game disagreed, and nothing on screen
 * explained it *(vault 6.4, blocker)*.
 *
 * ## Why 0.92
 *
 * 92 % of the slot's 239 px is 219, so the step from "nearly full" to "full" is **20 px** — well
 * over half the bar's own 33 px height, which reads as a gap rather than as aliasing. Below that it
 * is a number that satisfies a test and not an eye, which is the whole failure mode being fixed.
 * (On the retired 156 px plate the same fraction bought 13 px, which was already enough; the
 * re-shoot widened the bar and made the margin more comfortable, not less.)
 *
 * It applies to the PLAYER's bar only. The enemy bars keep the default of 1: they carry no
 * readiness claim, nothing is gated on them, and changing them would silently retune criterion 5.7.
 */
export const HUD_READY_FRACTION = 0.92;

export interface HudFillDesc {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where to draw the player's health fill, given the HUD image's top-left corner.
 *
 * Returns `w: 0` at 0 hp and never between 0 and the visible minimum — the same equivalence
 * `fillIsHonest` states for the enemy bars, because it is literally the same function underneath.
 */
export function playerHudFill(hp: number, maxHp: number, originX: number, originY: number): HudFillDesc {
  return {
    x: originX + HUD_SLOT.x,
    y: originY + HUD_SLOT.y,
    w: healthBarFillWidth(hp, maxHp, HUD_SLOT.w, HUD_READY_FRACTION),
    h: HUD_SLOT.h,
  };
}
