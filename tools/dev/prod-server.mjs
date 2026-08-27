/**
 * The PRODUCTION substrate for criterion 10.6: serve `dist/` with the headers Vercel will serve.
 *
 * Same shape as `e2e-server.mjs` — free the port, then serve, in ONE process — for the same
 * measured reason. Read that file's header first; every word of its false-green argument applies
 * here unchanged, and this one binds a second port (4173) that can be orphaned exactly the same way.
 *
 * ## Why not `vite preview`
 *
 * `vite preview` would serve `dist/` and apply `preview.headers` correctly — that much was verified.
 * It is not used because Playwright spawns `webServer.command` through `cmd.exe` on Windows and
 * kills the shell at the end of the run, orphaning the real process, which keeps the port. The next
 * run then cannot bind, aborts before collecting a test, prints `expected: 0, unexpected: 0` and
 * **exits 0**. `playwright.config.ts:221-241` records that failure; `e2e-server.mjs` exists because
 * of it. Serving in-process means there is no child to orphan.
 *
 * ## 🔴 THE HEADERS COME FROM `vercel.json`. THAT IS THE WHOLE POINT.
 *
 * Criterion 10.6 says the CSP is verified against the **production header config**, never the dev
 * server. A second copy of the policy in this file would satisfy the letter of that and defeat its
 * purpose the first time the two drifted — which, on this project's own evidence, is about four
 * days (`PRD.md:88-93`, where two documents disagreed about the art ceiling until someone noticed).
 *
 * So there is exactly one copy of the CSP, `vercel.json` holds it, and exactly one piece of code
 * looks it up: `tools/gen/vercelHeaders.mjs`, which this server and `vite.config.ts` both import.
 *
 * ⚠️ That was **not** true when this file was written. It said the two shared an import while
 * doing its own `JSON.parse(readFileSync('vercel.json'))` with its own `CATCH_ALL_SOURCE` — the
 * lookup existed twice under two comments claiming it existed once. The criterion 10.5 gate owner
 * found it; the shared module is the repair.
 *
 * ## What this CANNOT prove, stated so nobody reads the local pass as more than it is
 *
 * It applies the header VALUES that Vercel will apply. It is not Vercel:
 *
 *   - it does not exercise Vercel's `source` route matching (see the refusal below),
 *   - it does not exercise the CDN or edge layer,
 *   - it serves the locally-built `dist/`, not the artifact Vercel rebuilds on its own machine.
 *
 * A local pass is therefore the FIRST check, not the last. `curl -sI` against the real preview
 * deployment is the production-relevant one, and both are recorded in `docs/qa/phase-10-ship.md`.
 * Neither substitutes for the other. *(Vault 10.5's note is that a preview deploy behind SSO cannot
 * gate a security header — the inverse trap: trusting a remote check that never ran on the real
 * page. Running both, and saying which is which, is the answer to both halves.)*
 *
 * ## Why it REFUSES rather than guesses
 *
 * If `vercel.json` grows a rule whose `source` is anything other than the catch-all, this server
 * throws instead of applying a best guess. Silent divergence between the local check and production
 * is the one failure the single-source arrangement exists to prevent, and a server that quietly
 * applied the wrong headers would be a gate reporting green about a page nobody serves.
 *
 * `.mjs` under `tools/`, deliberately: outside `tsconfig.json`'s `include`, so it needs no Node type
 * declarations and no `@types/node` (CLAUDE.md §3 freezes dependencies).
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, resolve, sep } from 'node:path';
import { freePort } from './free-port.mjs';
import { productionHeaders } from '../gen/vercelHeaders.mjs';

const PORT = Number(process.argv[2] ?? 4173);
const ROOT = resolve('dist');

if (!existsSync(join(ROOT, 'index.html'))) {
  throw new Error(
    `no dist/index.html — run \`npm run build\` before serving the production substrate. ` +
      'Serving a stale or absent build is how vault C13 goes wrong.',
  );
}

const HEADERS = productionHeaders();

// Enough of a content-type table for what this game actually ships. `nosniff` is one of the headers
// under test, so a wrong type here would present as a broken page rather than a wrong header —
// which is the right way round for a gate.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.tmj': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const killed = freePort(PORT);
if (killed > 0) {
  console.warn(`[prod-server] killed ${killed} stale process(es) holding port ${PORT}.`);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  // 🔴 `decodeURIComponent` THROWS on a malformed escape, and an uncaught throw in a `createServer`
  // callback takes the whole PROCESS down. Measured: one `GET /%` killed the server outright, and
  // every request after it got ECONNREFUSED — a Playwright run that followed would read a dead port
  // as a broken game. Found by the criterion 10.6 gate owner (finding F8).
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res
      .writeHead(400, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' })
      .end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Path traversal guard. The server is local and short-lived, but it serves a directory and takes
  // a path from the request — that is a trust boundary whatever the lifetime, and "it is only a
  // test server" is how one ends up copied somewhere it matters.
  //
  // 🔴 This was `candidate.startsWith(ROOT)`, the classic sibling-prefix hole: with `ROOT` ending
  // `\dist`, the path `\dist-backup\secrets` starts with it and passes. Same finding. A path is
  // inside a directory when it IS that directory or begins with it plus a separator.
  const candidate = normalize(join(ROOT, pathname));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
    res.writeHead(403, HEADERS).end('forbidden');
    return;
  }

  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    // No SPA fallback: this game is a single page and a 404 that silently served index.html would
    // turn a missing asset into a green boot, which is precisely what verify-dist exists to catch.
    res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }

  const body = readFileSync(candidate);
  res.writeHead(200, {
    ...HEADERS,
    'Content-Type': TYPES[extname(candidate).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': body.length,
  });
  res.end(body);
}).listen(PORT, () => {
  console.log(`[prod-server] serving dist/ on http://localhost:${PORT}`);
  console.log(`[prod-server] headers from vercel.json: ${Object.keys(HEADERS).join(', ')}`);
});
