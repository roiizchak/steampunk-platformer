/**
 * The player's swing resolving against enemies — the other direction of step 9b.
 *
 * `worldDamage.ts` is everything that hurts the player. This is the reverse, and it lives in its
 * own module for the same reason that one does: the tick stays a numbered list, and the work sits
 * beside the things it works on.
 *
 * ## Once per target per swing, without giving anything an id
 *
 * `ATTACK.active` is more than one tick, so a hitbox tested each tick would cost a standing target
 * four hits per press — which makes the damage number meaningless and the `active` knob a damage
 * multiplier *(Codex C4 on criterion 5.5)*.
 *
 * Each enemy therefore records the swing that last hit it, and a swing is identified by **the tick
 * it started**: `tickCount - combatCounter` while the player is in `attack`. Two swings cannot begin
 * on the same tick, so the identity is unique without an id generator, without a set allocated per
 * swing, and without a new field on `PlayerSim`. One number per enemy *(vault 5.1 — one counter,
 * one flag)*.
 *
 * ## The hitbox is authored local, and mirrored by exactly one function
 *
 * `ATTACK_BOX` is in local space — `+x` forward, `+y` up from the feet — and reaches world space
 * only through `toWorld`, which applies `facing` *(vault 2.10)*. That is what makes "a target behind
 * the player is not hit" true by construction rather than by an `if` somebody has to remember.
 */

import { ATTACK, hitWindowOpen } from './combat';
import { SCAVENGER_BOX, SENTRY_BOX, type Scavenger, type Sentry } from './enemies';
import { toWorld } from './player';
import type { LocalBox, Rect, World } from './types';

/**
 * What one connected swing takes off an enemy.
 *
 * 20 kills the 40 hp sentry in two and the 60 hp scavenger in three — the criterion-5.10 invariant
 * (the static threat dies faster than the one that chases you) expressed as a number rather than
 * asserted about one.
 */
export const PLAYER_ATTACK_DAMAGE = 20;

/**
 * The swing's reach, authored local like `PLAYER_BOX`.
 *
 * `x: 11` starts it exactly at the player's own forward edge — `PLAYER_BOX` is 22 wide centred on
 * the feet — so the box is reach BEYOND the body rather than overlapping it. 26 local units is
 * 156 px drawn at `RENDER_SCALE` 6, a little over one tile: enough to hit something standing next
 * to you, not enough to clear a gap. `y: 12, h: 24` puts it at chest height on a 48-unit body, so
 * a swing does not connect with something lying at your feet or floating overhead.
 */
export const ATTACK_BOX: LocalBox = { x: 11, y: 12, w: 26, h: 24 };

/** Every enemy carries this: the start tick of the swing that last connected. `-1` is "never". */
export interface Hittable {
  x: number;
  y: number;
  hp: number;
  lastHitSwing: number;
}

function bodyOf(enemy: Hittable, box: LocalBox, scale: number): Rect {
  // Enemies do not mirror their own bodies — a symmetric box has nothing to mirror, and passing
  // their facing here would make a patroller's hurtbox jump sides at every turn.
  return toWorld(box, enemy.x, enemy.y, 1, scale);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Resolve the player's live hitbox against every enemy.
 *
 * Returns the number of enemies hit this tick, so the caller can turn it into an event rather than
 * re-deriving one by comparing hp across ticks *(vault 2.5 — edges are emitted, never reconstructed)*.
 *
 * Runs BEFORE the enemies' own damage in step 9b, so a killing blow lands first and a corpse cannot
 * also hurt you on the tick it dies. That ordering is a deliberate choice — trading hits with
 * something you just killed reads as the game cheating.
 *
 * **It is currently UNGATED, and that is recorded rather than hidden** *(C11)*. Swapping the two
 * calls fails no test, and the reason is not a missing test but a masked effect: to be in contact
 * range at all, the player must already have taken contact damage, which grants `IFRAME_TICKS` 45
 * of invulnerability — longer than the whole 20-tick swing. So on the tick the enemy dies the
 * player is invulnerable either way, and no fixture can tell the orderings apart without
 * contriving one. Writing a test that only passes because of how it was posed would be worse than
 * saying this.
 *
 * It stops being masked the moment `IFRAME_TICKS` drops below `attackTotalTicks(ATTACK)`, which is
 * a plausible retune. If that happens, the case becomes reachable and needs a gate.
 */
export function applyPlayerAttack(world: World): number {
  const { player } = world;
  if (player.state !== 'attack' || !hitWindowOpen(player.combatCounter, ATTACK)) {
    return 0;
  }

  const swing = world.tickCount - player.combatCounter;
  const reach = toWorld(ATTACK_BOX, player.x, player.y, player.facing, world.scale);
  let hits = 0;

  const strike = (enemy: Hittable, box: LocalBox): void => {
    if (enemy.hp <= 0 || enemy.lastHitSwing === swing) {
      return;
    }
    if (!overlaps(reach, bodyOf(enemy, box, world.scale))) {
      return;
    }
    enemy.lastHitSwing = swing;
    enemy.hp = Math.max(0, enemy.hp - PLAYER_ATTACK_DAMAGE);
    hits += 1;
  };

  for (const sentry of world.enemies.sentries as Sentry[]) {
    strike(sentry, SENTRY_BOX);
  }
  for (const scavenger of world.enemies.scavengers as Scavenger[]) {
    strike(scavenger, SCAVENGER_BOX);
  }

  return hits;
}
