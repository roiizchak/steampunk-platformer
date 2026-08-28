/**
 * # Merge collision strips that abut on the same surface
 *
 * ## The defect this exists to prevent
 *
 * Two solid rectangles that share a top edge and touch exactly — `a.x + a.w === b.x`, `a.y === b.y` —
 * draw as one continuous platform and collide as two. The player's horizontal resolver then treats
 * the neighbour as a **wall**:
 *
 *  - while grounded, gravity (step 6) runs before collision (step 9), so the body sits `0.675 px`
 *    inside its own floor when the horizontal pass runs — every floor rect it spans is a wall
 *    candidate for that pass;
 *  - `wasLeft` is a **closed** comparison (`previousX + rightOffset <= solid.x`), so once the body is
 *    snapped flush against the seam it re-fires every tick, forever.
 *
 * The player stops dead on open floor, holding the key, in the `idle` pose, and only a jump gets
 * them past. Reported "FOUR times" — the owner's own words at the time of what was in fact the
 * fifth report. Either count is defensible; what matters is that three fixes shipped and none of
 * them was the thing.
 * Confirmed on screen 2026-08-28 at level-02 feet `(8190, 1632)` and level-03 `(10686, 1536)`.
 *
 * ## Why the fix is here and not in the resolver
 *
 * The resolver latch is real and remains a **latent defect**, tracked separately. But
 * `resolveCollisions` is what the tick contract and every combat window rest on, and the safe
 * tolerance fix has a documented inverse failure — give the horizontal pass a foot tolerance and the
 * player can enter a low ledge the vertical pass will not land them on, and fall through it.
 *
 * Merging the data removes the trigger with **zero** simulation risk. It also keeps the platform
 * widening that introduced the seams, which was itself a real fix — those platforms were widened so
 * the player had somewhere to stand instead of being pinned in the spikes.
 *
 * ⚠️ **This is a trigger fix, not the root cause.** `no-flush-seams.test.ts` is what keeps the class
 * from coming back; do not delete it because "the builder handles it now".
 */

/**
 * Merge adjacent strips that share a top edge, a height, and a boundary.
 *
 * 🔴 **Order is preserved and merging never reorders.** `levelObjects.mjs` documents that the strip
 * the player spawns on must be collision object 0, because `phase-03-element-editor.spec.ts` asserts
 * `spawnStrip === 0`. The survivor is always the **lower-indexed** strip, so index 0 keeps its
 * identity.
 *
 * ⚠️ That invariant is stated in the code, not merely intended. The first version scanned every
 * ordered pair and merged only when `out[i]` was geometrically LEFT of `out[j]` — so a right-hand
 * strip appearing earlier in the array was the one spliced out, and the survivor's index was
 * whichever side happened to be left. The shipped data was safe by accident (strip 0 starts at
 * `x=0`, and nothing of positive width can abut it from the left), which is exactly the kind of
 * accident that stops being true when someone adds a level. Caught by the Codex implementation
 * review. The inner loop now starts at `i + 1` and merges adjacency in **either** direction, and
 * the survivor is `out[i]` by construction.
 *
 * Strips of the same top edge but a DIFFERENT height are deliberately left alone: fusing them would
 * invent collision where the author put none. `no-flush-seams.test.ts` fails the build on that case
 * rather than letting it ship — a loud stop beats a clever guess.
 *
 * @param {{x:number,y:number,w:number,h:number}[]} strips
 * @returns {{x:number,y:number,w:number,h:number}[]}
 */
export function mergeStrips(strips) {
  const out = strips.map((s) => ({ ...s }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i];
        const b = out[j];
        if (a.y !== b.y || a.h !== b.h) continue;
        // Either order of adjacency, but the SURVIVOR is always `out[i]` — the lower index.
        const left = a.x + a.w === b.x ? a : b.x + b.w === a.x ? b : null;
        if (left === null) continue;
        out[i] = { x: left.x, y: a.y, w: a.w + b.w, h: a.h };
        out.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  return out;
}
