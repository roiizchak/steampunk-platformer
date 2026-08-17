# Next session — Phase 8, level design and progression

← [HANDOFF.md](../HANDOFF.md) · [PRD.md § The phases](../PRD.md#the-phases)

**Written 2026-08-17, at the end of the session that closed the four gate defects.**

The previous version of this file (the one that scoped the four gate defects) is superseded. All
four are done and merged.

---

## Where things stand

**Phases 1–7 are ✅.** The four gate defects that were blocking Phase 8 are closed:

| item | outcome |
|---|---|
| **4.23** — red on `main` at 14.75 px | **green.** The renderer was never wrong; two assertions were. |
| **`MAX_BURST_RATIO`** (5.11) | **deleted.** Blind at 10× its own proving mutation. Replaced by wall-ms per simulated tick, red-proved. |
| **`MAX_HUD_GPU_RATIO`** (6.9) | **re-derived.** It was never contention — it fails in isolation. Bound raised on measured evidence, red-proved, stated floor. |
| **the 400-line rule** | **GameScene 432 → 378**, and a citation now expires with the file. Six committed fixtures. |

Plus one that was not in scope and turned up red mid-session: **criterion 7.7**, see the warning
below.

Verified at the end: typecheck · **1356** unit tests · **1356** with Phaser uninstalled · `build` +
`verify-dist` clean · **48** headless · **38** on `chromium-gpu` immediately after, which is the
contention sequence that used to fail.

**Full evidence: [docs/qa/session-gate-defects.md](../qa/session-gate-defects.md).** Read it before
touching any perf gate — it records what each statistic can and cannot see, measured.

---

## 🔴 Read this before trusting a perf gate

Three gates in this repo were **decoration** — green while structurally unable to fail for the defect
they named — and so were **two of the three replacements the last session's own plan specified**. The
only thing that separated them was building the mutation and measuring.

| statistic | verdict |
|---|---|
| a **percentile** over frames | cannot see a cost carried by a small fraction of frames. Proved twice. |
| **frames served**, for a tick-bounded window | works when the defect starves rAF (7.7); **useless** when the window just takes longer in wall time (5.11). |
| a **ratio of two very small numbers** | dominated by noise. 6.9's GPU arms are ~0.13 ms and the HUD costs ~0.001 ms. |
| **wall-ms per simulated tick** | the one that worked for 5.11. |

**If you add a perf assertion, build the mutation first.** Not the convenient one — the one the bound
names.

### ⚠️ Criterion 7.7's frame-loss half is KNOWN-WEAK and is open work

`MAX_AUDIO_FRAME_LOSS_RATIO` is at **1.15** and **no longer catches its own proving mutation**. Twelve
clean runs span 0.9331–1.0961; the 30 ms-per-cue mutation reads **1.0943**, below the worst clean run.
Phase 7 recorded the clean spread as "one frame in 479"; that is not what twelve runs show.

It is labelled in its own docstring, `MAX_AUDIO_WORK_DELTA_MS` is the load-bearing half meanwhile, and
the honest fix — more pairs, a longer window, or a different statistic — **needs its own session**.
Do not read a green 7.7 as evidence that audio costs nothing.

---

## Phase 8 — level design and progression

**This is the session's work.** Start at [docs/prd/phase-08-levels.md](../prd/phase-08-levels.md).
Gates on Phases 3, 5 and 6.

Run it with `superpowers:executing-plans`, one phase per session, in the usual order:

> vault-in → invoke the phase's named skills → **Codex plan review** → build → QA gate (**the agent
> owners in the gate's Owner column**, then the **Codex implementation review**) → vault-out →
> **STOP for approval**

### What this session leaves you that Phase 8 will use

- **4.23 is trustworthy now**, which was the point of settling it first. The character's feet meet
  the floor, and the spec asserts the drawn position *exactly* rather than bounding it — so authoring
  levels against it is safe.
  ⚠️ Its stated limit: it reads the sprite **transform**, not where the boots sit inside the frame.
  A mispacked sheet still needs `sheet-packing.test.ts` and 4.24.
- **The 400-line ratchet is at 0.** No file may exceed 400 lines. `perfSampler.ts` is at 398 and
  `GymScene.ts` at 399 — **one and two lines from red.** Phase 8 will add level-parsing code; expect
  to split early rather than late. An exemption needs a `SIZE-EXEMPTION: <path> lines=N` line in a
  `docs/qa/` log **and** a deliberate ratchet raise.
- **`window.__game` is still closed at eight fields.** A ninth needs a STOP-and-ask. Reading a
  `private` scene field through `__phaserGame` is the established alternative — `drawnVsSim.ts` and
  `perfSampler.ts` both do it.

---

## Traps this session paid for

- **A gate that has never been watched failing is not a gate.** Every red proof this session ran
  found something: one caught a bug *in the fix being proved*, and one showed the planned replacement
  was as blind as what it replaced.
- **The adversarial brief keeps earning its keep** *(A7)*. Four QA briefs ran; the two checklist
  briefs confirmed the work, and the two adversarial ones found five defects that would have shipped —
  including a 4.23 rewrite that had already been declared finished and red-proved, and which passed
  green with **interpolation switched off entirely**.
- **A subagent's summary is a claim.** The gate owners re-measured and got numbers outside the ranges
  this session had documented (6.9 at 1.396 against a documented ceiling of 1.319). Both were
  incorporated. Re-measure rather than trust a range someone else recorded, including your own.
- **`npm run test:sim-isolated` leaves `package.json` without `phaser`** if anything about the run is
  interrupted — recover with `git checkout package.json package-lock.json` and
  `npm i phaser@4.2.1 --save-exact`, then check `node -e "console.log(require('./package.json').dependencies)"`.
- **Kill dev servers by port before reporting done** *(C13)*. A gate owner found a stale one on 5173
  left by an interrupted run.

---

## Explicitly NOT in scope

Re-opening the four gate defects. They are closed and evidenced. **7.7's frame-loss half is open**,
but it is its own session, not a side quest inside Phase 8.
