# Steampunk Platformer

A short browser platformer — five levels, Victorian industrial steampunk, every pixel and every
sound generated through [fal.ai](https://fal.ai). Built in ten sessions as a learning exercise, with
a hard QA gate at the end of every one.

<!-- deployed-url -->
**▶ Play it: https://steampunk-platformer-25zu60adz-rois-projects-f9d9895d.vercel.app**

<sub>Deployed 2026-08-27, `--target=production`. That immutable deployment URL is the one this
repository can vouch for; the project's shorter alias is not recorded here because it was not read
back and verified.</sub>

**Arrows / WASD** move · **Space / Up / W** jump · **Shift** walk · **F / L** attack · **M** mute ·
**[ ]** volume · **Esc** level select.

---

## Run it

```bash
npm ci
npm run dev          # http://localhost:5173
```

Built and tested on Node 24. The runtime dependency list is one package.

## What is interesting about it

**The simulation has no engine in it.** `src/sim/` imports nothing from Phaser, reads no clock, calls
no `Math.random`, and touches no DOM. It is a pure function of `(state, input) -> state` with every
duration expressed as an integer count of 60 Hz ticks and every distance in pixels. That is what
makes the whole of the game logic unit-testable in milliseconds, and `npm run test:sim-isolated`
proves it by uninstalling Phaser and running the suite anyway.

Three layers, and the boundaries between them are the design:

| | |
|---|---|
| `src/sim/` | the fixed-tick simulation. Pure, deterministic, engine-free. |
| `src/game/frameClock.ts` | the seam. Milliseconds exist here and stop here: it accumulates real elapsed time from a variable-rate `requestAnimationFrame` and drains whole ticks out of it. |
| `src/render/` | engine-free decision functions — which frame, which flip, which camera bounds. |
| `src/scenes/` | the only place Phaser lives. |

**Collision is data, not names.** A level's solid geometry is an object layer of rectangles carrying
a `solid` property, authored in [Tiled](https://www.mapeditor.org/); nothing in the codebase
resolves a layer or a tileset by its name.

**The art pipeline is reproducible in one direction and honest about the other.** Every generation
is logged with its prompt and its `request_id` in [docs/GENERATION-LOG.md](docs/GENERATION-LOG.md),
sheets are cut from the raws by `npm run assets:build`, and the raws themselves cannot be
regenerated from this repository — see [ASSETS-LICENSE.md](ASSETS-LICENSE.md).

## Commands

```bash
npm run dev                # Vite dev server on :5173
npm run build              # typecheck x2, vite build, then tools/gen/verify-dist.mjs
npm run typecheck          # tsc --noEmit alone — the fastest full check
npm test                   # vitest: the sim, plus the doc and style locks
npm run test:e2e           # Playwright, four projects (see playwright.config.ts)
npm run test:sim-isolated  # uninstall Phaser, run the unit suite, reinstall
```

`npm run build` ends in a gate rather than a bundle. `tools/gen/verify-dist.mjs` fails the build if a
dev-only scene key, a debug symbol or a line of dev-facing prose reaches `dist/`, and asserts every
`.tmj` arrived byte for byte. A second gate, `tools/gen/devSeamGate.mjs`, fails it if any
`import.meta.env.DEV` body survived minification — each guarded body carries a string sentinel that
folds away with it, so absence is proved rather than grepped for.

## Documentation

Everything below `docs/` is the project's working record, not marketing. The useful entry points:

| | |
|---|---|
| [docs/PRD.md](docs/PRD.md) | the spine: the phase table, the constraints, the review protocols |
| [docs/TESTING-RULES.md](docs/TESTING-RULES.md) | every testing rule here, and the false green that paid for it |
| [docs/LESSONS-APPLIED.md](docs/LESSONS-APPLIED.md) | 133 vault notes distilled into hard requirements |
| [docs/ENGINE-NOTES.md](docs/ENGINE-NOTES.md) | Phaser behaviour already paid for in debugging time |
| [docs/ASSET-PIPELINE.md](docs/ASSET-PIPELINE.md) | generation → sheet → catalog |
| [docs/QA-LOG.md](docs/QA-LOG.md) | every measurement, decision and deliberate non-fix |

## Licence — two of them, and they are not the same

**Code: MIT.** `src/`, `tests/`, `tools/` and the root configuration files. See
[LICENSE](LICENSE).

**Art and audio: all rights reserved.** Everything under `public/assets/` and `assets/` — no
redistribution, no reuse in another project. See [ASSETS-LICENSE.md](ASSETS-LICENSE.md).

Cloning the code under MIT gives you no rights to the assets. Build on the code; bring your own art.

## Built with

Phaser 4.2.1 · TypeScript 7 · Vite 8 · vitest · Playwright · Tiled · fal.ai
