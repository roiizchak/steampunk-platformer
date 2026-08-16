/**
 * The SPLIT batch a render frame actually runs — pulled out of `GameScene.update()` so its edge
 * case is reachable from a unit test *(vault 2.12)*.
 *
 * ## What the split is for
 *
 * A render frame can drain several sim ticks. The interpolator needs the state immediately before
 * the **last** tick, not before the whole batch — snapshotting before the batch adds a frame of
 * render lag at any refresh rate above 60 Hz, which the Phase 2 Codex plan review rejected
 * (finding 1). So the batch runs as `ticks - 1`, then a snapshot, then `1`.
 *
 * ## 🔴 The defect this file exists to fix
 *
 * `GameScene.update()` ran that split and **threw away the first call's return value**, keeping only
 * the last tick's events. Every edge produced by the first `ticks - 1` ticks was silently lost: at
 * 30 Hz — a routine frame rate, not a stall — half of all events simply never reached the renderer.
 *
 * It shipped in Phase 5 and no Phase 5 gate saw it, because the events that matter most there
 * (`hitLanded`, `attackStarted`) are cosmetic, and a cosmetic edge going missing on some frames
 * looks like art, not like a bug. Codex's Phase 6 plan review found it by reading (finding F8), while
 * looking for the reason a collect tween might intermittently not appear.
 *
 * It is fixed **here**, in the one place both halves of the batch meet, rather than in the caller
 * that happened to notice — the same reason `advance()` walks its record instead of naming fields.
 */

import { advance, noEvents } from './tick';
import type { AdvanceEvents, InputSnapshot, TickEvents, World } from './types';

/**
 * OR two event records together.
 *
 * Walked from the record itself, never a list of named fields. `advance()` learned that the hard
 * way: it assigned three fields by name while `TickEvents` had grown to seven, and the four it
 * forgot read as permanently `false` in the only production caller. A field added to `TickEvents` is
 * merged here the moment `noEvents()` declares it.
 */
export function mergeEvents(a: AdvanceEvents, b: AdvanceEvents): AdvanceEvents {
  const merged = noEvents();
  for (const key of Object.keys(merged) as (keyof TickEvents)[]) {
    merged[key] = a[key] || b[key];
  }
  return merged;
}

/**
 * Run one render frame's worth of ticks as `ticks - 1` then `1`, calling `beforeLastTick` in the gap.
 *
 * Returns the events from **every** tick in the frame, not just the last one.
 *
 * `beforeLastTick` is where the caller takes its interpolation snapshot. It is a callback rather
 * than a returned position because the scene snapshots two different things — the player and every
 * enemy — and both must be captured at the same instant; handing back one of them would invite a
 * second, drifting capture point for the other.
 *
 * `ticks === 0` is legal and meaningful: a frame too short to produce a whole tick. It still calls
 * `advance(..., 0)`, which must NOT consume the input snapshot *(vault 2.4)*, and it does not
 * snapshot — there is no tick to interpolate towards.
 */
export function advanceSplit(
  world: World,
  input: InputSnapshot,
  ticks: number,
  beforeLastTick: () => void,
): AdvanceEvents {
  if (ticks <= 0) {
    return advance(world, input, 0);
  }
  const early = ticks > 1 ? advance(world, input, ticks - 1) : noEvents();
  beforeLastTick();
  const last = advance(world, input, 1);
  return mergeEvents(early, last);
}
