/**
 * The drawn-sprite / sim sampler behind criterion 4.23.
 *
 * Split out of `phase-04-assets.spec.ts` on 2026-08-17, when that file crossed the 400-line rule
 * after 4.23 was rewritten to predict the drawn position exactly rather than bound it. Same seam,
 * and for the same reason, as `hudHelpers.ts`: the spec states WHAT the criterion claims, this file
 * is HOW a frame is observed.
 *
 * Everything here reads the live scene tree through `window.__phaserGame` — dev-only, and the same
 * handle every other spec uses to assert that the DRAWN object tracks the sim. Phase 2 proved that
 * gap is real: deleting `renderPlayer()` once left the whole Phase 2 suite green, because every
 * other assertion read `__game`, which the scene writes directly.
 */

export interface Sample {
  simY: number;
  /**
   * Sim vertical speed, px/tick.
   *
   * Kept as the record of what 4.23 used to be judged on and no longer is — every claim below is
   * now derived from `prevY` and `accumMs`. It is deliberately read by nothing: an earlier version
   * of this docstring said "reported in the failure messages", which was untrue, and a field that
   * claims a use it does not have is the same defect class as a citation that claims a
   * justification it does not carry.
   */
  simVy: number;
  /**
   * The player's sim `y` immediately BEFORE the most recent tick — `GameScene.prevPlayer.y`, the
   * exact value `interpolatedPosition` blends FROM. `null` before the first tick and after a
   * respawn, which is `prevPlayer`'s own way of saying "there is no previous position".
   */
  prevY: number | null;
  /**
   * `GameScene.accumulatorMs` — the real time carried since the last whole tick, which is the blend
   * factor `renderPlayerSprite` passes to `renderAlpha`.
   *
   * 🔴 **Added 2026-08-17 after the adversarial gate-owner brief killed the first rewrite.** That
   * version sampled only `prevY` and asserted *containment* in `[prevY, simY]`. Containment is
   * one-sided, and the brief produced three renderers that are broken and still inside the segment:
   * `renderAlpha(accumulatorMs * 0.5)` (the player lags the enemies, which are not halved),
   * `renderAlpha(0)` (**interpolation off entirely — the exact ghost/smear defect
   * `src/render/interpolate.ts` exists to remove**), and a state-conditional offset applied only
   * while airborne. All three pass a containment bound; during a terminal-velocity fall that bound
   * admits a 51.6 px window, which is the blanket `maxFallSpeed` tolerance session 9 rejected,
   * returning as a data-dependent one.
   *
   * With the accumulator sampled there is no bound to widen at all: the drawn position is a
   * *prediction*, and the assertion is equality against it.
   */
  accumMs: number;
  drawnBottom: number;
  drawnY: number;
  frameIndex: number;
  state: string;
  /**
   * The sim's own `grounded` flag, read from `scene.world.player` in the same callback.
   *
   * 🔴 Added 2026-08-17. The landing assertion used to look for "the first sample after an airborne
   * one whose state is neither `jump` nor `fall`", and the Codex implementation review showed that
   * `hurt`, `attack`, `death` or a respawn all satisfy that without a landing having happened —
   * combat states bypass the grounded-derived movement state entirely (`src/sim/player.ts`). This is
   * the flag the sim actually resolves collision against, so a `!grounded -> grounded` transition is
   * the landing itself rather than a proxy for it.
   */
  grounded: boolean;
  originY: number;
}

/**
 * Sample the drawn sprite and the sim together, once per animation frame, for `frames` frames.
 *
 * Both halves are read in the SAME callback so they describe the same moment. Reading them in two
 * evaluates would let a tick land between them and turn a correct renderer into a divergence.
 */
export async function sampleDrawnVsSim(
  page: import('@playwright/test').Page,
  frames: number,
): Promise<Sample[]> {
  return page.evaluate(
    (count) =>
      new Promise<Sample[]>((resolve) => {
        const out: Sample[] = [];
        // `prevPlayer` and `accumulatorMs` are `private` on GameScene, which is a COMPILE-TIME
        // word — both are plain own properties at runtime. Reaching them through `__phaserGame` is
        // the idiom `perfSampler.ts` already uses to read `scene.world.projectiles` and
        // `scene.enemies`, and it is deliberately preferred over adding fields to `window.__game`:
        // that surface is closed at eight by a Phase 1 Codex ruling and widening it needs a
        // STOP-and-ask. (This comment cited `phase-05-perf.spec.ts` until 2026-08-17; that file
        // contains no `getScene` call at all — the helper was split out in Phase 5. A wrong
        // citation is a wrong comment, vault C9.)
        const scene = (
          window as unknown as {
            __phaserGame: { scene: { getScene(k: string): unknown } };
          }
        ).__phaserGame.scene.getScene('Game') as {
          children: { list: Record<string, unknown>[] };
          prevPlayer: { y: number } | null;
          accumulatorMs: number;
          world: { player: { grounded: boolean } };
        };

        const step = () => {
          // The player is the only child carrying a brass-courier texture. Found by texture key
          // rather than by size: the grey-box finder Phase 2 used matched on the collision box's
          // dimensions, and the sprite is now 288 x 384, which is the CELL, not the box.
          const drawn = scene.children.list.find((o) => {
            const key = (o.texture as { key?: string } | undefined)?.key;
            return typeof key === 'string' && key.startsWith('brass-courier-');
          }) as
            | {
                y: number;
                originY: number;
                getBounds(): { bottom: number };
                frame: { name: string };
              }
            | undefined;
          const sim = window.__game?.player as
            | { y?: number; vy?: number; state?: string }
            | null
            | undefined;

          if (drawn && sim && typeof sim.y === 'number') {
            out.push({
              simY: sim.y,
              simVy: typeof sim.vy === 'number' ? sim.vy : 0,
              // Read in the SAME callback as `drawn` and `sim`, so all four describe one moment.
              prevY: scene.prevPlayer ? scene.prevPlayer.y : null,
              accumMs: scene.accumulatorMs,
              drawnY: drawn.y,
              drawnBottom: drawn.getBounds().bottom,
              frameIndex: Number(drawn.frame.name),
              state: String(sim.state),
              grounded: scene.world.player.grounded,
              originY: drawn.originY,
            });
          }
          if (out.length >= count) {
            resolve(out);
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}

