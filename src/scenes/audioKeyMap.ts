/**
 * Which audio action a physical key position means — Phase 11.
 *
 * ## 🔴 Why this is keyed on `event.code` and not a Phaser KeyCode
 *
 * Phaser dispatches registered keys through the **legacy `event.keyCode`**
 * (`KeyboardPlugin.js:747` — `var code = event.keyCode; var key = keys[code];`). `keyCode` is
 * layout-dependent for **punctuation** and stable for **letters**, which is why the owner reported
 * `M` working while `[` and `]` did nothing at all on a Hebrew/English keyboard.
 *
 * That is not a hypothesis. Measured 2026-08-28 against the running game, dispatching keydown/keyup
 * pairs at the real page (QA log, criterion 11.1):
 *
 * | `code` | `keyCode` | volume changed? |
 * |---|---|---|
 * | `BracketLeft` ✓ | `0` | **no** |
 * | `Backslash` ✗ | `219` | **yes** |
 * | `BracketLeft` ✓ | `219` | yes |
 * | `BracketLeft` ✓ | `186` | **no** |
 *
 * A *wrong* physical key with the right `keyCode` fired; the *right* physical key with a foreign
 * `keyCode` did not. So the binding never depended on the key the player is actually pressing — only
 * on a number their keyboard layout is free to change.
 *
 * `event.code` names the physical position and is layout-independent by definition, so it is the
 * only honest key for a control that means "the key with `[` printed on it".
 *
 * ## Why a separate module
 *
 * No Phaser import of any kind, so `npm run test:sim-isolated` — which runs the unit suite with the
 * engine uninstalled — can drive this directly, and so can a plain Node unit test. The same argument
 * `engineLiterals.ts` makes for its four constants. `gameInput.ts` cannot do this itself: it value-
 * imports `phaser` on line 1.
 *
 * ⚠️ **This maps positions, not characters.** On a layout where the key printed `[` sits somewhere
 * else, the control follows the *position*, not the glyph. That is the deliberate choice for a game
 * control — it keeps the binding where the player's finger learned it — and it is the same choice
 * WASD makes.
 */

import type { AudioManager } from '../game/audio';

/** The three player-facing audio actions. `null` means "not an audio key". */
export type AudioAction = 'mute' | 'volumeDown' | 'volumeUp';

/**
 * Map a `KeyboardEvent.code` to its audio action.
 *
 * Total and side-effect free: every non-audio key returns `null`, so a caller is a switch with no
 * fallthrough rather than a chain of comparisons that can silently grow a fourth branch.
 */
export function audioActionForCode(code: string): AudioAction | null {
  switch (code) {
    case 'KeyM':
      return 'mute';
    case 'BracketLeft':
      return 'volumeDown';
    case 'BracketRight':
      return 'volumeUp';
    default:
      return null;
  }
}

/**
 * Perform an action on a manager.
 *
 * Lives beside the map so there is exactly ONE place that knows what each action means. Both
 * listeners that can produce an action — `gameInput.ts` during play and `TitleScene` on the welcome
 * screen — route through here, so the two can never drift into meaning different things by the same
 * name. `import type` only: this module still reaches no engine at runtime.
 */
export function applyAudioAction(manager: AudioManager, action: AudioAction): void {
  switch (action) {
    case 'mute':
      manager.toggleMute();
      return;
    case 'volumeDown':
      manager.nudgeVolume(-1);
      return;
    case 'volumeUp':
      manager.nudgeVolume(1);
      return;
  }
}
