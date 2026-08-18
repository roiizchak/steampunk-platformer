type Page = import('@playwright/test').Page;

/**
 * Criterion 6.9's proving mutation, **committed** — N full-screen alpha-blended scrims over the HUD.
 *
 * ## Why it lives here and not in `src/`
 *
 * The defect 6.9 exists to catch is named in its own bound: *"a full-screen scrim, an alpha-blended
 * overlay, a per-pixel cost"*. That is a RENDERING cost, and it can be added to the running game
 * from the page without touching a shipped file. The audio mutation could not be — a per-cue stall
 * has to sit inside `playCues` — so that one is a DEV-only query param in `src/game/audio.ts`. This
 * one has no such need, and a mutation that never enters `src/` cannot leak into `dist/` however
 * `verify-dist` is written.
 *
 * ## Why it is committed at all
 *
 * The previous perf session built this scrim, measured with it, and left it in a working copy. The
 * QA log records that as unresolved methodology debt, and it is the reason 6.9's floor is
 * *bracketed* rather than measured: one scrim was invisible, five read 2.688, and **nothing between
 * them was ever run** because re-creating the mutation by hand each time is a ritual nobody repeats.
 * A gate that cannot go red is decoration *(vault C2)*; so is one whose red proof has to be
 * reinvented.
 *
 * ## What it draws, and why that is the honest shape
 *
 * Full-viewport rectangles at 50 % alpha, on the **UI** scene, above every HUD element. Alpha
 * forces the blend the bound names; full-viewport makes the cost proportional to fill rate rather
 * than to geometry count; and putting them on `UI` means they appear in the HUD-ON arm ONLY, which
 * is what makes them show up in a ratio rather than cancelling in both arms — the exact mistake
 * criterion 7.7's first audio toggle made.
 */
export async function addScrims(page: Page, count: number): Promise<void> {
  await page.evaluate((n) => {
    const game = (
      window as unknown as {
        __phaserGame: {
          scene: { getScene(k: string): unknown; isActive(k: string): boolean };
          scale: { gameSize: { width: number; height: number } };
        };
      }
    ).__phaserGame;

    const scene = game.scene.getScene('UI') as {
      add: {
        rectangle(
          x: number,
          y: number,
          w: number,
          h: number,
          colour: number,
          alpha: number,
        ): { setOrigin(x: number, y: number): { setDepth(d: number): unknown } };
      };
    };
    const { width, height } = game.scale.gameSize;
    for (let i = 0; i < n; i += 1) {
      scene.add.rectangle(0, 0, width, height, 0x4488ff, 0.5).setOrigin(0, 0).setDepth(5000 + i);
    }
  }, count);
}

/**
 * Read the scrim count out of `PERF_MUTATION`, e.g. `scrim3`. Zero when unset or not a scrim.
 *
 * Driven from the shell so the mutation is a command rather than an edit:
 *
 * ```
 * PERF_MUTATION=scrim3 npx playwright test tests/e2e/phase-06-perf.spec.ts --project=chromium-gpu
 * ```
 */
export function scrimCount(mutation: string): number {
  const match = /^scrim(\d+)$/.exec(mutation);
  return match === null ? 0 : Number(match[1]);
}
