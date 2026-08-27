import { CAMERA_ZOOM, MS_PER_TICK } from '../game/constants';
import type { LevelData } from '../game/tilemap';
import type { Rect } from '../sim/types';

/**
 * Camera decisions, engine-free *(vault 2.12)*.
 *
 * Phaser owns the mechanism — `setBounds` already clamps scrolling, and reimplementing that here
 * would be a second copy of something the engine does correctly. What lives here is the *inputs*
 * (what bounds, what zoom, how much smoothing) and the two *predicates* that say whether the
 * result is right.
 *
 * Both predicates are imported by `tests/unit/camera-rig.test.ts` **and**
 * `tests/e2e/phase-03-tilemap.spec.ts`. That is deliberate: criterion 3.4 is then asserted against
 * one definition instead of a unit-test version and a subtly different browser version that agree
 * about the happy path and diverge exactly where a bug would live.
 */

/** What the scene hands Phaser. */
export interface CameraSetup {
  /** `setBounds` — the scrollable world, taken from the level's measured pixel extent. */
  bounds: Rect;
  zoom: number;
  lerpX: number;
  lerpY: number;
}

/**
 * Follow smoothing, **per rendered frame at 240 Hz** — the rate this was tuned at.
 *
 * 🔴 It is not the value handed to Phaser any more. Read `followLerpForFrame` before changing it.
 */
const FOLLOW_LERP_AT_240HZ = 0.12;

/** Rendered frames per 60 Hz tick on the box the value above was tuned on. */
const TUNED_FRAMES_PER_TICK = 4;

/**
 * The share of the remaining distance the camera closes in ONE 60 Hz tick.
 *
 * Derived, never typed *(vault 5.3)*: it is exactly what four applications of
 * `FOLLOW_LERP_AT_240HZ` come to, so `followLerpForFrame` reproduces the tuned behaviour bit for
 * bit at 240 Hz and merely *extends* it to every other display rate.
 */
export const FOLLOW_LERP_PER_TICK = 1 - (1 - FOLLOW_LERP_AT_240HZ) ** TUNED_FRAMES_PER_TICK;

/**
 * **Phaser applies the follow lerp ONCE PER RENDERED FRAME, so a fixed value is a frame-rate
 * dependency — and this one was tuned on a 240 Hz box.**
 *
 * ## The defect, measured
 *
 * `Camera.preRender` does `scrollX += (target - scrollX) * lerp.x` every frame it draws. With a
 * constant 0.12 the camera's time constant is `frameMs / 0.12`, which is **35 ms at 240 Hz and
 * 139 ms at 60 Hz**. The camera is four times less responsive on a 60 Hz screen than on the one
 * every tuning decision in this project was made on. Modelled against `DEFAULT_TUNING`:
 *
 * | display | trails a running player | character swing per jump |
 * |---|---|---|
 * | 240 Hz (the tuning box) | 16.5 px | 96 px — 8.9 % of screen height |
 * | 144 Hz | 27.5 px | 143 px — 13.2 % |
 * | **60 Hz** | **65.9 px** | **264 px — 24.5 %** |
 *
 * The character is the one object the player's eye is locked onto, and at 60 Hz it drifts a
 * quarter of the screen on every jump while the world scrolls underneath it. Two independent
 * motions on the thing you are tracking is what "smeared while moving" means. Reported from a
 * hands-on playthrough of the production build — **no gate could have found it**, because every
 * gate in this repository runs on a box that renders at ~240 fps *(vault C4)*.
 *
 * ## The fix, and why the exponent rather than a multiply
 *
 * A lerp is exponential decay: after `n` applications the remaining distance is `(1 - L)^n`. So
 * the frame-rate-independent form asks for the fraction that leaves the SAME remainder over the
 * elapsed time, which is `1 - (1 - L_perTick)^(elapsed in ticks)`.
 *
 * ⚠️ **Not `L * deltaMs / MS_PER_TICK`.** The naive multiply is the same trap `src/sim/` bans
 * outright: it is a first-order approximation that diverges as the frame gets longer, and at a
 * long frame it exceeds 1 and makes the camera overshoot its target — a snap, in the exact
 * conditions (a stalled frame) where a snap is most visible.
 *
 * At 240 Hz this returns 0.12 exactly, so the tuned feel is preserved and not merely approximated.
 * Clamped to `[0, 1]`: a non-finite or negative delta contributes nothing rather than poisoning
 * `scrollX` with `NaN`, for the same reason `drainTicks` guards its own input — Phaser hands out
 * NaN deltas after a tab restore, and a NaN scroll blanks the view instead of failing loudly.
 */
export function followLerpForFrame(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
  const ticks = deltaMs / MS_PER_TICK;
  const closed = 1 - (1 - FOLLOW_LERP_PER_TICK) ** ticks;
  return closed > 1 ? 1 : closed;
}

/**
 * Bounds and zoom for a level, or a throw if the level is too small to scroll.
 *
 * **The throw is vault 3.2, mechanised.** That lesson is a side-scroller that shipped with 10 px
 * of scroll room because its world width came from an aspect *label* rather than a measurement —
 * *"for a side-scroller this is the single most load-bearing asset-pipeline number there is."*
 * A camera with nothing to scroll to looks identical to a camera that works, so the failure is
 * invisible until level design, phases later. Here it is a loud error at load.
 *
 * Each axis is checked separately and names itself, because a level that is wide enough and
 * exactly viewport-tall is the vertical half of the same defect.
 */
export function cameraSetup(level: LevelData, viewportW: number, viewportH: number): CameraSetup {
  const viewW = viewportW / CAMERA_ZOOM;
  const viewH = viewportH / CAMERA_ZOOM;

  if (level.widthPx <= viewW) {
    throw new Error(
      `level ${level.id}: width ${level.widthPx}px leaves no horizontal camera travel at zoom ` +
        `${CAMERA_ZOOM} (view is ${viewW}px). A side-scroller that cannot scroll (vault 3.2).`,
    );
  }
  if (level.heightPx <= viewH) {
    throw new Error(
      `level ${level.id}: height ${level.heightPx}px leaves no vertical camera travel at zoom ` +
        `${CAMERA_ZOOM} (view is ${viewH}px). A side-scroller that cannot scroll (vault 3.2).`,
    );
  }

  return {
    bounds: { x: 0, y: 0, w: level.widthPx, h: level.heightPx },
    zoom: CAMERA_ZOOM,
    // The value `startFollow` is seeded with. It is overwritten every frame by
    // `followLerpForFrame` — see its header — so this is only what the camera uses before the
    // first `update()`. Seeding it with the per-TICK figure rather than the old per-frame 0.12
    // keeps that single frame in the right ballpark on any display.
    lerpX: FOLLOW_LERP_PER_TICK,
    lerpY: FOLLOW_LERP_PER_TICK,
  };
}

/**
 * Is the visible world rectangle entirely inside the map? Criterion 3.4's "never shows outside".
 *
 * Takes Phaser's own `camera.worldView` in the e2e spec, so it judges what was actually rendered
 * rather than what the scene intended.
 */
export function viewFits(bounds: Rect, worldView: Rect): boolean {
  return (
    worldView.x >= bounds.x &&
    worldView.y >= bounds.y &&
    worldView.x + worldView.w <= bounds.x + bounds.w &&
    worldView.y + worldView.h <= bounds.y + bounds.h
  );
}

/**
 * Is the follow target comfortably inside the view — i.e. is the camera actually *following*?
 *
 * Codex plan review P6: containment plus "scrollX increased" is satisfied by a scripted pan that
 * ignores the player completely, so criterion 3.4 needed a predicate about the target. `insetPx`
 * is what makes it fail *before* the player is literally off screen.
 *
 * Deliberately not "the target is at the view centre". Phaser clamps scroll at the map edges, so
 * near a boundary the player is legitimately far off centre — a centring assertion would go red
 * on a correct camera at spawn, which is exactly the kind of false red this suite has already
 * paid for twice.
 */
export function tracksTarget(
  worldView: Rect,
  targetX: number,
  targetY: number,
  insetPx: number,
  bounds?: Rect,
): boolean {
  // On a side where the view is already flush against the map, the inset is DROPPED to zero.
  //
  // Without this the predicate and `viewFits` are jointly unsatisfiable, and criterion 3.4 asserts
  // both. Measured on the shipped level: the map is 2112 px tall, the view 1080, and the walking
  // surface sits at y 1920 — so a grounded player is 192 px above the world's bottom edge while
  // the camera, clamped by `viewFits`, cannot open more than that. Demanding a 200 px margin there
  // is demanding the camera leave the map. It failed on 200 of 200 sampled frames, on a camera
  // that was tracking correctly.
  //
  // Dropping to zero is the honest floor rather than a smaller fudge: where the camera has no
  // freedom, the only thing it can be held to is that the player is on screen at all. Every side
  // the camera CAN still move keeps the full inset, which is where following is actually in
  // question — in a side-scroller, the horizontal axis for almost the whole level.
  //
  // `bounds` is optional so the predicate keeps its old meaning when a caller has no map to
  // measure against, which is what the existing unit fixtures exercise.
  const flush = (atEdge: boolean) => (atEdge ? 0 : insetPx);
  const left = flush(bounds !== undefined && worldView.x <= bounds.x);
  const right = flush(bounds !== undefined && worldView.x + worldView.w >= bounds.x + bounds.w);
  const top = flush(bounds !== undefined && worldView.y <= bounds.y);
  const bottom = flush(bounds !== undefined && worldView.y + worldView.h >= bounds.y + bounds.h);

  return (
    targetX > worldView.x + left &&
    targetX < worldView.x + worldView.w - right &&
    targetY > worldView.y + top &&
    targetY < worldView.y + worldView.h - bottom
  );
}
