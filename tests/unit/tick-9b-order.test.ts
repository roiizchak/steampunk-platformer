import { describe, expect, it } from 'vitest';
import { createWorld, tick } from '../../src/sim/tick';
import { createSnapshot } from '../../src/sim/input';
import { createScavenger } from '../../src/sim/enemies';
import { SCAVENGER_ATTACK, attackIsLive } from '../../src/sim/scavengerAttack';
import { ATTACK, PLAYER_MAX_HP, invulnerable } from '../../src/sim/combat';
import { frozen } from '../../src/sim/hitstop';

/**
 * # Step 9b: the player's swing resolves BEFORE enemy contact damage
 *
 * Session inventory item **1b.3**, raised to blocker-class for *"session 4"*, which did not do it.
 *
 * `tick.ts` step 9b calls `applyPlayerAttack` and then `applyWorldDamage`. That ordering is a
 * deliberate balance choice — *"trading hits with something you just killed reads as the game
 * cheating"* — and `playerAttack.ts` recorded it as **ungated**: swapping the two calls failed no
 * test. Pinned here, 2026-08-23, on the owner's ruling to **keep today's player-first order**.
 *
 * ## The recorded excuse was wrong, and so was the replacement offered for it
 *
 * `playerAttack.ts` justified the gap by arguing the case is unreachable: to be in contact range the
 * player must already have taken contact damage, which grants `IFRAME_TICKS` 45 — longer than the
 * 20-tick swing — so the player is invulnerable either way. `docs/qa/phase-05-combat-01-timings.md`
 * (A1) called that geometrically false, because `ATTACK_BOX` reaches ~26 units beyond contact
 * distance.
 *
 * ⚠️ **Both are beside the point.** A reach-only dead zone cannot discriminate the ordering at all:
 * no enemy damage happens out there, so both orderings behave identically in it. A gate built on
 * that zone would have been decoration.
 *
 * ## What actually discriminates it: the FREEZE, not the kill
 *
 * `applyPlayerAttack` freezes both bodies, and `applyWorldDamage` skips a frozen scavenger — *"a
 * frozen scavenger deals no damage"*, Phase 9, because a held `attackCounter` inside the active
 * window would otherwise leave the claw live for the whole pause.
 *
 * So on a tick where the player strikes a scavenger whose claw is **already live**:
 *
 * | order | outcome |
 * |---|---|
 * | **player first (shipped)** | the scavenger is hit and frozen; `applyWorldDamage` skips it; the player takes nothing |
 * | contact first | the player is hurt and gains i-frames, *then* the scavenger is hit |
 *
 * That needs no kill and no dead zone — only an overlap and one live claw, which is the ordinary
 * shape of trading blows with a scavenger. It is reachable in play on any level with one.
 *
 * **The mutation this file names is the swap itself**: exchange the `applyPlayerAttack` and
 * `applyWorldDamage` calls in `tick.ts` step 9b.
 */

const SCALE = 6;
const FLOOR = [{ x: -4000, y: 960, w: 20000, h: 400 }];
const BOUNDS = { widthPx: 20000, heightPx: 4000 };

/**
 * The player mid-swing, and a scavenger overlapping them with its claw live on this very tick.
 *
 * Both windows are parked one tick BEFORE the tick under test, because step 13 advances every
 * counter last: what `tick()` reads at 9b is the value set here.
 */
function aboutToTrade() {
  const world = createWorld({
    seed: 1,
    scale: SCALE,
    solids: FLOOR,
    bounds: BOUNDS,
    spawn: { x: 1000, y: 960 },
  });
  const { player } = world;

  const scavenger = createScavenger({
    x: player.x + 20,
    y: player.y,
    patrolMin: player.x - 500,
    patrolMax: player.x + 500,
  });
  // Committed, so `stepScavenger` neither re-acquires nor releases it under the test.
  scavenger.chasing = true;
  // Claw live: inside `[startup, startup + active)`.
  scavenger.attackCounter = SCAVENGER_ATTACK.startup;
  world.enemies.scavengers.push(scavenger);

  player.state = 'attack';
  player.swingStartTick = world.tickCount;
  player.combatCounter = ATTACK.startup;

  return { world, scavenger };
}

describe('step 9b resolves the player swing before enemy contact (inventory 1b.3)', () => {
  it('the premise: the claw really is live and the bodies really do overlap', () => {
    const { world, scavenger } = aboutToTrade();

    // Type before value — an `undefined` hp would make every comparison below meaningless.
    expect(typeof scavenger.hp).toBe('number');
    expect(scavenger.hp).toBeGreaterThan(0);
    expect(attackIsLive(scavenger), 'the claw is not live, so no ordering is being tested').toBe(
      true,
    );
    expect(frozen(scavenger, world.tickCount), 'already frozen before the tick').toBe(false);
    expect(world.player.hp).toBe(PLAYER_MAX_HP);
    // Close enough for contact damage AND inside the swing's reach — the overlap is the whole case.
    expect(Math.abs(scavenger.x - world.player.x)).toBeLessThan(60);
  });

  it('the player takes NO contact damage on the tick their swing connects', () => {
    const { world, scavenger } = aboutToTrade();
    const hpBefore = world.player.hp;

    tick(world, createSnapshot());

    // Player first: the scavenger is struck and frozen, and `applyWorldDamage` skips a frozen body.
    // Swap the two calls in step 9b and this is the assertion that goes red.
    expect(scavenger.hp, 'the swing did not land, so nothing here tests an ordering').toBeLessThan(
      60,
    );
    expect(
      world.player.hp,
      'the player was hurt by a scavenger their own swing had already frozen — step 9b now resolves ' +
        'contact damage BEFORE the player attack',
    ).toBe(hpBefore);
  });

  it('and gains no i-frames from a hit that never happened', () => {
    const { world } = aboutToTrade();

    tick(world, createSnapshot());

    // The second half of the same claim, and the one that matters for what happens NEXT. Taking
    // damage OPENS the window, so a player who silently acquired i-frames here would be invulnerable
    // for 45 ticks of a fight they never took a hit in — which no hp assertion can see.
    //
    // ⚠️ Through the predicate, not the counter *(vault 5.3)*. `iFrameCounter` reads the opposite way
    // round to the obvious guess: `world.ts` seeds it at `IFRAME_TICKS` as the CLOSED sentinel and
    // `applyDamage` sets it to **0** to open the window. The first version of this assertion read
    // `toBe(0)` and failed on a correct game.
    expect(invulnerable(world.player), 'i-frames were granted without any damage').toBe(false);
  });

  it('the scavenger is frozen by the strike — the mechanism the ordering depends on', () => {
    const { world, scavenger } = aboutToTrade();

    tick(world, createSnapshot());

    // If this stops being true the test above passes for a different reason, and the ordering would
    // be unguarded again while looking guarded.
    expect(
      frozen(scavenger, world.tickCount - 1),
      'the strike did not freeze the scavenger, so skipping its contact damage is not what spared ' +
        'the player',
    ).toBe(true);
  });
});
