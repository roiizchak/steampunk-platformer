/**
 * The gears, drawn in the world — and the one place that decides how a gear is drawn at all.
 *
 * ## The grey-box branch, and why it is explicit
 *
 * "Grey-box before art" means the mechanics ship playable before any money is spent on generating
 * the sprite. So a gear is drawn as an **Image** when the catalogued `gear` texture exists, and as
 * a plain **Arc** when it does not — the same shape `EnemyLayer` already uses for its bodies.
 *
 * 🔴 Phase 5 paid for the trap in this pattern: `EnemyLayer` chose Sprite-vs-Rectangle **once, at
 * creation, from a transient state**, and twelve of twenty enemies were permanently grey boxes
 * while every gate stayed green — and *cheaper* to draw, so the frame budget looked better for it.
 * The choice here keys on nothing transient: a texture either is in the catalog at boot or is not,
 * and `BootScene` refuses to route if a catalogued texture is missing. `gearIsGreybox` is exported
 * so a test can assert which branch shipped instead of inferring it.
 */

import Phaser from 'phaser';
import { GEAR_TEXTURE_KEY } from '../render/hud';
import { GEAR_BOX } from '../sim/pickups';
import type { World } from '../sim/types';


/** Grey-box colours — brass, so the placeholder reads as the thing it is standing in for. */
const GREYBOX_FILL = 0xd9a441;
const GREYBOX_EDGE = 0x6b4a1f;

/** Is this scene about to draw grey boxes rather than the generated sprite? */
export function gearIsGreybox(scene: Phaser.Scene): boolean {
  return !scene.textures.exists(GEAR_TEXTURE_KEY);
}

/**
 * Add one gear-shaped object at a screen or world point, sized to `diameter`.
 *
 * Shared by this layer and by `UIScene`, so the HUD icon and the world pickup cannot end up being
 * two different decisions about what a gear looks like *(vault 5.3)*.
 *
 * **The contract both branches honour: the object is CENTRED on `(x, y)` and already `diameter`
 * across.** Callers must not reach for `setOrigin` or `setDisplaySize` afterwards — an `Arc` and an
 * `Image` do not implement the same components, and a call that silently no-ops on one of them is
 * how the two branches drift into looking different. Resize with `setScale`, which both have.
 */
export function addGearObject(
  scene: Phaser.Scene,
  x: number,
  y: number,
  diameter: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Arc {
  if (!gearIsGreybox(scene)) {
    return scene.add.image(x, y, GEAR_TEXTURE_KEY).setDisplaySize(diameter, diameter);
  }
  return scene.add
    .circle(x, y, diameter / 2, GREYBOX_FILL)
    .setStrokeStyle(Math.max(2, diameter * 0.08), GREYBOX_EDGE);
}

/**
 * Every gear in the level, drawn and kept in step with the sim.
 *
 * Bodies are created once and never spliced, indexed by position in `world.gears` — which is
 * exactly why collected gears stay in that array. A shrinking source array would silently re-point
 * every body after the hole, which is a bug that looks like the wrong gear disappearing.
 */
export class GearLayer {
  private bodies: (Phaser.GameObjects.Image | Phaser.GameObjects.Arc)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {}

  create(): void {
    const diameter = GEAR_BOX.w * this.world.scale;
    for (const gear of this.world.gears) {
      // Depth 8: under the player (10) and the enemies (9), over the tiles. A pickup that draws
      // over the character reads as an object in front of them rather than one to walk into.
      this.bodies.push(addGearObject(this.scene, gear.x, gear.y, diameter).setDepth(8));
    }
  }

  /** Hide what has been collected. Driven by sim state, so a dropped frame cannot desync it. */
  sync(): void {
    for (const [index, gear] of this.world.gears.entries()) {
      const body = this.bodies[index];
      if (body === undefined) {
        continue;
      }
      if (body.visible === gear.collected) {
        body.setVisible(!gear.collected);
      }
    }
  }

  /** The drawn bodies, for the e2e spec's `willRender` assertions. */
  objects(): readonly (Phaser.GameObjects.Image | Phaser.GameObjects.Arc)[] {
    return this.bodies;
  }
}
