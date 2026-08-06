# Steampunk Platformer

A short browser platformer — 3–5 levels, Victorian industrial steampunk, all art generated through
fal.ai — built as a learning exercise with a hard QA gate at every phase.

**Phaser 4.2.1 · TypeScript 7 · Vite 8 · vitest · @playwright/test · Tiled · fal.ai via `genmedia`**

## Read these before doing anything

| Document | What it is |
|---|---|
| [docs/PRD.md](docs/PRD.md) | **The spine.** Global Constraints, file structure, the `window.__game` surface, the Codex review protocol. Read once per session. |
| `docs/prd/phase-NN-*.md` | One document per phase. **Read only the phase you are executing.** |
| [docs/LESSONS-APPLIED.md](docs/LESSONS-APPLIED.md) | 133 vault notes distilled into hard requirements. Items are cited by ID (1.3, A7, C11…) throughout the codebase and the docs. |
| [docs/QA-LOG.md](docs/QA-LOG.md) | Every decision, measurement and deliberate non-fix, per phase. **Check here before re-measuring anything.** |
| [docs/reviews/](docs/reviews/) | Codex plan + implementation reviews, one pair per phase. What an earlier phase was warned about. |
| [docs/STYLE.md](docs/STYLE.md) | Locked art direction. Changing §2–§5 needs approval, not a prompt tweak. |
| [docs/FAL-MODELS.md](docs/FAL-MODELS.md) | Every fal endpoint: schema, price, gotchas. Re-read **and re-run `genmedia schema`** before any phase that generates. |

## Non-negotiables

- **Dependencies are frozen** at runtime `phaser@4.2.1` (exact, no caret); dev `vite`, `typescript`,
  `vitest`, `@playwright/test`. **Anything else: STOP and ask.** Phase 1 needed `@types/node` twice
  and solved it without adding it — prefer that.
- **`src/sim/` imports nothing from Phaser**, and reaches no clock, no `Math.random`, no DOM.
  Mechanical proof: `npm run test:sim-isolated`.
- **Every duration is an integer count of 60 Hz ticks. Every distance is pixels.** Never a float of
  seconds, never a `deltaTime` multiply inside the sim.
- **No source file over 400 lines** without a written justification in `QA-LOG.md`. Prefer splitting.
- **Grey-box before art.** No fal spend on a feature whose mechanics are not already playable.
- **A phase with a failing or unrun criterion is reported failing.** Never as done.
- **STOP and ask** before: a new dependency, deleting a file, a fal batch over 5 generations, or
  contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md.

## Phase workflow

Run each phase with `superpowers:executing-plans`, one phase per session, in this order:

> vault-in → invoke the phase's named skills → **Codex plan review** → build → QA gate (incl. **Codex
> implementation review**) → vault-out → **STOP for approval**

Both Codex reviews are mandatory; neither may be skipped. Every finding is **applied** or **recorded
with a one-line reason** — silently ignoring one is not permitted *(C11)*.

⚠️ **Codex's sandboxed shell cannot spawn processes on this machine** (`CreateProcessAsUserW failed:
5`). This is permanent — retrying does not help. Every review prompt must instruct it to use the
`node_repl` MCP tool with `fs.readFileSync` for all file access. That restores file *reading*, not
command *execution*, so review findings are file-evidence only and **must be re-verified locally**.
Full detail in [PRD.md § The Codex review protocol](docs/PRD.md#the-codex-review-protocol).

## Commands

```bash
npm run dev                # Vite dev server on :5173
npm run build              # tsc --noEmit && vite build
npm test                   # vitest (unit; sim only)
npm run test:e2e           # Playwright
npm run test:sim-isolated  # uninstall Phaser, run the sim suite, reinstall — QA criterion 1.3
```

## Engine gotchas already paid for — do not re-discover these

Measured against Phaser 4.2.1. Detail and citations in [docs/QA-LOG.md](docs/QA-LOG.md), Phase 1 and
Phase 2.

**From Phase 2:**

- **`Rectangle` has no `setFlipX`.** The Flip component is mixed into Sprite and Image but **not**
  into Shape. The typechecker catches it; no test would.
- **Tint is WebGL-only.** The game runs `Phaser.AUTO` with a live Canvas fallback, so a tinted
  texture is not usable as a grey-box primitive — it renders plain white. Use a filled `Rectangle`.
  Also, `setTintFill` no longer exists in v4: `setTint(c).setTintMode(Phaser.TintModes.FILL)`.
- **Game Objects default to origin `0.5, 0.5`.** A feet-anchored convention must set
  `setOrigin(0.5, 1)` explicitly, or the sprite floats half its height above the ground.
- **`JustDown()` is a consuming read** that resets when checked, so two readers in one frame lose the
  edge; polling `isDown` misses a press-and-release inside one frame. Latch edges from the keyboard
  **event**, and register keys with **`emitOnRepeat: false`** — the OS repeats a held key ~30×/s and
  every repeat would otherwise latch a fresh press.
- **Phaser dedupes keyboard events** on `(code, timeStamp, type)`. Synthetic `KeyboardEvent`s built
  in one tight loop share a `timeStamp` and get collapsed; and Chromium ignores `keyCode` in the
  constructor, so attach it with `Object.defineProperty` or the event reaches nothing.
- **`TimerEvent` / `Clock` are wall-clock and honour `timeScale`**, and `addEvent` is deferred to the
  next frame. Keep them away from anything the simulation depends on.
- **Arcade Physics is not used and must not be.** `Body.velocity` is px/**second**, integrated with a
  delta inside `World.step` — the exact multiply vault 2.1 forbids — and it lives in `phaser`, which
  vault 1.1 forbids `src/sim/` importing. There is deliberately no `physics` block in `gameConfig`.

- **Phaser's caches are game-global and survive a scene restart**, and `LoaderPlugin.addFile`
  silently skips any already-cached key. Any load-and-verify gate becomes a **no-op on the second
  entry to the scene** unless you drop the key first. Applies to textures *and* the JSON catalog.
  This is the most dangerous one: it turns a working gate decorative without touching the gate.
- **An undecodable image is dropped silently.** `File.onProcessError()` emits **no event** (there is
  no `FILE_PROCESS_ERROR`) and does not move `totalFailed`. Verify the *outcome*, never a completion
  signal.
- **`pixelArt: true` does not pin filtering on the Canvas renderer.** `TextureSource.scaleMode` is
  hardcoded to `DEFAULT` (=LINEAR=0) and never derived from config; Canvas draws with
  `imageSmoothingEnabled = !scaleMode`. Call `setFilter(NEAREST)` explicitly.
  Also: two unrelated things are named "scale mode" — `Phaser.ScaleModes` (texture filtering) and
  `Phaser.Scale.ScaleModes` (canvas fitting).
- **Default `scale.mode` is `NONE`**, not FIT. Set it explicitly.
- **The ScaleManager owns `canvas.style`.** Never write project CSS targeting the canvas element.
- **`Phaser.AUTO`, never `Phaser.WEBGL`** — the latter has no fallback and fails silently.
- **Reset scene state in `init()`, not the constructor.** Scene starts are queued.
- **`loader.maxRetries` defaults to 2**, so a failing file is attempted three times. Size test
  timeouts for that, or a correct refusal reads as a hang.
- **Vite's dev server never returns 404** — a missing file gets 200 + SPA-fallback HTML. To test a
  real 404, force it with Playwright route interception.

## Testing conventions

- **Watch every gate fail before trusting it** *(C1)*. Re-introduce the bug, see red, restore, and
  confirm the mutation actually reverted with `grep -c` *(C12)*.
- **A gate that cannot go red is decoration** *(C2)*. Committed failing fixtures, not assertions
  about assertions.
- **Assert the type before the value** in e2e — a prior project passed vacuously on
  `undefined === undefined` through a debug hook that returned nothing.
- **Never `waitForTimeout`.** Wait on `window.__game.ready`. A sleep long enough to pass is long
  enough to hide a hang.
- **Kill dev servers by port before reporting done** *(C13)*. Playwright launches
  `node ./node_modules/vite/bin/vite.js` directly — never `npm run dev`, whose shell wrapper orphans
  the real process on Windows.
- Run **two** review briefs per gate: one verifying the stated criteria, one asking *how could this be
  wrong?* *(A7)*. In Phase 1 the first concluded there were no asset-missing paths; the second found
  three, and Codex then found two more.

**Hard-won in Phase 2 — these three cost hours each:**

- **A wait expressed in ticks cannot bound a SAMPLING window.** `waitTicks(N)` guarantees *at least*
  N ticks, never exactly N, and under parallel Playwright workers a single round trip can outlast the
  whole window you are measuring. "Advance N ticks, then read once" produced a **false green with a
  mutation applied** and a **false red on correct code**, in the same suite. Sample inside the page,
  once per animation frame, and return an aggregate.
- **A non-zero exit code is not evidence a gate caught anything.** A vitest spawned from a Node parent
  loses its runner context and every suite dies at import, printing `Tests  no tests` and exiting 1.
  Detect redness *positively*, from `Tests N failed` plus named failing specs. Drive mutation loops
  from the shell, not from a Node script.
- **Verify a mutation applied by "content changed AND the original count dropped by one"** — never by
  "the original count is now zero". That is wrong when the mutant *contains* the original, and
  meaningless when the replacement is empty; both write the file before failing, so a "refused"
  mutation can sit applied in a green tree *(C12)*.
- **A "DEV ONLY" label in a document is not a build gate.** Write the `import.meta.env.DEV` guard when
  you create the artifact. `PlaygroundScene` shipped in `dist/` with every gate green until Codex's
  implementation review read the whole diff against the whole PRD.
- **An existence assertion cannot verify a timing claim.** "Did a jump happen" passed while the tick
  order's documented window semantics were wrong. Assert *which tick*.

## The `window.__game` surface

Read-only, live, **dev build only** — installed via `Object.defineProperty` with a getter and no
setter, and absent from `dist/`. Fixed in Phase 1; every later e2e spec depends on it.

```ts
{ sceneKey: string; tick: number; player: { x, y, vx, vy, state } | null;
  score: number; health: number; levelId: string | null;
  ready: boolean; bootError: string | null }
```

`ready` is the positive terminal condition, `bootError` the negative one. Both exist because there is
deliberately **no loader timeout** *(vault 1.4)* — without them a successful boot, a refused boot and
an infinite hang are indistinguishable, and the QA gate cannot fail.

`window.__phaserGame` is also dev-only. It exists so e2e can restart the Boot scene, and Phase 2 also
uses it to assert the *drawn* `Rectangle` tracks the sim — without that, deleting `renderPlayer()`
left every test green, because everything else reads `__game`, which the scene writes directly.

**The surface is closed at nine fields** by a Phase 1 Codex ruling. Phase 2 wanted two values it does
not carry (the Playground's selected knob; the rendered position) and rewrote both tests to measure
behaviour instead. Adding a tenth field needs a STOP-and-ask.

## The tick contract

`src/sim/tick.ts` holds a **numbered 14-step order, declared authoritative** *(vault 2.2)*. Phase 5's
combat timing is expressed against it and its art frame rates derive from windows that slot into it,
so renumbering later is a balance change, not a refactor. **Step 4 is reserved, empty, for Phase 5
combat** — placed before integration so knockback reaches the same tick's movement.

Read that file's header before changing anything in `src/sim/`. It also states the two forgiveness
windows separately and on purpose: they are *not* symmetric, because step 7 tests `grounded` as set
by step 9 of the previous tick, so a buffered jump fires the tick **after** touchdown.
