import Phaser from 'phaser';
import { latchAttackPress, latchJumpPress } from '../sim/input';
import type { InputSnapshot } from '../sim/types';

/**
 * The keyboard half of `GameScene`: binding keys to `Phaser.Input.Keyboard.Key` objects and
 * sampling them into the sim's `InputSnapshot` every frame. Split out to keep `GameScene.ts`
 * under the 400-line rule — this file has no subclass coupling of its own; the scene still owns
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
): HeldKeys {
  const keyboard = scene.input.keyboard;
  if (!keyboard) {
    return NO_KEYS;
  }

  const { LEFT, RIGHT, A, D, SPACE, UP, W, P, O, G, SHIFT, F, L, N, M } =
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

  // Without capture the browser scrolls the page on arrows and space — which also corrupts a
  // Playwright key drive, so this is a test-correctness fix as much as a UX one.
  keyboard.addCapture('SPACE,LEFT,RIGHT,UP,DOWN,W,A,D');

  // DEV ONLY, on the same side of the build gate as the scene itself (vault 1.6). Without this
  // guard the key would still be bound in production and would call `scene.start('Playground')`
  // on a scene that is not registered there — a silent no-op at best. Codex review 2, finding I2.
  if (import.meta.env.DEV && dev) {
    addKey(P).on('down', () => dev.togglePlayground());
    addKey(O).on('down', () => dev.toggleElementEditor());
    addKey(G).on('down', () => dev.toggleGym());
    // Criterion 5.11: a worst-case fleet at full hp.
    addKey(N).on('down', () => dev.spawnDevFleet());
    // Criterion 5.7: one scavenger at 2/60 hp, below anything combat itself can land on.
    addKey(M).on('down', () => dev.spawnDevLowHpEnemy());
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
