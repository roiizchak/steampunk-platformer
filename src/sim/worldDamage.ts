/**
 * **Step 9b of the tick order** — everything in the world that can hurt the player, in one place.
 *
 * ## Why it is 9b and not step 4, which is what the plan said
 *
 * The Phase 5 plan (following Codex plan review C6) put hazards and the kill plane inside step 4,
 * before integration, so that knockback would reach the same tick's movement. That ordering and the
 * guarantee the same review asked for are **incompatible**, and the guarantee is the one that
 * matters:
 *
 * > A swept hazard test needs BOTH endpoints of this tick's motion. The second one does not exist
 * > until step 8 has integrated and step 9 has resolved. Evaluated at step 4, contact could only be
 * > a point sample — which is precisely the tunnelling defect the swept test was written to prevent.
 *
 * So contact is evaluated after collision, with `previousX`/`previousY` — the same two locals step 8
 * already captures. The cost is that a `hurt` state is entered after this tick's movement rather
 * than before it, so knockback lands on the following tick: a uniform 16 ms, the same price and the
 * same reasoning as the jump buffer's documented one-tick delay. Recorded rather than hidden.
 *
 * A second benefit fell out of it: step 11 derives the movement state AFTER this runs, so a `hurt`
 * entered here is published on the tick it happened. At step 4 it would have been overwritten by
 * this tick's own movement, which is the trap `resolveState`'s combat guard exists to catch.
 *
 * ## Why every source lives together
 *
 * A hazard, a shot and an enemy's body are one question — *did something hurt the player this
 * tick* — asked of three geometries. Split across the tick they would drift out of order, and the
 * order matters: see the kill plane below.
 *
 * It also keeps `tick.ts` a numbered list rather than a paragraph of arithmetic, which is what
 * vault 2.2 asks of a contract that Phase 5's art is derived from.
 */

import { HAZARD_DAMAGE, belowKillPlane, hazardHit } from './hazards';
import { SCAVENGER, overlapsScavenger } from './enemies';
import { damagePlayer, killPlayer } from './combat';
import { PLAYER_BOX, toWorld } from './player';
import { projectileHit } from './projectiles';
import type { World } from './types';

/**
 * Apply every world damage source to the player, in a fixed order.
 *
 * **The kill plane is first and exclusive.** Falling out of the world is not survivable, so it does
 * not route through `damagePlayer` (which respects i-frames) and nothing else is evaluated on the
 * same tick — otherwise a hazard could grant a grace window to a player who has already left the
 * world, and they would fall forever inside it. That is the Phase 4 defect wearing a new hat.
 *
 * The other three share one i-frame window, so a player who walks into a scavenger while a shot
 * lands takes one hit, not two. `damagePlayer` enforces that itself; the order below only decides
 * which source gets attributed, and hazards come first because they are the only one the player
 * chose to touch.
 */
export function applyWorldDamage(world: World, previousX: number, previousY: number): void {
  const { player } = world;

  if (belowKillPlane(player.y, world.bounds)) {
    killPlayer(player);
    return;
  }

  const box = toWorld(PLAYER_BOX, player.x, player.y, player.facing, world.scale);

  if (hazardHit(previousX, previousY, player.x, player.y, world.hazards) !== null) {
    damagePlayer(player, HAZARD_DAMAGE);
  }

  const shot = projectileHit(world.projectiles, box);
  if (shot !== null) {
    damagePlayer(player, shot.damage);
    // Consumed on impact, whether or not it actually cost hp. A shot left flying through an
    // invulnerable player re-hits the moment the window lapses, which reads as one bullet doing
    // damage twice from the same position.
    world.projectiles = world.projectiles.filter((inFlight) => inFlight !== shot);
  }

  for (const scavenger of world.enemies.scavengers) {
    // A corpse is scenery. Without this the body the player just killed keeps costing hp until it
    // is walked around, which reads as the kill not having registered.
    if (scavenger.hp <= 0) {
      continue;
    }
    if (overlapsScavenger(scavenger, box, world.scale)) {
      damagePlayer(player, SCAVENGER.damage);
      break;
    }
  }
}
