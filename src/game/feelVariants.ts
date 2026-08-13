/**
 * Playable locomotion-feel variants, for judging speed and foot-slide BY EYE.
 *
 * ## Why this exists
 *
 * The user reported the character "moves too fast, like a ghost". Those are two different
 * complaints and only one of them is a preference:
 *
 *  - **too fast** is a preference about `runMax` / `walkMax`.
 *  - **like a ghost** is FOOT-SLIDE, and it is a defect: the declared `stridePxPerCycle` is larger
 *    than the stride the art actually draws, so the body covers more ground per cycle than the feet
 *    describe and the character skates.
 *
 * 🔴 **Slowing the character down does NOT fix the slide.** `simTicks = round(stride / topSpeed)`,
 * so ground travel per cycle equals the declared stride at ANY speed. Halve the speed and the feet
 * slip by exactly the same percentage, just more slowly. The two knobs are independent and both are
 * needed, which is the whole reason this file has two scales rather than one.
 *
 * ## Why the stride is not simply corrected in `character-bounds.json`
 *
 * Because four independent measurements of the shipped art disagree by ~20 %:
 *
 * | method | walk | run |
 * |---|---|---|
 * | declared | 254 | 320 |
 * | foot-band span x2 (the documented one) | 250 | 94 — the method cannot see a run |
 * | planted-blob tracking | 222 | 269 |
 * | cross-correlation | 202 | 285 |
 * | contact-row bands 3/5/8 px | 156 / 179 / 199 | 271 / 219 / 214 |
 *
 * Every method agrees the declared numbers are too HIGH; none agrees on by how much. That is vault
 * 4.18's INDETERMINATE condition, and `character-bounds.json`'s own `_strideLevelledAnchor` note
 * already says of run: *"Treat 320 as PROVISIONAL, settle it in the Gym against the running
 * character, and expect run foot-slide as the observable if it is wrong."* This is that settling,
 * done against the running character as instructed rather than by picking a number off a spreadsheet.
 *
 * ## Why a runtime switch rather than three builds
 *
 * Because *(HANDOFF §14)* **only a same-session interleaved A/B decides anything** on this project.
 * Absolute readings moved four times in one session on unchanged code. Three sequential rebuilds
 * cannot be interleaved; a query parameter can be flipped back and forth in seconds.
 *
 * **DEV only.** Nothing here is imported by a production path — `GameScene` applies it behind
 * `import.meta.env.DEV`, so it is tree-shaken out of `dist/` and `verify-dist` stays green.
 */

/** One playable combination of movement speed and animation pacing. */
export interface FeelVariant {
  readonly id: string;
  readonly label: string;
  /** Multiplies `runMax` and `walkMax`. 1 leaves the shipped speed alone. */
  readonly speedScale: number;
  /**
   * Multiplies the declared stride. Below 1 means "the art's real stride is shorter than declared",
   * which shortens `simTicks` and therefore plays the cycle FASTER — the animation gets smoother,
   * not choppier, which is the opposite of what slowing the character does.
   */
  readonly strideScale: number;
}

/**
 * 0 is the shipped control and MUST stay first — an A/B with no control is the mistake that made
 * this project's first parallax measurement meaningless.
 *
 * `strideScale` 0.85 sits inside the measured spread for both animations (walk 254 -> 216 against
 * readings of 199-250; run 320 -> 272 against 269-285) rather than at either extreme, because the
 * point is to find out whether the direction is right by eye before committing a number.
 */
export const FEEL_VARIANTS: readonly FeelVariant[] = [
  { id: '0', label: 'shipped (control)', speedScale: 1, strideScale: 1 },
  { id: '1', label: 'stride corrected, same speed', speedScale: 1, strideScale: 0.85 },
  { id: '2', label: 'stride corrected, 25% slower', speedScale: 0.75, strideScale: 0.85 },
] as const;

/**
 * The only sheets a variant re-paces: the player's two STRIDE-DERIVED locomotion cycles.
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
 * `simTicks = round(stride / topSpeed)`, so scaling stride by `s` and speed by `p` gives
 * `round(simTicks * s / p)` **without needing the stride itself** — which matters because the
 * stride lives in `character-bounds.json` and is not loaded at runtime (the catalog has no field
 * for it; see `gameAnimations.ts`).
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
