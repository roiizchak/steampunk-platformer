import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/tick';
import { createScavenger } from '../../src/sim/enemies';
import { applyPlayerAttack } from '../../src/sim/playerAttack';
import { HITSTOP_TICKS, frozen } from '../../src/sim/hitstop';
import { ATTACK } from '../../src/sim/combat';

/**
 * # One swing freezes the player once (session inventory 1b.1)
 *
 * ## The defect
 *
 * `applyPlayerAttack` is ungated by hit-stop and `combatCounter` is frozen during a freeze, so the
 * swing's hitbox stays **live for every frozen tick**. A second enemy that walks into reach during
 * that freeze is struck, and its `freezePair` call extends the player's deadline through
 * `Math.max`. A third extends it again. `docs/qa/phase-09-polish.md:394` recorded this and left it
 * uncapped, correctly, because *"a cap is a design decision"* — one Phase 9 did not own.
 *
 * ⚠️ **It is not the double-hit the inventory's wording suggests.** `lastHitSwing` already dedups
 * per target per swing, and has since Phase 9. The chain is **distinct** enemies each arming a fresh
 * freeze, which no existing mechanism bounds.
 *
 * ## The ruling, taken 2026-08-23
 *
 * **A deadline, and later hits do not extend it.** One swing freezes the player until tick T, fixed
 * by the first body it connects with; anything else it strikes during that freeze is frozen itself
 * but does not push T out. Bounded by construction — the worst case is one freeze length, always —
 * rather than bounded by "level layout makes a crowd unlikely", which was the previous argument and
 * is a fact about today's five levels rather than about this code.
 *
 * **Explicitly decided: a later HEAVIER hit does not extend it either.** A `lethal` connecting
 * during a `light` freeze reads as weightier in every other channel — the particles, the flash and
 * the shake all key off `impactOf` and are unaffected — but it does not lengthen the pause. The
 * alternative was on the table and was not chosen: it makes the worst case depend on the order a
 * crowd arrives in, which is the unpredictability the cap exists to remove.
 *
 * ## What is deliberately NOT changed
 *
 * `freezePair`'s `Math.max` guard stays. It answers a different question — a `light` hit must never
 * **shorten** a `lethal` freeze already in progress — and removing it would make a second blow read
 * as weaker than the first. The cap is per-swing and lives in `applyPlayerAttack`, which is the only
 * place that knows what a swing *is*.
 *
 * The ENEMY half is untouched: every body struck still freezes for its own class. What is bounded is
 * the player's pause, because the player's pause is what reads as "the game stopped".
 */

const SCALE = 6;
const FLOOR = [{ x: -2000, y: 960, w: 20000, h: 120 }];
const BOUNDS = { widthPx: 20000, heightPx: 4000 };

/** A world with the player mid-swing, plus `count` scavengers parked far out of reach. */
function midSwing(count: number) {
  const world = createWorld({
    seed: 1,
    scale: SCALE,
    solids: FLOOR,
    bounds: BOUNDS,
    spawn: { x: 1000, y: 960 },
  });
  const { player } = world;

  // Start a swing by hand. `swingStartTick` MUST be set — `applyPlayerAttack` throws otherwise, and
  // that throw exists because the `-1` sentinel it shares with `lastHitSwing` once made a whole
  // swing pass silently through every enemy.
  player.state = 'attack';
  player.swingStartTick = world.tickCount;
  // Park the counter inside the active window and LEAVE it there. That is not a convenience: a
  // frozen player does not advance `combatCounter`, so an open window across the whole freeze is
  // precisely the production condition that lets the chain happen at all.
  player.combatCounter = ATTACK.startup + 1;

  for (let i = 0; i < count; i += 1) {
    world.enemies.scavengers.push(
      createScavenger({ x: 9000 + i * 500, y: 960, patrolMin: 8000, patrolMax: 12000 }),
    );
  }
  return world;
}

/** Put one scavenger where the swing will connect with it. */
function stepIntoReach(world: ReturnType<typeof midSwing>, index: number): void {
  const scavenger = world.enemies.scavengers[index]!;
  scavenger.x = world.player.x + 20;
  scavenger.y = world.player.y;
}

describe('the hit-stop chain is capped at one freeze per swing (inventory 1b.1)', () => {
  it('the premise: a crowd really does arrive one per tick and really is struck', () => {
    const world = midSwing(5);
    let totalHits = 0;
    for (let i = 0; i < 5; i += 1) {
      stepIntoReach(world, i);
      totalHits += applyPlayerAttack(world).hits;
      world.tickCount += 1;
    }
    // Without this the test below could pass because nothing was ever hit — the absence-assertion
    // trap this session has already walked into once.
    expect(totalHits, 'no enemy was struck, so there is no chain to cap').toBe(5);
  });

  it('does not extend the deadline when a second body walks in during the freeze', () => {
    const world = midSwing(5);
    const { player } = world;

    stepIntoReach(world, 0);
    applyPlayerAttack(world);
    const deadlineAfterFirst = player.hitstopUntil;
    expect(deadlineAfterFirst, 'the first hit armed no freeze at all').toBeGreaterThan(-1);

    for (let i = 1; i < 5; i += 1) {
      world.tickCount += 1;
      stepIntoReach(world, i);
      applyPlayerAttack(world);
    }

    expect(
      player.hitstopUntil,
      'four more bodies pushed the deadline out — the chain is still uncapped',
    ).toBe(deadlineAfterFirst);
  });

  it('bounds the total frozen ticks by ONE freeze length, however large the crowd', () => {
    const world = midSwing(12);
    const { player } = world;

    stepIntoReach(world, 0);
    applyPlayerAttack(world);
    const armedAt = world.tickCount;

    for (let i = 1; i < 12; i += 1) {
      world.tickCount += 1;
      stepIntoReach(world, i);
      applyPlayerAttack(world);
    }

    // `light`, because a 60 hp scavenger survives one hit. The deadline is inclusive — `hitstopUntil`
    // is the LAST frozen tick — so the span is the table's value exactly.
    expect(player.hitstopUntil - armedAt).toBe(HITSTOP_TICKS.light);
    expect(frozen(player, armedAt + HITSTOP_TICKS.light)).toBe(true);
    expect(frozen(player, armedAt + HITSTOP_TICKS.light + 1)).toBe(false);
  });

  it('a LETHAL blow landing mid-chain does not lengthen the pause either', () => {
    const world = midSwing(2);
    const { player } = world;

    stepIntoReach(world, 0);
    applyPlayerAttack(world);
    const deadline = player.hitstopUntil;

    // One hp, so the next strike kills it and asks for `lethal` — 9 ticks against light's 4. Under
    // the old `Math.max` this pushed the deadline out by five.
    world.tickCount += 1;
    world.enemies.scavengers[1]!.hp = 1;
    stepIntoReach(world, 1);
    const result = applyPlayerAttack(world);

    expect(result.kills, 'the lethal blow did not land, so this proves nothing').toBe(1);
    expect(player.hitstopUntil, 'a lethal hit mid-chain extended the freeze').toBe(deadline);
  });

  it('still freezes the enemy it struck — the cap is on the PLAYER, not on the victim', () => {
    const world = midSwing(2);

    stepIntoReach(world, 0);
    applyPlayerAttack(world);

    world.tickCount += 1;
    stepIntoReach(world, 1);
    applyPlayerAttack(world);

    // The counter-fixture. "Skip the whole freezePair call for later hits" would satisfy every
    // assertion above while silently removing the second enemy's own hit-stop.
    const second = world.enemies.scavengers[1]!;
    expect(second.hitstopUntil, 'the second enemy was struck but never froze').toBe(
      world.tickCount + HITSTOP_TICKS.light,
    );
    expect(frozen(second, world.tickCount)).toBe(true);
  });

  it('a NEW swing may freeze again — the cap is per swing, not per lifetime', () => {
    const world = midSwing(2);
    const { player } = world;

    stepIntoReach(world, 0);
    applyPlayerAttack(world);
    const firstDeadline = player.hitstopUntil;

    // A fresh swing: new identity, and the counter re-parked in its window.
    world.tickCount += 40;
    player.swingStartTick = world.tickCount;
    player.combatCounter = ATTACK.startup + 1;
    stepIntoReach(world, 1);
    applyPlayerAttack(world);

    expect(
      player.hitstopUntil,
      'the second swing did not freeze — the cap leaked past its own swing',
    ).toBeGreaterThan(firstDeadline);
  });
});
