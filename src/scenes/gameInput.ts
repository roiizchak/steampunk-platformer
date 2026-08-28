import Phaser from 'phaser';
import { devSeam } from '../debug/devSeam';
import { latchAttackPress, latchJumpPress } from '../sim/input';
import type { InputSnapshot } from '../sim/types';
import type { AudioManager } from '../game/audio';
import { applyAudioAction, audioActionForCode } from './audioKeyMap';

/**
 * The keyboard half of `GameScene`: binding keys to `Phaser.Input.Keyboard.Key` objects and
 * sampling them into the sim's `InputSnapshot` every frame. Split out to keep `GameScene.ts`
 * smaller — this file has no subclass coupling of its own; the scene still owns
 * `playerInputEnabled` and the DEV scene switches, and passes them in.
 *
 * Held state is polled; the jump and attack EDGES are not (vault 2.5).
 *
 * `Phaser.Input.Keyboard.JustDown()` would look like the obvious tool and is a trap here: it is
 * a consuming read that resets when checked, so two readers in one frame lose the edge. Polling
 * `isDown` is worse — a press and release inside one frame is invisible to it entirely. The
 * edge therefore arrives by event, in `bindPlayerKeys`.
 */

export interface HeldKeys {
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  jump: Phaser.Input.Keyboard.Key[];
  walk: Phaser.Input.Keyboard.Key[];
  attack: Phaser.Input.Keyboard.Key[];
}

const NO_KEYS: HeldKeys = { left: [], right: [], jump: [], walk: [], attack: [] };

/** DEV-only scene switches and fixture spawns, bound only when `import.meta.env.DEV` is true. */
export interface DevKeyActions {
  togglePlayground: () => void;
  toggleElementEditor: () => void;
  toggleGym: () => void;
  spawnDevFleet: () => void;
  spawnDevLowHpEnemy: () => void;
}

/**
 * Bind the movement/jump/walk/attack keys, plus (DEV only) the scene-switch and fixture-spawn
 * keys. Returns the same shape `NO_KEYS` uses when there is no keyboard to bind, so the caller
 * never has to null-check the result.
 */
export function bindPlayerKeys(
  scene: Phaser.Scene,
  input$: InputSnapshot,
  isPlayerInputEnabled: () => boolean,
  dev?: DevKeyActions,
  /**
   * Phase 8's ESC → level menu. SHIPPED, like the audio keys and for the same reason: a menu the
   * player cannot reach is a menu they do not have.
   *
   * ⚠️ Deliberately **not** gated on `isPlayerInputEnabled`. The subclass problem here is the
   * opposite of the brackets': `PlaygroundScene` leaves player input ON, so that flag would not stop
   * it, and `ElementEditorScene` turns it off, so it would. The guard that actually fits — "am I the
   * production play scene" — lives in `GameScene.openLevelSelect`, with the action.
   */
  openLevelSelect?: () => void,
  audio?: () => AudioManager | undefined,
): HeldKeys {
  const keyboard = scene.input.keyboard;
  if (!keyboard) {
    return NO_KEYS;
  }

  const { LEFT, RIGHT, A, D, SPACE, UP, W, P, O, G, SHIFT, F, L, N, K, ESC } =
    Phaser.Input.Keyboard.KeyCodes;

  // `emitOnRepeat: false` is the load-bearing argument. The OS repeats a held key ~30 times a
  // second; with repeats enabled every one would latch a fresh jump edge, and holding the
  // button would auto-bunny-hop through the jump buffer. A press is one edge, however long the
  // finger stays down.
  const addKey = (code: number) => keyboard.addKey(code, true, false);

  const held: HeldKeys = {
    left: [addKey(LEFT), addKey(A)],
    right: [addKey(RIGHT), addKey(D)],
    jump: [addKey(SPACE), addKey(UP), addKey(W)],
    // The walk modifier. Persistent state, sampled every frame in `sampleHeldKeys` — no `down`
    // listener, because unlike jump it is not an edge and has nothing to latch.
    walk: [addKey(SHIFT)],
    // Attack is an EDGE with the same latch/consume pair as jump, for the same reason: holding the
    // key must not swing repeatedly, and a frame that drained zero ticks must not eat the press.
    // `F` and `L`; jump stays on SPACE so every Phase 2 spec keeps working unchanged.
    attack: [addKey(F), addKey(L)],
  };

  for (const key of held.jump) {
    key.on('down', () => {
      if (isPlayerInputEnabled()) {
        latchJumpPress(input$);
      }
    });
  }

  for (const key of held.attack) {
    key.on('down', () => {
      if (isPlayerInputEnabled()) {
        latchAttackPress(input$);
      }
    });
  }

  // Phase 7's audio controls. SHIPPED, not dev-only — mute and volume are player-facing, and the
  // whole point of criterion 7.4 is that a player's choice survives a reload.
  //
  // `audio` is passed as a getter rather than a manager, because `bindPlayerKeys` runs during
  // `create()` and the binding must not capture whatever the field held at that instant.
  //
  // 🔴 **A raw `keydown` on `event.code`, NOT three `addKey` bindings — Phase 11.** These were
  // `addKey(M)` / `addKey(OPEN_BRACKET)` / `addKey(CLOSED_BRACKET)`, and the brackets were dead on
  // the owner's Hebrew/English keyboard while `M` kept working. Phaser indexes registered keys by
  // the legacy `event.keyCode` (`KeyboardPlugin.js:747`), which a layout may reassign for
  // punctuation but not for letters. Measured, not guessed: a press carrying the WRONG `code` and
  // keyCode 219 changed the volume, while the RIGHT `code` carrying keyCode 186 did nothing at all.
  // `audioKeyMap.ts` holds the evidence table and the layout-independent map.
  if (audio) {
    keyboard.on('keydown', (event: KeyboardEvent) => {
      // 🔴 `event.repeat` is the guard, and it replaces something we gave up above. The `Key`
      // objects these bindings used to be got `emitOnRepeat: false` from `addKey(code, true, false)`
      // for free; a raw `keydown` listener inherits nothing, and the OS repeats a held key ~30 times
      // a second. Without this, holding `]` walks the volume to an end stop and writes
      // `localStorage` thirty times a second, and holding `M` toggles mute continuously.
      // `LevelSelectScene.bindKeys()` carries the same native-`repeat` guard, for a related reason.
      //
      // 🔴 `isPlayerInputEnabled()` stays, and pausing under the title screen is NOT a substitute
      // for it. `ElementEditorScene` extends `GameScene`, so it inherits this listener, and it
      // already binds `[` and `]` to "select the previous/next collision strip". It sets
      // `playerInputEnabled = false`, which is exactly the "is the keyboard driving the game"
      // question this collision needs asked. Muting still SURVIVES into the editor; only the keys
      // stop. The title screen's own listener deliberately does NOT carry this guard — see
      // `TitleScene`.
      if (event.repeat || !isPlayerInputEnabled()) {
        return;
      }
      const action = audioActionForCode(event.code);
      // 🔴 The manager is resolved and null-checked PER PRESS, not at bind time. The caller used to
      // decide whether to pass a getter at all by testing `this.audio`, which made the existence of
      // the mute key depend on `create()`'s statement order. Here a manager that is not yet built is
      // simply a press that does nothing, which is the right failure for a key the player may hit
      // during a scene transition.
      const manager = audio();
      if (!action || !manager) {
        return;
      }
      applyAudioAction(manager, action);
    });
  }

  if (openLevelSelect) {
    addKey(ESC).on('down', openLevelSelect);
  }

  // Without capture the browser scrolls the page on arrows and space — which also corrupts a
  // Playwright key drive, so this is a test-correctness fix as much as a UX one.
  //
  // ESC is **not** captured, on purpose: `preventDefault` on ESC blocks the browser's own exit from
  // full-screen, and a game that traps the player in full-screen is a worse bug than a menu key that
  // occasionally loses to the browser.
  keyboard.addCapture('SPACE,LEFT,RIGHT,UP,DOWN,W,A,D');

  // DEV ONLY, on the same side of the build gate as the scene itself (vault 1.6). Without this
  // guard the key would still be bound in production and would call `scene.start('Playground')`
  // on a scene that is not registered there — a silent no-op at best. Codex review 2, finding I2.
  if (import.meta.env.DEV && dev) {
    devSeam('__DEVSEAM_gameInput_devKeyBindings__');
    addKey(P).on('down', () => dev.togglePlayground());
    addKey(O).on('down', () => dev.toggleElementEditor());
    addKey(G).on('down', () => dev.toggleGym());
    // Criterion 5.11: a worst-case fleet at full hp.
    addKey(N).on('down', () => dev.spawnDevFleet());
    // Criterion 5.7: one scavenger at 2/60 hp, below anything combat itself can land on.
    // 🔴 Moved from `M` to `K` in Phase 7. `M` is the universal mute key and mute SHIPS, so the
    // player-facing binding wins and the dev one moves.
    //
    // **`tests/e2e/phase-05-combat.spec.ts` drives this key** and was updated with it. The first
    // attempt claimed nothing depended on `M`, on the strength of a grep that returned no output —
    // and an empty result is not evidence, it is an unread command. The e2e suite said otherwise by
    // timing out. Any future re-binding here needs the spec checked, not assumed.
    addKey(K).on('down', () => dev.spawnDevLowHpEnemy());
  }

  return held;
}

/**
 * Sample the held keys into `input$` for one frame.
 *
 * Not just "read nothing" when input is disabled — actively clear. Leaving the last sampled
 * values in place would keep the player walking in whatever direction was held when e.g. the
 * editor opened.
 *
 * The EDGES too, not only the held state. A press latched in the frame before input was disabled
 * would otherwise sit in the snapshot and fire the moment control came back — a jump or a swing
 * the player asked for in a different context, arriving seconds later. Discarding input the
 * player never aimed at the game is not vault 2.4's "cleared because a tick ran" — no tick is
 * running.
 */
export function sampleHeldKeys(input$: InputSnapshot, held: HeldKeys, enabled: boolean): void {
  if (!enabled) {
    input$.left = false;
    input$.right = false;
    input$.jumpHeld = false;
    input$.walkHeld = false;
    input$.jumpPressed = false;
    input$.attackPressed = false;
    return;
  }

  input$.left = held.left.some((key) => key.isDown);
  input$.right = held.right.some((key) => key.isDown);
  input$.jumpHeld = held.jump.some((key) => key.isDown);
  input$.walkHeld = held.walk.some((key) => key.isDown);
}
