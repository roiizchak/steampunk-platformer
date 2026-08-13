import type Phaser from 'phaser';
import { HUD_SLOT, playerHudFill } from '../render/playerHud';

/**
 * The HUD: portrait medallion plus one continuous health bar, pinned to the camera. Split out of
 * `GameScene.ts` to keep that file under the 400-line rule — the fill geometry decision already
 * lives engine-free in `src/render/playerHud.ts`; this is only the Phaser plumbing around it.
 *
 * Drawn at the assembly's authored size with `setScrollFactor(0)` so it never scrolls, and at a
 * high depth so nothing in the world can cover it.
 */
export function createHud(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  scene.add
    .image(24, 24, 'hud-health')
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(1000);
  // Drawn OVER the art, at a higher depth. Phase 4 shipped the image alone, so the bar was full
  // gold at any hp — a bar that lies, on the player's own health. Found by playtesting; no unit
  // test in the suite looks at the HUD, which is exactly vault C4.
  return scene.add.graphics().setScrollFactor(0).setDepth(1001);
}

export function renderHud(hudFill: Phaser.GameObjects.Graphics, hp: number, maxHp: number): void {
  const fill = playerHudFill(hp, maxHp, 24, 24);
  hudFill.clear();

  // The EMPTY portion is what gets painted, not the full one. `hud-health.png` already contains a
  // completely full gold bar, so drawing a gold fill over it was invisible — gold on gold, which
  // is how the first version of this fix looked identical to the bug it was fixing. Blanking the
  // spent part turns the art's bar into the lit portion and the drawn rectangle into the drained
  // one, which also means the bezel and highlights in the art survive untouched.
  const spentX = fill.x + fill.w;
  const spentW = HUD_SLOT.w - fill.w;
  if (spentW > 0) {
    hudFill.fillStyle(0x241c18, 0.92).fillRect(spentX, fill.y, spentW, fill.h);
  }
}
