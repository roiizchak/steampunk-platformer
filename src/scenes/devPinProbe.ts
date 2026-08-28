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

const SOLID_COLOUR = 0x4fb0c6;
const HAZARD_COLOUR = 0xe0553a;
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
  const rects = scene.add.graphics().setDepth(RECT_DEPTH).setName(PIN_PROBE_RECTS);
  rects.lineStyle(3, SOLID_COLOUR, 0.9);
  for (const s of world.solids) {
    rects.strokeRect(s.x, s.y, s.w, s.h);
  }
  rects.lineStyle(3, HAZARD_COLOUR, 0.95);
  for (const h of world.hazards) {
    rects.strokeRect(h.x, h.y, h.w, h.h);
  }

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
      rects.destroy();
      readout.destroy();
    },
  };
}
