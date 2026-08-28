/**
 * Step 13 of the tick contract, moved out whole.
 *
 * ⚠️ **The BLOCK moved, the NUMBERING did not** — the same move steps 5-8 made into
 * `playerMotion.ts`, for the same reason and under the same rule. `tick.ts` still calls this at
 * position 13 and `tick.ts`'s numbered header is unchanged. Renumbering the contract is a balance
 * change, not a refactor.
 *
 * It came out here to make room for the per-tick trace emission (`trace.ts`) without pushing
 * `tick.ts` past the 400-line limit `tests/unit/file-size.test.ts` enforces. Nothing about the
 * behaviour changed; the reasoning below is the original, verbatim.
 *
 *
 *     ONE RULE, applied to both windows:
 *
 *       > A window does not spend a tick on which step 8 could not yet see the fact that tick
 *       > established.
 *
 *     Step 8 runs before step 10 resolves collisions, so it necessarily tests LAST tick's
 *     grounded flag. Two ticks are therefore not real chances to jump, and charging the window
 *     for them makes a knob of `N` behave like `N - 1`:
 *
 *       - the tick the player walks off a ledge — coyote is armed at step 11, after step 8 ran;
 *       - the tick the player touches down — the buffer was tested at step 8 while `grounded`
 *         was still false, so the buffered jump actually fires on the following tick.
 *
 *     Codex plan review F5 predicted the first and this implementation had it; `coyote-time.
 *     test.ts` then caught the second, which is the same defect mirrored. Both endpoints of
 *     both windows are asserted there against the live knob.
 *
 *     The `advanceWindow` call is the shared saturating increment from `windows.ts`; the guard in
 *     front of it — WHETHER this tick is spent at all — is the step-order rule above and stays
 *     here, with the numbered order that owns it.
 *     🔴 **A FROZEN tick is not spent either** (Phase 9): step 7 did not run at all. Ungated, a
 *     9-tick `lethal` freeze saturated both knobs from inside itself and ate the press. `motionRan`
 *     and NOT `frozen()` — `PlayerMotion.ran` says why they differ on the arming tick.
 */

import { advanceWindow } from './windows';
import type { PlayerSim, TuningKnobs } from './types';

export function advanceTickWindows(
  player: PlayerSim,
  tuning: TuningKnobs,
  coyoteArmedThisTick: boolean,
  landed: boolean,
  motionRan: boolean,
): void {
if (!coyoteArmedThisTick && motionRan) {
  player.ticksSinceGrounded = advanceWindow(player.ticksSinceGrounded, tuning.coyoteTicks);
}
if (!landed && motionRan) {
  player.ticksSinceJumpPressed = advanceWindow(
    player.ticksSinceJumpPressed,
    tuning.jumpBufferTicks,
  );
}
}
