/**
 * The three gate statuses and the verdict constructor. **A leaf: this module imports nothing.**
 *
 * ## Why it exists — inventory 5.25
 *
 * These lived in `gates.mjs`. When the zone-separation and brass-cap gates crossed the 400-line rule
 * they moved to `gatesBrassCap.mjs`, `gates.mjs` kept re-exporting them so no importer had to
 * change — and `gatesBrassCap.mjs` still needed `PASS`/`FAIL`/`verdict`, which stayed behind. That
 * closed an import cycle, and `gates.mjs` then wrote the convention protecting it down in prose:
 * *"`gatesBrassCap.mjs` never calls back into this module at load time — only inside function
 * bodies."*
 *
 * A convention nothing enforces is the exact defect `phase-05-impl.md:72` recorded against the
 * `motion.mjs` ↔ `motionCombat.mjs` pair. That pair was repaired the same way this one now is:
 * **the shared primitive moves DOWN to a leaf both sides import**, so neither has to run first.
 * `tests/unit/gen-import-cycles.test.ts` is what keeps it that way.
 *
 * ⚠️ **Nothing may be imported into this file.** A single import re-opens the door — the whole value
 * of a leaf is that it has no evaluation order to get wrong.
 */

export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const INDETERMINATE = 'INDETERMINATE';

/** One gate's result: a status, the number it measured, and the sentence explaining it. */
export function verdict(status, value, reason) {
  return { status, value, reason };
}
