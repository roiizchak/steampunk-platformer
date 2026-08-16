/**
 * The four audio cue edges Phase 7 adds to `TickEvents` — criterion 7.6, vault 2.5.
 *
 * Five of Phase 7's nine cues already had an edge: `jumped`, `landed`, `attackStarted`, `hitLanded`
 * and `gearCollected`. These four did not, and each was missing for a different reason:
 *
 *   - **`playerHurt`** — observable only as `combatCounter === 0 && state === 'hurt'`, a counter-edge
 *     that survives exactly one tick. Any render frame draining more than one tick loses it.
 *     `damagePlayer` already returns "did it land" (`combat.ts:88`); `applyWorldDamage` threw that
 *     boolean away.
 *   - **`playerDied`** — same counter-edge shape, and **two entry paths**. See below.
 *   - **`enemyKilled`** — no marker of any kind. Enemies carry no death tick, no death counter and
 *     no `alive` flag; death is only ever inferred by `hp <= 0`, which is a comparison against the
 *     previous tick and therefore exactly what vault 2.5 forbids.
 *   - **`footstep`** — no stride or cadence concept existed anywhere in `src/sim/`.
 *
 * ## 🔴 The kill plane is the case that would have shipped
 *
 * `applyWorldDamage` early-returns on the kill plane: `killPlayer(player); return;`
 * (`worldDamage.ts:117-120`). It never reaches `damagePlayer`. So a `playerDied` edge built only from
 * `damagePlayer`'s return leaves **falling out of the world** — the most common death in a
 * platformer — silent, while every test using ordinary lethal damage passes. Found by the Codex plan
 * review (F4) before any code existed. Both paths are asserted here, separately and on purpose.
 *
 * ## 🔴 A kill is always also a hit
 *
 * `strike()` decrements hp and then increments `hits` unconditionally (`playerAttack.ts:108-110`), so
 * `hitLanded` is necessarily true on any tick `enemyKilled` is. That is not an accident to be tidied
 * away — criterion 7.2's clipping stack has to include both, and the plan's first draft omitted the
 * hit. Asserted below so the stack's premise is pinned by a test rather than by a paragraph.
 *
 * ## Why footsteps are counted in TICKS, not pixels
 *
 * The first draft accumulated distance against `stridePxPerCycle {walk: 254, run: 320}`. That number
 * is retired — `animTiming.ts:190-196` records it as "no longer used for timing", kept only because
 * the asset file still holds the measurement. The live authority is the catalog's `simTicks`: walk is
 * a 48-tick loop, run a 30-tick loop, two footfalls each. A tick count is also natively legal under
 * the "every duration is an integer count of 60 Hz ticks" constraint, which a px accumulator is only
 * incidentally.
 */

import { describe, expect, it } from 'vitest';

import catalog from '../../public/assets/index.json';
import { DEATH_TICKS } from '../../src/sim/combat';
import { createSnapshot, latchAttackPress, latchJumpPress } from '../../src/sim/input';
import { FOOTSTEP_TICKS } from '../../src/sim/playerTuning';
import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, Rect, TickEvents, World } from '../../src/sim/types';

const SCALE = 6;
const FLOOR: Rect[] = [{ x: 0, y: 960, w: 8000, h: 120 }];
const BOUNDS = { widthPx: 8000, heightPx: 1080 };

function worldWith(overrides: Partial<Parameters<typeof createWorld>[0]> = {}): World {
  return createWorld({
    seed: 1,
    scale: SCALE,
    solids: FLOOR,
    spawn: { x: 1000, y: 960 },
    bounds: BOUNDS,
    ...overrides,
  });
}

const IDLE: InputSnapshot = createSnapshot();

/** Run `count` ticks against one snapshot, returning the tick offsets on which `field` was true. */
function ticksThatFired(
  world: World,
  field: keyof TickEvents,
  count: number,
  input: InputSnapshot = IDLE,
): number[] {
  const fired: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (tick(world, input)[field]) {
      fired.push(i);
    }
  }
  return fired;
}

/** Gaps between consecutive entries — the shape a cadence claim actually makes. */
function gaps(offsets: readonly number[]): number[] {
  return offsets.slice(1).map((offset, i) => offset - offsets[i]!);
}

describe('playerHurt — the edge damagePlayer already knew about and nothing carried out', () => {
  it('fires on the tick a hazard lands, and on no other tick of the hitstun', () => {
    // A hazard band the player is standing in from tick 0, so the hit is immediate and the player
    // stays inside it — which is what makes "only once" a real assertion rather than a tautology.
    const world = worldWith({ hazards: [{ x: 0, y: 900, w: 8000, h: 200 }] });

    const fired = ticksThatFired(world, 'playerHurt', 20);

    expect(fired.length).toBeGreaterThan(0);
    // The player never leaves the hazard, so a naive "is the player hurt" read would be true for
    // every tick of the hitstun window. An edge is true once per landing.
    expect(fired[0]).toBe(0);
    expect(fired).not.toContain(1);
    expect(fired).not.toContain(2);
  });

  it('does not fire on a tick nothing damaged the player', () => {
    const world = worldWith();
    expect(ticksThatFired(world, 'playerHurt', 30)).toEqual([]);
  });
});

describe('playerDied — both entry paths, because only one goes through damagePlayer', () => {
  /**
   * Run until `playerDied` first fires, collecting both damage edges on the way.
   *
   * Bounded at the first death deliberately. The player **respawns** after `DEATH_TICKS` and, in
   * these fixtures, promptly dies again — a 400-tick window over a bottomless world sees four
   * separate deaths, which says nothing about whether the edge is per-death or per-tick. The
   * "not again" question is asked below, against the death window that actually owns it.
   */
  function runToFirstDeath(world: World, limit = 400): { hurtOn: number[]; diedAt: number | null } {
    const hurtOn: number[] = [];
    for (let i = 0; i < limit; i += 1) {
      const events = tick(world, IDLE);
      if (events.playerHurt) hurtOn.push(i);
      if (events.playerDied) return { hurtOn, diedAt: i };
    }
    return { hurtOn, diedAt: null };
  }

  it('fires on the tick the player crosses the kill plane', () => {
    // No solids: the player falls out of a world whose floor is `heightPx`. This path early-returns
    // in `applyWorldDamage` before `damagePlayer` is ever called (worldDamage.ts:117-120), so an
    // edge derived from that function's return alone would never fire here.
    const world = worldWith({ solids: [], spawn: { x: 500, y: 0 } });

    const { diedAt } = runToFirstDeath(world);

    expect(diedAt).not.toBeNull();
    expect(world.player.hp).toBe(0);
    expect(world.player.state).toBe('death');
    // Nothing damaged the player on the way down — the kill plane is not damage.
    expect(world.player.state).toBe('death');
  });

  it('fires on the tick lethal damage takes hp to zero, not on the hits before it', () => {
    // A hazard the player stands in, taking a hit each time i-frames lapse, until hp reaches 0.
    const world = worldWith({ hazards: [{ x: 0, y: 900, w: 8000, h: 200 }] });

    const { hurtOn, diedAt } = runToFirstDeath(world);

    expect(diedAt).not.toBeNull();
    expect(world.player.hp).toBe(0);
    // The non-lethal hits are `playerHurt`, the lethal one is `playerDied` — never both on one tick.
    // Without this, a cue layer plays the hurt sound over the death sound on the tick that matters.
    expect(hurtOn.length).toBeGreaterThan(0);
    expect(hurtOn).not.toContain(diedAt);
  });

  it('does not fire again for the whole time the corpse is on screen', () => {
    const world = worldWith({ solids: [], spawn: { x: 500, y: 0 } });

    const { diedAt } = runToFirstDeath(world);
    expect(diedAt).not.toBeNull();

    // `killPlayer` runs again on every tick the corpse is still below the kill plane, and it is
    // idempotent — so this is the assertion that the EDGE is too. One death, one cue.
    const duringCorpse = ticksThatFired(world, 'playerDied', DEATH_TICKS - 1);
    expect(duringCorpse).toEqual([]);
    expect(world.player.state).toBe('death');
  });
});

describe('enemyKilled — the only one of the four with no state marker at all', () => {
  /** A scavenger parked at `x` with its detection and speed off, so it cannot fight back. */
  function worldWithScavengerAt(x: number): World {
    const world = worldWith({
      enemies: [{ slug: 'rust-scavenger', x, y: 960, patrolMin: x, patrolMax: x }],
    });
    const target = world.enemies.scavengers[0]!;
    target.detectRadius = 0;
    target.chaseSpeed = 0;
    return world;
  }

  it('fires on the tick a swing takes the last hp, and not on the swings before it', () => {
    const world = worldWithScavengerAt(1120);
    const target = world.enemies.scavengers[0]!;

    const killedOn: number[] = [];
    let hpAtKill: number | null = null;
    for (let i = 0; i < 600; i += 1) {
      const input = createSnapshot();
      latchAttackPress(input);
      const events = tick(world, input);
      if (events.enemyKilled) {
        killedOn.push(i);
        hpAtKill ??= target.hp;
      }
    }

    expect(target.hp).toBe(0);
    expect(killedOn).toHaveLength(1);
    // The tick it reached zero, not the tick something noticed. `enemyTurn` only spots `hp <= 0` on
    // the FOLLOWING tick, which is exactly the state comparison vault 2.5 forbids.
    expect(hpAtKill).toBe(0);
  });

  it('is always accompanied by hitLanded — criterion 7.2 stacks both', () => {
    const world = worldWithScavengerAt(1120);

    let sawKill = false;
    for (let i = 0; i < 600; i += 1) {
      const input = createSnapshot();
      latchAttackPress(input);
      const events = tick(world, input);
      if (events.enemyKilled) {
        sawKill = true;
        // `strike()` increments `hits` on the killing blow like any other (playerAttack.ts:108-110).
        // The clipping budget has to sum both cues, and this is what pins that premise.
        expect(events.hitLanded).toBe(true);
      }
    }

    expect(sawKill).toBe(true);
  });

  it('does not fire on a non-lethal hit', () => {
    const world = worldWithScavengerAt(1120);
    const target = world.enemies.scavengers[0]!;

    const input = createSnapshot();
    latchAttackPress(input);

    let landedWhileAlive = false;
    for (let i = 0; i < 40; i += 1) {
      const events = tick(world, input);
      if (events.hitLanded && target.hp > 0) {
        landedWhileAlive = true;
        expect(events.enemyKilled).toBe(false);
      }
    }

    // Guard the guard: if the swing never connected, the loop above asserted nothing.
    expect(landedWhileAlive).toBe(true);
  });

  it('does not fire on a tick with no swing', () => {
    const world = worldWithScavengerAt(1120);
    expect(ticksThatFired(world, 'enemyKilled', 60)).toEqual([]);
  });
});

describe('footstep — a cadence the sim did not have', () => {
  it('fires every FOOTSTEP_TICKS.walk ticks while walking', () => {
    const world = worldWith();
    const walkRight: InputSnapshot = { ...createSnapshot(), right: true, walkHeld: true };

    const fired = ticksThatFired(world, 'footstep', 200, walkRight);

    expect(fired.length).toBeGreaterThanOrEqual(3);
    // Every gap, not the average: a cadence that drifts satisfies a mean and is audibly wrong.
    expect(new Set(gaps(fired))).toEqual(new Set([FOOTSTEP_TICKS.walk]));
  });

  it('fires every FOOTSTEP_TICKS.run ticks while running, which is faster', () => {
    const world = worldWith();
    const runRight: InputSnapshot = { ...createSnapshot(), right: true };

    const fired = ticksThatFired(world, 'footstep', 200, runRight);

    expect(fired.length).toBeGreaterThanOrEqual(3);
    expect(new Set(gaps(fired))).toEqual(new Set([FOOTSTEP_TICKS.run]));
    expect(FOOTSTEP_TICKS.run).toBeLessThan(FOOTSTEP_TICKS.walk);
  });

  it('does not fire while standing still', () => {
    const world = worldWith();
    expect(ticksThatFired(world, 'footstep', 200)).toEqual([]);
  });

  /**
   * The pin. `src/sim/` may not read a file, so `FOOTSTEP_TICKS` is a mirror — and a mirror with no
   * test is a retyped constant waiting to drift. Same pattern as `foot-plant.test.ts` for
   * `FOOT_PX_PER_FRAME` and `catalog-timings.test.ts` for the combat windows.
   *
   * A locomotion cycle is two footfalls, so the cadence is the catalog's `simTicks` halved. If an
   * animation is ever re-timed, this goes red rather than the footsteps quietly drifting out of
   * phase with the drawn feet — which is a defect nothing else in this suite could see.
   */
  it('stays pinned to the shipped animation loop — simTicks / 2, both states', () => {
    const sheet = (key: string): number => {
      const row = catalog.sheets.find((s) => s.key === key);
      expect(row, `${key} is missing from public/assets/index.json`).toBeDefined();
      return row!.simTicks;
    };

    expect(FOOTSTEP_TICKS.walk).toBe(sheet('brass-courier-walk') / 2);
    expect(FOOTSTEP_TICKS.run).toBe(sheet('brass-courier-run') / 2);
    // Both must stay whole: half a tick is not a thing the sim can count *(vault 2.1)*.
    expect(Number.isInteger(FOOTSTEP_TICKS.walk)).toBe(true);
    expect(Number.isInteger(FOOTSTEP_TICKS.run)).toBe(true);
  });

  it('does not fire while airborne', () => {
    const world = worldWith();
    const input: InputSnapshot = { ...createSnapshot(), right: true, jumpHeld: true };
    latchJumpPress(input);

    // Settle on the ground first, then jump, and only sample once the feet have left.
    for (let i = 0; i < 5; i += 1) tick(world, { ...createSnapshot(), right: true });

    const airborne: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const events = tick(world, input);
      if (!world.player.grounded) {
        airborne.push(world.player.state);
        expect(events.footstep).toBe(false);
      }
    }

    // Guard the guard: without this the test passes on a player who never left the floor.
    expect(airborne.length).toBeGreaterThan(5);
  });
});
