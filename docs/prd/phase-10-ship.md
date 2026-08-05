# Phase 10 — Build and ship

← [PRD spine](../PRD.md) · prev: [Phase 9](phase-09-polish.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Production build, dev seams stripped, licensing split, full regression. Ship it.

🔴 **OPEN — needs a user decision before this phase can start.** Vault items 10.4 and 10.5 require a
**rollback command** and a **CSP header configuration**, and both are properties of a hosting target
that **no document in this repository names**. "Ship it" currently has no destination.

Until a target is chosen, criteria 10.6 and the rollback half of 10.4 are **unrunnable, and an
unrunnable criterion means this phase is reported failing** (Global Constraints). The question to
settle: is the deliverable a hosted playable URL, or a `dist/` folder handed over? If hosted — which
provider, and what is its rollback command? Answer it before Phase 9 ends, not here.

### 2. Required skills
`game-setup-and-config` · `scale-and-responsive` · `superpowers:verification-before-completion`

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
**Runs now, before any code.** Invoke **`/codex:rescue --wait --fresh`** with the review-1 prompt from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol), naming this file.
Save verbatim to `docs/reviews/phase-10-plan.md`, then append the triage. Review 2 uses `--wait --resume`.

This is the **twentieth** run of the protocol. Give it `docs/reviews/` in full and ask it to read
across phases, not just this one — the cross-phase question is the only one it has never been asked.

Ask Codex in particular: **enumerate every dev-only seam in this repository and state, for each,
whether criterion 10.2 would actually catch it in `dist/`.** Grepping for `__game` does not catch a
Playground scene that is merely unreferenced but still bundled. And: **read `docs/reviews/*-plan.md`
from all nine earlier phases — which warning was recorded-but-not-fixed and is now shipping?**

### 5. Deliverables
`ASSETS-LICENSE.md` · `LICENSE` · `README.md` · production `vite.config.ts` ·
`tests/e2e/phase-10-production.spec.ts`

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 10.1 | `npm run build` clean; production bundle runs | command + browser | — |
| 10.2 | **`window.__game`, Playground, Gym and Element Editor absent from `dist/`** | grep the bundle *(1.6/10.6)* | qa-expert |
| 10.3 | Build-target and minifier defaults recorded with reversal instructions | doc *(10.1)* | — |
| 10.4 | Bundle size change explained via raw-vs-gzip ratio | *(10.2)* | qa-expert |
| 10.5 | Build config typechecked as its own program | *(10.3)* | code-reviewer |
| 10.6 | CSP verified against the **production** header config locally. **Blocked until a hosting target is chosen — see §1** | *(10.5)* | qa-expert |
| 10.7 | `git log --all -p` clean of secrets | command *(10.6)* | qa-expert |
| 10.8 | Licences split: code vs generated assets | doc *(10.6)* | — |
| 10.9 | Asset rebuild from a fresh clone is byte-identical | *(10.9/4.15)* | qa-expert |
| 10.10 | **Specs 01–10 all green** | full suite | e2e |
| 10.11 | **Every prior phase's acceptance criteria re-verified** | full regression | qa-expert |
| 10.12 | Full playthrough on the production build | hands-on *(C4)* | play |
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
