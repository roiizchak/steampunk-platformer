/**
 * The `window.__game` debug seam.
 *
 * Vault 1.6 — decide per seam, up front, which side of the build gate it lives on:
 * this one is DEV ONLY. `import.meta.env.DEV` is statically replaced with `false` by Vite in a
 * production build, so both the installer body and `updateDebugState`'s body fold away and the
 * seam never reaches `dist/`. Both are guarded, not just the installer: guarding only the
 * installer would leave the state machine in the bundle while the global was gone.
 * Phase 10 owns verifying the absence.
 *
 * The surface is fixed here because every later phase's e2e spec is written against it.
 * Changing it later invalidates those specs.
 */

import type { World } from '../sim/types';

export interface PlayerView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: string;
}

export interface GameDebugView {
  sceneKey: string;
  tick: number;
  player: PlayerView | null;
  score: number;
  health: number;
  levelId: string | null;
  /**
   * Positive terminal condition: boot completed and the game is running.
   *
   * Without this, a successful boot and an infinite load are indistinguishable — both sit in
   * the Boot scene forever. Every e2e spec waits on this rather than sleeping, so a hang fails
   * as a timeout instead of passing as a sleep that happened to be long enough.
   */
  ready: boolean;
  /**
   * Negative terminal condition: boot refused to route, and why.
   *
   * Mandatory because there is deliberately no loader timeout (vault 1.4). `ready === false`
   * with `bootError === null` is the third state — still loading, or hung.
   */
  bootError: string | null;
}

/** The single owner of debug state. Scene code mutates this; nothing else may. */
const state: GameDebugView = {
  sceneKey: '',
  tick: 0,
  player: null,
  score: 0,
  health: 0,
  levelId: null,
  ready: false,
  bootError: null,
};

/**
 * Mutate the debug view. The only supported write path.
 *
 * Guarded on DEV like the installer, so in a production build the body folds away and the
 * call sites become no-ops that Rollup can drop. Without this guard the debug state machine
 * would ship even though `window.__game` did not — and a Phase 10 grep for `__game` would
 * pass while the seam's internals were still in the bundle.
 */
export function updateDebugState(patch: Partial<GameDebugView>): void {
  if (!import.meta.env.DEV) {
    return;
  }
  Object.assign(state, patch);
}

export function getDebugState(): GameDebugView {
  return state;
}

/**
 * Publish the per-tick half of the surface from a sim `World`.
 *
 * Lifted out of `GameScene.update()` in Phase 8, and it belongs here rather than there: this file is
 * where the eight fields are DEFINED, so it is the honest place for the note about which of them were
 * declared long before anything wrote them. `GameScene` was also at the 400-line limit, and the rule
 * is to split rather than to delete the explanation that made the file long.
 *
 * `World` is a type-only import, so nothing from `src/sim/` reaches the emitted bundle through it.
 */
export function publishWorldState(world: World): void {
  const { player } = world;
  updateDebugState({
    tick: world.tickCount,
    player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, state: player.state },
    // `health` has been on the eight-field surface since Phase 1 and was permanently 0 until Phase 5.
    // Filling it is not widening the surface — the field already existed and was a lie.
    health: player.hp,
    // `score` was the same lie, and outlived `health` by a phase: declared in Phase 1, reset to 0 by
    // BootScene, and never written by anything. Phase 6 gives it the only meaning this game has for
    // it. Still eight fields; still no STOP-and-ask.
    score: world.gearsCollected,
  });
}

/**
 * Install `window.__game` as a read-only, LIVE view.
 *
 * A getter, not an assigned object: assigning a snapshot once would leave every later read
 * returning stale values, and a spec asserting `tick === 0` would then pass forever no matter
 * what the game did. Each read builds a fresh frozen copy, so callers see current values and
 * cannot write back into the game.
 */
export function installDebugGlobals(): void {
  if (!import.meta.env.DEV) {
    return;
  }

  Object.defineProperty(window, '__game', {
    // Not configurable: with `configurable: true` the whole QA oracle can be replaced via
    // another defineProperty, which assignment alone does not permit. Installed exactly once,
    // so nothing legitimate needs to redefine it.
    configurable: false,
    enumerable: true,
    get(): GameDebugView {
      return Object.freeze({
        ...state,
        player: state.player ? Object.freeze({ ...state.player }) : null,
      });
    },
  });
}
