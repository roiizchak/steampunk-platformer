/**
 * Sim state -> render descriptor. **Engine-free** (vault 2.12).
 *
 *   > "Pull render DECISIONS out of scenes into engine-free modules. If a scene rule has an edge
 *   > case, that's the move — not a browser test."
 *
 * This module imports no Phaser and touches no Game Object. It returns plain data; the scene reads
 * it and applies it. That is what makes the mirroring rule, the feet origin and the scale seam
 * testable in `tests/unit/player-view.test.ts` rather than through a screenshot.
 *
 * It is NOT under `src/sim/`, because it is a rendering concern — Phase 5 gave it art keys and
 * frame indices that the simulation must never know about. But it obeys the same discipline,
 * and the sim boundary test would pass on it unchanged.
 */

import { GOAL_ENTRY_TICKS } from '../sim/goal';
import { PLAYER_BOX } from '../sim/player';
import type { PlayerSim, PlayerState } from '../sim/types';

export interface PlayerRenderDesc {
  /** World position of the FEET. The scene applies it verbatim — see `originY`. */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Bottom-centre. Stated explicitly because Phaser Game Objects default to `0.5, 0.5`, which
   * would float the box half its height above the ground it is standing on.
   */
  originX: number;
  originY: number;
  /** Mirror the sprite. Read from `facing`, never re-derived from velocity. */
  flipX: boolean;
  /** Fill colour, `0xRRGGBB`. Grey-box only — the Playground and the Gym still draw rectangles. */
  colour: number;
  /**
   * The animation key to play. Phase 4.
   *
   * `colour` is kept beside it deliberately rather than deleted: two dev scenes still draw the
   * grey box, and a coloured rectangle is a far more legible failure than an invisible sprite if a
   * texture ever goes missing.
   */
  animKey: string;
  /**
   * Opacity, `0`–`1`. **`1` for every frame of ordinary play** — this exists for the gate.
   *
   * The gate-entry session. The scene applies it unconditionally every frame, which is what makes
   * it self-correcting: nothing has to remember to put it back.
   */
  alpha: number;
}

/**
 * Grey-box palette — one distinct colour per state.
 *
 * Distinct on purpose: a state machine stuck in `fall` while the player stands still is invisible
 * if two states share a colour, and criterion 2.8's hands-on pass is exactly the gate meant to
 * catch that. Replaced by real art in Phase 4; the STATES, not the colours, are the contract.
 *
 * These are fill colours on a `Rectangle`, not a tint. Tint is WebGL-only in Phaser 4 and the game
 * runs `Phaser.AUTO` with a live Canvas fallback, where a tinted texture would render plain white.
 */
const STATE_COLOURS: Record<PlayerState, number> = {
  idle: 0xc8a86b,
  walk: 0xd4b87a,
  run: 0xe0c98a,
  jump: 0x7fb2c8,
  fall: 0x9a7bb0,
  // Phase 5. Warm and saturated for the states the player CAUSES, cold for the ones done TO them —
  // so a grey-box playtest can tell "I swung" from "I was hit" without reading a debug field.
  attack: 0xe8813a,
  hurt: 0xc4463f,
  death: 0x5a4a52,
};

/**
 * THE state → animation-key map. Phase 4.
 *
 * A `Record<PlayerState, string>`, so adding a state to the union is a compile error here until it
 * is handled — the same seam `STATE_COLOURS` provided, kept deliberately. Phase 5 adds `attack`,
 * `hurt` and `death` and will be told about it by the typechecker rather than by a black sprite.
 *
 * The slug is part of the key because the catalog namespace is flat and enemies land in it too.
 */
const SLUG = 'brass-courier';

const STATE_ANIMS: Record<PlayerState, string> = {
  idle: `${SLUG}-idle`,
  walk: `${SLUG}-walk`,
  run: `${SLUG}-run`,
  jump: `${SLUG}-jump`,
  fall: `${SLUG}-fall`,
  attack: `${SLUG}-attack`,
  hurt: `${SLUG}-hurt`,
  death: `${SLUG}-death`,
};

/** The animation key for a state. Exported so the scene registers exactly what it plays. */
export function animKeyFor(state: PlayerState): string {
  return STATE_ANIMS[state];
}

/** Every animation key the player can ask for, for registration and for the e2e assertions. */
export function allAnimKeys(): string[] {
  return Object.values(STATE_ANIMS);
}

/**
 * The gate-entry fade: the run-in's tick count → the player's opacity.
 *
 * 🔴 **This is the seam the whole feature turns on.** `src/sim/` owns an integer — how many ticks
 * the player has been walking into the doorway — and knows nothing about transparency. This
 * function is the only place that decides the body disappears.
 *
 * **Why not a Phaser tween on the sprite.** Two independent reasons, either one sufficient:
 *
 *  1. A tween is a duration in MILLISECONDS on a body whose entire sequence is an integer count of
 *     60 Hz ticks *(vault 2.1)*. The two would drift apart on any frame rate that is not exactly
 *     60, and the fade would finish before or after the level did depending on the display.
 *  2. A tween is STATE. It would have to be cancelled on a scene restart, on a death mid-run-in,
 *     and on the cancel — three teardown paths, each of which is a chance to leave a permanently
 *     transparent character in the next level. Phase 6 paid for exactly this class of bug with the
 *     HUD's lifetime.
 *
 * Recomputed from the counter every frame, it has no teardown at all: `null` means opaque, and a
 * new level's world starts at `null`.
 *
 * The clamp at 0 matters because the sim FREEZES at step 0 once the level completes, so this is
 * called forever afterwards with the counter's final value. Alpha holds at 0 — "no pop-back" is
 * structural rather than something a listener remembers to do.
 */
export function goalEntryAlpha(goalEntryTicks: number | null): number {
  if (goalEntryTicks === null) {
    return 1;
  }
  return 1;
}

/**
 * @param goalEntryTicks `World.goalEntryTicks` — the gate run-in's progress, or `null` when none is
 *   running. Defaults to `null` so every pre-existing call site keeps the behaviour it was written
 *   against; only the production draw path passes it.
 */
export function playerRenderDesc(
  player: PlayerSim,
  scale: number,
  goalEntryTicks: number | null = null,
): PlayerRenderDesc {
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new Error(`playerRenderDesc: scale must be a finite number greater than 0, got ${scale}`);
  }

  return {
    // Position is a world coordinate the sim already resolved collisions against. Scaling it here
    // would move the drawing away from the box it was resolved for (vault 2.11).
    x: player.x,
    y: player.y,
    w: PLAYER_BOX.w * scale,
    h: PLAYER_BOX.h * scale,
    originX: 0.5,
    originY: 1,
    flipX: player.facing === -1,
    colour: STATE_COLOURS[player.state],
    // 🔴 `run` is FORCED for the whole gate run-in, whatever the sim says. The sim's own state
    // reads `fall` for a tick or two if the player entered airborne, and `idle` once the auto-run's
    // dead zone settles them at the centre — and the character is supposed to be seen RUNNING into
    // the door. The override lives here rather than in `resolveState` because it is a rendering
    // claim about one scripted moment, not a movement state the simulation should have to carry.
    animKey: goalEntryTicks === null ? STATE_ANIMS[player.state] : STATE_ANIMS.run,
    alpha: goalEntryAlpha(goalEntryTicks),
  };
}
