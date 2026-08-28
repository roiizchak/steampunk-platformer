/**
 * # The per-tick trace seam — what actually governed a tick, attributed to that tick
 *
 * Built for the invisible-blocker hunt, after three fixes shipped against a symptom nobody had ever
 * put on screen. It exists because **a post-frame snapshot cannot name a cause**, for three reasons
 * that are each independently fatal:
 *
 *  1. `entryLocked`, `hitstunLocked`, the effective `dir` and `previousX`/`previousY` are
 *     **tick-local** — they are computed inside `tick()` and are gone before it returns.
 *  2. Step 9b can create a movement lock **after** step 5-8 moved the body, and step 9d can arm the
 *     gate run-in after it too. So the state a frame reads afterwards may not be the state that
 *     governed the tick it is about to be blamed for.
 *  3. `advanceSplit` **OR-merges** every tick's events across a frame and discards tick attribution
 *     entirely. By the time `drawFrame` sees `events`, "which tick" is unanswerable.
 *
 * ## Why a registry and not a parameter
 *
 * 🔴 **`advance()`'s signature and `advanceSplit.ts`'s `const events = tick(world, input);` line are
 * pinned by a committed mutation fixture.** `tests/fixtures/dead-sim.patch` anchors on both, and
 * `advance-split.test.ts` asserts every line that patch matches on — context lines included, because
 * checking only the removed line once let the red proof silently stop existing. Threading an
 * observer argument through either would fail that test AND make the patch inapplicable, which
 * quietly deletes a gate. So the observer is **registered against a `World`**, and `tick()` reads it
 * from module scope. Neither anchored line moves.
 *
 * ## Why keyed by World, and why the disposer is idempotent
 *
 * 🔴 `derivedFeel()` in `derived.ts` advances **scratch worlds** to compute the feel table. A single
 * global observer would ingest those ticks and report an incident in a world nobody ever played —
 * a wrong answer that looks exactly like a real one. Ownership is therefore per-`World`, and
 * `observeTicks` returns a disposer that is safe to call twice (scene shutdown and a test `finally`
 * will both call it).
 *
 * ## Sim-legality
 *
 * A `Map` and a callback. No Phaser, no `Date`, no `Math.random`, no `performance.now`, no `crypto`,
 * no `window`, no `document`, no `globalThis` — the eight rules `sourceScan.ts` enforces. The
 * observer only **reads**; every payload field is a copied primitive, so a consumer cannot reach
 * back into the live world or mutate the `events` record before `advance()` merges it. Determinism
 * is untouched: attaching an observer must not change a single simulated value, and
 * `tests/unit/tick-trace.test.ts` proves that by running the same input traced and untraced.
 *
 * ⚠️ **This module ships.** It is a generic observability seam, not a dev feature — the DEV guard
 * lives at the *registration* site, in `src/scenes/`, never here. With no observer registered
 * `tracing()` is one `Map.has` and `tick()` builds no payload at all.
 */

import type { InputSnapshot, PlayerSim, PlayerState, World } from './types';
import type { WorldDamageResult } from './worldDamage';

/**
 * Which world-damage source actually landed on this tick.
 *
 * 🔴 **This cannot be inferred after the fact, which is the whole reason it is carried.** A lethal
 * projectile applies **no knockback** (`applyKnockback` is guarded by `player.hp > 0`, so a corpse
 * is never shoved), takes **no hit-stop** ("no hit-stop on a bolt"), and the shot is **deleted** in
 * the same tick. Against a lethal hazard — also no knockback, also no hit-stop — the two are
 * observationally *identical* in the post-tick world. Enemy contact is the leading candidate for a
 * bug reported in all five levels, so a classifier that cannot tell those apart would be wrong
 * exactly where it matters most.
 *
 * The order matches `applyWorldDamage`'s fixed evaluation order and is part of the contract.
 */
export type DamageSource = 'killPlane' | 'hazard' | 'projectile' | 'enemyContact';

/** One tick's worth of ground truth, all copied primitives. */
export interface TickTrace {
  /**
   * The tick that just ran.
   *
   * 🔴 **Pre-increment.** `world.tickCount += 1` is step 14 and runs *before* `tick()` returns, so a
   * trace ID read after the call is off by one — every incident would be filed against the tick
   * after the one that caused it.
   */
  readonly tick: number;

  /** What the input asked for: -1, 0 or 1, before any lock overrode it. */
  readonly rawDir: -1 | 0 | 1;
  /** What step 5 was actually given, after the gate run-in and hitstun had their say. */
  readonly effectiveDir: -1 | 0 | 1;

  /** Both endpoints of this tick's motion — the pair steps 9, 9b and 9c all resolve against. */
  readonly previousX: number;
  readonly previousY: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;

  readonly grounded: boolean;
  readonly wasGrounded: boolean;
  readonly state: PlayerState;

  /** The gate's run-in owns the body: direction is driven and jumping is refused. */
  readonly entryLocked: boolean;
  /** Hurt or death has forced direction to 0. */
  readonly hitstunLocked: boolean;
  /**
   * Steps 5-8 ran at all. False on a frozen tick, where `playerMotion` returns early — and a frozen
   * tick moves nothing, so "did not move" means something completely different there.
   */
  readonly motionRan: boolean;

  /** Non-null only on a tick where damage actually landed. */
  readonly damageSource: DamageSource | null;
  readonly hurt: boolean;
  readonly died: boolean;
  readonly respawned: boolean;

  /** `world.goalEntryTicks`, so a stall inside the exit run-in is never mistaken for geometry. */
  readonly goalEntryTicks: number | null;
  /**
   * Did `clampToBounds` fire this tick?
   *
   * 🔴 Without this the classifier's `boundsClamp` cause is **unreachable**, and a player held
   * against the left or right world edge is reported as `geometry` — a confident wrong answer, in
   * the one label this whole instrument exists to print. Found by the Codex implementation review
   * after the fix had already shipped.
   */
  readonly boundsClamped: boolean;
}

export type TickTraceObserver = (trace: TickTrace) => void;

/**
 * Per-world, so one scene's probe cannot ingest another world's ticks. Module scope rather than a
 * field on `World` because `World` is the sim's public state shape and a diagnostic hook has no
 * business in it — and because adding a field would change every `createWorld` fixture.
 */
const observers = new Map<World, TickTraceObserver>();

/**
 * Attach an observer to one world. Returns an **idempotent** disposer.
 *
 * Idempotent because both a scene `shutdown` handler and a test `finally` block will call it, and
 * because `attachDevOverlays()` re-runs on every scene restart. A second call must not detach an
 * observer some later registration has since installed for the same world.
 */
export function observeTicks(world: World, observer: TickTraceObserver): () => void {
  observers.set(world, observer);
  let disposed = false;
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    // Only if it is still OURS — a later `observeTicks` on the same world wins, and this stale
    // disposer must not silently remove it.
    if (observers.get(world) === observer) {
      observers.delete(world);
    }
  };
}

/**
 * Is anyone listening to this world? One `Map.has`.
 *
 * Called by `tick()` before building a payload, so the untraced path allocates nothing. This is why
 * the seam can ship without being a per-tick cost.
 */
export function tracing(world: World): boolean {
  return observers.size > 0 && observers.has(world);
}

/** Hand one tick's trace to this world's observer, if it has one. */
export function emitTickTrace(world: World, trace: TickTrace): void {
  const observer = observers.get(world);
  if (observer === undefined) return;
  try {
    observer(trace);
  } catch {
    /**
     * 🔴 **A diagnostic may not break the thing it is diagnosing.**
     *
     * The observer runs synchronously inside `tick()`, before step 14 increments `tickCount`. A
     * callback that throws therefore escapes through `tick()` leaving the world **already mutated
     * but never stamped** — every later tick is then attributed one short, and `advanceSplit`'s
     * batch dies mid-frame. That is a far worse failure than losing a trace line, and it is
     * reachable from any registered observer, not just ours.
     *
     * Swallowed deliberately and silently: this is a DEV-only read-only seam, the throw belongs to
     * the observer, and re-raising it would hand the sim a fault it did not cause. Raised by the
     * Codex implementation review against the file's own claim to be behaviourally transparent —
     * which was true of the payload and not of the call.
     */
  }
}

/** Test-only reset, so one spec's leaked registration cannot alter the next spec's world. */
export function clearTickObservers(): void {
  observers.clear();
}

/**
 * The tick-local values only `tick()` can see, handed over at the one point they all exist.
 *
 * A context object rather than twenty parameters, and assembled HERE rather than in `tick.ts`, so
 * the trace schema has exactly one home. `tick.ts` names the values; it does not know their shape.
 */
export interface TickTraceContext {
  readonly input: InputSnapshot;
  readonly player: PlayerSim;
  readonly effectiveDir: -1 | 0 | 1;
  readonly previousX: number;
  readonly previousY: number;
  readonly wasGrounded: boolean;
  readonly entryLocked: boolean;
  readonly hitstunLocked: boolean;
  readonly motionRan: boolean;
  readonly damage: WorldDamageResult;
  readonly respawned: boolean;
  readonly boundsClamped: boolean;
}

/**
 * Build and emit this tick's trace, if anyone is listening to this world.
 *
 * 🔴 Call this BEFORE step 14 increments `world.tickCount`. The trace ID is the tick that just ran;
 * read after the increment, every incident is filed against the following tick.
 */
export function emitIfTracing(world: World, ctx: TickTraceContext): void {
  if (!tracing(world)) {
    return;
  }
  const { input, player, damage } = ctx;
  emitTickTrace(world, {
    tick: world.tickCount,
    rawDir: input.left === input.right ? 0 : input.right ? 1 : -1,
    effectiveDir: ctx.effectiveDir,
    previousX: ctx.previousX,
    previousY: ctx.previousY,
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    grounded: player.grounded,
    wasGrounded: ctx.wasGrounded,
    state: player.state,
    entryLocked: ctx.entryLocked,
    hitstunLocked: ctx.hitstunLocked,
    motionRan: ctx.motionRan,
    damageSource: damage.source,
    hurt: damage.hurt,
    died: damage.died,
    respawned: ctx.respawned,
    goalEntryTicks: world.goalEntryTicks,
    boundsClamped: ctx.boundsClamped,
  });
}
