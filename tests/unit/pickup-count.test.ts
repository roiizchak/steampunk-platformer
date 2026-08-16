/**
 * Criterion 6.1's simulation half — gear pickups, in the engine-free sim.
 *
 * ## What each test in here IS (vault C3)
 *
 * Every test below is a **guard** (green→green) except the two marked REPRODUCTION, which were
 * written against behaviour that did not exist yet and were watched fail before `src/sim/pickups.ts`
 * was written at all.
 *
 * ## The one that is not obvious
 *
 * `collectedTick` exists because `TickEvents` **cannot** carry a coordinate. It is a boolean record
 * OR-accumulated field-by-field across a whole render frame's batch (`tick.ts:336-358`), so a
 * position put in it would be overwritten by the next tick and a second gear collected in the same
 * batch would be invisible. Codex's Phase 6 plan review found this (finding F7) before any of it was
 * built. The boolean edge stays for Phase 7's audio cue — emitted from the tick that produced it
 * *(vault 2.5)* — and the render layer reads `collectedTick` for the tween.
 */

import { describe, expect, it } from 'vitest';
import { GEAR_BOX, advance, createWorld, tick } from '../../src/sim';
import type { GearSpawn, InputSnapshot, World } from '../../src/sim';
import { RENDER_SCALE } from '../../src/game/constants';

const SCALE = RENDER_SCALE;

/** A world with gears placed relative to the grey-box spawn, so the player can reach them. */
function worldWithGears(gears: readonly GearSpawn[]): World {
  return createWorld({ seed: 1, scale: SCALE, gears });
}

/** Put the player's feet exactly at a point, leaving every window and counter alone. */
function placeFeet(world: World, x: number, y: number): void {
  world.player.x = x;
  world.player.y = y;
}

const idle: InputSnapshot = {
  left: false,
  right: false,
  jumpHeld: false,
  jumpPressed: false,
  walkHeld: false,
  attackPressed: false,
};

describe('gear pickups — the count', () => {
  it('REPRODUCTION: standing on a gear collects it and increments the count', () => {
    const world = worldWithGears([{ x: 470, y: 760 }]);
    expect(typeof world.gearsCollected).toBe('number');
    expect(world.gearsCollected).toBe(0);

    placeFeet(world, 470, 780);
    tick(world, idle);

    expect(world.gearsCollected).toBe(1);
    expect(world.gears[0].collected).toBe(true);
  });

  it('REPRODUCTION: the same gear cannot be collected twice', () => {
    const world = worldWithGears([{ x: 470, y: 760 }]);
    placeFeet(world, 470, 780);

    tick(world, idle);
    const afterFirst = world.gearsCollected;
    for (let i = 0; i < 10; i += 1) {
      placeFeet(world, 470, 780);
      tick(world, idle);
    }

    expect(afterFirst).toBe(1);
    expect(world.gearsCollected).toBe(1);
  });

  it('a gear the player never touches stays uncollected', () => {
    const world = worldWithGears([{ x: 1800, y: 200 }]);
    for (let i = 0; i < 30; i += 1) {
      tick(world, idle);
    }
    expect(world.gearsCollected).toBe(0);
    expect(world.gears[0].collected).toBe(false);
  });

  it('collects every gear the player overlaps on the same tick, and counts each once', () => {
    // Three gears stacked inside the player's 132 x 288 px box at scale 6.
    const world = worldWithGears([
      { x: 470, y: 760 },
      { x: 470, y: 700 },
      { x: 500, y: 640 },
    ]);
    placeFeet(world, 470, 780);
    tick(world, idle);

    expect(world.gearsCollected).toBe(3);
    expect(world.gears.every((gear) => gear.collected)).toBe(true);
  });

  it('records the tick each gear was collected on, so the render layer can find it', () => {
    const world = worldWithGears([{ x: 470, y: 760 }]);
    expect(world.gears[0].collectedTick).toBeNull();

    placeFeet(world, 470, 780);
    const tickOfCollect = world.tickCount;
    tick(world, idle);

    expect(typeof world.gears[0].collectedTick).toBe('number');
    expect(world.gears[0].collectedTick).toBe(tickOfCollect);
  });

  it('emits the gearCollected edge on the tick it happened, and not after', () => {
    const world = worldWithGears([{ x: 470, y: 760 }]);
    placeFeet(world, 470, 780);

    const events = tick(world, idle);
    expect(typeof events.gearCollected).toBe('boolean');
    expect(events.gearCollected).toBe(true);

    placeFeet(world, 470, 780);
    expect(tick(world, idle).gearCollected).toBe(false);
  });

  it('the count is monotone non-decreasing over a long run', () => {
    const world = worldWithGears([
      { x: 470, y: 760 },
      { x: 600, y: 760 },
      { x: 900, y: 620 },
    ]);
    let previous = world.gearsCollected;
    for (let i = 0; i < 200; i += 1) {
      tick(world, { ...idle, right: i % 2 === 0 });
      expect(world.gearsCollected).toBeGreaterThanOrEqual(previous);
      previous = world.gearsCollected;
    }
  });

  it('is deterministic — two identical runs collect identically', () => {
    const run = (): { count: number; ticks: (number | null)[] } => {
      const world = worldWithGears([
        { x: 470, y: 760 },
        { x: 620, y: 760 },
      ]);
      for (let i = 0; i < 120; i += 1) {
        advance(world, { ...idle, right: true }, 1);
      }
      return { count: world.gearsCollected, ticks: world.gears.map((g) => g.collectedTick) };
    };

    const a = run();
    const b = run();
    expect(a.count).toBe(b.count);
    expect(a.ticks).toEqual(b.ticks);
  });
});

describe('gear pickups — geometry', () => {
  it('collects on contact at the box edge, and not one pixel outside it', () => {
    // The player box is 22 x 48 local units; at scale 6 that is 132 wide, centred on the feet.
    // A gear centred exactly half-a-player-width plus half-a-gear-width away is touching.
    const halfPlayer = (22 * SCALE) / 2;
    const halfGear = (GEAR_BOX.w * SCALE) / 2;
    const touching = 470 + halfPlayer + halfGear;

    const onEdge = worldWithGears([{ x: touching, y: 780 - (48 * SCALE) / 2 }]);
    placeFeet(onEdge, 470, 780);
    tick(onEdge, idle);
    expect(onEdge.gearsCollected).toBe(1);

    const justOutside = worldWithGears([{ x: touching + 2, y: 780 - (48 * SCALE) / 2 }]);
    placeFeet(justOutside, 470, 780);
    tick(justOutside, idle);
    expect(justOutside.gearsCollected).toBe(0);
  });

  it('a gear crossed mid-tick is collected, not tunnelled through', () => {
    // The sweep is what makes this pass. A point test at each endpoint would miss a gear the
    // player jumped clean over between two positions, which is the defect `segmentHitsRect`
    // already exists to prevent for hazards.
    const world = worldWithGears([{ x: 470, y: 300 }]);
    placeFeet(world, 470, 900);
    world.player.vy = -700;
    tick(world, idle);

    expect(world.gearsCollected).toBe(1);
  });
});

describe('gear pickups — interaction with the rest of the tick', () => {
  it('a gear touched on the same tick as damage still collects', () => {
    // Pickups are step 9c, after world damage at 9b. Taking a hit must not swallow the pickup.
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      gears: [{ x: 470, y: 760 }],
      hazards: [{ x: 400, y: 770, w: 140, h: 40 }],
    });
    placeFeet(world, 470, 780);
    const hpBefore = world.player.hp;

    tick(world, idle);

    expect(world.player.hp).toBeLessThan(hpBefore);
    expect(world.gearsCollected).toBe(1);
  });

  it('dying and respawning does NOT give the gears back', () => {
    // A respawn restores hp; it does not rewind the level. Stated here because "hp went up" and
    // "the run restarted" look identical from outside a single tick (see TickEvents.respawned).
    const world = worldWithGears([{ x: 470, y: 760 }]);
    placeFeet(world, 470, 780);
    tick(world, idle);
    expect(world.gearsCollected).toBe(1);

    world.player.hp = 0;
    for (let i = 0; i < 200; i += 1) {
      tick(world, idle);
    }

    expect(world.gearsCollected).toBe(1);
    expect(world.gears[0].collected).toBe(true);
  });

  it('advance() carries the gearCollected edge out of a multi-tick batch', () => {
    const world = worldWithGears([{ x: 470, y: 760 }]);
    placeFeet(world, 470, 780);

    const events = advance(world, idle, 5);

    expect(typeof events.gearCollected).toBe('boolean');
    expect(events.gearCollected).toBe(true);
  });
});
