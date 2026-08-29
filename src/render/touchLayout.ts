/**
 * **Where the on-screen touch controls go, and whether they are big enough to hit.**
 *
 * Engine-free *(vault 2.12)*, so its edge cases are reachable from a unit test rather than only from
 * a browser at one particular window size. `src/scenes/touchControlsLayer.ts` applies the result;
 * this file decides it.
 *
 * ## The measurement everything here rests on
 *
 * `Phaser.Scale.FIT` holds the backing store at **1920 x 1080 at every viewport and every DPR** and
 * restyles only the canvas CSS width and height — measured, not assumed, in
 * `docs/ENGINE-NOTES.md § Scale`. So a button declared in GAME pixels arrives on the player's screen
 * at `gamePx * canvasCssWidth / 1920`, and an accessibility floor expressed in CSS pixels is a
 * *different number* in the units this file works in.
 *
 * | viewport | canvas CSS | scale | `TOUCH_BOX_PX` 160 lands at |
 * |---|---|---|---|
 * | iPhone SE landscape 667x375 | 667 wide | **0.347** | **55.6 CSS px** |
 * | iPad portrait 768x1024 | 768 wide | 0.400 | 64.0 CSS px |
 * | desktop 1920x1080 | 1920 wide | 1.000 | 160 CSS px |
 * | **iPhone 14 portrait 390x844** | **390 wide** | **0.203** | **32.5 CSS px** |
 *
 * Phone portrait is the case the numbers cannot be chosen to satisfy: at 0.203 a *legal* 44 CSS px
 * target costs **217 of the 1080 game pixels of height**, a fifth of the play area per button. That
 * is why `touchTargetsFit` returning false puts a rotate prompt on screen rather than shrinking
 * anything — and why the prompt's trigger is this predicate rather than an orientation test or a
 * device list. Portrait *tablet* is 0.400 and is playable, which an orientation test would have
 * refused for no reason.
 *
 * ## What these predicates are NOT
 *
 * 🔴 **They are production oracles, never acceptance oracles.** The Codex plan review (round 1,
 * finding 7) named the trap: a pure layout predicate used to check itself cannot fail. It is green
 * with nothing drawn at all, and green with every control 400 px off the canvas. Criteria 12.8 and
 * 12.9 therefore measure the LIVE objects' bounds against the LIVE canvas rect inside the page and
 * derive their CSS figures from those measurements. `tests/unit/touch-layout.test.ts` gates the
 * arithmetic here; `tests/unit/touch-draw-path.test.ts` gates that a scene actually applies it.
 * Three questions, three gates — collapsing any two of them re-opens the hole.
 */

import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';

/**
 * The five actions, in draw order. `pause` is deliberately in this list even though it writes no
 * sim field: it is a touch target, it must clear the same size floor, and it must not overlap the
 * others.
 */
export const TOUCH_IDS = ['left', 'right', 'attack', 'jump', 'pause'] as const;

export type TouchId = (typeof TOUCH_IDS)[number];

/** A hit box in GAME pixels, `x`/`y` at the top-left corner. */
export interface TouchTarget {
  id: TouchId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Box edge in game pixels.
 *
 * Chosen from the worst viewport this phase supports, not from taste: 160 * 0.347 = 55.6 CSS px
 * against a 44 px floor, with 11.6 px of headroom. The smallest value that would still pass there is
 * 127, and a threshold set AT the observed minimum has no room to be wrong safely.
 */
export const TOUCH_BOX_PX = 160;

/** Gap between two boxes in a pair. 32 * 0.347 = 11.1 CSS px against an 8 px floor. */
export const TOUCH_GAP_PX = 32;

/** Inset from the view edge. Two thirds of a tile; clear of the 24 px HUD margin. */
export const TOUCH_EDGE_PX = 64;

/**
 * The accessibility floors, in CSS pixels, cited rather than invented: `ui-ux-pro-max`'s
 * `ux-guidelines.csv`, Touch -> *Touch Target Size* (*"Minimum 44x44px touch targets"*, severity
 * High) and Touch -> *Touch Spacing* (*"Minimum 8px gap between touch targets"*, severity Medium).
 * Criterion 12.9 is owned by `voltagent-qa-sec:accessibility-tester` and cites these two rows.
 */
export const TOUCH_MIN_CSS_PX = 44;
export const TOUCH_MIN_GAP_CSS_PX = 8;

function positive(value: number, what: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`touchLayout: ${what} must be a positive finite number, got ${value}`);
  }
  return value;
}

/**
 * Lay the five controls out for a view of this size.
 *
 * Scaled off the view rather than hardcoded at the design size *(vault 6.2)*. Under FIT production
 * always passes 1920 x 1080, so this scaling never runs in the shipped game today — which is exactly
 * why it must not be a literal: the HUD learned that lesson by cropping a whole plate off a phone
 * when a camera created at an explicit size declined to resize.
 */
export function touchLayout(viewWidth: number, viewHeight: number): TouchTarget[] {
  positive(viewWidth, 'viewWidth');
  positive(viewHeight, 'viewHeight');

  const s = viewHeight / GAME_HEIGHT;
  const box = TOUCH_BOX_PX * s;
  const gap = TOUCH_GAP_PX * s;
  const edge = TOUCH_EDGE_PX * s;

  const bottom = viewHeight - edge - box;
  const rightmost = viewWidth - edge - box;

  const at = (id: TouchId, x: number, y: number): TouchTarget => ({ id, x, y, w: box, h: box });

  // Movement under the left thumb, actions under the right, pause out of both thumbs' way. The
  // order matches TOUCH_IDS so a caller can zip the two lists.
  return [
    at('left', edge, bottom),
    at('right', edge + box + gap, bottom),
    at('attack', rightmost - box - gap, bottom),
    at('jump', rightmost, bottom),
    at('pause', rightmost, edge),
  ];
}

/**
 * How many CSS pixels one game pixel occupies, given the canvas's measured CSS width.
 *
 * Returns **0** rather than throwing for a canvas that is absent, collapsed or unmeasurable. A zero
 * scale fails `touchTargetsFit`, which shows the rotate prompt — and "show the prompt" is the safe
 * answer to a geometry we do not understand, in the same spirit as `isIntegerScale` treating an
 * unreadable ratio as fractional.
 */
export function cssScaleFor(canvasCssWidth: number, gameWidth: number = GAME_WIDTH): number {
  if (!Number.isFinite(canvasCssWidth) || canvasCssWidth <= 0) return 0;
  if (!Number.isFinite(gameWidth) || gameWidth <= 0) return 0;
  return canvasCssWidth / gameWidth;
}

/** Do two boxes share any area? Touching exactly along an edge is NOT overlapping. */
function overlaps(a: TouchTarget, b: TouchTarget): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The clear distance between two non-overlapping boxes, in game pixels. 0 if they touch or overlap. */
function separation(a: TouchTarget, b: TouchTarget): number {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.max(dx, dy);
}

/**
 * Is every target hittable at this CSS scale — both large enough AND far enough apart?
 *
 * 🔴 **Both halves, and they are separate claims.** A layout of enormous buttons jammed edge to edge
 * satisfies the size floor and is still unusable, and a caller that checked only sizes would ship
 * exactly that. This is the predicate the rotate prompt is driven from, so it is also the predicate
 * that decides whether the controls are interactive at all — see `controlsLive` in
 * `touchControlsLayer.ts`. Leaving the controls enabled under the prompt would let a tap meant for
 * "turn your phone" move the player instead.
 *
 * An **empty** list is false, not vacuously true: otherwise deleting every control satisfies the
 * accessibility criterion, which is the deletion the gate exists to catch.
 */
export function touchTargetsFit(targets: readonly TouchTarget[], cssScale: number): boolean {
  if (targets.length === 0) return false;
  if (!Number.isFinite(cssScale) || cssScale <= 0) return false;

  for (const t of targets) {
    if (t.w * cssScale < TOUCH_MIN_CSS_PX) return false;
    if (t.h * cssScale < TOUCH_MIN_CSS_PX) return false;
  }
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      if (separation(targets[i], targets[j]) * cssScale < TOUCH_MIN_GAP_CSS_PX) return false;
    }
  }
  return true;
}

/**
 * Does any pair of targets share area?
 *
 * Scale-free on purpose — overlap is a property of the layout, not of the screen it lands on. Empty
 * is false for the same reason as above.
 */
export function touchTargetsDisjoint(targets: readonly TouchTarget[]): boolean {
  if (targets.length === 0) return false;
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      if (overlaps(targets[i], targets[j])) return false;
    }
  }
  return true;
}
