/**
 * The shape of `window.__game`, declared ONCE for every e2e spec.
 *
 * Phase 2 added a second spec, and two `declare global` blocks for the same property is a
 * `TS2717: Subsequent property declarations must have the same type` build failure the moment they
 * differ by one field. Two hand-maintained copies of the same contract drift — the project already
 * learned that in `src/game/constants.ts`, where a duplicated list would have shown up as a
 * browser-specific false red rather than a real failure.
 *
 * `player` is deliberately `unknown`. Every spec must narrow it out loud before comparing, because
 * a prior project passed vacuously on `undefined === undefined` through a debug hook that returned
 * nothing *(vault C1: assert the type before the value)*.
 */
export interface GameDebugView {
  sceneKey: string;
  tick: number;
  player: unknown;
  score: number;
  health: number;
  levelId: string | null;
  ready: boolean;
  bootError: string | null;
}

declare global {
  interface Window {
    __game?: GameDebugView;
  }
}
