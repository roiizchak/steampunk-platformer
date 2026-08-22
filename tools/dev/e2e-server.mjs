/**
 * The e2e dev server: free the port, then serve — in ONE process.
 *
 * ## The false green this closes
 *
 * Playwright spawns `webServer.command` through `cmd.exe` on Windows and, when the run ends, kills
 * the shell. The node process the shell launched **survives**, still holding port 5173.
 * `playwright.config.ts` already records this shape one layer up: killing a wrapper orphans the real
 * process, which is why the command stopped being `npm run dev`. This is the same bug with `cmd.exe`
 * as the wrapper, and it cannot be fixed from a command string.
 *
 * Because `--strictPort` is deliberate, the NEXT run cannot bind. Playwright aborts **before
 * collecting a single test**, reports `"expected": 0, "unexpected": 0` — and **exits 0**.
 *
 * 🔴 That is a false green of a kind this project had no defence against. Every rule in
 * `docs/TESTING-RULES.md` is built on watching a gate go red, and all of them assume the tests ran.
 * This one poisons the *next* measurement and poisons it green: a run that selected zero tests is
 * indistinguishable from a clean pass unless you read the test COUNT. In Phase 9 it silently zeroed
 * three consecutive control runs, one of which was deciding whether a merge had broken the game.
 *
 * ## Why here and not in `globalSetup`
 *
 * Tried that first; it does not work, and watching it fail is what found the reason.
 * **Playwright starts `webServer` BEFORE `globalSetup`**, so the run had already aborted on the busy
 * port before the guard's first line executed — the proof run reported `expected: 0` with the guard
 * installed and never printed its warning. The only hook early enough is the server command itself.
 *
 * ## Why kill rather than reuse
 *
 * `reuseExistingServer` stays **false**. Reusing whatever answers on the port is vault C13's original
 * failure — "serves stale art after an asset rebuild", presenting as "the sprite didn't update".
 * Killing the stale server and starting a fresh one keeps the guarantee that every run serves the
 * tree it is testing.
 *
 * ## Why the Vite JS API rather than spawning the CLI
 *
 * Serving in-process means there is no child to orphan: Playwright's handle IS the server. That
 * removes the leak at its source rather than only cleaning up after it. The kill below then only
 * matters for servers leaked *before* this file existed, or by a run that was interrupted.
 *
 * `.mjs` under `tools/`, deliberately: it is outside `tsconfig.json`'s `include`, so it needs no
 * Node type declarations. `CLAUDE.md` freezes dependencies and records that Phase 1 needed
 * `@types/node` twice and solved it without adding it — a `.d.ts` shim was written for a TypeScript
 * version of this file and then deleted, because moving the file was the smaller answer.
 */
import { createServer } from 'vite';
import { freePort } from './free-port.mjs';

const PORT = Number(process.argv[2] ?? 5173);

// Belt to `test:e2e`'s braces. This half stops a leak from a run that was interrupted before its
// own teardown; the npm script's half is what fires early enough to save a run that Playwright would
// otherwise abort. Neither alone is enough — see `free-port.mjs` for the two designs that failed.
const killed = freePort(PORT);
if (killed > 0) {
  console.warn(`[e2e-server] killed ${killed} stale process(es) holding port ${PORT}.`);
}

const server = await createServer({
  server: { port: PORT, strictPort: true },
});
await server.listen();
server.printUrls();
