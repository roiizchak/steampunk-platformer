/**
 * The welcome screen's keyboard listener — split out of `TitleScene.ts` at the 400-line ceiling.
 *
 * A plain function taking the three things it needs rather than a method, so the scene keeps only
 * the wiring. Every 🔴 note below travelled with the code it explains.
 */

import type Phaser from 'phaser';
import { applyAudioAction, audioActionForCode } from './audioKeyMap';
import type { AudioActionResult } from './audioKeyMap';
import type { AudioManager } from '../game/audio';

export interface TitleKeyHooks {
  /** The live audio manager, or undefined before one exists. */
  audio: () => AudioManager | undefined;
  /** Redraw the hint from what the action actually became. */
  onAudio: (result: AudioActionResult) => void;
  /** Every begin key goes to the LEVEL MENU. There is no second route and no resume. */
  onBegin: () => void;
}

export function bindTitleKeys(scene: Phaser.Scene, hooks: TitleKeyHooks): void {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      return;
    }
    keyboard.on('keydown', (event: KeyboardEvent) => {
      // The OS repeats a held key ~30 times a second, and this scene is entered with a key possibly
      // still down from whatever started the game. Nothing here may fire twice.
      //
      // 🔴 `isComposing` too, and it is NOT redundant with `gameInput.ts`'s. This scene registers
      // no `Key` objects at all, so `keys[229]` is undefined and Phaser's `ANY_KEY_DOWN` accepts a
      // composition keydown here that the game listener rejects — the welcome screen was the one
      // place a CJK user composing text could still walk the volume. Codex implementation review,
      // finding 3: the guard was copied to one of the two listeners.
      if (event.repeat || event.isComposing) {
        return;
      }
      /**
       * 🔴 The audio keys answer HERE too, and deliberately WITHOUT `gameInput.ts`'s
       * `isPlayerInputEnabled()` guard.
       *
       * `Game` is paused while this screen is up, so its own listener is inert — and this is the
       * first screen the player sees. Leaving them dead here would mean shipping a welcome screen
       * whose advertised mute and volume keys do nothing, in the phase that exists to repair them.
       * The same shared map and applier as `gameInput.ts`, so the two can never drift.
       */
      const action = audioActionForCode(event.code);
      if (action) {
        const manager = hooks.audio();
        if (manager) {
          hooks.onAudio(applyAudioAction(manager, action));
        }
        return;
      }
      // Every begin key goes to the LEVEL MENU. There is no second route and no resume.
      if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') {
        hooks.onBegin();
      }
    });
  }
