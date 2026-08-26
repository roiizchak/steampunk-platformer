import Phaser from 'phaser';
import { devSeam } from '../debug/devSeam';

/**
 * The Gym's key bindings. **DEV ONLY** — `GymScene` is guarded at every point that names it.
 *
 * Extracted from `GymScene.ts` on 2026-08-23, when inventory 4.6's merge took that file to 405
 * lines. The seam is the one `GameScene` already uses: `gameInput.ts` holds its bindings for the
 * same reason. A scene's key map is a flat table of *(key → intent)* with no state of its own, so
 * it reads better beside itself than buried between `loadConfig` and the geometry getters.
 *
 * ⚠️ **This is a move, not a redesign.** Every binding, every capture flag and the `addCapture`
 * string below are byte-for-byte what `GymScene.bindKeys` held. The actions stay on the scene; this
 * file only says which key reaches which one.
 */

/** What each Gym key does. The scene supplies its own methods — this file names none of them. */
export interface GymActions {
  backToGame: () => void;
  togglePlaying: () => void;
  stepSheet: (delta: number) => void;
  stepFrame: (delta: number) => void;
  nudge: (delta: number) => void;
  toggleActiveFrame: () => void;
  save: () => void;
  revert: () => void;
  cycleZoom: () => void;
}

/**
 * Bind every Gym key on `keyboard`.
 *
 * A `null` keyboard is a no-op rather than a throw: Phaser leaves `input.keyboard` undefined when
 * the plugin is not installed, and a Gym with no keys is useless but not broken.
 */
export function bindGymKeys(
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null | undefined,
  actions: GymActions,
): void {
  devSeam('__DEVSEAM_gymKeys_bindGymKeys__');
  if (!keyboard) {
    return;
  }
  const { G, SPACE, OPEN_BRACKET, CLOSED_BRACKET, COMMA, PERIOD, Z, X, A, S, R, M } =
    Phaser.Input.Keyboard.KeyCodes;

  keyboard.addKey(G, true, false).on('down', () => actions.backToGame());
  keyboard.addKey(SPACE, true, false).on('down', () => actions.togglePlaying());
  keyboard.addKey(OPEN_BRACKET, true, false).on('down', () => actions.stepSheet(-1));
  keyboard.addKey(CLOSED_BRACKET, true, false).on('down', () => actions.stepSheet(1));
  keyboard.addKey(COMMA, true, true).on('down', () => actions.stepFrame(-1));
  keyboard.addKey(PERIOD, true, true).on('down', () => actions.stepFrame(1));
  keyboard.addKey(Z, true, true).on('down', () => actions.nudge(-1));
  keyboard.addKey(X, true, true).on('down', () => actions.nudge(1));
  keyboard.addKey(A, true, false).on('down', () => actions.toggleActiveFrame());
  keyboard.addKey(S, true, false).on('down', () => actions.save());
  keyboard.addKey(R, true, false).on('down', () => actions.revert());
  keyboard.addKey(M, true, false).on('down', () => actions.cycleZoom());
  keyboard.addCapture('SPACE,G,Z,X,A,S,R,M,COMMA,PERIOD,OPEN_BRACKET,CLOSED_BRACKET');
}
