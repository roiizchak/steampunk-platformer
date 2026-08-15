/**
 * Step 9b's damage ordering — finding A1 in `docs/qa/phase-05-combat.md`.
 *
 * `playerAttack.ts` (comment at the top of `applyPlayerAttack`) records the ordering between the
 * player's swing and the enemies' contact damage as "currently UNGATED", on the theory that being
 * in contact range always implies `IFRAME_TICKS` (45) of invulnerability already granted — longer
 * than the whole 20-tick swing — so no fixture can tell the two orderings apart.
 *
 * That theory is geometrically false: `ATTACK_BOX` (`playerAttack.ts:50`) reaches past
 * contact-overlap distance, so a dead zone exists where a swing connects with ZERO prior contact
 * damage and therefore no i-frames. This fixture sits in that dead zone: the scavenger overlaps
 * both the player's body (`overlapsScavenger`) and the attack box at the same position, with the
 * player's i-frames already expired.
 *
 * Drives the real `tick()` — the point is the ordering at `src/sim/tick.ts:291-297`
 * (`applyPlayerAttack` before `applyWorldDamage`), not the two functions in isolation.
 */

import { describe, expect, it } from 'vitest';

import { ATTACK, PLAYER_MAX_HP, hitWindowOpen } from '../../src/sim/combat';
import { PLAYER_ATTACK_DAMAGE } from '../../src/sim/playerAttack';
import { createSnapshot } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';

const SCALE = 6;
const FLOOR = [{ x: 0, y: 960, w: 8000, h: 120 }];
const BOUNDS = { widthPx: 8000, heightPx: 1080 };

/**
 * The first counter on which the active hit window is open, found via the imported predicate —
 * never a restated `startup` comparison (vault 5.3).
 */
function firstActiveCounter(): number {
  let counter = 0;
  while (!hitWindowOpen(counter, ATTACK)) {
    counter += 1;
  }
  return counter;
}

describe("step 9b: the player's swing resolves before contact damage (finding A1)", () => {
  it('a killing blow lands with zero contact damage taken, in the dead zone contact-overlap implies i-frames does not cover', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: BOUNDS,
      spawn: { x: 1000, y: 960 },
      enemies: [{ slug: 'rust-scavenger', x: 1060, y: 960, patrolMin: 1060, patrolMax: 1060 }],
    });
    const scavenger = world.enemies.scavengers[0]!;
    scavenger.hp = PLAYER_ATTACK_DAMAGE; // one swing kills it outright
    // Movement and detection disabled, the way `player-attack.test.ts`'s `worldWithScavengerAt` does
    // it — isolating the ordering from the scavenger's own chase behaviour.
    scavenger.detectRadius = 0;
    scavenger.chaseSpeed = 0;

    // Start already mid-swing, one tick before the active window opens. Starting from 'fall' and
    // looping would let the scavenger's contact damage interrupt the swing (via `enterCombatState`
    // resetting `state`/`combatCounter`) long before the active window was ever reached.
    world.player.state = 'attack';
    world.player.combatCounter = firstActiveCounter() - 1;
    // i-frames expired — `createWorld` already seeds `iFrameCounter` at `IFRAME_TICKS` (closed
    // window, vault-documented "expired" state), so no override is needed here.

    tick(world, createSnapshot());

    expect(scavenger.hp).toBe(0);
    expect(world.player.hp).toBe(PLAYER_MAX_HP);
  });

  it('a sentry in the same overlapping position deals no contact damage — worldDamage.ts iterates scavengers only', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: BOUNDS,
      spawn: { x: 1000, y: 960 },
      enemies: [{ slug: 'brass-sentry', x: 970, y: 960, patrolMin: 970, patrolMax: 970 }],
    });
    const sentry = world.enemies.sentries[0]!;
    sentry.radius = 0; // never fires — isolates contact from the projectile path

    for (let i = 0; i < 10; i += 1) {
      tick(world, createSnapshot());
    }

    expect(world.player.hp).toBe(PLAYER_MAX_HP);
  });
});
