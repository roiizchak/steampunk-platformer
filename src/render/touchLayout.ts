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

/**
 * A hit box in GAME pixels, `x`/`y` at the top-left corner.
 *
 * The predicates below take this rather than `TouchTarget`, so the level menu's rows and the
 * terminal screens' zones are measured by the same two rules as the five play controls — the
 * accessibility floor is a property of a touch target, not of which screen it happens to be on.
 */
export interface HitBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One of the five play controls. */
export interface TouchTarget extends HitBox {
  id: TouchId;
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
 * The level menu's row band, in game pixels.
 *
 * 🔴 **The row height is `TOUCH_BOX_PX`, and that is the whole point.** It was 128, which is
 * 44.4 CSS px at 0.347 — over the floor by **0.44 px**, a margin of 1.0 %. The accessibility
 * gate's adversarial brief found what that costs, and it is not a theoretical margin:
 *
 * | posture | viewport | scale | row |
 * |---|---|---|---|
 * | iPhone SE landscape, the number the spec tests | 667x375 | 0.3472 | 44.4 ✅ |
 * | iPhone SE landscape, **Safari's real viewport** | 667x325 | 0.3009 | **38.5 ❌** |
 * | Pixel 7 landscape, **Chrome's real viewport** | 892x356 | 0.3296 | **42.2 ❌** |
 *
 * `page.setViewportSize()` hands the test the whole screen. A real browser keeps a URL bar, and
 * `index.html`'s `#game { height: 100% }` means the page never scrolls, so that bar **never
 * collapses** — the reduced viewport is the permanent one, not a transient.
 *
 * And the band it fell into was invisible. A 128 px row needs a scale of `44/128 = 0.344`; a
 * 160 px control needs `44/160 = 0.275`. Everything that asks *"are the targets big enough"*
 * asked it about the **controls**, so between 0.275 and 0.344 the rows were under the floor,
 * fully interactive, and no prompt appeared.
 *
 * Two floors are one floor too many. The rows are now the same 160 px the controls are, so the
 * two share a threshold by construction and the blind band cannot exist. The band's own margins
 * pay for it: five rows at 160 + four gaps at 32 is 928 of the 930 that 90 and 60 leave.
 */
export const TOUCH_MENU_ROW_H_PX = TOUCH_BOX_PX;
export const TOUCH_MENU_GAP_PX = 32;
export const TOUCH_MENU_TOP_PX = 90;
export const TOUCH_MENU_BOTTOM_PX = 60;
/** Rows are wide targets on purpose: a thumb aiming at a level name has the whole row.  */
export const TOUCH_MENU_WIDTH_FRAC = 0.62;

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

/**
 * 🔴 `overlaps` and `touchTargetsDisjoint` are gone, and the reason is criterion 12.16 itself.
 *
 * `touchTargetsDisjoint` had **zero production consumers** — only its own unit test. Blanking it
 * to `return true` reddened nothing behavioural and left the game byte-identical on screen, which
 * is precisely the `spriteFeedback.ts` shape this project forbids. Found by the code review, twice
 * independently.
 *
 * It was also redundant. `touchTargetsFit`'s gap loop already refuses any overlapping pair:
 * `separation` returns 0 when two boxes overlap, and `0 * scale < 8` is false for no scale. A
 * layout that fits is a disjoint layout by construction, so the rule is enforced by the predicate
 * production actually calls rather than by a second one nothing did.
 */

/** The clear distance between two non-overlapping boxes, in game pixels. 0 if they touch or overlap. */
function separation(a: HitBox, b: HitBox): number {
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
export function touchTargetsFit(targets: readonly HitBox[], cssScale: number): boolean {
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
 * **The level menu, laid out for thumbs.**
 *
 * 🔴 `LevelSelectScene`'s keyboard layout puts rows on a `ROW_HEIGHT` of 68 game pixels, which is
 * **23.6 CSS px** at the worst in-scope scale of 0.347 — under half the floor this file sets for
 * every other target. Widening each row's hit area to 44 CSS px in place would overlap its
 * neighbours, so the rule and the layout would contradict each other. Named by the Codex plan
 * review, round 3.
 *
 * So on a touch device the rows get their own layout, and the keyboard layout is untouched on
 * desktop. The band deliberately leaves the screen title above and the hint line below alone.
 *
 * ⚠️ The row height SHRINKS to fit a longer catalog rather than overflowing the band, and that
 * CAN take a row under the floor. With the shipped five it does not — the band is sized so
 * that exactly five rows land at the full `TOUCH_BOX_PX`. A sixth level would push `rowH` to
 * 138 game px and the rows would be under-floor at every phone scale.
 *
 * 🔴 An earlier version of this paragraph said `touchTargetsFit` over the result *"is what says
 * so rather than a comment claiming it"*. **There was no such production call** — the only one
 * was in the unit test, against a hardcoded catalog size. `attachTapRoutes` now runs the
 * predicate over the targets it was actually given, which is what makes the sentence true.
 */
/**
 * **Is the rotate prompt up for a screen carrying `targets`?** The one definition, so the prompt and
 * the tap route it covers cannot disagree.
 *
 * 🔴 They did. `RotatePrompt` asked only about the play controls while `attachTapRoutes` asked about
 * both those and the route's own targets, so a screen whose OWN targets were under the floor had its
 * route silently killed with nothing on screen to explain it. That is not hypothetical: a sixth
 * catalog level pushes `touchMenuLayout`'s rows to 138 game px, under-floor at every phone scale
 * (see the note above), and the level menu would simply stop responding. Found by the Codex
 * implementation review, round 3.
 *
 * Two terms, and both are needed. The play-controls term is what makes the prompt appear on a
 * portrait phone at all, where a full-screen title zone is comfortably over the floor. The targets
 * term is what makes the prompt appear for a screen whose own targets are too small, where the play
 * controls would have fitted.
 */
export function rotatePromptWanted(
  viewWidth: number,
  viewHeight: number,
  canvasCssWidth: number,
  targets: readonly HitBox[],
): boolean {
  if (!(viewWidth > 0 && viewHeight > 0)) return false;
  const scale = cssScaleFor(canvasCssWidth, viewWidth);
  if (!touchTargetsFit(touchLayout(viewWidth, viewHeight), scale)) return true;
  // ⚠️ An EMPTY list is "this screen has no route of its own", not "this screen's targets do not
  // fit". `touchTargetsFit([])` is false — correctly, since a caller asking whether nothing fits has
  // asked the wrong question — so without this guard `UIScene`, which passes no targets, would show
  // the prompt on every frame at every viewport. Caught by two existing cases going red.
  if (targets.length === 0) return false;
  return !touchTargetsFit(targets, scale);
}

export function touchMenuLayout(count: number, viewWidth: number, viewHeight: number): HitBox[] {
  positive(viewWidth, 'viewWidth');
  positive(viewHeight, 'viewHeight');
  if (!Number.isInteger(count) || count <= 0) return [];

  const s = viewHeight / GAME_HEIGHT;
  const gap = TOUCH_MENU_GAP_PX * s;
  const bandTop = TOUCH_MENU_TOP_PX * s;
  const bandHeight = viewHeight - bandTop - TOUCH_MENU_BOTTOM_PX * s;
  const rowH = Math.min(TOUCH_MENU_ROW_H_PX * s, (bandHeight - (count - 1) * gap) / count);
  const total = count * rowH + (count - 1) * gap;
  const top = bandTop + Math.max(0, (bandHeight - total) / 2);
  const w = viewWidth * TOUCH_MENU_WIDTH_FRAC;
  const x = (viewWidth - w) / 2;

  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    x,
    y: top + i * (rowH + gap),
    w,
    h: rowH,
  }));
}
