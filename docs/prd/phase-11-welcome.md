# Phase 11 — Welcome screen and volume repair

← [PRD spine](../PRD.md) · prev: [Phase 10](phase-10-ship.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope

The first post-ship phase, and it carries one bug and one feature.

**The bug.** The owner reported `M` (mute) working while `[` and `]` did nothing at all. The keys
were never broken as such — they were bound to the wrong thing. Phaser indexes registered keys by
the legacy `event.keyCode`, which a keyboard layout may reassign for **punctuation** but not for
**letters**, so a Hebrew/English keyboard silently removes the volume controls and leaves mute
alone. Fixed by dispatching on `event.code`, which names the physical key position.

**The feature.** A welcome screen the player sees on entering the game, leading into the
`LevelSelectScene` that already ships from Phase 8. It is a **parallel overlay that pauses `Game`**,
not a scene boot routes into — `ready` is published only by `GameScene.create()`, 32 spec files
assert `sceneKey === 'Game'`, and a failed warm-up aborts a Playwright run with zero tests collected.

Out of scope: any fal spend, any art generation, any change to STYLE.md, a cancel route back out of
the level menu, and the separate question of whether the volume *step size* is perceptible.

### 2. Required skills

`scenes` · `input-keyboard-mouse-touch` · `text-and-bitmaptext` · `ui-ux-pro-max` ·
`e2e-playwright-testing` (specs) · `playwright-cli` (drive the running game)
**Always:** `superpowers:executing-plans` · `superpowers:test-driven-development` ·
`superpowers:systematic-debugging` · `superpowers:verification-before-completion`

### 3. Vault-in

**11.1** Reproduce before fixing, and let the instrument settle a disagreement rather than the
argument *(C8)*. · **11.2** A gate watched failing is the only gate worth having *(C1/C12)*. ·
**11.3** Playing finds what gates cannot — a green suite never saw this because it only ever pressed
a US-layout key *(C4)*. · **11.4** A comment describing a mechanism that does not exist turns nothing
red *(C9)*. · **11.5** Record what was decided not to fix, with the measurement *(C11)*. ·
**11.6** Kill every server by port before reporting done *(C13)*.

### 4. Codex plan review

**Ran before any code**, with the review-1 questions from the PRD protocol naming this file.
Converged over **five rounds** — `VERDICT: REVISE` ×4, then `VERDICT: APPROVED`. 22 material
findings, every one applied. Recorded in [reviews/phase-11-plan.md](../reviews/phase-11-plan.md).

The questions it was asked to attack: does the keyCode diagnosis actually hold; does the overlay
genuinely preserve every boot invariant; can each proposed gate go red; and what does pausing `Game`
break.

### 5. Deliverables

`src/scenes/audioKeyMap.ts` · `src/scenes/TitleScene.ts` · `src/scenes/gameTitle.ts` ·
`src/scenes/gameCamera.ts` · `src/scenes/gameInput.ts` · `src/scenes/BootScene.ts` ·
`src/scenes/GameScene.ts` · `src/game/config.ts` · `tests/unit/audio-key-map.test.ts` ·
`tests/e2e/phase-11-audio-keys.spec.ts` · `tests/e2e/phase-11-welcome.spec.ts` ·
`tests/e2e/gameHarness.ts` · `tests/e2e/prodTitle.ts`

### 6. QA gate

| # | Criterion | Method | Owner |
|---|---|---|---|
| 11.1 | Volume failure reproduced in the running game and the root cause proved by measurement, not inference | `playwright-cli` against the real page | play |
| 11.2 | The owner's own keyboard confirms the repaired keys, on the layout that broke them | `playwright-cli` + hands-on *(C4)* | play |
| 11.3 | Volume gate goes RED on the un-fixed code; mutation confirmed reverted *(C1/C12)* | watched failing | `voltagent-qa-sec:qa-expert` |
| 11.4 | From a 0.5 baseline both keys move the level and survive a reload *(7.4)*; the 1.0 ceiling stated | `playwright-cli` + hands-on *(C4)* | play |
| 11.5 | A held key is exactly one step — run with Title active and again with Game active | `npm run test:e2e` | e2e |
| 11.6 | `M` / `[` / `]` answer ON the welcome screen, not only in play | `playwright-cli` + hands-on | play |
| 11.7 | Welcome screen appears on entry and routes into the level menu | `playwright-cli` + hands-on *(C4)* | play |
| 11.8 | The simulation does not advance under the title, sampled across frames in-page; red-proved by removing the pause | `npm run test:e2e` | e2e |
| 11.9 | ESC and the DEV scene keys cannot leak past the title | `npm run test:e2e` | e2e |
| 11.10 | Title shows once per page load, including a restart while it is still up | `npm run test:e2e` | e2e |
| 11.11 | Level select still shows correct lock state and gear totals | `playwright-cli` + hands-on | play |
| 11.12 | Title readable and correctly laid out at 1920×1080 and on resize | screenshots | `voltagent-qa-sec:ui-ux-tester` |
| 11.13 | `sceneKey` / `ready` / `bootError` unmoved by the overlay; the debug surface still closed at eight fields | `npm run test:e2e` + grep | `voltagent-qa-sec:qa-expert` |
| 11.14 | The diff reviewed adversarially for defects the gates cannot see | two briefs *(A7)* | `voltagent-qa-sec:code-reviewer` |
| 11.15 | Full e2e suite green at the expected test COUNT, read positively | `npm run test:e2e` | e2e |
| 11.16 | `npm run build` clean, `verify-dist` passes, no dev prose or dev scene key in the bundle | command | — |
| 11.17 | No source file over 400 lines — `GameScene.ts` and `phase-01-boot.spec.ts` both sat on the ceiling | `npm test` | — |
| 11.18 | **Codex plan review ran; every finding applied or recorded** | [reviews/phase-11-plan.md](../reviews/phase-11-plan.md) | — |
| 11.19 | **Codex implementation review ran on the diff; every finding applied or recorded** | [reviews/phase-11-impl.md](../reviews/phase-11-impl.md) | codex |

**Regression set:** the full unit suite, the full e2e suite, and `npm run test:sim-isolated` — the
audio key map is engine-free and must stay drivable with Phaser uninstalled.

### 7. Vault-out

What this phase learned and owes forward: that an input binding can depend on a number the *user's
operating system* owns, and that no amount of local testing sees it; that a synthetic keydown with
no keyup poisons every later press of that keycode and can make a working build look broken; that
`playerInputEnabled` is not a pause and never was; and that Phaser's `canInput()` puts PAUSED
outside the accepted range, which is a load-bearing detail this phase now depends on.

### 8. Demo

Load the game. The welcome screen is up over a frozen first level; `[` and `]` change the volume
there. `ENTER` begins play, `L` opens the level menu. Reload and the screen returns.
