# Phase 1 — Codex plan review (review 1 of 2)

**Ran:** 2026-08-05, before any code was written.
**Invocation:** `/codex:rescue --wait --fresh`, third attempt — see *Operational note* below.
**Reviewed:** `docs/prd/phase-01-boot.md` and the execution plan at
`C:\Users\royko\.claude\plans\docs-prd-phase-01-boot-md-okay-let-s-st-zippy-hoare.md`, against
`docs/PRD.md`, `docs/LESSONS-APPLIED.md`, `docs/STYLE.md`, `docs/reviews/gate-07-docs.md`, and
`docs/prd/phase-05-combat.md`, `phase-06-hud.md`, `phase-08-levels.md`.
**Repository state at review time:** documentation only — no `package.json`, no `src/`, no
`node_modules`.

---

## Operational note — the protocol's failure mode on this machine

**This supersedes the "a retry succeeded" guidance in [PRD.md](../PRD.md#the-codex-review-protocol).**

The first **two** invocations failed identically with:

```
CreateProcessAsUserW failed: 5 (Access is denied.)
```

Both read **zero** files and both correctly declined to produce findings rather than inventing them.
This is the same failure Gate 7 hit. **It is not transient, and re-running does not fix it.**

**Root cause, diagnosed this session.** Codex's Windows sandbox spawns its shell via
`CreateProcessAsUserW` with a restricted token. The configured shell resolves to:

```
C:\Users\royko\AppData\Local\Microsoft\WindowsApps\pwsh.exe
```

which is a **Microsoft Store execution alias** — a zero-byte reparse point, not a real executable. A
restricted token cannot launch a Store alias, so every sandboxed shell call fails before any file is
opened. There is no standalone PowerShell 7 installation on this machine
(`C:\Program Files\PowerShell\7\pwsh.exe` does not exist) to fall back to.

**Workaround, verified.** Codex's `node_repl` MCP tool is unaffected. Instructing the reviewer to use
`node_repl` with `fs.readFileSync` / `fs.readdirSync` for **all** file access, and to avoid the shell
entirely, produced a fully grounded review on the third attempt — reading every named file, including
one outside the repository, and returning correct file-and-line citations.

**Every later phase's review 1 and review 2 must carry that instruction in the prompt**, or they will
fail the same way.

---

## The report, verbatim

### 1. Deliverables not required by the Phase 1 goal

- **[Medium] Root `.gitattributes`.** Normalizing line endings is not part of standing up the
  toolchain, rendering an empty scene, exposing the debug hook, or building the QA apparatus. The plan
  adds it as a purported C12 measure, but C12 requires confirming that a mutation actually took
  effect, not enforcing LF endings.
  `execution plan:87–89`; `LESSONS-APPLIED.md:105–112`

- **[Low] `src/sim/types.ts`.** Phase 1 requires the sim-boundary test but not a sim source
  placeholder; the execution plan itself assigns all actual sim modules to Phase 2.
  `phase-01-boot.md:40–44`; `execution plan:103–106`; `execution plan:250–254`

- **[Low] The Phase 1 production-bundle absence check.** The plan says to inspect `dist/` for
  `window.__game`, then says that check belongs to Phase 10. The PRD likewise assigns final absence
  verification to Phase 10.
  `execution plan:233–234`; `execution plan:250–255`; `PRD.md:232–239`

### 2. Acceptance criteria that could pass while broken

- **[Blocker] Criteria 1.4 and 1.5 cannot distinguish successful completion, intentional failure, and
  an infinite load.** A healthy run remains in `Boot`, and the failure assertion is also "remain in
  Boot"; the plan explicitly builds no destination scene. Canvas + `sceneKey === 'Boot'` therefore
  passes before loading finishes, and "broken asset blocks boot" passes even if every boot is
  permanently stuck.
  `phase-01-boot.md:58–59`; `execution plan:168–180`

- **[High] Criterion 1.3 can pass vacuously with Phaser uninstalled.** The plan statically scans
  source text without importing every sim entry point; a sim module could transitively reach Phaser
  through a module outside `src/sim/` while the uninstall run never evaluates that import.
  `execution plan:115–127`; `LESSONS-APPLIED.md:125–128`

- **[Medium] Criterion 1.6 can approve dead enforcement.** Its method is code review, while the
  runtime assertion executes only after a texture loads. Nothing in that criterion proves the
  assertion actually ran.
  `phase-01-boot.md:60`

### 3. Cited vault item not satisfied

**[High] C12.** The plan claims `.gitattributes` satisfies C12, but C12 requires verifying that the
specific mutation used by a test really changed its target; line-ending normalization does not provide
that.

### 4. Dependency no earlier phase produces

**[Blocker] A successful post-Boot destination or equivalent observable success transition.**
`GameScene` is deferred to Phase 2, so criterion 1.5 cannot prove that failure — not unconditional
non-routing — caused the block.

### 5. Most likely subtle shipping error

**[High] A stale or writable `window.__game` snapshot.** The PRD calls the surface read-only, but the
plan only says to install and populate one object once, without defining live-update ownership or
read-only enforcement.

### Ruling on the three explicit decisions

- **1920×1080 / 32px / camera-zoom repair belongs in Phase 3** — reasoning direction is right, but the
  "~1.7×" figure is not generally correct (it fits 128px to ~20%, but only ~15% for 96px), and it
  would not "invalidate Phase 4's spend" since Phase 3 must publish zoom before Phase 4's readability
  gate.
- **TS 7.0.2 with 5.9.x fallback** — reasonable, but the fallback should pin an exact 5.9 patch, not a
  floating range.
- **No loader timeout** — approved, matches the vault's prior decision; makes explicit
  `ready`/`bootError` terminal states indispensable.

### 6. The `window.__game` surface

Phases 5, 6 and 8 as currently specified **do not require any field beyond the existing surface**.
Both proposed fields are **necessary**: `ready: boolean` supplies the missing positive terminal
condition, and `bootError: string | null` is the required negative terminal condition given no
timeout. **No other field is justified now** by a cited later-phase spec.

Citations throughout: `docs/PRD.md:232–239`, `docs/LESSONS-APPLIED.md:95–135`,
`docs/prd/phase-05-combat.md:55–69`, `docs/prd/phase-06-hud.md:41–52`,
`docs/prd/phase-08-levels.md:34–42`.

### What the reviewer could not check

Codex has **no network access**. Nothing about npm package availability or version numbers was
verified by this review — `phaser@4.2.1`, `vite@8.2.0`, `vitest@4.1.10`, `@playwright/test@1.62.1`,
`typescript@7.0.2`, and the non-existence of a stable TypeScript 6, were all verified separately
against the registry in-conversation. The two passes are complementary, not redundant. *(Preserved per
vault 9.3 — a gate's blind spots are part of its result.)*

---

## Triage

Every finding is **applied**, or **rejected with a one-line reason** *(vault C11)*.

| # | Finding | Sev | Disposition |
|---|---|---|---|
| F1 | 1.4/1.5 cannot distinguish success, refusal and infinite hang | **Blocker** | **Applied.** `ready` + `bootError` added to the `__game` surface; three-way discrimination table added to the QA gate; an unmodified-run assertion added to 1.5. |
| F2 | 1.3 passes vacuously — a static scan misses a transitive Phaser import | **High** | **Applied.** The boundary test now *import-evaluates* `src/sim/index.ts` in addition to scanning. |
| F3 | `.gitattributes` does not satisfy C12 | **High** | **Applied.** Claim withdrawn. C12 is marked **N/A for Phase 1** (no mutation testing here; it binds Phase 2's gate 2.5). `.gitattributes` is kept on its own merits — it removes the live CRLF hazard, which is C12's *precondition*, not C12. |
| F4 | 1.6 is a code review of an assertion nothing proves ever ran | Medium | **Applied.** A failed filtering assertion now routes to the same refusal path as a missing texture, and a `?breakFilter=1` fixture proves it fires. |
| F5 | `window.__game` risks being a stale, writable snapshot | **High** | **Applied.** Installed via `Object.defineProperty` with a getter and no setter, reading live from a single owner. |
| F6 | No post-Boot destination, so 1.5 cannot prove failure caused the block | **Blocker** | **Applied without building `GameScene`** (Phase 2 owns it). The unmodified-run row supplies the discrimination: same build, only the query parameter differs. |
| F7 | `src/sim/types.ts` is not required by the Phase 1 goal | Low | **Rejected** — in direct tension with F2, which Codex ranked higher. A real, imported sim barrel is precisely what makes criterion 1.3 non-vacuous. Kept, renamed `src/sim/index.ts`. |
| F8 | The `dist/` absence check belongs to Phase 10 | Low | **Applied.** Dropped from Phase 1 verification. |
| F9 | "~1.7× zoom" is right only for 128px; "invalidates Phase 4's spend" overstated | Medium | **Applied.** Figure removed, claim softened; the obligation is still recorded against Phase 3. |
| F10 | The 5.9 fallback should pin an exact patch | Low | **Applied.** |
| F11 | No loader timeout — approved; makes `ready`/`bootError` indispensable | — | Consistent with F1. |
| F12 | No field beyond the surface needed for 5/6/8; both additions necessary | — | **Applied.** Surface closed at nine fields. |

**Applied: 11. Rejected with a reason: 1.**

## Was the review worth its cost?

**Yes, on its first run.** F1 and F6 are the same defect seen from two angles: the phase's own QA gate
could not tell a successful boot from an infinite hang, because both leave the game sitting in `Boot`.
The in-conversation review did not catch it. That is the first datapoint for the protocol.
