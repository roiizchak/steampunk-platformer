/**
 * The reachability graph: walkable surface segments, and transitions PROVED with the real `tick()`.
 *
 * HELPER ONLY — no `expect` lives here. `level-reach.test.ts` does the asserting.
 *
 * ## 🔴 Why a graph, and not "every rise is inside the apex"
 *
 * Codex's plan review rejected the first design of this gate as a blocker (F11), on three counts, and it
 * was right on all of them:
 *
 * 1. Comparing *distinct surface heights* collapses two disconnected platforms that happen to share a
 *    height into one value — so a cluster can be internally consistent and cut off from the spawn.
 * 2. "Reachable from the surface below" is a bag of LOCAL claims that never becomes a connected
 *    spawn → goal path.
 * 3. The horizontal sweep started from a supplied `startX` that was never itself proved reachable.
 *
 * Nodes are segments, not heights. Edges are proved by running the sim **from a position on the source
 * segment**, so the run-up is always reachable rather than assumed. And the assertion is a BFS from the
 * spawn's segment to the goal's segment, which is the actual definition of "completable" — a jump one
 * pixel too high simply fails to prove its edge and the goal drops out of the reachable set.
 *
 * Because the edges are simulated, ceilings, acceleration, friction, the speed cap, gravity and the
 * collision box are all accounted for by construction. `level-traversal.test.ts` records what happened
 * the one time this project computed a jump by hand instead: the Phase 5 plan's ballistics were wrong on
 * **both** of their inputs.
 *
 * ## What this deliberately cannot see
 *
 * Edges are proved for the input scripts `LAUNCHES` tries. A transition needing a pattern the harness
 * never attempts reads as unreachable — so this gate errs toward **false red**, which is the correct
 * direction for a completability proof. It says a route exists; it does not say a human finds it. That
 * is criterion 8.2's hands-on half and no unit test replaces it *(vault C4)*.
 */

import { RENDER_SCALE } from '../../src/game/constants';
import type { LevelData } from '../../src/game/tilemap';
import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { PLAYER_BOX } from '../../src/sim/player';
import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, Rect, TuningKnobs, World } from '../../src/sim/types';

export const HALF_W = (PLAYER_BOX.w / 2) * RENDER_SCALE;
export const BODY_H = PLAYER_BOX.h * RENDER_SCALE;

/** A stretch of walkable surface: everything from `x0` to `x1` at height `y`, standable end to end. */
export interface Segment {
  x0: number;
  x1: number;
  y: number;
}

/**
 * The parts of `top`'s upper surface that something else is standing on, and therefore cannot be walked.
 *
 * 🔴 The `>=` on the bottom edge is load-bearing and it was `>` in the first draft, which made this
 * function return nothing for every mass in every shipped level. The Phase 8 masses are stepped down TO
 * the walking surface — `{ row: 16, rows: 4 }` spans y 1536…1920 against a floor whose top is 1920 — so a
 * strict `>` says the mass does not overlap the floor at all. Every ground strip came back as ONE segment
 * running the whole length of the level, straight through the masonry, and the BFS then found the goal
 * "reachable" without proving a single transition. The gate was green and vacuous. Found by the committed
 * synthetic below, which asked for a 4-tile climb and got an unsplit floor.
 *
 * Resting exactly on a surface covers it. That is what resting means.
 */
function coveredSpans(level: LevelData, top: Rect): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = [];
  for (const other of level.solids) {
    if (other === top) continue;
    // Something standing ON this surface, or passing through it from above.
    if (other.y + other.h < top.y) continue;
    if (other.y >= top.y) continue;
    const from = Math.max(top.x, other.x);
    const to = Math.min(top.x + top.w, other.x + other.w);
    if (to > from) spans.push({ from, to });
  }
  return spans.sort((a, b) => a.from - b.from);
}

/**
 * Every walkable segment in the level.
 *
 * One per solid top, minus the parts another solid stands on — which is what keeps two platforms at the
 * same height DISTINCT nodes, the collapse Codex F11 named. A segment narrower than the player's box is
 * dropped: it is a corner, not somewhere to stand, and a probe placed on one reports nonsense.
 */
export function segments(level: LevelData): Segment[] {
  const out: Segment[] = [];
  for (const solid of level.solids) {
    let cursor = solid.x;
    for (const { from, to } of coveredSpans(level, solid)) {
      if (from > cursor) out.push({ x0: cursor, x1: from, y: solid.y });
      cursor = Math.max(cursor, to);
    }
    if (solid.x + solid.w > cursor) out.push({ x0: cursor, x1: solid.x + solid.w, y: solid.y });
  }
  return out.filter((s) => s.x1 - s.x0 >= PLAYER_BOX.w * RENDER_SCALE).sort((a, b) => a.x0 - b.x0 || a.y - b.y);
}

/** Which segment is the player standing on, or -1 if they are airborne or nowhere known. */
export function segmentAt(segs: Segment[], x: number, y: number): number {
  return segs.findIndex((s) => y === s.y && x >= s.x0 - HALF_W && x <= s.x1 + HALF_W);
}

/**
 * The launch scripts an edge may be proved with.
 *
 * `from` is where on the source segment the attempt starts, as a fraction of its width, and `jumpAfter`
 * is how many ticks of held input pass before the jump — 0 for a standing hop, higher for a run-up.
 * `null` means never jump, which is how a walk-off-the-edge drop is proved.
 *
 * Small on purpose. Each entry is a full simulation per ordered pair, and the set has to be wide enough
 * to find the routes the levels actually use rather than wide enough to find every route that exists.
 */
const LAUNCHES: { from: number; jumpAfter: number | null; jumpAtEdge?: boolean }[] = [
  { from: 0.5, jumpAfter: null },
  { from: 0.0, jumpAfter: null },
  { from: 1.0, jumpAfter: null },
  { from: 0.5, jumpAfter: 0 },
  { from: 0.0, jumpAfter: 0 },
  { from: 1.0, jumpAfter: 0 },
  { from: 0.0, jumpAfter: 24 },
  { from: 0.0, jumpAfter: 40 },
  { from: 1.0, jumpAfter: 24 },
  { from: 1.0, jumpAfter: 40 },
  /**
   * 🔴 **Jump AT THE EDGE, after a full run-up.** This is what a player does, and without it the harness
   * could not prove a 384 px climb from an adjacent floor at all: the fixed-tick launches either jump
   * far too early (`from: 0.0` at tick 24 is still 1800 px short) or jump from a standstill already
   * flush against the wall (`from: 1.0`). The committed synthetic in `level-reach.test.ts` caught it —
   * a 4-tile step that is 85 % of the measured apex read as unreachable, which would have made the red
   * proof below red for the wrong reason and the whole gate unusable on any level with a real climb.
   *
   * The edge is the LATEST honest moment to press jump, so proving it from there proves it from any
   * earlier press too — the same argument `level-traversal.test.ts` makes about its own trigger.
   */
  { from: 0.5, jumpAfter: null, jumpAtEdge: true },
  { from: 0.75, jumpAfter: null, jumpAtEdge: true },
  { from: 0.25, jumpAfter: null, jumpAtEdge: true },
];

/**
 * Long enough for a run-up to cross half a level-01 ground strip and still finish the arc.
 *
 * ⚠️ Sized against a MEASUREMENT, not guessed: the player covers about 9 px per tick at run speed, and
 * the longest run-up any launch below asks for is half of a 3840 px strip — roughly 215 ticks. At the
 * first draft's 150 the run simply ran out of ticks short of the obstacle, and the transition read as
 * unprovable for a reason that had nothing to do with the geometry.
 */
const TICKS_PER_ATTEMPT = 300;

export interface GraphOptions {
  seed: number;
  /** Applied over `DEFAULT_TUNING`. The margin sweep passes a reduced `jumpVelocity` here. */
  tuning?: Partial<TuningKnobs>;
}

function attemptWorld(level: LevelData, x: number, y: number, opts: GraphOptions): World {
  const world = createWorld({
    seed: opts.seed,
    scale: RENDER_SCALE,
    solids: level.solids,
    bounds: { widthPx: level.widthPx, heightPx: level.heightPx },
    spawn: { x, y },
    goal: level.goal,
    gears: level.gears,
  });
  // Terrain and GEARS. No hazards, no enemies: a route blocked by a patrolling scavenger is a different
  // question from a route that does not exist, and conflating them would make a reachability failure
  // unreadable — that is `level-completable.test.ts`'s job. The gears are here because gear
  // reachability is proved the same way an edge is, by the sim collecting one *(step 9c)*, rather than
  // by a distance heuristic. See `neighbours`.
  if (opts.tuning) Object.assign(world.tuning, opts.tuning);
  return world;
}

/**
 * Every segment reachable in ONE transition from `origin`, by any launch script.
 *
 * Returns indices into `segs`. `origin` itself is always included — standing still is a transition
 * nobody needs proved, and excluding it would make the BFS below depend on the frontier's shape.
 */
function neighbours(
  level: LevelData,
  segs: Segment[],
  origin: number,
  opts: GraphOptions,
): { segments: Set<number>; gears: Set<number> } {
  const found = new Set<number>([origin]);
  const gears = new Set<number>();
  const from = segs[origin]!;

  for (const dir of [1, -1] as const) {
    for (const launch of LAUNCHES) {
      const startX = from.x0 + (from.x1 - from.x0) * launch.from;
      const x = Math.min(Math.max(startX, from.x0 + HALF_W), from.x1 - HALF_W);
      const world = attemptWorld(level, x, from.y, opts);
      const input: InputSnapshot = createSnapshot();
      if (dir === 1) input.right = true;
      else input.left = true;
      if (launch.jumpAfter !== null || launch.jumpAtEdge) input.jumpHeld = true;
      // The segment boundary the run-up is aimed at — where an obstacle, or a drop, begins.
      const edge = dir === 1 ? from.x1 : from.x0;
      let edgeJumped = false;

      for (let i = 0; i < TICKS_PER_ATTEMPT; i += 1) {
        if (launch.jumpAfter !== null && i === launch.jumpAfter) latchJumpPress(input);
        if (launch.jumpAtEdge && !edgeJumped) {
          const lead = dir === 1 ? world.player.x + HALF_W : world.player.x - HALF_W;
          if (dir === 1 ? lead >= edge : lead <= edge) {
            latchJumpPress(input);
            edgeJumped = true;
          }
        }
        tick(world, input);
        if (world.player.hp <= 0) break;
        // Record every segment the player is standing on along the way, not only where they end up:
        // one run can cross three ledges, and each landing is a proved transition in its own right.
        if (world.player.vy === 0) {
          const at = segmentAt(segs, world.player.x, world.player.y);
          if (at >= 0) found.add(at);
        }
      }
      // 🔴 Gear reachability, proved rather than estimated. The first draft asked whether a gear sat
      // within a body-height of a reachable segment's SPAN, and reported every gear hung over a pit as
      // unreachable — three of them across levels 03–05 — because the nearest segment edge is a whole
      // gap away. Those gears are collected in mid-air during the jump that crosses the gap, which is a
      // fact about the sim and not about distances. So the attempt world carries the level's gears and
      // step 9c answers the question.
      world.gears.forEach((gear, index) => {
        if (gear.collected) gears.add(index);
      });
    }
  }
  return { segments: found, gears };
}

export interface ReachResult {
  segs: Segment[];
  reachable: Set<number>;
  /** Indices into `level.gears` that some proved transition actually collected. */
  collectableGears: Set<number>;
  spawnSegment: number;
  goalSegment: number;
}

/**
 * BFS from the spawn's segment, expanding through simulated transitions.
 *
 * The goal's segment is the one under the exit's bottom-centre — `describeGoalProblem` already refuses a
 * goal with no ground below it, so that lookup always resolves for a shipped level.
 */
export function reachFrom(level: LevelData, opts: GraphOptions): ReachResult {
  const segs = segments(level);
  const spawnSegment = segmentAt(segs, level.spawn.x, level.spawn.y);
  const goalX = level.goal.x + level.goal.w / 2;
  const goalBottom = level.goal.y + level.goal.h;
  // The surface the exit stands on: the highest solid top at or below the doorway's foot.
  let goalSegment = -1;
  let best = Number.POSITIVE_INFINITY;
  segs.forEach((s, i) => {
    if (goalX < s.x0 || goalX > s.x1) return;
    const drop = s.y - goalBottom;
    if (drop >= -1 && drop < best) {
      best = drop;
      goalSegment = i;
    }
  });

  const reachable = new Set<number>();
  const collectableGears = new Set<number>();
  const queue: number[] = spawnSegment >= 0 ? [spawnSegment] : [];
  if (spawnSegment >= 0) reachable.add(spawnSegment);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const step = neighbours(level, segs, current, opts);
    for (const gear of step.gears) collectableGears.add(gear);
    for (const next of step.segments) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  return { segs, reachable, collectableGears, spawnSegment, goalSegment };
}
