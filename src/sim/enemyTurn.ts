/**
 * **Step 4a of the tick order** — every enemy's turn, and the shots already in flight.
 *
 * Paired with `worldDamage.ts` (step 9b): one module per lettered sub-step, so `tick.ts` stays the
 * numbered list vault 2.2 asks a contract to be rather than a paragraph of arithmetic. Both were
 * extracted when the tick file crossed the 400-line rule, and the seam is the same in each case:
 * the step order lives in `tick.ts`, the work each step does lives beside the things it works on.
 *
 * ## Why enemies move before the player integrates
 *
 * Every enemy decides against the player's position **as of the end of last tick**. That is one
 * well-defined moment shared by all of them. "After the player has integrated" would make an
 * enemy's decision depend on where it sits in the array relative to the player's own update — a
 * bug that stays invisible until someone reorders a list, and then changes the game.
 *
 * Projectiles are advanced BEFORE the sentries fire, so a shot spawned this tick does not also move
 * this tick. Firing first would give every shot a free tick of travel and make the muzzle appear a
 * body-width from the barrel.
 */

import { SENTRY, SENTRY_BOX, stepScavenger, stepSentry } from './enemies';
import { PLAYER_BOX } from './player';
import { fireProjectile, stepProjectiles } from './projectiles';
import type { World } from './types';

export function stepEnemies(world: World): void {
  const { player } = world;
  const sighting = { playerX: player.x, playerY: player.y };

  for (const scavenger of world.enemies.scavengers) {
    if (scavenger.hp > 0) {
      stepScavenger(scavenger, sighting);
    }
  }

  world.projectiles = stepProjectiles(
    world.projectiles,
    world.bounds.widthPx,
    world.bounds.heightPx,
  );

  for (const sentry of world.enemies.sentries) {
    if (sentry.hp <= 0) {
      continue;
    }
    if (!stepSentry(sentry, sighting).fired) {
      continue;
    }
    // Fired from the sentry's chest and aimed at the player's, not feet-to-feet. Both `y` values
    // are FEET, and the sentry stands on a ledge four tiles above the player in `level-01` — so a
    // shot along the ground line passes under them and one along the sentry's own line sails over
    // their head. Half a body height at each end is what makes the turret able to hit anything at
    // all, and no test asking "did a projectile spawn" would have noticed it could not.
    const muzzleY = sentry.y - (SENTRY_BOX.h / 2) * world.scale;
    const chestY = player.y - (PLAYER_BOX.h / 2) * world.scale;
    // Frozen HERE, the same tick and the same numbers `fireProjectile` aims with — a renderer that
    // recomputed this from the player's later position would swing the barrel after the shot left.
    sentry.lastFireDx = Math.round(player.x - sentry.x);
    sentry.lastFireDy = Math.round(chestY - muzzleY);
    world.projectiles.push(
      fireProjectile(sentry.x, muzzleY, player.x, chestY, SENTRY.projectileSpeed, SENTRY.damage),
    );
  }
}
