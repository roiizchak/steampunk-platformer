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
 * It is NOT under `src/sim/`, because it is a rendering concern and Phase 5 will give it art keys
 * and frame indices that the simulation must never know about. But it obeys the same discipline,
 * and the sim boundary test would pass on it unchanged.
 */

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
};

/** The animation key for a state. Exported so the scene registers exactly what it plays. */
export function animKeyFor(state: PlayerState): string {
  return STATE_ANIMS[state];
}

/** Every animation key the player can ask for, for registration and for the e2e assertions. */
export function allAnimKeys(): string[] {
  return Object.values(STATE_ANIMS);
}

export function playerRenderDesc(player: PlayerSim, scale: number): PlayerRenderDesc {
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
    animKey: STATE_ANIMS[player.state],
  };
}
