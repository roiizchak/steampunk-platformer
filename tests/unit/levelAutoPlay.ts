import { RENDER_SCALE } from '../../src/game/constants';
import type { LevelData } from '../../src/game/tilemap';
import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { PLAYER_BOX } from '../../src/sim/player';
import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, Rect, World } from '../../src/sim/types';

/**
 * The auto-player, shared by the two traversal gates that ask different questions of it.
 *
 * Extracted from `level-completable.test.ts` when `level-hazard-free.test.ts` was written. Both had
 * to run the same policy over the same shipped worlds, and a second copy of `groundAhead` is exactly
 * how the two would come to disagree about what a pit is *(vault 5.3)*. The measured constants below
 * — `LOOK_DOWN_PX`, `LOOK_AHEAD_PX` — each cost a false red, and their reasons are kept verbatim.
 *
 * **The two questions, and why they are two:**
 *
 *  - *can this level be finished at all?* — enemies live, damage allowed, 100 hp and respawn carry
 *    it. That is `level-completable.test.ts`, and its answer must not change.
 *  - *is every hazard on the route crossable WITHOUT touching it?* — enemies off, damage forbidden.
 *    That is `level-hazard-free.test.ts`, and it is a new gate. The Codex plan review found that
 *    nothing in the project could answer it: the traversal probe reads a frozen retired level, and
 *    the completable auto-player tanks the hits with a `groundAhead` that never reads a hazard. So
 *    a spike run wider than the measured 252 px impassable limit could ship with a green suite.
 */

const HALF_W = (PLAYER_BOX.w / 2) * RENDER_SCALE;

/**
 * How long the auto-player gets. Generous, and a BOUND rather than a measurement — the callers
 * assert `completed`, never the tick count, so a faster or slower route is not a failure.
 */
export const MAX_TICKS = 12_000;

/**
 * ⚠️ **`LOOK_DOWN_PX` is 600, and it is not a tolerance — it is the difference between a drop and a
 * pit.** The first draft allowed 240 px, which is less than one 4-tile step, so stepping off a
 * ziggurat onto the floor 288 px below read as *no ground ahead*. The auto-player jumped, and on
 * level-02 that carried it straight OVER the exit: the goal is 288 px tall standing on the floor,
 * and a running jump off a 1632 px ledge keeps the whole player box above it. It finished at x 10686
 * of 10752 having never touched a goal it had passed through the air. A real pit has no ground at
 * any depth, so a generous look-down costs nothing and a stingy one invents pits that are not there.
 */
const LOOK_DOWN_PX = 600;

/**
 * 🔴 Small on purpose: the jump fires when the leading edge is essentially AT the hole. That is the
 * trigger `level-traversal.test.ts` measured its 288 px clearable gap with — the obstacle's own left
 * edge is the LATEST honest moment to jump, so a test that passes there passes for any earlier press
 * too — and copying it is what makes the measurement transferable. The first draft looked 120 px
 * ahead, which jumps 120 px early, which costs 120 px of the 288 px reach: the auto-player fell into
 * the third gap of level-04 nine times and never got past it.
 */
const LOOK_AHEAD_PX = 16;

export interface Run {
  completed: boolean;
  ticks: number;
  furthestX: number;
  deaths: number;
  /** How many ticks the player was hurt on. `playerHurt` is an emitted EDGE, never diffed hp (2.5). */
  hurts: number;
  /** Where the first hit landed, for a message that names the spike rather than the level. */
  firstHurtX: number | null;
}

export interface AutoPlayOptions {
  /**
   * Treat a hazard as ground that ends, so the policy JUMPS it rather than walking into it.
   *
   * Off for the completable gate, whose claim is "this level can be finished", not "finished
   * flawlessly". On for the hazard-free gate, which is the only thing that makes its zero-damage
   * assertion a statement about the LEVEL rather than about the policy's indifference to pain.
   */
  avoidHazards?: boolean;
  /**
   * Include the shipped enemies. Off isolates hazard geometry from enemy interference, the same
   * separation `level-reach.test.ts` makes for terrain — a route blocked by a patrolling scavenger
   * is a different question from a spike run nobody can jump, and conflating them makes a red
   * unreadable.
   */
  withEnemies?: boolean;
}

/** The exact shipped world. Nothing omitted, nothing substituted, unless an option says so. */
export function shippedWorld(level: LevelData, seed: number, options: AutoPlayOptions = {}): World {
  return createWorld({
    seed,
    scale: RENDER_SCALE,
    solids: level.solids,
    hazards: level.hazards,
    enemies: options.withEnemies === false ? [] : level.enemies,
    gears: level.gears,
    goal: level.goal,
    bounds: { widthPx: level.widthPx, heightPx: level.heightPx },
    spawn: level.spawn,
  });
}

/** Is there any solid ground under `x` at or below the feet? */
export function groundAhead(level: LevelData, x: number, feetY: number): boolean {
  return level.solids.some(
    (s) => s.x <= x && s.x + s.w >= x && s.y >= feetY - 8 && s.y <= feetY + LOOK_DOWN_PX,
  );
}

/**
 * Is a hazard standing at `x`, anywhere between the feet and one look-down below them?
 *
 * The window mirrors `groundAhead`'s for the same reason — a stingy one invents obstacles that are
 * not on the route. A hazard on the floor the player is about to run onto counts; one on a ledge
 * well above the head does not.
 */
export function hazardAhead(level: LevelData, x: number, feetY: number): boolean {
  return level.hazards.some(
    (h: Rect) => h.x <= x && h.x + h.w >= x && h.y + h.h >= feetY - 8 && h.y <= feetY + LOOK_DOWN_PX,
  );
}

/**
 * Hold Right; jump when blocked, when the ground ahead runs out, or — optionally — when a hazard is
 * one look-ahead away.
 *
 * `jumpHeld` stays true for the full-height jump; releasing early is the jump CUT and this policy
 * never wants a short hop.
 */
export function autoPlay(level: LevelData, seed: number, options: AutoPlayOptions = {}): Run {
  const world = shippedWorld(level, seed, options);
  const input: InputSnapshot = createSnapshot();
  input.right = true;
  input.jumpHeld = true;

  let furthestX = world.player.x;
  let deaths = 0;
  let hurts = 0;
  let firstHurtX: number | null = null;
  let lastX = world.player.x;
  let stuckFor = 0;

  for (let i = 0; i < MAX_TICKS; i += 1) {
    const grounded = world.player.vy === 0;
    if (grounded) {
      const lead = world.player.x + HALF_W;
      const probe = lead + LOOK_AHEAD_PX;
      const blocked = Math.abs(world.player.x - lastX) < 0.5;
      stuckFor = blocked ? stuckFor + 1 : 0;
      // A few ticks of no progress rather than one: acceleration from a standstill is genuinely slow
      // for the first tick or two, and jumping on that would bunny-hop the whole level.
      const mustJump =
        stuckFor >= 4 ||
        !groundAhead(level, probe, world.player.y) ||
        (options.avoidHazards === true && hazardAhead(level, probe, world.player.y));
      if (mustJump) {
        latchJumpPress(input);
        stuckFor = 0;
      }
    }
    lastX = world.player.x;

    const events = tick(world, input);
    if (events.playerDied) deaths += 1;
    if (events.playerHurt) {
      hurts += 1;
      if (firstHurtX === null) firstHurtX = world.player.x;
    }
    if (world.player.x > furthestX) furthestX = world.player.x;
    if (world.completed) {
      return { completed: true, ticks: i + 1, furthestX, deaths, hurts, firstHurtX };
    }
  }
  return { completed: false, ticks: MAX_TICKS, furthestX, deaths, hurts, firstHurtX };
}
