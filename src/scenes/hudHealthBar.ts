/**
 * **The DRAINED portion of the health bar.**
 *
 * Split out of `UIScene` on 2026-09-02, when subscribing that scene's teardown to DESTROY as well
 * as SHUTDOWN (Codex implementation review, finding 3) and re-fitting the completion overlay on a
 * resize (finding 2) took it past the project's 400-line ceiling. This is the seam because it is
 * the one method there that reads no member of the scene it lived on: a pure function of a
 * `Graphics`, a layout and two numbers.
 *
 * No Phaser VALUE import — `Graphics` is a type only — so this file is reachable from
 * `npm run test:sim-isolated` even though its caller is not.
 */

import { HUD_SLOT, playerHudFill } from '../render/playerHud';
import type { HudLayout } from '../render/hud';

/** Paint the spent part of the bar over the art. Called every frame from `UIScene.render`. */
export function drawHealth(
  barFill: Phaser.GameObjects.Graphics,
  layout: HudLayout,
  hp: number,
  maxHp: number,
): void {
  const fill = playerHudFill(hp, maxHp, 0, 0);
  const { slot, scale } = layout;
  barFill.clear();

  // The EMPTY portion is painted, not the full one. `hud-health.png` already contains a complete
  // gold bar, so drawing a gold fill over it was invisible — gold on gold, which is how the first
  // version of this fix looked identical to the bug it was fixing. Blanking the spent part turns
  // the art's bar into the lit portion and this rectangle into the drained one, which also leaves
  // the bezel and highlights in the art untouched.
  const spentW = (HUD_SLOT.w - fill.w) * scale;
  if (spentW > 0) {
    barFill.fillStyle(0x241c18, 0.92).fillRect(slot.x + fill.w * scale, slot.y, spentW, slot.h);
  }
}
