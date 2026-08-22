/**
 * Kill whatever is listening on a TCP port. Used before every Playwright run, and by
 * `e2e-server.mjs` before it binds.
 *
 * ## The false green this closes
 *
 * Playwright spawns `webServer.command` through `cmd.exe` on Windows and kills the shell when the
 * run ends. The node process the shell launched **survives**, still holding port 5173.
 * `playwright.config.ts` already records this shape one layer up — killing a wrapper orphans the
 * real process, which is why the command stopped being `npm run dev`. Same bug, `cmd.exe` as the
 * wrapper.
 *
 * Because `--strictPort` is deliberate, the NEXT run cannot bind. Playwright reports
 * `"expected": 0, "unexpected": 0` — and **exits 0**.
 *
 * 🔴 A run that selected zero tests is indistinguishable from a clean pass unless you read the test
 * COUNT. Every rule in `docs/TESTING-RULES.md` is built on watching a gate go red, and all of them
 * assume the tests ran. This poisons the *next* measurement, and poisons it green. In Phase 9 it
 * silently zeroed three consecutive control runs, one of which was deciding whether a merge had
 * broken the game.
 *
 * ## Why it runs from the npm script, and not from anywhere inside Playwright
 *
 * Two earlier designs were built and **both were watched failing**, which is the only reason the
 * third is right:
 *
 *  1. `globalSetup`. Too late — **Playwright starts `webServer` before `globalSetup`**, so the run
 *     had already aborted on the busy port. Its warning never printed.
 *  2. Inside `webServer.command`. Also too late — **Playwright probes the URL first**, and with
 *     `reuseExistingServer: false` a reachable URL is an immediate error; the command never runs.
 *     The proof run lasted 38 ms.
 *
 * So the guard has to fire **before Playwright starts**, which means `package.json`'s `test:e2e`.
 *
 * ⚠️ **`npx playwright test` bypasses this.** Use `npm run test:e2e`. If you must call Playwright
 * directly, run `node tools/dev/free-port.mjs 5173` first.
 *
 * ## Why kill rather than reuse
 *
 * `reuseExistingServer` stays **false**. Reusing whatever answers on the port is vault C13's original
 * failure — "serves stale art after an asset rebuild", presenting as "the sprite didn't update".
 * Killing the stale server and starting fresh keeps the guarantee that a run serves the tree it is
 * testing.
 *
 * `.mjs` under `tools/`, deliberately: outside `tsconfig.json`'s `include`, so it needs no Node type
 * declarations. `CLAUDE.md` freezes dependencies and records that Phase 1 needed `@types/node` twice
 * and solved it without adding it. This is the third time, solved by choosing a file location.
 */
import { execFileSync } from 'node:child_process';

/**
 * PIDs listening on `port`, via `netstat`.
 *
 * `netstat` rather than a socket probe: a probe says the port is busy, not who holds it, and this
 * has to kill a specific process rather than guess. Failures are swallowed — a machine without
 * `netstat` should skip the guard, never fail the suite.
 */
export function listenersOn(port) {
  let out = '';
  try {
    // 🔴 NO `-p TCP`. That filter lists IPv4 only, and **Vite binds IPv6** — `[::1]:5173`. The first
    // version of this file used it, found nothing, killed nothing, and Playwright still aborted on
    // the busy port. `Get-NetTCPConnection` showed `::1 5173 Listen 57716` the whole time. Without
    // the filter the row appears as `TCP  [::1]:5173  [::]:0  LISTENING  57716`, and the regex below
    // handles both families.
    out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    // e.g.  TCP    0.0.0.0:5173    0.0.0.0:0    LISTENING    51392
    const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
    if (m && Number(m[1]) === port) {
      const pid = Number(m[2]);
      if (pid > 0) pids.add(pid); // PID 0 is the System Idle Process.
    }
  }
  return [...pids];
}

/** Free `port`. Returns how many processes had to be killed. */
export function freePort(port) {
  const pids = listenersOn(port);
  for (const pid of pids) {
    try {
      // `/T` takes the tree — the orphan may have children of its own.
      execFileSync('taskkill', ['/PID', String(pid), '/F', '/T'], { stdio: 'ignore' });
    } catch {
      // Already gone, or not ours to kill. The bind that follows is what actually decides.
    }
  }
  return pids.length;
}

// Run directly (`node tools/dev/free-port.mjs 5173`) rather than imported.
if (process.argv[1]?.endsWith('free-port.mjs')) {
  const port = Number(process.argv[2] ?? 5173);
  const killed = freePort(port);
  if (killed > 0) {
    // Loud on purpose: a leaked server means a previous run did not shut down cleanly, which is
    // worth knowing even though this line has already fixed it.
    console.warn(
      `[free-port] killed ${killed} stale process(es) holding port ${port}. ` +
        `Without this, the run about to start would have collected zero tests and exited 0.`,
    );
  }
}
