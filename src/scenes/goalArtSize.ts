/**
 * The exit gate's DRAWN size, in world pixels — deliberately larger than the rect it triggers on.
 *
 * A separate module because it is needed on both sides of a boundary that must not be crossed:
 * `src/scenes/goalLayer.ts` draws with it, and `tools/gen/buildChrome.mjs` authors the PNG at it.
 * The scene file imports Phaser and the build tool runs under plain node, so neither can import the
 * other; a number written down twice is how two files quietly stop agreeing *(vault 5.3)*, and here
 * the disagreement would be silent — the image would simply be rescaled at draw time and nothing
 * would fail.
 *
 * 🔴 **Why it is not the goal rect.** The rect is 192 x 288 and the courier's box is `PLAYER_BOX`
 * 22 x 48 at `RENDER_SCALE` 6 = 132 x 288 — so art authored at the rect's size stands exactly as
 * tall as the character walking through it and reads as a hatch, not a doorway. 288 x 432 keeps the
 * source art's 2:3 aspect, stands 1.5x the courier's height, and is 3 grid cells wide.
 *
 * The TRIGGER is unchanged. `drawGoal` anchors this bottom-centre on the rect, so the door stands on
 * the threshold the sim tests and grows upward from it. Containment is an exact vertical equality
 * against the rect's 288 (`src/sim/goal.ts`) and nothing about the art may alter it.
 */
export const GATE_PX = { w: 288, h: 432 } as const;
