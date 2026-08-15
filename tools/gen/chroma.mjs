/**
 * THE chroma keying module — vault **4.13** (blocker). One module, shared, never re-implemented.
 *
 * The vault's evidence, in its own terms:
 *
 *   > Key by **L1 colour distance with a tolerance, never equality**. Asked for `#FF00FF`, got
 *   > `~(252,1,252)` — only **0.004 %** of pixels were exactly pure. Working thresholds: a low/high
 *   > pair (**40** and **120**) plus despill, in **one shared module**. Judge specks by
 *   > **connected-component area (min 256 px)**, not `alpha > 0`.
 *
 * Two thresholds rather than one because a single cut produces a hard, aliased edge: below `LOW`
 * is certainly background, above `HIGH` is certainly subject, and the band between them is a ramp.
 * That band is also where the despill lives — a subject photographed against saturated green picks
 * up green in its edge pixels, and removing the key colour without removing the spill leaves a lime
 * halo that survives every metric because the pixels are opaque.
 *
 * ## The rule that is easy to get backwards
 *
 * `keepLargestComponent` is **safe for held and grounded poses and MUST NOT be applied to
 * `jump`, `fall` or `attack` states** *(vault 4.13)*. An airborne figure is legitimately more than
 * one connected component — a trailing coat, a raised arm crossing behind the torso, a weapon in
 * flight. "Keep the biggest blob" deletes those and the result still looks like a sprite, which is
 * why it passes review. `assertComponentPolicy` below makes the state name decide, so the choice
 * cannot be made per-call-site by whoever is writing the loop that day.
 *
 * Lives in `tools/gen/` as `.mjs` — see `png.mjs`'s header for why. The Gym reads the same
 * thresholds through `chromaThresholds()` so the overlay and the build agree by construction.
 */

/**
 * Re-exporting barrel — split into `chromaKey.mjs` (thresholds, key estimation, `keyOut`) and
 * `chromaComponents.mjs` (connected-component analysis and the policies built on it) to keep
 * each file under the 400-line limit. Precedent: `src/sim/enemies.ts` is a hybrid barrel over
 * four children. Every one of this module's 12 importers keeps importing from `chroma.mjs`
 * unchanged.
 */
export {
  CHROMA,
  chromaThresholds,
  keyDistance,
  hasRealAlpha,
  estimateKeyColour,
  borderKey,
  estimateFieldColour,
  keyOut,
} from './chromaKey.mjs';
export {
  components,
  trimHalo,
  dropCastShadow,
  removeSpecks,
  assertComponentPolicy,
  keepLargestComponent,
  multiComponentStates,
} from './chromaComponents.mjs';
