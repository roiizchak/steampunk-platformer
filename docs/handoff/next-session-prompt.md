# Next session — the prompt, and everything left to decide

← [HANDOFF.md](../HANDOFF.md) §17 · [PRD.md § The phases](../PRD.md#the-phases)

**Written 2026-08-16, at the end of the session that closed Phase 6.**

---

## Where things stand

**Phase 6 is done and merged to `main`, reported passing.** `main` is pushed and green: typecheck ·
1224 unit tests · 1224 with Phaser uninstalled · build + `verify-dist` · 48 headless e2e · 24 on
`chromium-gpu` · port 5173 clear.

Phases 1–6 are ✅. **Phase 7 (Audio) is next**, and it gates on Phase 5.

Nothing is blocked. Everything below is either a decision only you can make, or work already written
down with an owner.

---

## The prompt to paste next session

> +500k
>
> Continue with Phase 7 (Audio), per `docs/prd/phase-07-audio.md`. Follow the full workflow:
> vault-in from `docs/lessons/phase-07-audio.md`, invoke the phase's §2 skills at the stage that
> needs them, Codex plan review before any code, build, then the QA gate — the agent owners in the
> gate's Owner column with **two briefs each**, then the Codex implementation review — then
> vault-out and STOP for approval.
>
> Read `docs/HANDOFF.md` §17 first. It carries three things into this phase and names two traps
> from Phase 6 that apply directly to a parallel audio manager.
>
> Before planning, give me the decisions below with options, the way the last two sessions did.
> Note that 4.2b and the session size are already decided — the art ceiling is `$50` and the
> ordering rule stands, so the open one is the **audio** budget and when to set it.

---

## Decisions — nothing here is technical, all of it is yours

### 1. ✅ Phase 4's criterion 4.2b — DECIDED 2026-08-16

**The art-spend ceiling is raised from `$25` to `$50`, and 4.2b is closed.** Phase 4's `$31.39` now
sits inside it with `$18.61` of headroom. Recorded in
[qa/phase-04-art.md](../qa/phase-04-art.md) and declared in
[PRD.md § Global Constraints](../PRD.md#global-constraints); Phase 4's PRD row now shows **4.27 as
its only open item**.

**What survived the amendment**, and it is the half that matters: 22 clips ran before anyone read an
invoice, and no ceiling makes that fine. **Read the invoice before the next batch, not after it.**
Phase 4 had a ceiling and overran it anyway, precisely because nothing was measured until the money
was gone.

**Nothing to decide here next session.** It is listed so the next reader sees it was settled
deliberately rather than quietly dropped.

### 2. How much art does Phase 7 need, if any?

Phase 7 is Audio. Audio is not fal image generation, so the **$50 art ceiling does not cover it** —
it is the *art* ceiling, and a new medium needs its own number.

| Option | What it means |
|---|---|
| **A — Decide the audio budget up front** | Set a ceiling before anything is generated, so 4.2b's ordering mistake cannot repeat in a new medium. |
| **B — Grey-box audio first** | Placeholder sounds until the mechanics are proven, then spend. Mirrors the project's own *grey-box before art* rule. |

**I lean B then A** — prove the hooks with placeholder audio, then set a ceiling before the real
batch. That is the same order Phase 4 got wrong.

### 3. ✅ Session size — DECIDED 2026-08-16: run it large

The last three sessions each ran long — Phase 6's closing session did eight agent runs, two Codex
reviews, a hands-on playtest and a full regression sweep, and the gate is where the defects were
actually caught.

**Start the next session with a budget directive**, e.g. `+500k`, in the same message as the prompt
below. That is a thing only you can type; there is no setting on this side. Without it the session
is paced against a limit it will meet somewhere in the middle of the QA gate, which is the worst
possible place to run short — the second Codex review alone produced five applied fixes and
uncovered a live crash.

---

## Carried work — already written down, no decision needed

These have owners and will be picked up by the phase named. Listed so nothing is a surprise.

| Owner | Item |
|---|---|
| **Phase 7** | Three `hudObjects()` call sites reach the HUD without `waitForHud` — a latent race, same shape as the one fixed this session. |
| **Phase 8** | The gear-burial validator misses a gear on the **seam between two floor rects**. A 96 px grid makes that the *default* authoring outcome, and Phase 8 is the phase that authors multi-rect floors. Wants `GEAR_BOX` overlap, not a centre-point test. |
| **Phase 8** | Re-measure counter contrast against any new palette. The text fill alone is 15.04:1 on near-black but **3.13:1 on mid-grey and 1.13:1 on bright sky** — it is the 6 px stroke carrying it. |
| **Phase 9** | `addHelpBanner` uses a literal `18px`, unscaled — about **8 physical px at 852×480**, below the project's own ~11 px floor. Confirmed illegible in this session's playtest screenshot. It should move into `UIScene`. |
| **Phase 9** | That same banner uses `setScrollFactor(0)` on `GameScene` — vault 6.1's exact pattern, re-created outside the HUD. Harmless only because `CAMERA_ZOOM` is 1. |
| **Phase 9** | DPR ≠ 1 centring is unexercised; `autoRound` floors CSS sizes and could round asymmetrically at 125 %/150 % Windows scaling. |
| **Phase 9** | Collect-tween polish: a burst of gears produces overlapping identical flyers, and the counter has no arrival punctuation. |
| **Phase 4 (open)** | **4.27** only — needs a pre-generation anchor-geometry gate; belongs to the next *generating* phase, which may be Phase 7 if audio takes anchors. 4.2b is closed. |
| **Phase 5 (open)** | R1, R2, R3, R4, R6, R7, R8 — recorded-not-fixed with reasons in `docs/qa/phase-05-combat-09-session-11.md`. R5 was fixed this session. |

---

## Two traps from Phase 6 that apply directly to Phase 7

Audio will almost certainly be a manager or a parallel scene, so both of these are live again.

1. **Lifetime by scene-event ordering is a trap.** Phase 6 took three attempts to stop the HUD
   correctly. A `SHUTDOWN` handler *queues* its stop, and `create()` can run before the queue drains
   — which deleted the HUD on a restart, and neither test caught it; both code-reviewer briefs found
   it by reading Phaser's sources. The form that held is a **condition re-evaluated every frame**.
   Note that **PAUSED still renders and SLEEPING does not** — an audio manager probably wants the
   opposite of what the HUD wanted here.
2. **A ratio is an upper bound.** Criterion 6.9's first draft would have passed at ~1.0× if the HUD
   drew nothing at all. Any "does it cost much" measurement needs a separate, independent assertion
   that the thing is actually *happening* — for audio, that a sound really played, not that a play
   call returned.

And one rule this session paid for twice: **a gate that cannot go red is decoration.** The refusal
test looked fine for a whole phase, could not fail for the line it named, and was hiding a real
crash. Write the mutation that should break each new gate, and watch it break.
