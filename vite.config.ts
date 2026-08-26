/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vercel from './vercel.json' with { type: 'json' };
import { devSeamGate } from './tools/gen/devSeamGate.mjs';

// Vault A8: this file MUST keep the `.ts` extension. If Vite ever warns about its config
// loader, adding a `.js` config silences the warning AND breaks the loader. A warning
// going quiet is not evidence the underlying thing works.
//
// Nothing here imports Phaser, which is what lets QA criterion 1.3 (run the sim suite with
// Phaser uninstalled) work at all — vitest has to be able to load this file without it.
//
// ⚠️ It imports `vercel.json` and `tools/gen/devSeamGate.mjs`, and NEITHER pulls in Phaser or
// `node:*`. That is deliberate: `resolveJsonModule` is already on, so reading the CSP needs no
// `fs` and therefore no `@types/node`, which is a frozen-dependency STOP-and-ask (CLAUDE.md §3).

/**
 * 🔴 THE BROWSER CONTRACT IS PINNED, AND VITE WOULD OTHERWISE MOVE IT UNDER US.
 *
 * Vault 10.1 — *"after a toolchain upgrade diff the OUTPUTS, not the changelog: a Vite major
 * silently moved the minimum browser contract"*. This project shipped Phases 1–9 with **no
 * `build` block at all**, so the target was whatever Vite defaulted to that week.
 *
 * Measured in the installed tree on 2026-08-26, not quoted from documentation
 * (`node_modules/vite/dist/node/chunks/node.js`):
 *
 *   Vite 8's default `build.target` is the special value `'baseline-widely-available'`, which
 *   expands to  chrome111, edge111, firefox114, safari16.4, ios16.4
 *
 * and Vite's own source comment beside that constant reads:
 *
 *   > "The browser versions that are included in the Baseline Widely Available on 2025-05-01.
 *   >  **This value would be bumped on each major release of Vite.**"
 *
 * That is the vault item stated by the tool itself. An unpinned target means the set of
 * browsers this game runs in changes when a dependency is upgraded, silently, with no diff to
 * review and no test that can see it.
 *
 * So the value is written down, and it is written down as the EXPANSION rather than the alias —
 * `'baseline-widely-available'` is a moving target by design; this list is not.
 *
 * ## Reversal instructions (vault 10.1 requires these to travel with the value)
 *
 *   - **To adopt a newer baseline deliberately:** delete `target` below, run `npm run build`,
 *     and read the emitted syntax back out with `tools/gen/measure-bundle.mjs`. Do NOT simply
 *     paste a newer list — the point is to see what changed in the OUTPUT.
 *   - **To go back to Vite's default:** delete the `target` line. The default is the alias, so
 *     the contract resumes moving on every Vite major.
 *   - **To support older browsers:** lower the numbers. The floor Vite supports is `es2015`,
 *     and beneath its own target Vite still requires native ESM dynamic import and
 *     `import.meta` — chrome ≥64, firefox ≥67, safari ≥11.1, edge ≥79.
 *   - **The recorded emitted syntax for this target**, measured from the shipped bundle by
 *     `tools/gen/measure-bundle.mjs` on 2026-08-26: `?.` ×70, `??` ×48, `??=` ×18, `**` ×41 —
 *     all present, none downlevelled. If a target change makes those disappear, the bundle grew
 *     downlevel helpers.
 *
 * ⚠️ **And do NOT reach for the raw-vs-gzip ratio to see that happen.** It was tried, as a
 * three-arm A/B on the same commit:
 *
 * | arm | raw | gzip | ratio | `?.` | `??` |
 * |---|---|---|---|---|---|
 * | Vite 8 defaults | 1,441,653 | 377,486 | 3.819 | 70 | 48 |
 * | this file, pinned | 1,441,653 | 377,486 | 3.819 | 70 | 48 |
 * | `target: 'es2015'` | 1,446,448 | 378,656 | **3.820** | **19** | **0** |
 *
 * Downlevelling every `??` and two thirds of the optional chaining moved the ratio by **0.001**
 * and the raw size by 0.33 %. The ratio is not a discriminator for a target change on this
 * bundle; the syntax census is. *(Vault 10.2's own warning, arriving in the phase named after
 * it — see `measure-bundle.mjs`.)*
 *
 * The first two rows being byte-identical is the other half of the result: **the pinned values
 * ARE Vite 8.2.0's current defaults**, so pinning changed nothing today. Its whole value is that
 * a Vite major can no longer move the contract silently.
 */
const BROWSER_TARGET = ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'];

/**
 * The production response headers, **read from `vercel.json` rather than restated here.**
 *
 * Criterion 10.6 says the CSP is verified against the PRODUCTION header config, never the dev
 * server. A second copy of the policy in this file would satisfy the letter of that and defeat
 * its purpose the first time the two drifted — so there is exactly one copy, and it is the one
 * Vercel serves.
 *
 * ⚠️ This covers the LOCAL substrate only (`tools/dev/prod-server.mjs` reads the same import).
 * It cannot exercise Vercel's route matching or its edge, so a local pass is the FIRST check and
 * `curl -sI` against the real preview deployment is the production-relevant one. Both are
 * recorded in the QA log; neither substitutes for the other.
 *
 * 🔴 The `source` pattern is NOT interpreted here. If `vercel.json` ever grows a rule whose
 * `source` is anything other than the catch-all, this returns the headers for the catch-all only
 * and `prod-server.mjs` throws rather than guessing — silent divergence between the local check
 * and production is the one failure this whole arrangement exists to prevent.
 */
export const CATCH_ALL_SOURCE = '/(.*)';

export function productionHeaders(): Record<string, string> {
  const rule = vercel.headers.find((h) => h.source === CATCH_ALL_SOURCE);
  if (rule === undefined) {
    throw new Error(
      `vercel.json has no headers rule with source "${CATCH_ALL_SOURCE}"; the local production ` +
        'substrate cannot reproduce what Vercel would serve, so it refuses to guess.',
    );
  }
  return Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
}

export default defineConfig({
  plugins: [devSeamGate()],
  build: {
    // See BROWSER_TARGET above. Pinned, with reversal instructions, per vault 10.1.
    target: BROWSER_TARGET,
    // Vite 8's default minifier is `'oxc'` (it ships Rolldown). Stated rather than inherited for
    // the same reason as the target: `'oxc' | 'terser' | 'esbuild' | false` are the options, and
    // which one runs decides whether the dev-seam gate's folded guards actually fold.
    minify: 'oxc',
    // No source maps in production. The repo is public and the source is MIT, so this is not
    // secrecy — it is 4 MB of payload no player fetches. Set to `true` to debug a shipped build.
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    // 4173, so a production preview can never collide with the dev server on 5173 — and both
    // ports are freed before an e2e run and killed after it (vault C13).
    port: 4173,
    strictPort: true,
    headers: productionHeaders(),
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
