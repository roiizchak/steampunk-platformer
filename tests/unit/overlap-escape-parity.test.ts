import { describe, expect, it } from 'vitest';
import { PLAYER_BOX, resolveCollisions } from '../../src/sim/player';
import { blockedAt } from '../../src/sim/enemyGeometry';
import { createWorld } from '../../src/sim/tick';
import type { Rect } from '../../src/sim/types';

/**
 * # "Newly entered, not overlapping" — one rule, two bodies, and they must move together
 *
 * Session inventory **1.4**, from `docs/reviews/session-bugfix-perf-gates-impl.md:75` (finding 2b),
 * verified real and **recorded rather than changed**.
 *
 * Both collision resolvers refuse only a body that **was clear** on the previous frame:
 *
 * - `blockedAt` (`enemyGeometry.ts`) computes `wasClear` and returns `true` only then;
 * - `resolveCollisions` (`player.ts`) pushes out only under `wasLeft` / `wasRight`.
 *
 * So a body that **starts** inside a solid is not pushed out and keeps moving deeper into it.
 *
 * ## Why it is deliberate, and why the reason is load-bearing
 *
 * An overlap test — "if you are inside, refuse" — breaks the `EVERYWHERE` fixture and **would have
 * trapped a shipped enemy at boot**, because every one of the twenty enemies in the five levels
 * stands with *exactly zero* separation from its floor. `FOOT_TOLERANCE_PX`'s docstring records that
 * measurement and the two rewrites it already caused.
 *
 * And the two resolvers use the **same** rule. Changing one without the other puts the player and
 * the enemies on different physics — a bug far worse than the latent one, and much harder to see.
 *
 * ## What this file is, and what it is not
 *
 * It is **not** a fix. The paired change is real work with real risk (it touches the collision every
 * Phase 2 assertion rests on) and is deliberately not attempted here *(C11)*.
 *
 * It is the coupling made **executable**. Until now *"treat as a paired change or not at all"* was a
 * sentence in a review nobody re-reads. Now a change to either resolver alone turns this red, and
 * the failure message says why. That converts a promise to remember — the exact thing that failed
 * for 1b.2, 1b.6 and 2.3 in this same session — into something the suite enforces.
 *
 * **A red here is not fixed by deleting the assertion.** It means either the other body needs the
 * same change, or the asymmetry is now intended and this file should say so instead.
 */

const SCALE = 6;

/** A wall a body can be placed inside of. */
const WALL: Rect = { x: 1000, y: 0, w: 400, h: 3000 };

describe('the player resolver: newly entered, not overlapping (inventory 1.4)', () => {
  function playerAt(x: number) {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: [WALL],
      bounds: { widthPx: 8000, heightPx: 4000 },
      spawn: { x, y: 2000 },
    });
    return world;
  }

  it('pushes out a player who ENTERED the wall this frame', () => {
    // The positive half. Without it, everything below would pass on a resolver that does nothing at
    // all, which is the shape a pin most easily degenerates to.
    const world = playerAt(1000 - PLAYER_BOX.w * SCALE);
    const { player } = world;
    const previousX = player.x;

    player.x = WALL.x + 10;
    resolveCollisions(player, world.solids, SCALE, previousX, player.y);

    expect(player.x, 'a player who walked into the wall was not pushed out').toBeLessThan(WALL.x);
    expect(player.vx).toBe(0);
  });

  it('does NOT push out a player who was ALREADY inside it — pinned, not endorsed', () => {
    const world = playerAt(WALL.x + 100);
    const { player } = world;

    // Previous position also inside: neither `wasLeft` nor `wasRight` holds.
    const previousX = WALL.x + 90;
    player.x = WALL.x + 100;
    resolveCollisions(player, world.solids, SCALE, previousX, player.y);

    expect(
      player.x,
      'the player resolver now escapes an overlap. `blockedAt` must change WITH it, or the player ' +
        'and the enemies are on different physics — see this file’s header and inventory 1.4.',
    ).toBe(WALL.x + 100);
  });
});

describe('the enemy resolver: the SAME rule, and that is the point', () => {
  const HALF_W = 60;
  const HEIGHT = 120;
  const FEET_Y = 2000;
  const GROUND: Rect = { x: -2000, y: FEET_Y, w: 20000, h: 400 };

  it('blocks a step that ENTERS a wall', () => {
    // The positive half again, for the same reason.
    expect(
      blockedAt(WALL.x - HALF_W - 10, WALL.x - HALF_W + 10, FEET_Y, HALF_W, HEIGHT, [WALL, GROUND]),
    ).toBe(true);
  });

  it('does NOT block a body that was ALREADY inside — pinned, not endorsed', () => {
    expect(
      blockedAt(WALL.x + 100, WALL.x + 120, FEET_Y, HALF_W, HEIGHT, [WALL, GROUND]),
      'blockedAt now refuses an overlap. `resolveCollisions` must change WITH it, or the enemies ' +
        'and the player are on different physics — see this file’s header and inventory 1.4.',
    ).toBe(false);
  });

  it('still lets a body walk along the floor it stands on', () => {
    // The reason the tolerance exists at all, and the case an "if you overlap, refuse" fix breaks:
    // every shipped enemy stands with exactly zero separation from its floor.
    expect(blockedAt(500, 506, FEET_Y, HALF_W, HEIGHT, [GROUND])).toBe(false);
  });
});

describe('the two resolvers agree — change one and this is what tells you', () => {
  it('both let an already-overlapping body keep moving, and both stop a newly-entering one', () => {
    // Asserted as a PAIR rather than as two independent facts, because the pairing is the property
    // worth protecting. Two files that happen to agree today is vault 5.3's failure mode; two files
    // a test requires to agree is not.
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: [WALL],
      bounds: { widthPx: 8000, heightPx: 4000 },
      spawn: { x: WALL.x + 100, y: 2000 },
    });
    const { player } = world;
    const before = player.x;
    resolveCollisions(player, world.solids, SCALE, WALL.x + 90, player.y);
    const playerEscaped = player.x !== before;

    const enemyBlocked = blockedAt(WALL.x + 100, WALL.x + 120, 2000, 60, 120, [WALL]);

    expect(
      playerEscaped,
      'the two resolvers no longer agree about an overlapping body: player escaped=' +
        `${String(playerEscaped)}, enemy blocked=${String(enemyBlocked)}. Inventory 1.4 says this ` +
        'is a paired change or none at all.',
    ).toBe(enemyBlocked);
  });
});
