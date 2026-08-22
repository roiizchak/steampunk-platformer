# Next session — the jump clip, the inherited gate, then Phase 10

← [PRD spine](PRD.md) · [HANDOFF](HANDOFF.md) · [Phase 10 spec](prd/phase-10-ship.md)

> Written 2026-08-22 at the close of the Phase 9 session, by the integrator, while the context was
> still live. **Read [HANDOFF.md](HANDOFF.md) first** — it is the index and carries the traps.
> `main` is `ae51224`, pushed to `origin`. Phase 9 is merged and owner-approved.

---

## 0. Answer this before any Phase 10 work starts

**Phase 10 cannot begin without it, and no document in this repository answers it.**

> ### Where does this game ship to?

`docs/prd/phase-10-ship.md` §1 marks itself **OPEN** on exactly this. Vault items 10.4 and 10.5
require a **rollback command** and a **CSP header configuration**, and both are properties of a
hosting target. Until one is named, criterion **10.6** and the rollback half of **10.4** are
**unrunnable — and an unrunnable criterion means the phase is reported FAILING** (Global
Constraints). "Ship it" currently has no destination.

Sub-questions that fall out of the answer, all of which change the work:

| | question | why it changes the work |
|---|---|---|
| a | static host (GitHub Pages / Netlify / Vercel / Cloudflare Pages) or a server you control? | decides whether CSP arrives as a header or a `<meta>` tag — **a `<meta>` CSP cannot carry `frame-ancestors`** |
| b | what is the rollback command on that target? | 10.4 asserts one exists and works, not that one is documented |
| c | a custom domain, or the host's default? | changes the CSP origins and any absolute asset path |
| d | is the repository going public? | changes the licensing split in §5 and the secret-scan criterion's scope |

**Do not pick a target on the user's behalf and do not proceed on an assumption.** This is a
STOP-and-ask, and it is the one blocking question in the whole session.

Jobs 1 and 2 below are **not** blocked by it. Start there while the answer comes back.

---

## 1. The jump clip reads 69% of idle — owner-reported, measured, unfixed

The owner played the merged Phase 9 build, approved it, and reported one defect:
**the jump animation looks different from the rest, and looks smaller.** It was measured before being
written down, so this starts from numbers.

Drawn figure height per frame — opaque rows inside the 336 × 384 cell, read off the shipped
`public/assets/characters/brass-courier/sheets/*.png` with `tools/gen/png.mjs`:

| clip | per-frame heights | mean | vs idle |
|---|---|---|---|
| idle | 287–289 | 288.1 | — |
| walk | 286–292 | 288.9 | 100% |
| attack | 283–289 | 287.6 | 100% |
| run | 261–279 | 275.7 | 96% |
| fall | 277,263,246,224,206,203,206,218,232 | 230.6 | starts full, tapers |
| **jump** | **215,186,195,201,204,197** | **199.7** | **69%** |
| death | 288 → 64 | 145.2 | shrinks legitimately (the character collapses) |

**Jump never reaches full height on any of its six frames** (max 215). Fall's *first* frame is 277 —
so an airborne pose can read near-full height on this character, and a tucked pose alone does not
explain jump.

### The two leads, in the order worth testing

**Lead 1 — jump has no `_actionScale` override and may need one.**
In `public/assets/config/character-bounds.json`, `fall` carries `scale: 0.6`, `attack` `0.6` and
`death` `0.60504202` — per-(slug, action) overrides added because those clips were shot from
**padded** generations. **`jump` carries none**, so it packs at the unpadded slug default
`0.23723229`. Jump and fall are the airborne pair and both use `verticalAnchor: "centroid"`; one
having a padded scale and the other not is the asymmetry to check first.

> ⚠️ **Do not paste 0.6 into jump.** A straight missing 0.6 override would put jump at roughly **40%**
> of idle, and it measures **69%**. If lead 1 is the cause at all, jump's padding differs from fall's
> and the number must be **re-derived**, never guessed.
> `node tools/gen/build-assets.mjs brass-courier jump --derive-scale` prints it and **a human pastes
> it**, in that order *(vault A5)*. `assets:build` **reads** the scale and never computes it.

**Lead 2 — "looks different" is probably the derivation path, not the pose.**
In `public/assets/index.json`, `jump` and `fall` are `derivedFrom: "sim"` while `idle`, `walk` and
`run` are `"authored"`. The two airborne clips came through a different pipeline from everything the
owner is comparing them against. Check `tools/gen/motionAirborne.mjs` and `clipAnchors.mjs` before
concluding anything about the art.

### Before regenerating anything

- Re-read [ASSET-PIPELINE.md](ASSET-PIPELINE.md) and [STYLE.md](STYLE.md). The art direction is locked
  mechanically by `tests/unit/style-lock.test.ts`; **a red hash is an approval checkpoint, never
  something to clear by editing the hash.**
- **Regenerating `idle` re-derives the slug scale and silently rescales every other animation**
  *(vault A5)*. Idle is rebuilt FIRST or not at all.
- **A fal batch over 5 generations is a STOP-and-ask.** So is any new dependency.
- Prefer a config fix to a regeneration. Spending fal money on a number that can be re-derived from
  the frames already on disk is the expensive way round.

### How it is verified

The owner's report was visual, so **the fix is closed visually — by measuring pixels, not by
inferring from config** *(the Phase 9 lesson, § Vault-out §8: an evidence clip was once approved for
effects that were not on screen)*. Re-run the height measurement above and put jump within the band
idle/walk/attack occupy, then capture a clip for the owner to judge. **Keep the clip; do not delete
it after sending.**

---

## 2. G.7b — the inherited perf gate

**Check its state first — a repair was in flight when this was written and may have landed.**
`git log --oneline main -5` and look for it; if a `worktree-agent-*` branch carries it, re-verify
before merging rather than trusting the agent's report.

`tests/e2e/phase-08-gate-perf.spec.ts:264`, criterion **G.7b** — a **Phase 8** criterion, inherited.
Not caused by Phase 9 and it cannot be closed by Phase 9. Fails roughly **3 runs in 8** on `main` as
well as on the phase branch. Last observed failure had **both arms reading `0.0000 ms`**:

```
the per-exit cost measured at 20 copies (0.0000 ms) and at 40 (0.0000 ms) disagree by 25.6x.
```

The diagnosis is settled and is in [qa/phase-09-polish.md](qa/phase-09-polish.md) § Vault-out §5:

> the failing shape is **reducing each arm to a single UNPAIRED median, then subtracting or dividing,
> when the effect is within a few timer quanta.** `performance.now()` quantises to **0.1 ms** here.

The repair is 9.5's and needs **both** halves — pair the observations and take the median of
per-round *deltas*, **and** separate the arms far enough that the effect clears the grid. Pairing
alone still ordered only 4 runs in 6.

**Forbidden here:** moving the bound, `test.skip`, deleting the gate. *A statistic that cannot order
its own mutation is not fixed by moving the bound — replace the statistic.*

---

## 3. Phase 10 — Build and ship (blocked on §0)

15 criteria, [prd/phase-10-ship.md](prd/phase-10-ship.md). Scope: production build, dev seams
stripped, licensing split, full regression.

Two things Phase 10 specifically verifies that earlier phases only asserted:

- **`window.__game` and `window.__phaserGame` are absent from `dist/`.** `verify-dist.mjs` already
  fails on dev-only scene keys, debug symbols and dev prose; Phase 10 is where their absence is a
  criterion.
- **The recorded-but-not-fixed warnings from all nine earlier phases** — the spec asks which one is
  now shipping. That sweep is real work: read every `docs/qa/phase-NN-*.md` § "what the gates do NOT
  cover" and every **RECORDED** verdict in `docs/reviews/`.

Run it under the full [CLAUDE.md §4](../CLAUDE.md) workflow — vault-in → named skills → **Codex plan
review** → build → QA gate (**the agent owners in the Owner column**, two briefs each *(A7)*, then
the **Codex implementation review**) → vault-out → **STOP for approval**. Phase 10 additionally runs
`voltagent-qa-sec:security-auditor` with the `security-review` skill.

---

## 4. Standing constraints — unchanged, and none of them are negotiable

- **Every agent that can touch files runs under `isolation: "worktree"`.** No agent merges its own
  work; no agent commits to `main`. A ban written into a brief is not enforcement — six Phase 8
  agents corrupted the shared tree and a commit captured it.
- **A subagent's summary is a claim, not evidence.** Re-verify locally whatever it could not run.
- **Withhold findings between adversarial briefs** *(A7)*; brief 2 never sees brief 1's output.
- **No new dependency.** Runtime `phaser@4.2.1` exact; dev `vite`, `typescript`, `vitest`,
  `@playwright/test`. Anything else: STOP and ask.
- **`src/sim/` imports nothing from Phaser**, reaches no clock, no `Math.random`, no DOM, no Arcade
  Physics. Every duration is an integer count of 60 Hz ticks.
- **Do not renumber `src/sim/tick.ts`'s 14-step order.** Lettered inserts only; renumbering is a
  balance change and needs a STOP-and-ask.
- **No source file over 400 lines** without a written justification in `docs/qa/`.
- **`window.__game` is closed at eight fields.** A ninth needs a STOP-and-ask.
- **STOP and ask** before: a new dependency · deleting a file · a fal batch over 5 generations · a
  ninth `__game` field · contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md · renumbering the tick
  contract · merging to `main`.
- **A phase with a failing or unrun criterion is reported FAILING.** Never as done.

### Testing rules that bind every change here

- **Watch every gate fail before trusting it** *(C1)*, and confirm the mutation reverted *(C12)* by
  "content changed AND the original count dropped by one" — **never** "the count is now zero".
- **Detect redness positively** from `Tests N failed` plus named specs; **detect greenness positively
  too, including the test COUNT.** A run that selected nothing reports `expected: 0, unexpected: 0`
  and exits 0. **A zero exit through a pipe is `tail`'s exit, not the gate's.**
- Drive mutation loops **from the shell**, never from a Node script.
- **Only one Playwright run at a time, and nothing heavy beside it.** Kill the dev server by port
  between runs — Playwright leaks 5173 on Windows.
- **A perf bound is chosen on one set of runs and confirmed on a HELD-OUT set** that had no say in it.
- **Never attribute a perf red from one run per arm.** That mistake was made on G.7b and was wrong.
- **The headless harness is not the frame rate** — SwiftShader inflates e2e ms ~21×.
- **Never `waitForTimeout`.** Wait on `window.__game.ready`.

---

## 5. Verification before anything is called done

```bash
npm run typecheck                 # tsc --noEmit
npm test                          # unit — read the COUNT, not the exit code
npm run build                     # tsc + vite build + verify-dist.mjs
npm run test:sim-isolated         # recover with: npm i phaser@4.2.1 --save-exact
npm run test:e2e                  # one at a time, nothing heavy beside it
```

At the close of Phase 9 these read: typecheck clean · unit **2154 pass / 0 fail** (133 files) ·
build exit 0 with `verify-dist ok: 5 level(s) and 11 audio file(s) byte-identical` ·
`test:sim-isolated` **2151 passed / 3 skipped** · e2e **118 passed / 1 failed** (the failure is
G.7b). **Anything worse than that is a regression this session caused.**

---

## 6. Do not re-litigate these — already decided

| | decided |
|---|---|
| Hit-stop shape | per-body integer tick counter; **both** bodies freeze the same count, the world keeps ticking. Settled by user ruling. |
| The tick contract | 14 numbered steps, authoritative. Phase 9's additions went in as lettered inserts 4a/4b/4c and 9b/9c/9d. Not to be renumbered. |
| `_actionScale` lives in the config | on purpose *(vault A5)*. `assets:build` reads it, never computes it. |
| The perf failure shape | unpaired median per arm, **not** "a ratio with a quiet denominator". That first diagnosis was written down, refuted, and corrected — the correction is in the vault. |
| Phase 9's evidence clip | approved twice; the first approval was withdrawn because it predated the emit-window fix. Closed. |
| G.7b's attribution | **not** Phase 9's. Established across eight runs on both branches. |
