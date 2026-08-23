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
 *
 * ## Hit-stop skips a BODY's turn, never the world's array update (Phase 9)
 *
 * A frozen enemy does not take its own step and a frozen sentry does not fire. **`stepProjectiles`
 * is never skipped**: it is a world-level update over an array, not one creature's turn, and bolts
 * already in flight belong to the world rather than to whoever fired them. Freezing a sentry must
 * not stop a shot that left its barrel three ticks ago — that would be the global pause `hitstop.ts`
 * exists to not be, and it would stop it for every OTHER sentry's shots too, since they share the
 * one array.
 */

import { SENTRY, SENTRY_MUZZLE, releaseAggro, scavengerFooting, stepScavenger, stepSentry } from './enemies';
import { PLAYER_BOX, toWorld } from './player';
import { frozen } from './hitstop';
import { fireProjectile, stepProjectiles } from './projectiles';
import type { World } from './types';

export function stepEnemies(world: World): void {
  const { player } = world;
  const sighting = { playerX: player.x, playerY: player.y };

  const footing = scavengerFooting(world.solids, world.scale);

  for (const scavenger of world.enemies.scavengers) {
    if (scavenger.hp > 0) {
      // Frozen: no decision, no swing advance, no travel. The corpse branch below still runs for a
      // dead one, because death has to release the chase whatever else is true of the body.
      if (!frozen(scavenger, world.tickCount)) {
        stepScavenger(scavenger, sighting, footing);
      }
      continue;
    }
    // 🔴 Death is ONE of three exits from a chase — the other two are `releaseAggro` at the release
    // radius and the same call on the attack window, both in `enemyScavenger.ts`. This line read
    // "the ONLY exit … now that aggro is permanent" until 2026-08-23, when the owner reopened that
    // ruling (inventory 2b.1) and the release radius came back. It is written down here because
    // this loop, which every cause of death routes through, is the one place that sees every corpse
    // regardless of what killed it — a role the other two exits do not share. Before this the loop
    // just `continue`d,
    // which left a dead scavenger flagged `chasing` forever: `enemyView.ts` would pick the `chase`
    // sheet for a body, and any future "is anything hunting the player" question would answer yes
    // from a corpse. Harmless while a chase could lapse on its own; a permanent state with no exit
    // has to be cleared explicitly (Codex plan review, finding 3 — which also found the existing
    // test for this vacuous, because it set `hp = 0` on a scavenger that had never chased).
    // One definition of "the chase is over", shared with the player-death release in `tick`'s step
    // 4c (vault 5.3). Two exits writing their own copy of the same two fields is how one of them
    // ends up clearing a field the other forgets.
    releaseAggro(scavenger);
  }

  // `world.solids` since 2026-08-23: a bolt now stops at a wall instead of flying through it
  // (inventory 1.2). Passing them is the whole wiring — the clip lives in `stepProjectiles`, and a
  // `solids` argument that never arrived would leave the feature a decision function with no
  // consumer, which is this project's most expensive recurring defect.
  world.projectiles = stepProjectiles(
    world.projectiles,
    world.bounds.widthPx,
    world.bounds.heightPx,
    world.solids,
  );

  for (const sentry of world.enemies.sentries) {
    if (sentry.hp <= 0) {
      continue;
    }
    // Frozen: the whole fire block goes, cooldown advance included. `stepSentry` IS the cooldown
    // advance, so calling it and discarding `fired` would let a frozen turret bank its recovery and
    // shoot the instant the freeze lifted.
    if (frozen(sentry, world.tickCount)) {
      continue;
    }
    if (!stepSentry(sentry, sighting).fired) {
      continue;
    }
    // Fired from the CANNON and aimed at the player's chest, not feet-to-feet. Both `y` values are
    // FEET, and the sentry stands on a ledge four tiles above the player in `level-01` — so a shot
    // along the ground line passes under them and one along the sentry's own line sails over their
    // head. Half a body height at the player's end is what makes the turret able to hit anything at
    // all, and no test asking "did a projectile spawn" would have noticed it could not.
    //
    // The sentry's end used to be half a body height too — `sentry.y - SENTRY_BOX.h / 2 * scale` at
    // `sentry.x`, i.e. the middle of the machine, with no muzzle offset in either axis. The user
    // reported it off a screen recording as firing from its belly. `SENTRY_MUZZLE` is the measured
    // barrel position and `toWorld` mirrors it on `facing` — which is why this could not have been
    // written before session 8 gave a sentry a `facing` to offset ALONG.
    //
    // `stepSentry` above has already set `facing` toward the player on this same tick, so the barrel
    // and the sprite's `flipX` agree without either re-deriving the other.
    const muzzle = toWorld(SENTRY_MUZZLE, sentry.x, sentry.y, sentry.facing, world.scale);
    const chestY = player.y - (PLAYER_BOX.h / 2) * world.scale;
    // Frozen HERE, the same tick and the same numbers `fireProjectile` aims with — a renderer that
    // recomputed this from the player's later position would swing the barrel after the shot left.
    // BOTH components are measured from the muzzle: the docstring on these fields says
    // "muzzle->chest", and measuring dx from `sentry.x` while spawning at the muzzle would leave the
    // frozen vector describing a shot that was never fired. Nothing but the new test catches that —
    // every other assertion on these fields is sign-only with ~300px of margin.
    sentry.lastFireDx = Math.round(player.x - muzzle.x);
    sentry.lastFireDy = Math.round(chestY - muzzle.y);
    world.projectiles.push(
      fireProjectile(muzzle.x, muzzle.y, player.x, chestY, SENTRY.projectileSpeed, SENTRY.damage),
    );
  }
}
