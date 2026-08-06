import Phaser from 'phaser';
import { ticksToMs } from '../sim';
import { DEFAULT_TUNING } from '../sim/player';
import type { TuningKnobs } from '../sim/types';
import { GameScene } from './GameScene';

/**
 * DEV ONLY — live movement tuning. Vault **A6** (blocker):
 *
 *   > "The Playground needs knob-sweep verification wired in from day one. A slider that visibly
 *   > exists reads as a slider that visibly works. Change it, run, confirm the output moved."
 *
 * So this scene is deliberately not the gate. `tests/unit/knob-sweep.test.ts` proves every knob
 * moves an observable output, exhaustively and in milliseconds;
 * `tests/e2e/phase-02-movement.spec.ts` proves the UI here is wired to the same knobs. A scene
 * that looked right would otherwise satisfy criterion 2.6 while adjusting nothing — which Codex
 * plan review F2c called out.
 *
 * **Keys are Q/E and Z/X, not the arrows.** The plan said arrows; the plan was wrong, because the
 * whole point is to retune the feel WHILE running and jumping, and the arrows are how you run.
 * Rebinding movement to tune movement would make the scene useless for its one job.
 */

/** Knobs measured in whole 60 Hz ticks (vault 2.1) rather than pixels. */
function isTickCount(key: keyof TuningKnobs): boolean {
  return key === 'coyoteTicks' || key === 'jumpBufferTicks';
}

/** How far one keypress moves a knob. Tick counts step by whole ticks — never a fraction (2.1). */
function stepFor(key: keyof TuningKnobs): number {
  if (isTickCount(key) || key === 'jumpCutDivisor') {
    return 1;
  }
  return Math.max(0.05, Math.round(DEFAULT_TUNING[key] * 10) / 100);
}

/** Knobs must stay usable. A gravity of 0 is not a tuning, it is a broken scene. */
function floorFor(key: keyof TuningKnobs): number {
  if (key === 'coyoteTicks' || key === 'jumpBufferTicks') {
    return 0;
  }
  if (key === 'jumpCutDivisor') {
    return 1;
  }
  return 0.05;
}

export class PlaygroundScene extends GameScene {
  private knobKeys: (keyof TuningKnobs)[] = [];
  private selected = 0;
  private readout!: Phaser.GameObjects.Text;

  constructor() {
    super('Playground');
  }

  init(): void {
    super.init();
    // Reset here, not in the constructor: the selection must not survive a scene restart.
    this.selected = 0;
    this.knobKeys = [];
  }

  create(): void {
    super.create();

    // Read from the live tuning object rather than a hand-written list, so a knob added in a
    // later phase appears here with no edit — the same construction the sweep test uses.
    this.knobKeys = Object.keys(this.simWorld.tuning) as (keyof TuningKnobs)[];

    this.readout = this.add
      .text(24, 64, '', { fontFamily: 'monospace', fontSize: '18px', color: '#c8a86b' })
      .setScrollFactor(0);

    this.bindKnobKeys();
    this.refreshReadout();
  }

  protected helpText(): string {
    return 'ARROWS / WASD move · SPACE jump · Q/E select knob · Z/X adjust · R reset · P back';
  }

  protected togglePlayground(): void {
    this.scene.start('Game');
  }

  private bindKnobKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const { Q, E, Z, X, R } = Phaser.Input.Keyboard.KeyCodes;

    // `emitOnRepeat: false` for selection so one press moves one row, but the adjust keys are
    // left repeating on purpose — holding X to sweep a knob is the entire ergonomic point.
    keyboard.addKey(Q, true, false).on('down', () => this.moveSelection(-1));
    keyboard.addKey(E, true, false).on('down', () => this.moveSelection(1));
    keyboard.addKey(Z, true, true).on('down', () => this.adjust(-1));
    keyboard.addKey(X, true, true).on('down', () => this.adjust(1));
    keyboard.addKey(R, true, false).on('down', () => this.resetTuning());
    keyboard.addCapture('Q,E,Z,X,R');
  }

  private moveSelection(delta: number): void {
    const count = this.knobKeys.length;
    this.selected = (this.selected + delta + count) % count;
    this.refreshReadout();
  }

  private adjust(direction: -1 | 1): void {
    const key = this.knobKeys[this.selected];
    const tuning = this.simWorld.tuning;
    const next = tuning[key] + stepFor(key) * direction;
    // Written into the LIVE tuning object the running sim already holds, so the change lands on
    // the very next tick. Rebuilding the world instead would reset the player's position and
    // hide exactly the before/after comparison this scene exists to make.
    tuning[key] = Math.max(floorFor(key), Math.round(next * 1000) / 1000);
    this.refreshReadout();
  }

  private resetTuning(): void {
    Object.assign(this.simWorld.tuning, DEFAULT_TUNING);
    this.refreshReadout();
  }

  private refreshReadout(): void {
    const tuning = this.simWorld.tuning;
    const lines = this.knobKeys.map((key, index) => {
      const marker = index === this.selected ? '>' : ' ';
      const drifted = tuning[key] === DEFAULT_TUNING[key] ? ' ' : '*';
      // Tick counts also shown in ms. Ticks are the unit the sim thinks in, but nobody has an
      // intuition for "7 ticks" while tuning feel by hand — 117 ms is the number you can compare
      // against how long your own thumb takes. This is the only place `ticksToMs` is for.
      const suffix = isTickCount(key) ? ` (${ticksToMs(tuning[key])}ms)` : '';
      return `${marker} ${drifted} ${key.padEnd(16)} ${String(tuning[key]).padStart(8)}${suffix}`;
    });
    this.readout.setText(lines);
  }
}
