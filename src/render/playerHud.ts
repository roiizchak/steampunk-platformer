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
 * **If `hud-health` is regenerated, re-measure these four numbers.** There is no gate that can catch
 * a stale slot: the fill would simply sit slightly off inside the frame, which is a thing only an
 * eye can see. Recorded as a known limitation rather than papered over.
 */

import { healthBarFillWidth } from './enemyHealthBar';

/**
 * The interior of the gold bar in `hud-health.png`, in SOURCE pixels of a 305 × 128 image.
 *
 * Measured 2026-08-09 by scanning the loaded texture for pixels with `r > 190, g > 140, b < 130`
 * at alpha > 200, right of the medallion: x 130–301, y 40–82. Inset by a few pixels on each side so
 * the fill sits inside the bezel rather than overpainting it.
 */
export const HUD_SLOT = { x: 140, y: 46, w: 156, h: 30 } as const;

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
 * 92 % of 156 px is 143, so the step from "nearly full" to "full" is 13 px — about four tenths of
 * the bar's own height, which is the smallest gap that reads as a gap rather than as aliasing at
 * this size. Below that it is a number that satisfies a test and not an eye, which is the whole
 * failure mode being fixed.
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
