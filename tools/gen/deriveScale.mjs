/**
 * `assets:build <slug> [action] --derive-scale` — the separate command mode, extracted.
 *
 * It shares `build-assets.mjs`'s argument parsing and nothing else: it reads frames, prints a
 * number, and **returns before anything is written**. Keeping it inline made `main()` a function
 * with two unrelated halves and pushed the file over the 400-line rule that criterion 5.12 gates.
 *
 * ## Vault A5, and why this prints rather than writes
 *
 * The scale is the one number vault A5 warns about: a global constant derived from a single
 * regenerable frame means regenerating that frame silently rescales every other animation and moves
 * every measured bound. So this **prints** and a human **pastes**, in that order, deliberately. The
 * build reads `character-bounds-<slug>.json` and never computes it.
 */

import { keySheet, framesOf, cellPitchFor, findSource, loadConfig } from './assetSources.mjs';
import { figureMetrics, deriveScale } from './sheets.mjs';

/**
 * Print the scale for `slug`, measured off `actions[0]`.
 *
 * ## Why the action is an argument and not `'idle'`
 *
 * This branch hardcoded `findSource(..., 'idle')`. `rust-scavenger` **has no `idle`**, and that is a
 * design decision rather than an omission — it patrols continuously, so a standing pose is a state
 * the sim can never enter and a sheet for it would be money spent on an unreachable frame. So
 * `--derive-scale` for the scavenger searched for `rust-scavenger-idle-clip.png` and threw, while
 * the scavenger's own bounds config carried `"scale": null` and its error message told you to run
 * this exact command. A deadlock, caught by the session-6 Codex plan review before it was hit.
 *
 * Whichever action is used, its name is printed beside the number: a human pasting a measurement
 * must be able to see what it was measured from.
 */
export function printDerivedScale({ slug, actions, generated, configPath }) {
  const deriveAction = actions[0] ?? 'idle';
  const deriveSource = findSource(generated, slug, deriveAction);
  const { keyed } = keySheet(deriveSource);
  const heights = framesOf(keyed, cellPitchFor(deriveSource)).map(
    (frame) => figureMetrics(frame)?.height ?? 0,
  );
  const standing = Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
  // The target height is read from the config rather than written here. It was a literal `96`,
  // which went stale the moment RENDER_SCALE moved 2 -> 6 and `renderHeightPx` became 288 — and a
  // deriver that prints a number for the wrong target is worse than no deriver, because its output
  // is meant to be pasted straight into the file it disagrees with.
  const renderHeight = loadConfig(configPath).renderHeightPx;
  const scale = deriveScale(standing, renderHeight);

  console.log(`${deriveAction} frame heights: ${heights.join(', ')}`);
  const spread = Math.max(...heights) - Math.min(...heights);
  console.log(
    `mean standing height: ${standing} source px  (spread ${spread} px, ` +
      `${((spread / standing) * 100).toFixed(1)}% — this is the frame-to-frame size pop)`,
  );
  console.log(`scale for a ${renderHeight} px render height: ${scale.toFixed(8)}`);
  console.log(`\nWrite this into ${configPath} deliberately. The build will not derive it (vault A5).`);
}
