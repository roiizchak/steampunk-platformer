import Phaser from 'phaser';
import { ticksToMs } from '../sim';
import { derivedFeel } from '../sim/derived';
import { enemyKnobs, knobLine, type Knob } from '../render/enemyTuning';
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
 * **Keys are Q/E and `,`/`.`, not the arrows.** The plan said arrows; the plan was wrong, because
 * the whole point is to retune the feel WHILE running and jumping, and the arrows are how you run.
 * Rebinding movement to tune movement would make the scene useless for its one job.
 *
 * Adjust was `Z`/`X` until Phase 5 bound **`Z` to attack**, at which point one keypress both swung
 * the sword and decremented a knob. Attack has since moved to `F`/`L` — session 8, on the user's
 * report that the old placement was awkward to reach — so that collision no longer exists. `,`/`.`
 * stayed rather than moving back: they are clear of every production binding, and churning a dev
 * binding twice costs more than it saves.
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
  /**
   * Phase 5's enemy knobs, appended after the movement ones so `selected` spans both lists.
   *
   * A second selection index and a second pair of adjust keys was the alternative, and it is worse:
   * the whole point of A6 is that you sweep everything, and a panel with two modes is a panel where
   * one mode goes unswept. Rebuilt on every adjustment because the accessors close over live
   * entities, and spawning one invalidates the list.
   */
  private enemyKnobList: Knob[] = [];
  private selected = 0;
  private readout!: Phaser.GameObjects.Text;
  private derivedText!: Phaser.GameObjects.Text;

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
    this.enemyKnobList = enemyKnobs(this.simWorld);

    this.readout = this.add
      .text(24, 64, '', { fontFamily: 'monospace', fontSize: '18px', color: '#c8a86b' })
      .setScrollFactor(0);

    // The derived panel is the answer to vault A6's actual complaint. Several knobs — both
    // forgiveness windows, `airFriction`, `jumpCutDivisor` — have no effect a player can SEE while
    // playing, so turning them looks identical to turning a dead knob. These numbers move on the
    // same frame the knob does, which is the "confirm the output moved" half of the rule.
    this.derivedText = this.add
      .text(560, 64, '', { fontFamily: 'monospace', fontSize: '18px', color: '#7fb2c8' })
      .setScrollFactor(0);

    this.bindKnobKeys();
    this.refreshReadout();
  }

  protected helpText(): string {
    return 'ARROWS / WASD move · SPACE jump · F/L attack · Q/E select knob · ,/. adjust · R reset · P back';
  }

  protected togglePlayground(): void {
    /**
     * ⚠️ `{ levelId: null }`, never a bare `start('Game')`.
     *
     * Phaser's `Systems.start(data)` only overwrites `settings.data` when `data` is TRUTHY, and
     * `SceneManager.bootScene` feeds `settings.data` straight into `init`. So a payload-less start
     * re-delivers whatever payload the scene was last started with — and since Phase 8 that is a
     * concrete `{ levelId }` from the level menu or from the completion panel. `GameScene.init` cannot
     * tell "no payload" from "the payload from three starts ago", so the stale id would win over the
     * save and defeat the tier ordering `resolveEntryLevel` exists to enforce. Verified against the
     * installed Phaser 4.2.1 source by the Phase 8 code-reviewer's adversarial brief.
     *
     * `null` is not "no payload" — it is the explicit request to resolve from the save, which is what
     * `init`'s `data?.levelId ?? null` already means.
     */
    this.scene.start('Game', { levelId: null });
  }

  private bindKnobKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const { Q, E, COMMA, PERIOD, R } = Phaser.Input.Keyboard.KeyCodes;

    // `emitOnRepeat: false` for selection so one press moves one row, but the adjust keys are
    // left repeating on purpose — holding X to sweep a knob is the entire ergonomic point.
    keyboard.addKey(Q, true, false).on('down', () => this.moveSelection(-1));
    keyboard.addKey(E, true, false).on('down', () => this.moveSelection(1));
    keyboard.addKey(COMMA, true, true).on('down', () => this.adjust(-1));
    keyboard.addKey(PERIOD, true, true).on('down', () => this.adjust(1));
    keyboard.addKey(R, true, false).on('down', () => this.resetTuning());
    keyboard.addCapture('Q,E,COMMA,PERIOD,R');
  }

  private moveSelection(delta: number): void {
    const count = this.knobKeys.length + this.enemyKnobList.length;
    this.selected = (this.selected + delta + count) % count;
    this.refreshReadout();
  }

  private adjust(direction: -1 | 1): void {
    const enemyIndex = this.selected - this.knobKeys.length;
    if (enemyIndex >= 0) {
      const target = this.enemyKnobList[enemyIndex]!;
      target.set(Math.round((target.get() + target.step * direction) * 1000) / 1000);
      // No cross-knob invariant to re-assert any more: `releaseRadius` is gone with permanent
      // aggro, and one radius cannot be dragged past itself. See `enemyTuning.ts`.
      this.refreshReadout();
      return;
    }

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

    // Phase 5's enemy knobs, on the same list and the same selection index — see `enemyKnobList`.
    // Rebuilt each refresh because the accessors close over live entities.
    this.enemyKnobList = enemyKnobs(this.simWorld);
    const enemyLines = this.enemyKnobList.map((k, index) =>
      knobLine(k, this.knobKeys.length + index === this.selected),
    );
    this.readout.setText(enemyLines.length > 0 ? [...lines, '', ...enemyLines] : lines);

    const feel = derivedFeel(tuning, ticksToMs);
    this.derivedText.setText([
      'WHAT THE KNOBS DO',
      '',
      `jump apex        ${feel.apexPx} px  (${feel.apexTiles} tiles)`,
      `airtime          ${feel.airtimeTicks} ticks (${ticksToMs(feel.airtimeTicks)}ms)`,
      `short hop        ${feel.shortHopPx} px`,
      `top speed        ${feel.topSpeed} px/tick`,
      `time to top      ${feel.ticksToTopSpeed} ticks`,
      `ground stop      ${feel.groundStopPx} px`,
      `air drift        ${feel.airDriftPx} px`,
      `terminal fall    ${feel.terminalFallSpeed} px/tick`,
      `coyote window    ${feel.coyoteMs}ms`,
      `buffer window    ${feel.bufferMs}ms`,
    ]);
  }
}
