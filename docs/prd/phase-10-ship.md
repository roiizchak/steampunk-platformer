# Phase 10 — Build and ship

← [PRD spine](../PRD.md) · prev: [Phase 9](phase-09-polish.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Production build, dev seams stripped, licensing split, full regression. Ship it.

✅ **UNBLOCKED 2026-08-26 by owner decision. The 🔴 OPEN block this section carried is resolved.**
It read *"'Ship it' currently has no destination"* — vault items 10.4 and 10.5 need a **rollback
command** and a **CSP header configuration**, and both are properties of a hosting target that no
document in this repository named. Four decisions settle it:

1. **The target is Vercel.** CLI **56.5.0**, installed, on PATH and authenticated. **Criterion 10.6
   and the rollback half of 10.4 are runnable**, and row 10.6 below no longer says otherwise.
2. **A full production deploy is in scope.** `vercel --prod` is a **STOP-and-confirm gate**: the
   preview URL, the CSP as actually served, the playthrough evidence and a rehearsed rollback go to
   the owner first, and only the owner promotes. *(Vault 10.4: the deploy command that reads like a
   dry run is a release.)*
3. **Licensing splits** as 10.8 requires: `LICENSE` = MIT over the code — `src/`, `tests/`, `tools/`
   **and the root source and config files** (`vite.config.ts`, `playwright.config.ts`, `index.html`,
   `tsconfig*.json`). The root files were added by owner ruling on 2026-08-26 because leaving them
   unlicensed in a public repo is a real gap, not a formality. `ASSETS-LICENSE.md` = the generated
   fal.ai art and audio, © the repo owner, all rights reserved, no redistribution. **The repo is going
   public, so 10.7's history sweep is live** — and the owner, not this session, flips visibility,
   after reading the sweep.
4. **Both Codex reviews run through `claudex-loop:codex-review`** — see §4.

### 2. Required skills
`game-setup-and-config` · `scale-and-responsive` · `security-review` · `find-docs` ·
`e2e-playwright-testing` (specs) · `playwright-cli` (drive the running game)
**Always:** `superpowers:executing-plans` · `superpowers:test-driven-development` ·
`superpowers:systematic-debugging` · `superpowers:verification-before-completion`

### 3. Vault-in
**10.1** after a toolchain upgrade diff the **outputs**, not the changelog — a Vite major silently
moved the minimum browser contract · **10.2** a post-upgrade size change is a hypothesis; raw-vs-gzip
ratio is the discriminator · **10.3** typecheck the build config as its own program · **10.4** a push
to main is a production deploy; learn the rollback command **before** you need it · **10.5** CSP:
`data:` and `blob:` for images, `'self'` for connect-src, **keywords must be quoted** — bare `self`
blanks the game rather than erroring — and `style-src 'unsafe-inline'` is load-bearing because the
scale manager writes inline margins · **10.6** split licensing before the repo is public; check
`git log --all -p` for secrets, not the working tree; **hide dev-only chrome or the demo looks like a
dev build** · **10.7** anything a human will watch needs a second driver; disable window-occlusion
optimisation on Windows · **10.9** reproducible asset rebuild verified from a fresh clone

### 4. Codex plan review

🔴 **PROTOCOL SUBSTITUTION, authorised by the owner 2026-08-26. Recorded here rather than done
silently.** [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol) and
[CLAUDE.md §4](../../CLAUDE.md) both say `/codex:rescue`. **This phase uses
`claudex-loop:codex-review` for BOTH reviews instead.** That skill runs the same read-only Codex
critic against the plan and returns `VERDICT: APPROVED` / `VERDICT: REVISE`, looping on one persistent
thread so the reviewer keeps its earlier context between rounds — which is what makes the round-2+
"is this fixed or only reworded?" question answerable at all. Everything else is unchanged: **both
outputs still land at `docs/reviews/phase-10-plan.md` and `docs/reviews/phase-10-impl.md`**, verbatim
plus triage, because `tests/unit/docs-contract.test.ts` and criteria 10.14/10.15 read those paths.

**Runs now, before any code**, with the review-1 questions from the PRD protocol naming this file.

This is the **twentieth** run of the protocol. Give it `docs/reviews/` in full and ask it to read
across phases, not just this one — the cross-phase question is the only one it has never been asked.

Ask Codex in particular: **enumerate every dev-only seam in this repository and state, for each,
whether criterion 10.2 would actually catch it in `dist/`.** Grepping for `__game` does not catch a
Playground scene that is merely unreferenced but still bundled. And: **read `docs/reviews/*-plan.md`
from all nine earlier phases — which warning was recorded-but-not-fixed and is now shipping?**

⚠️ Codex's sandboxed shell cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`).
Every review prompt must tell it to use the `node_repl` MCP tool with `fs.readFileSync`. Its findings
are **file-evidence only and must be re-verified locally** before being acted on.

### 5. Deliverables
`ASSETS-LICENSE.md` · `LICENSE` · `README.md` · production `vite.config.ts` ·
`tests/e2e/phase-10-production.spec.ts`

Added 2026-08-26, because the hosting target is now named and 10.2 needed a gate that can actually
fail: **`vercel.json`** (the production header config 10.6 is verified against) · **`.vercelignore`** ·
**`tsconfig.build.json`** + a `typecheck:build` script (10.5) · **`tools/dev/prod-server.mjs`**, which
serves `dist/` with the headers **imported from `vercel.json`** so the CSP has one source · and the
**dev-seam bundle gate** (`tools/gen/devSeamGate.mjs`, a Vite `generateBundle` plugin) that closes the
false green `verify-dist.mjs:66-84` has had documented as uncaught since 2026-08-23.

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 10.1 | `npm run build` clean; production bundle runs | command + browser | — |
| 10.2 | **`window.__game`, Playground, Gym and Element Editor absent from `dist/`** | grep the bundle *(1.6/10.6)* | `voltagent-qa-sec:qa-expert` |
| 10.3 | Build-target and minifier defaults recorded with reversal instructions | doc *(10.1)* | — |
| 10.4 | Bundle size change explained via raw-vs-gzip ratio | *(10.2)* | `voltagent-qa-sec:qa-expert` |
| 10.5 | Build config typechecked as its own program | *(10.3)* | `voltagent-qa-sec:code-reviewer` |
| 10.6 | CSP verified against the **production** header config locally — never the dev server. **Unblocked 2026-08-26: the target is Vercel (§1), so the production header config is `vercel.json` and the local check imports its headers rather than restating them.** A local pass is the FIRST check, not the last — it cannot exercise Vercel's route matching or its edge, so `curl -sI` against the real preview deployment is recorded beside it | *(10.5)* + `security-review` | `voltagent-qa-sec:security-auditor` |
| 10.7 | `git log --all -p` clean of secrets — history, not the working tree | command *(10.6)* | `voltagent-qa-sec:security-auditor` |
| 10.8 | Licences split: code vs generated assets | doc *(10.6)* | — |
| 10.9 | 🔴 **AMENDED 2026-08-26 by owner ruling — this is a criterion amendment, not the original criterion satisfied.** It read *"Asset rebuild from a fresh clone is byte-identical"*, and **that cannot run**: `_generated/` (the raw model output `assets:build` packs from) is gitignored, and the `npm run assets:fetch` script `.gitignore:12` names to restore it **does not exist in `package.json`**. Amended to **ship-path reproducibility** — fresh clone → `npm ci` → `npm run build` → `dist/assets/**` byte-identical to the main-tree build. ⚠️ **Codex's objection, recorded rather than resolved:** *"weakened, not discharged — fresh-clone Vite output equality proves tracked-input deployment determinism. It does not run the asset generator or prove tracked frame picks rebuild the shipped sheets."* The consequence is that the public repo **cannot reconstruct its own art from its recorded provenance**. See 10.13's headline disposition | *(10.9/4.15)* | `voltagent-qa-sec:qa-expert` |
| 10.10 | **Specs 01–10 all green** | full suite | e2e |
| 10.11 | **Every prior phase's acceptance criteria re-verified.** ⚠️ *"Every"* is load-bearing and **Phase 4's 4.27 was unrun** — `tools/gen/anchorGate.mjs` exists and works but no `assets:*` script invoked it (`PRD.md:30`), so nothing re-ran it. **Owner ruling 2026-08-26: wire it, run it, close it** — the only option that satisfies this criterion as written. Note **wiring is not verifying**: the gate must actually run and pass via `npm run assets:build`, which `npm run build` does not invoke (`package.json:8,14`) | full regression | `voltagent-qa-sec:qa-expert` |
| 10.12 | Full playthrough on the production build. ⚠️ **`levelDriver.ts` cannot drive `dist/`** — it reads `window.__phaserGame` and `scene.simWorld` (`levelDriver.ts:48,108,143-145`), both stripped by design. Split: production is real keyboard input against the `localStorage['steampunk.progress']` `completed` false→true transition; the mechanical regression runs `levelDriver.ts` on the **dev** build at the same commit. `playwright-cli` produces the hands-on screenshots but **cannot platform this game** — every command is a round trip while the game runs on real time | `playwright-cli` + hands-on *(C4)* | play |
| 10.13 | **Every recorded-but-not-fixed Codex finding from phases 1–9 re-reviewed and dispositioned** | `docs/reviews/` sweep *(C11)* | — |
| 10.14 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-10-plan.md` | — |
| 10.15 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-10-impl.md` | codex |

**Regression set:** everything.

### 7. Vault-out
The complete retrospective: what the 400-line ceiling cost and bought, whether the sim/render split
paid off, total real fal spend vs the quoted rates, and which vault lessons actually fired.
**Plus the Codex protocol's own verdict:** across ten phases, how many findings did each review
produce, how many were real, and was the plan review or the implementation review worth more? That
number is the reusable lesson.

### 8. Demo
The finished game, production build, played start to finish.
