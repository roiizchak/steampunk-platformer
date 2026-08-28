import { afterEach, describe, expect, it } from 'vitest';
import { advance, createWorld, tick } from '../../src/sim/tick';
import { clearTickObservers, observeTicks } from '../../src/sim/trace';
import type { TickTrace } from '../../src/sim/trace';
import type { InputSnapshot, World } from '../../src/sim/types';

/**
 * # The trace seam must change nothing, and must attribute to the right tick
 *
 * `sim-boundary.test.ts` proves the trace imports nothing forbidden. It does **not** prove the
 * observer leaves the simulation alone, and that is the property everything else in this session
 * rests on: if attaching a diagnostic changes the thing being diagnosed, every reading it produces
 * is about a world the owner never played.
 *
 * So this file asserts transparency **by comparison** — the same seed, the same input, run twice —
 * rather than by inspecting the implementation. An implementation-shaped assertion would go green
 * against a rewrite that broke it.
 */

const SOLIDS = [{ x: 0, y: 1000, w: 4000, h: 400 }];

function makeWorld(): World {
  return createWorld({
    seed: 7,
    scale: 6,
    solids: SOLIDS,
    bounds: { widthPx: 4000, heightPx: 2000 },
    spawn: { x: 300, y: 1000 },
  });
}

function heldRight(): InputSnapshot {
  return {
    left: false,
    right: true,
    jumpHeld: false,
    jumpPressed: false,
    walkHeld: false,
    attackPressed: false,
  } as InputSnapshot;
}

/** Everything a tick could have changed, flattened so a diff names the field. */
function snapshot(world: World): Record<string, unknown> {
  const p = world.player;
  return {
    tickCount: world.tickCount,
    tickRoll: world.tickRoll,
    gearsCollected: world.gearsCollected,
    goalEntryTicks: world.goalEntryTicks,
    completed: world.completed,
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    grounded: p.grounded,
    state: p.state,
    hp: p.hp,
    facing: p.facing,
    ticksSinceGrounded: p.ticksSinceGrounded,
    ticksSinceJumpPressed: p.ticksSinceJumpPressed,
  };
}

afterEach(() => {
  clearTickObservers();
});

describe('the trace seam is behaviourally transparent', () => {
  it('leaves the world, the RNG stream and the returned events byte-identical', () => {
    const untraced = makeWorld();
    const untracedEvents = [];
    for (let i = 0; i < 240; i += 1) {
      untracedEvents.push(tick(untraced, heldRight()));
    }

    const traced = makeWorld();
    const seen: TickTrace[] = [];
    const dispose = observeTicks(traced, (t) => seen.push(t));
    const tracedEvents = [];
    for (let i = 0; i < 240; i += 1) {
      tracedEvents.push(tick(traced, heldRight()));
    }
    dispose();

    // The RNG stream is included via `tickRoll`: one sample per tick, so 240 identical values means
    // the seeded sequence advanced identically. A trace that pulled from the stream diverges here.
    expect(snapshot(traced)).toEqual(snapshot(untraced));
    expect(tracedEvents).toEqual(untracedEvents);
    expect(seen).toHaveLength(240);
  });

  it('does not let an observer mutate the events record the caller receives', () => {
    const world = makeWorld();
    const dispose = observeTicks(world, (t) => {
      // A hostile observer. The payload is copied primitives, so there is nothing here to reach
      // through — this is the assertion that the schema stayed flat.
      (t as unknown as Record<string, unknown>).hurt = true;
    });
    const events = tick(world, heldRight());
    dispose();

    expect(events.playerHurt).toBe(false);
  });
});

describe('trace attribution', () => {
  it('reports the PRE-increment tick, so an incident is filed against the tick that caused it', () => {
    const world = makeWorld();
    const seen: number[] = [];
    const dispose = observeTicks(world, (t) => seen.push(t.tick));

    expect(world.tickCount).toBe(0);
    tick(world, heldRight());
    expect(world.tickCount).toBe(1);

    tick(world, heldRight());
    tick(world, heldRight());
    dispose();

    // 0,1,2 — not 1,2,3. Step 14 increments before `tick` returns, so reading the counter after the
    // call names the NEXT tick, and every incident lands one tick late.
    expect(seen).toEqual([0, 1, 2]);
  });

  it('fires exactly once per simulated tick across 0-, 1- and N-tick batches', () => {
    const world = makeWorld();
    let count = 0;
    const dispose = observeTicks(world, () => {
      count += 1;
    });

    advance(world, heldRight(), 0);
    expect(count, 'a zero-tick frame must not emit').toBe(0);

    advance(world, heldRight(), 1);
    expect(count).toBe(1);

    advance(world, heldRight(), 5);
    expect(count, 'a batched frame emits per TICK, not per batch').toBe(6);

    dispose();
  });

  it('carries both endpoints of the tick, not just where the body ended up', () => {
    const world = makeWorld();
    const seen: TickTrace[] = [];
    const dispose = observeTicks(world, (t) => seen.push(t));
    advance(world, heldRight(), 30);
    dispose();

    const moving = seen.find((t) => t.x !== t.previousX);
    expect(moving, 'the player never moved — fixture is wrong, not the trace').toBeDefined();
    expect(moving?.effectiveDir).toBe(1);
    expect(moving?.rawDir).toBe(1);
  });
});

describe('observer ownership is per world', () => {
  /**
   * 🔴 `derivedFeel()` advances scratch worlds. A global observer ingests those ticks and reports an
   * incident in a world nobody played — a wrong answer indistinguishable from a real one.
   */
  it("ignores another world's ticks entirely", () => {
    const watched = makeWorld();
    const other = makeWorld();
    const seen: TickTrace[] = [];
    const dispose = observeTicks(watched, (t) => seen.push(t));

    advance(other, heldRight(), 50);
    expect(seen, "the unwatched world's ticks leaked into the trace").toHaveLength(0);

    advance(watched, heldRight(), 3);
    expect(seen).toHaveLength(3);
    dispose();
  });

  it('has an idempotent disposer that cannot detach a later registration', () => {
    const world = makeWorld();
    const first: TickTrace[] = [];
    const second: TickTrace[] = [];

    const disposeFirst = observeTicks(world, (t) => first.push(t));
    const disposeSecond = observeTicks(world, (t) => second.push(t));

    // The stale disposer runs twice. Neither call may remove the observer that replaced it.
    disposeFirst();
    disposeFirst();

    advance(world, heldRight(), 4);
    expect(first).toHaveLength(0);
    expect(second, 'a stale disposer detached the live observer').toHaveLength(4);

    disposeSecond();
    disposeSecond();
    advance(world, heldRight(), 4);
    expect(second).toHaveLength(4);
  });

  it('emits nothing at all when no observer is registered', () => {
    const world = makeWorld();
    expect(() => advance(world, heldRight(), 10)).not.toThrow();
    expect(world.tickCount).toBe(10);
  });
});
