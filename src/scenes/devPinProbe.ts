/**
 * # The pin probe — draw the collision, and name what stopped the player
 *
 * `?pin=1`. Built for the invisible-blocker hunt: the owner has reported getting stuck in something
 * invisible four times, three fixes have shipped against it, and **nobody has ever put the stuck
 * state on screen**. Every previous attempt reasoned from level data. This one waits to be shown.
 *
 * It does three things:
 *
 *  1. **Draws every collision rectangle** — solids cyan, hazards red — over the level, so "there is
 *     nothing there" becomes a claim the screen can settle.
 *  2. **Reads out the live feet position**, so a screenshot carries its own coordinates.
 *  3. **Detects a stall and names its cause**, from the per-tick trace rather than from the
 *     post-frame world — see `trace.ts` for why the difference is not cosmetic.
 *
 * ## The wall-clock half, and why the tick half exists
 *
 * ⚠️ **Wall time alone is not a measure of simulation.** `drainTicks` caps a frame at
 * `MAX_TICKS_PER_FRAME` and **drops** the backlog, so after a 500 ms stall — a tab restore, a
 * breakpoint, a long GC — as little as 83 ms of simulation may actually have run. A detector that
 * counted only milliseconds would report a pin that never happened, on a machine that merely
 * hiccuped. So a stall needs BOTH: `STALL_MS` of eligible wall time **and**
 * `MIN_STALL_TICKS` consecutive eligible ticks, with the wall-clock accumulator reset whenever
 * `drainTicks` reports dropped ticks.
 *
 * The tick half lives in `stallAnalysis.ts` and is shared with the offline sweep, so the two cannot
 * classify the same evidence differently. Only the clock lives here, because the sim may not have one.
 */

import type Phaser from 'phaser';
import { devSeam } from '../debug/devSeam';
import { GAME_HEIGHT } from '../game/constants';
import { createStallDetector } from '../sim/stallAnalysis';
import type { StallIncident } from '../sim/stallAnalysis';
import { observeTicks } from '../sim/trace';
import type { TickTrace } from '../sim/trace';
import type { World } from '../sim/types';

/**
 * 🔴 **Magenta, not the editor's cyan.** The first cut used `0x4fb0c6` at `0.18` fill. The rectangles
 * rendered correctly — and the owner still reported "no rectangle, just nothing to see", because a
 * pale cyan wash at 18 % over this palette's dark blue-grey and brown brick is invisible, and the
 * one edge that WAS on screen sat exactly under the floor's own painted top edge. An overlay that is
 * technically drawing and practically unreadable is a broken instrument.
 *
 * Magenta appears nowhere in the steampunk palette, so any tint of it reads as "this is the overlay".
 * **Verify a colour change with a screenshot, never by asserting the object exists.**
 */
const SOLID_COLOUR = 0xff00ff;
const HAZARD_COLOUR = 0xff2200;
const SOLID_FILL = 0.22;
const HAZARD_FILL = 0.4;
const STROKE_PX = 6;
const RECT_DEPTH = 5;
const TEXT_DEPTH = 1000;

/** Eligible wall time before a stall is called. Paired with `MIN_STALL_TICKS`, never alone. */
export const STALL_MS = 500;

/** How many incidents stay on screen. The newest is what a screenshot needs; the rest give context. */
const KEEP = 4;

/**
 * Named so a test can assert the overlay is present — and, more importantly, ABSENT without the flag.
 * An unnamed `Graphics` cannot prove either.
 */
export const PIN_PROBE_RECTS = 'devPinProbe.rects';
export const PIN_PROBE_READOUT = 'devPinProbe.readout';

export interface PinProbe {
  /** Call once per rendered frame, with the ticks that frame actually simulated and any dropped. */
  update(deltaMs: number, ticks: number, dropped: number): void;
  /** Remove every listener and detach the trace observer. Idempotent. */
  destroy(): void;
}

function describe(hit: StallIncident): string {
  const where = `(${hit.x.toFixed(1)}, ${hit.y.toFixed(1)})`;
  const dir = hit.dir === 1 ? 'right' : hit.dir === -1 ? 'left' : 'none';
  const src = hit.damageSource ? `:${hit.damageSource}` : '';
  // 🔴 `geometry` is the analyzer's LAST resort and `unexplained` sits below it. Spelling that out
  // on screen matters: a probe that always names something teaches the reader to trust a guess.
  const verdict =
    hit.cause === 'unexplained'
      ? 'NOTHING EXPLAINS THIS STOP'
      : `cause=${hit.cause}${src}`;
  return `#${hit.id} tick ${hit.tick} feet ${where} dir=${dir} ${verdict} (${hit.ticks} ticks)`;
}

/**
 * Attach the probe to a scene and a world.
 *
 * The trace observer is registered against THIS world, so a scene transition or `derivedFeel`'s
 * scratch worlds cannot leak ticks into the readout.
 */
export function createPinProbe(scene: Phaser.Scene, world: World): PinProbe {
  devSeam('__DEVSEAM_devPinProbe_createPinProbe__');
  /**
   * 🔴 **One `Rectangle` per rect, NOT a `Graphics` with `strokeRect`.**
   *
   * The first cut used `scene.add.graphics()` and drew every rect into it. The object existed, was
   * `visible`, had `alpha` 1 and sat at depth 5 above the tile layer — and drew **nothing at all** on
   * screen. The owner played a whole session against that overlay and reported "no rectangle, just
   * nothing to see", which reads exactly like the bug being hunted. An instrument that asserts its
   * own existence and draws nothing is the zero-particle burst from `CLAUDE.md` §2, and it cost a
   * playtest.
   *
   * `ElementEditorScene` has drawn `world.solids` this way since Phase 2 and is known to work. This
   * is that code. **Do not "simplify" it back into a single `Graphics`** without a screenshot.
   */
  const rects: Phaser.GameObjects.Rectangle[] = [];
  const draw = (
    r: { x: number; y: number; w: number; h: number },
    colour: number,
    fill: number,
  ): void => {
    rects.push(
      scene.add
        .rectangle(r.x, r.y, r.w, r.h, colour, fill)
        .setOrigin(0, 0)
        .setStrokeStyle(STROKE_PX, colour, 1)
        .setDepth(RECT_DEPTH)
        .setName(PIN_PROBE_RECTS),
    );
  };
  for (const solid of world.solids) draw(solid, SOLID_COLOUR, SOLID_FILL);
  // Hazards last and louder, so a hazard sitting on top of a solid is never hidden by it.
  for (const hazard of world.hazards) draw(hazard, HAZARD_COLOUR, HAZARD_FILL);

  const readout = scene.add
    .text(24, GAME_HEIGHT - 220, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffd479',
      backgroundColor: '#000000cc',
      padding: { x: 10, y: 8 },
    })
    .setScrollFactor(0)
    .setDepth(TEXT_DEPTH)
    .setName(PIN_PROBE_READOUT);

  const detector = createStallDetector();
  const incidents: string[] = [];
  let last: TickTrace | null = null;
  let stallMs = 0;

  const dispose = observeTicks(world, (trace) => {
    last = trace;
    const hit = detector.observe(trace);
    if (hit !== null) {
      incidents.unshift(describe(hit));
      incidents.length = Math.min(incidents.length, KEEP);
    }
  });

  return {
    update(deltaMs: number, ticks: number, dropped: number): void {
      if (dropped > 0 || ticks === 0) {
        // A frame that dropped ticks measured wall time the simulation never spent. A frame that
        // ran none measured nothing at all. Neither may accumulate toward a stall.
        stallMs = dropped > 0 ? 0 : stallMs;
      } else if (detector.current() !== null || (last !== null && last.rawDir !== 0)) {
        stallMs += deltaMs;
      } else {
        stallMs = 0;
      }

      const t = last;
      const head = t
        ? `tick ${t.tick}  feet (${t.x.toFixed(1)}, ${t.y.toFixed(1)})  v (${t.vx.toFixed(2)}, ${t.vy.toFixed(2)})\n` +
          `${t.state}  grounded=${t.grounded}  dir raw=${t.rawDir} eff=${t.effectiveDir}  stall=${Math.round(stallMs)}ms`
        : 'waiting for the first tick';
      readout.setText([head, ...incidents].join('\n'));
    },

    destroy(): void {
      dispose();
      for (const r of rects) r.destroy();
      rects.length = 0;
      readout.destroy();
    },
  };
}
