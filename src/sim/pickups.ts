/**
 * **Step 9c of the tick order** — gear pickups.
 *
 * ## Why 9c, beside world damage rather than inside it
 *
 * A pickup asks the same question a hazard does — *did the player's body cross this rectangle
 * between last tick and this one* — so it needs the same two endpoints of this tick's motion, which
 * do not exist until step 8 has integrated and step 9 has resolved. That is the whole argument in
 * `worldDamage.ts`'s header, and it applies here unchanged.
 *
 * It is a **new numbered step, not an addition to 9b**, because 9b is *damage* and this is not. The
 * numbering is inserted, never renumbered: `tick.ts`'s step order is a contract that Phase 5's combat
 * timing and Phase 4's art frame rates are both expressed against *(vault 2.2)*, so renumbering it is
 * a balance change wearing a refactor's clothes. 4a/4b/4c and 9b are the precedent.
 *
 * Ordered **after** 9b so a tick that both hurts and rewards does both. A player who grabs a gear on
 * the same tick a spike bites keeps the gear; the alternative — damage swallowing the pickup — is a
 * silent loss the player would read as the pickup not working.
 *
 * ## Why the sweep, and why the gear rectangle is the one that grows
 *
 * The test is the player's **whole body**, not their feet: a gear at head height is a gear you can
 * collect. Rather than build a second player rectangle here — which is exactly the second conversion
 * `toWorld` exists to forbid *(vault 2.10)* — the player's own world box is measured through
 * `toWorld` and its offsets are added to the GEAR's rectangle. Sweeping the feet point against that
 * expanded rectangle is arithmetically identical to sweeping the whole box against the gear, and it
 * reuses `segmentHitsRect` rather than restating it *(vault 5.3)*.
 *
 * ## `collectedTick`, and why the boolean edge is not enough
 *
 * `TickEvents` is a record of booleans that `advance()` OR-accumulates field by field across every
 * tick a render frame drained (`tick.ts:336-358`). It therefore **cannot** carry a coordinate: a
 * position written into it is overwritten by the next tick of the same batch, and two gears collected
 * in one batch are indistinguishable from one. Codex's Phase 6 plan review found that before any of
 * this was written (finding F7).
 *
 * So the edge and the detail are separate, on purpose:
 *
 *   - `events.gearCollected` — the boolean edge, emitted from the tick that produced it
 *     *(vault 2.5)*. This is what Phase 7's pickup cue will hang on.
 *   - `gear.collectedTick` — the tick number stamped on each gear. The render layer keeps the last
 *     tick it drew and finds everything newer, which gives it position AND multiplicity, and which
 *     cannot be lost by a frame that drops events.
 */

import { segmentHitsRect } from './hazards';
import { PLAYER_BOX, toWorld } from './player';
import type { LocalBox, World } from './types';

/**
 * A gear's collision box, in LOCAL units like every other box in the sim.
 *
 * 12 units square — three quarters of a 16-unit tile, and 72 px at the shipped `RENDER_SCALE` of 6.
 * Big enough that a player running past at full speed cannot thread it, small enough that a gear
 * placed in the middle of a tile does not overlap the neighbouring one.
 *
 * Centred on its placement point (`x: -6`) rather than hanging off it, because a level author places
 * a gear where they want to SEE it — unlike the player box, whose origin is the feet.
 */
export const GEAR_BOX: LocalBox = { x: -6, y: -6, w: 12, h: 12 };

/** Where a level asks for a gear. The centre of the gear, in world pixels. */
export interface GearSpawn {
  x: number;
  y: number;
}

/** One gear in the live world. */
export interface GearSim {
  /** Centre, world pixels. Fixed for the level's lifetime — gears do not move. */
  x: number;
  y: number;
  collected: boolean;
  /**
   * The tick this gear was collected on, or `null` while it is still out there.
   *
   * Read by the render layer to spawn the collect tween. See the header for why this exists rather
   * than a position on the event record.
   */
  collectedTick: number | null;
}

/** Turn a level's placements into live gears. */
export function spawnGears(spawns: readonly GearSpawn[]): GearSim[] {
  return spawns.map((spawn) => ({
    x: spawn.x,
    y: spawn.y,
    collected: false,
    collectedTick: null,
  }));
}

/**
 * Collect every uncollected gear the player's body crossed this tick. Returns how many.
 *
 * The return is a COUNT rather than a boolean so the caller can keep `world.gearsCollected` and the
 * event edge in agreement from one number, instead of deriving one of them twice.
 *
 * `previousX`/`previousY` are step 8's own locals — the feet at the start of this tick.
 */
export function collectGears(world: World, previousX: number, previousY: number): number {
  const player = world.player;
  const box = toWorld(PLAYER_BOX, player.x, player.y, player.facing, world.scale);

  // The player box's offsets from the feet point. `PLAYER_BOX` is symmetric about x, so `facing`
  // does not move these; taking them from `toWorld` anyway is what keeps this from becoming a second
  // conversion that drifts the day the box stops being symmetric.
  const left = box.x - player.x;
  const top = box.y - player.y;

  const gearW = GEAR_BOX.w * world.scale;
  const gearH = GEAR_BOX.h * world.scale;

  let collected = 0;
  for (const gear of world.gears) {
    if (gear.collected) {
      continue;
    }
    // The Minkowski sum: the gear's rectangle grown by the player's box, so a swept FEET POINT
    // answers the same question a swept whole BODY would.
    const expanded = {
      x: gear.x + GEAR_BOX.x * world.scale - (left + box.w),
      y: gear.y + GEAR_BOX.y * world.scale - (top + box.h),
      w: gearW + box.w,
      h: gearH + box.h,
    };
    if (segmentHitsRect(previousX, previousY, player.x, player.y, expanded)) {
      gear.collected = true;
      gear.collectedTick = world.tickCount;
      collected += 1;
    }
  }
  return collected;
}
