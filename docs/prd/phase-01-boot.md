# Phase 1 — Boot

← [PRD spine](../PRD.md) · next: [Phase 2](phase-02-player.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Vite + Phaser 4.2.1 + TypeScript + vitest + Playwright stand up. An empty scene renders. The
`window.__game` debug hook exists. The full QA apparatus is built here, once, so every later phase
inherits it.

### 2. Required skills
`game-setup-and-config` · `scenes` · `scale-and-responsive` · `v4-new-features` · `find-docs` ·
`e2e-playwright-testing`
**Always:** `superpowers:executing-plans` · `superpowers:test-driven-development` ·
`superpowers:systematic-debugging` · `superpowers:verification-before-completion`

### 3. Vault-in
**1.1** sim imports nothing from Phaser — provable by uninstalling Phaser · **1.2** Vite config loader
uses `.ts`, never `.js`; a quiet warning is not evidence *(A8)* · **1.3** the loader refuses to route
past boot if any expected texture is missing — 404 *and* corrupt-200 · **1.4** the loader has no
default timeout; decide consciously and record the decision · **1.5** decide pixel-art vs smooth
filtering **once** and assert it (Phaser's scale-mode constants are reversed: linear = 0 = default) ·
**1.6** decide per seam which side of the build gate it lives on — applies to `window.__game` ·
**1.7** reset scene state in `init`, not the constructor; scene starts are queued · **C12** confirm
mutations applied — this repo already emits CRLF warnings

### 4. Codex plan review
**Runs now, before any code.** Invoke **`/codex:rescue --wait --fresh`** with the review-1 prompt from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol), naming this file.
Save the report verbatim to `docs/reviews/phase-01-plan.md`, then append the triage. Every finding
applied, or recorded with a reason *(C11)*. Review 2 later uses `--wait --resume`.

**This is the protocol's first run on a plan.** If the review returns a grounding complaint instead of
findings, re-run it — a review that could not read the repository is not a pass.

Ask Codex in particular: **is the `window.__game` surface below sufficient for every later phase's
e2e spec, or will Phase 5/6/8 need a field that is not there?** Changing this surface later
invalidates every spec written against it, so it is the one decision in this phase that is expensive
to get wrong.

### 5. Deliverables
`package.json` (deps exactly as Global Constraints) · `vite.config.ts` · `tsconfig.json` ·
`src/main.ts` · `src/game/config.ts` · `src/game/constants.ts` · `src/scenes/BootScene.ts` ·
`src/debug/globals.ts` · `tests/unit/sim-boundary.test.ts` · `tests/e2e/phase-01-boot.spec.ts` ·
`playwright.config.ts` · `docs/QA-LOG.md` · `docs/reviews/` (both Codex outputs)

`window.__game` surface, fixed now because every later e2e spec depends on it:
```ts
{ sceneKey: string; tick: number; player: { x, y, vx, vy, state } | null;
  score: number; health: number; levelId: string | null;
  ready: boolean; bootError: string | null }
```
**`ready` and `bootError` were added during this phase**, on the Codex plan review's finding that
without them a successful boot, a refused boot and an infinite hang are indistinguishable — all three
sit in the Boot scene — so this phase's own QA gate could not fail. See
[PRD.md](../PRD.md#the-windowgame-surface) and [reviews/phase-01-plan.md](../reviews/phase-01-plan.md).

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 1.1 | `npm run build` succeeds; `tsc --noEmit` clean | command output | — |
| 1.2 | `vitest run` green | command output | — |
| 1.3 | **Sim suite passes with Phaser uninstalled** | uninstall, run, reinstall | `voltagent-qa-sec:qa-expert` |
| 1.4 | Canvas mounts; `sceneKey === 'Boot'`; zero console errors | `phase-01-boot.spec.ts` | e2e |
| 1.5 | Missing texture blocks boot; corrupt 200 also blocks | deliberately break an asset, observe | `voltagent-qa-sec:qa-expert` |
| 1.6 | Filtering mode asserted at runtime with a comment explaining the reversed constants | code review | `voltagent-qa-sec:code-reviewer` |
| 1.7 | No source file > 400 lines | `wc -l` sweep | — |
| 1.8 | Diff reviewed | `voltagent-qa-sec:code-reviewer` | `voltagent-qa-sec:code-reviewer` |
| 1.9 | Adversarial pass: *how could this be wrong?* | second review brief *(A7)* | `voltagent-qa-sec:code-reviewer` |
| 1.10 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-01-plan.md` | — |
| 1.11 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-01-impl.md` | codex |

**Regression set:** none — this is the baseline.

### 7. Vault-out
Whether the sim/render boundary held under a real Phaser 4.2.1 boot. Anything Phaser 4 changed that
the vault's Phaser 3-era notes got wrong. The actual Vite 8 / TS 6 config that worked.
**New this phase:** whether an independent model reviewing the plan caught anything the in-conversation
review did not — that is the evidence for or against the Codex protocol being worth its cost.

### 8. Demo
`npm run dev` → a blank canvas at the right size, correct filtering, no console errors. In the
browser console, `window.__game` returns the object above.
