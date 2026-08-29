import Phaser from 'phaser';
import { devSeam } from '../debug/devSeam';
import { latchAttackPress, latchJumpPress } from '../sim/input';
import type { InputSnapshot } from '../sim/types';
import type { AudioManager } from '../game/audio';
import { AUDIO_CHANGED, applyAudioAction, audioActionForCode } from './audioKeyMap';

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
    /**
     * 🔴 **On the DOM target, NOT `keyboard.on('keydown')` — the second half of the same bug.**
     *
     * Phase 11's first fix made the INTERPRETATION layout-independent by reading `event.code`. It
     * left the **gate in front of the listener** keyed on `event.keyCode`. `KeyboardPlugin`'s
     * `ANY_KEY_DOWN` is conditional (`KeyboardPlugin.js:797`):
     *
     * ```js
     * var key = keys[event.keyCode];
     * repeat = key.isDown;                       // not `&& event.repeat`
     * if (!event.cancelled && (!key || !repeat)) { ... this.emit(ANY_KEY_DOWN, event); }
     * ```
     *
     * So if the player's layout puts `[` on a keyCode this function has REGISTERED — the shipped set
     * is 37, 39, 65, 68, 32, 38, 87, 16, 70, 76, 27 — then holding that key (`L` is an attack key,
     * `SHIFT` is the walk modifier) and tapping `[` suppresses the event entirely. The volume key
     * goes dead intermittently, only while another key is held, only on that layout: the exact shape
     * of the defect this phase exists to close. Found by the criterion 11.14 adversarial brief, which
     * asked how the fix could still be wrong rather than whether it was applied.
     *
     * ⚠️ **The DOM listener does not inherit the plugin's gating, and that gating is load-bearing.**
     * `KeyboardPlugin.isActive()` is what makes a PAUSED `Game` deaf under the welcome screen;
     * without it, BOTH this listener and `TitleScene`'s fire on one press and step the volume twice.
     *
     * 🔴 So the plugin's OWN predicate is called, not a re-derivation of it. This first read
     * `scene.sys.isActive()` with a comment claiming that was "exactly that gate" — **it is not**:
     * `KeyboardPlugin.isActive()` is `this.enabled && sys.canInput()`, which also honours the
     * plugin's `enabled` flag and accepts the pre-RUNNING statuses `isActive()` rejects. A disabled
     * `KeyboardManager` is checked beside it for the same reason. Codex implementation review,
     * finding 4: an approximation of an engine predicate is a second definition that agrees on the
     * happy path.
     *
     * 🔴 **`event.defaultPrevented` is deliberately NOT checked, though `KeyboardManager.js:188`
     * checks it.** Copying that clause looked like faithfulness and was a regression: `addKey(code,
     * **true**, false)` enables capture for every key this function registers, so Phaser calls
     * `preventDefault()` on them itself. **Measured, not reasoned** — a probe on the real page
     * reported `defaultPrevented: true` for a keyCode-76 event with every other gate open. The
     * collision spec went red the moment the clause was added, which is the whole reason C1 asks for
     * a gate to be watched failing before it is trusted: the clause would have silently restored the
     * exact defect this phase exists to close. The manager checks it to avoid double-handling an
     * event another listener consumed; a capture flag is not consumption.
     *
     * 🔴 **`event.cancelled` is the marker that DOES work, and it is checked.**
     *
     * Round 2 recorded two of the plugin's rejections as unreproducible, on the reasoning that
     * Phaser's queue drain happens after this listener. **That reasoning was backwards**, and round 3
     * caught it: `KeyboardManager` emits `MANAGER_PROCESS` synchronously from inside its own DOM
     * handler (`KeyboardManager.js:194`), so `KeyboardPlugin.update()` has already run by the time a
     * listener registered later in `create()` sees the event.
     *
     * Measured on the real page rather than argued a second time: a `BracketLeft` event reaches this
     * listener with `cancelled: 0`, **a number**, alongside `defaultPrevented: false`; the captured
     * `KeyL` event reaches it with `cancelled: 0` and `defaultPrevented: true`. So the two are
     * genuinely different signals, and `cancelled` is the one that means what we need:
     *
     * | `event.cancelled` | meaning |
     * |---|---|
     * | `undefined` | Phaser never queued it — rejected before the plugin, or the plugin is inactive |
     * | `0` | queued and accepted, whatever `preventDefault` a capture flag caused |
     * | `1` / `-1` | `stopImmediatePropagation()` / `stopPropagation()` — deliberately stopped |
     *
     * Requiring exactly `0` reproduces both rejections without touching `defaultPrevented`, and it
     * leaves the keyCode-collision fix intact: the plugin sets `cancelled` **before** it looks up
     * `keys[keyCode]`, so a suppressed `ANY_KEY_DOWN` still leaves a `0` behind.
     *
     * `TitleScene` needs none of this: it registers no keys at all, so `keys[code]` is always
     * undefined there and `ANY_KEY_DOWN` always fires.
     */
    const target: EventTarget = keyboard.manager?.target ?? window;

    /**
     * Phaser's duplicate-event bailout, reproduced.
     *
     * `KeyboardPlugin.js:776` skips an event whose `keyCode`, `timeStamp` and `type` all match the
     * one before it, with the comment *"on some systems, the exact same event will fire multiple
     * times"*. Leaving the plugin gave that up, and a duplicate is **not** an `event.repeat` — so on
     * such a system one press would apply two volume steps. Round 2, finding 1.
     *
     * Keyed on `code` rather than `keyCode`, because `code` is what this listener dispatches on and
     * is therefore the thing that must not be honoured twice.
     *
     * 🔴 **And the keyUP resets it**, which the first version missed. Phaser's triplet includes
     * `event.type` and is updated for keyups too, so two legitimate presses that happen to share a
     * millisecond — separated by a release — are accepted there and would have been swallowed here.
     * A timestamp is not a press identifier; the release between them is. Round 3, finding 3.
     */
    let prevCode = '';
    let prevTime = -1;
    const forgetPrevious = (): void => {
      prevCode = '';
      prevTime = -1;
    };

    const onAudioKey = (event: KeyboardEvent): void => {
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
      // 🔴 `isComposing` is new with the DOM listener and is not decoration. During IME
      // composition a browser fires `keydown` with `keyCode === 229` while `event.code` stays the
      // physical key — so a CJK user composing text with the canvas focused would walk the volume
      // and write `localStorage` on every keystroke. The old `addKey(219)` binding was inert for
      // those because 229 was unregistered; this listener is not, so it says so.
      if (event.repeat || event.isComposing) {
        return;
      }
      // The plugin's own gate, plus the two the manager applies before it.
      if (!keyboard.isActive() || keyboard.manager?.enabled === false) {
        return;
      }
      if (!isPlayerInputEnabled()) {
        return;
      }
      // Phaser queued it and nobody stopped it. `undefined` means the plugin never saw it.
      //
      // The cast is the honest shape: `cancelled` is a field PHASER adds to the DOM event
      // (`KeyboardPlugin.js:751`), not part of the `KeyboardEvent` interface, so no lib.dom type
      // describes it.
      if ((event as KeyboardEvent & { cancelled?: number }).cancelled !== 0) {
        return;
      }
      if (event.code === prevCode && event.timeStamp === prevTime) {
        return;
      }
      prevCode = event.code;
      prevTime = event.timeStamp;

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
      scene.events.emit(AUDIO_CHANGED);
      // 🔴 The banner is the only readout of the volume in play, and it draws from a provider it
      // re-reads on this event. Without the emit the number moves and nothing on screen does — the
      // same silent no-op this change exists to remove, just one layer further down.
    };
    target.addEventListener('keydown', onAudioKey as EventListener);
    target.addEventListener('keyup', forgetPrevious);
    // The plugin used to own this teardown. A raw DOM listener outlives its scene unless the scene
    // removes it — the same trap `TitleScene` handles for the global `ScaleManager`.
    /**
     * 🔴 BOTH lifecycle events, and **each one cancels the other**.
     *
     * DESTROY as well as SHUTDOWN because `SceneManager.remove()` calls `sys.destroy()` without
     * emitting SHUTDOWN first (`SceneManager.js:429`), so a removed scene would otherwise leak this
     * listener and the closure retaining it *(Codex review round 1, finding 5)*.
     *
     * ⚠️ And each unregisters the other, because `Systems.shutdown()` does **not** clear the scene's
     * own emitter. Registering two independent `once` handlers meant SHUTDOWN fired, removed the DOM
     * listener, and left its DESTROY twin behind — one more dead closure per restart, for the life of
     * the page *(round 2, finding 2)*. A leak this small is still a leak that grows.
     */
    const drop = (): void => {
      target.removeEventListener('keydown', onAudioKey as EventListener);
      target.removeEventListener('keyup', forgetPrevious);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, drop);
      scene.events.off(Phaser.Scenes.Events.DESTROY, drop);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, drop);
    scene.events.once(Phaser.Scenes.Events.DESTROY, drop);
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
