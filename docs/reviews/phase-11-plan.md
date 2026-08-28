# Codex plan review — Phase 11 (Welcome screen and volume repair)

Model `gpt-5.6-sol`, reasoning effort high, read-only sandbox, thread `01a048a1`. Run through the
`claudex-loop:codex-review` skill on 2026-08-28, BEFORE any implementation code was written.

**Five rounds. `VERDICT: REVISE` x4, then `VERDICT: APPROVED`. 22 material findings, all applied.**

⚠️ Codex's sandboxed shell cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`),
so every prompt instructed it to use the `node_repl` MCP tool with `fs.readFileSync`. Its findings
are therefore **file evidence only** and each was re-verified locally before being acted on. Three
were re-verified and found to be *understated* rather than wrong; none was rejected.

## Round 0 — the run that produced no verdict

Round 1 launched, spent 288 s and 21 `node_repl` file reads, then **hit the ChatGPT usage limit
mid-turn** with `last_agent_message: null`. No critique was produced. Recovered from the local
rollout transcript rather than by re-spending: two interim progress notes had been emitted and both
were material, so they were applied before the retry.

- *"raw keyboard events are not inherently one-shot"* — became finding M1.
- *"scene operations are queued and input priority follows scene order"* — became the parallel-scene
  input analysis behind M7.

## Round 1 — 10 material findings

| # | finding | disposition |
|---|---|---|
| M1 | The raw audio listener reintroduces OS key-repeat; `emitOnRepeat:false` is not inherited | **applied** — `event.repeat` guard + criterion 11.5 |
| M2 | The red proof is only valid as a browser integration gate, not a pure-helper unit test | **applied** — `phase-11-audio-keys.spec.ts` dispatches at the real keyboard target |
| M3 | Criterion 11.4 has no volume baseline; `]` cannot move a fresh save off 1.0 | **applied** — 0.5 baseline |
| M4 | Gating on `playerInputEnabled` disables the newly repaired audio keys on the title itself | **applied** — Title carries its own listener through the shared map |
| M5 | Disabling input does not stop the game running underneath the title | **applied** — `Game` is paused |
| M6 | `Title` calling `scene.start('LevelSelect')` stops its CALLER, leaving Game running | **applied** — Game-owned callback |
| M7 | ESC and DEV keys leak through the overlay | **applied** — closed by the same pause |
| M8 | "Once per page load" is false without a latch; `requestedLevelId` is null on every dataless restart | **applied** — module-scope latch |
| M9 | The harness dismissal is race-prone and misses restart paths | **applied** — positive waits |
| M10 | `GameScene` has no line budget for the new call | **applied** — `gameCamera.ts` extraction |

Also corrected three of my own factual claims: `globalSetup` does **not** assert `sceneKey`; "all 36
specs break" was false; `devFeelTuner.ts` was missing from the bracket inventory.

## Round 2 — 6 material findings

| # | finding | disposition |
|---|---|---|
| R2-1 | `prodHarness` cannot use the same barrier — production ships no `__game`/`__phaserGame` | **applied** — pixel barrier |
| R2-2 | The Title resize listener needs SHUTDOWN teardown; `this.scale` is global | **applied** |
| R2-3 | `attachTitle(this)` cannot supply its dependencies; `audio` is private | **applied** — three-argument contract |
| R2-4 | M10 named no concrete extraction | **applied** — `GameScene.ts:205-210` named |
| R2-5 | Criterion 11.8 can pass vacuously; `waitTicks` never completes against a paused scene | **applied** — in-page rAF window |
| R2-6 | The repeat guard lives in two listeners; testing one leaves the other free | **applied** — 11.5 runs both arms |

Round 2 also **verified the pause architecture** against the installed engine, including that a
paused scene keeps rendering, that `UIScene` survives PAUSED, that audio beds are game-global, and
that Game receives no catch-up delta on resume.

## Round 3 — 6 material findings

| # | finding | disposition |
|---|---|---|
| R3-1 | `applyCameraRig(scene, level)` cannot reach private `playerSprite` | **applied** — third argument |
| R3-2 | `phase-01-boot.spec.ts` navigates directly and asserts `tick > 0`, which a paused Game fails | **applied** — verified locally, `dismissTitle` exported and called |
| R3-3 | The red-proof baseline is seeded too late; `createAudio` copies storage at boot | **applied** — `addInitScript` before `goto` |
| R3-4 | The Game listener must KEEP `isPlayerInputEnabled()` for `ElementEditorScene` | **applied** |
| R3-5 | The latch is unsafe if Game restarts while Title is active | **applied** — re-pause, and criterion 11.10 names the case |
| R3-6 | The production pixel barrier was a placeholder, and an absence-only check passes on a tree-shaken Title | **applied** — present-then-absent, both halves |

Nitpicks applied: `import type` for `GameScene`/`AudioManager` under `verbatimModuleSyntax` (verified
set in **both** tsconfigs); the cold-entry condition dropped entirely as unimplementable; the camera
line arithmetic corrected; "last element in both arrays" made exact.

## Round 4 — 1 material finding

**R4-1 — "Title inactive" is not a sufficient barrier.** On the first resumed frame `update()` can
receive a sub-tick delta — ~4.17 ms at 240 Hz against a 16.67 ms tick — and `drainTicks` floors it to
**zero**. So Title can be inactive while `tick` is still 0, which is exactly what
`phase-01-boot.spec.ts` then asserts against.

**Applied**: `dismissTitle` captures the pre-dismiss tick and waits for it to MOVE. Verified locally
that the spec is 398 lines (so the helper must absorb all the waiting), that the assertion is at
line 90, and that `drainTicks` floors as described.

## Round 5 — APPROVED

> The final material gap is closed. The barrier now proves actual simulation progress, runs before
> the Phase 1 snapshot, and fits its remaining two-line budget. I found no remaining material plan
> defect.
>
> `VERDICT: APPROVED`

## What the argument was worth

Three findings were defects that would otherwise have shipped, not stylistic notes:

1. **M5** — the sim running under the title. The player could have died while reading a title screen.
2. **R3-2 / R4-1** — a guaranteed `phase-01-boot.spec.ts` failure with a confusing cause, since
   `globalSetup` would still have passed.
3. **M8** — the title reopening on every dataless `Game` restart, which several existing specs do.

One prediction was **understated**: M1's repeat guard turned out to matter in a second place the
review did not reach — with the pause removed, both audio listeners go live and a single press steps
the volume twice.
