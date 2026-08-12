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
import { DEFAULT_TUNING, PLAYER_BOX, toWorld } from './player';
import { projectileHit } from './projectiles';
import type { PlayerSim, World } from './types';

/**
 * Knockback speed on a landed, non-lethal hit, px/tick.
 *
 * Reuses `DEFAULT_TUNING.walkMax` (Phase 2's walk cap) rather than authoring a new number — one
 * measured constant, a second consumer. Lives here rather than in `combat.ts` because `combat.ts`
 * exports `isCombatState`, which `player.ts` imports; a knockback constant sourced FROM `player.ts`
 * and consumed IN `combat.ts` would close that into a cycle. `worldDamage.ts` already imports from
 * both `combat.ts` and `player.ts` and feeds neither, so it is the seam without one.
 */
export const KNOCKBACK_SPEED = DEFAULT_TUNING.walkMax;

/**
 * Shove the player away from `sourceX`, horizontally only — knockback never touches `vy`.
 *
 * `sign === 0` (a dead-centre contact) resolves to the player's own `facing` rather than leaving a
 * zero-impulse hole: a hit landed exactly on-centre must still shove *somewhere*.
 */
function applyKnockback(player: PlayerSim, sourceX: number): void {
  const dir = Math.sign(player.x - sourceX) || player.facing;
  player.vx = KNOCKBACK_SPEED * dir;
}

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

  const hazard = hazardHit(previousX, previousY, player.x, player.y, world.hazards);
  if (hazard !== null) {
    // Hazard knockback is deliberately EXEMPT, not merely unimplemented. `hazardHit` returns the
    // rectangle the player's feet swept through, not a point of origin — there is no "the hazard is
    // over there" to shove away from. Neither candidate rule survives contact: the rectangle's
    // nearest edge is arbitrary for a spike strip the player is usually falling THROUGH rather than
    // walking INTO, and reversing the player's own travel double-counts a wall or floor collision
    // that has already stopped them this same tick. Decided rather than left to fall out of the
    // code by accident (Codex plan review correction 3).
    damagePlayer(player, HAZARD_DAMAGE);
  }

  const shot = projectileHit(world.projectiles, box);
  if (shot !== null) {
    // The guard is both conditions, and both are load-bearing: `damagePlayer`'s boolean return is
    // what tells a refused hit (i-frames, already dead) from a landed one, and `player.hp > 0` is
    // "no shove on a corpse" — `combat.ts`'s step-4 ordering exists so a lethal hit does not also
    // move the body it just killed (Codex plan review correction 1).
    if (damagePlayer(player, shot.damage) && player.hp > 0) {
      applyKnockback(player, shot.x);
    }
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
      if (damagePlayer(player, SCAVENGER.damage) && player.hp > 0) {
        applyKnockback(player, scavenger.x);
      }
      break;
    }
  }
}
