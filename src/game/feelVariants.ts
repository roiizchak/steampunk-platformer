/**
 * Playable movement-speed variants, for judging how fast the character should move BY EYE.
 *
 * ## What this is now, and what it was
 *
 * The user reported the character "moves too fast, like a ghost". Those were two complaints:
 *
 *  - **like a ghost** was FOOT-SLIDE, and it was a defect. Locomotion cadence was DERIVED from a
 *    measured `stridePxPerCycle`, the declared strides were larger than the strides the art draws,
 *    and the body therefore covered more ground per cycle than the feet described. Measured: 17 %
 *    of every step on run, 13 % on walk. **Fixed at the source** — cadence is authored now
 *    (`character-bounds.json` -> `animations.<name>.fps`); see `src/render/animTiming.ts`'s header.
 *  - **too fast** is a preference, and it is what these variants are still for.
 *
 * This file originally carried a second knob, `strideScale`, because correcting the stride was the
 * only route to the frame rate. It is pinned at 1 now and a test asserts it: scaling cadence
 * independently of speed would put the slide straight back.
 *
 * ## Why speed alone is safe
 *
 * Foot travel per frame is a property of the ART and cannot change. For zero slide the body must
 * advance exactly that far per frame — and it does at every speed, because `tunedSimTicks` divides
 * by `speedScale`, so `fps` scales by the same factor and `ticksPerFrame * topSpeed` is invariant.
 * Choosing a speed therefore cannot re-break the feet.
 *
 * ## Why a runtime switch rather than three builds
 *
 * Because *(HANDOFF §14)* **only a same-session interleaved A/B decides anything** on this project.
 * Absolute readings moved four times in one session on unchanged code. Three sequential rebuilds
 * cannot be interleaved; a query parameter can be flipped back and forth in seconds.
 *
 * **DEV only.** `GameScene` applies it behind `import.meta.env.DEV`, so it is tree-shaken out of
 * `dist/` — verified by string literal, not identifier grep (finding T8).
 */

/** One playable movement speed. */
export interface FeelVariant {
  readonly id: string;
  readonly label: string;
  /** Multiplies `runMax` and `walkMax`. 1 leaves the shipped speed alone. */
  readonly speedScale: number;
  /**
   * ⚠️ **Pinned at 1, and a test enforces it.** It exists only so the invariant is expressible and
   * greppable: moving cadence independently of speed re-creates the foot-slide. See the header.
   */
  readonly strideScale: number;
}

/**
 * 0 is the shipped control and MUST stay first — an A/B with no control is the mistake that made
 * this project's first parallax measurement meaningless.
 */
export const FEEL_VARIANTS: readonly FeelVariant[] = [
  { id: '0', label: 'shipped (control)', speedScale: 1, strideScale: 1 },
  { id: '1', label: '15% slower', speedScale: 0.85, strideScale: 1 },
  { id: '2', label: '25% slower', speedScale: 0.75, strideScale: 1 },
] as const;

/**
 * 🔴 **`strideScale` is 1 everywhere now, and that is the point.**
 *
 * These variants originally moved a `strideScale` because locomotion cadence was DERIVED from a
 * measured stride, and correcting that stride was the only way to reach the frame rate. Cadence is
 * authored now (`character-bounds.json` -> `animations.<name>.fps`), tuned once against the running
 * character, so scaling it here would REINTRODUCE the foot-slide these variants exist to remove.
 *
 * What remains is one honest knob: speed. Cadence follows it automatically, because
 * `tunedSimTicks` divides by `speedScale` — so `fps` scales by exactly the same factor, body travel
 * per frame is unchanged, and the feet stay planted at every speed. The user chooses how fast the
 * character moves; they do not have to re-solve the sliding problem to do it.
 */

/**
 * The only sheets a variant re-paces: the player's two locomotion loops.
 *
 * Everything else is deliberately excluded. `idle` is an authored breathing period; `jump` and
 * `fall` are derived from airtime; and `attack` / `hurt` / `death` carry `simTicks` values that are
 * **combat windows written against `tick.ts`'s numbered step order**. Re-pacing one of those would
 * be a balance change wearing an animation change's clothes — the exact confusion vault 4.22 exists
 * to prevent.
 */
export const LOCOMOTION_KEYS: ReadonlySet<string> = new Set([
  'brass-courier-walk',
  'brass-courier-run',
]);

/** The variant named by `?feel=`, or the shipped control when absent or unrecognised. */
export function variantFromSearch(search: string): FeelVariant {
  const id = new URLSearchParams(search).get('feel');
  return FEEL_VARIANTS.find((v) => v.id === id) ?? FEEL_VARIANTS[0]!;
}

/**
 * Re-pace a locomotion cycle under a variant.
 *
 * Dividing the catalog's `simTicks` by `speedScale` scales `fps` by exactly that factor, which is
 * what keeps body travel per frame — and therefore the feet — unchanged at any speed.
 *
 * Clamped at 1: a zero would divide by zero in `deriveFps` and a negative is meaningless.
 */
export function tunedSimTicks(simTicks: number, variant: FeelVariant): number {
  return Math.max(1, Math.round((simTicks * variant.strideScale) / variant.speedScale));
}

/**
 * The frame rate a variant implies, derived exactly as the shipped rule does:
 * `fps = renderFrames * TICK_HZ / simTicks` *(vault 4.22)*. Never authored, here or anywhere.
 */
export function tunedFps(frameCount: number, simTicks: number, variant: FeelVariant): number {
  return (frameCount * 60) / tunedSimTicks(simTicks, variant);
}
