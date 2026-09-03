[← gate-entry session log index](phase-08-gate-entry.md) · [QA-LOG index](../QA-LOG.md)

## The QA gate

| # | Criterion | Method | Owner | Status |
|---|---|---|---|---|
| G.1 | `goalIsGreybox()` false in all 5 levels; the gate renders at the goal rect | unit + e2e | `voltagent-qa-sec:qa-expert` | ✅ unit + e2e on all 5 levels |
| G.1b | **The art READS as a doorway with a dark opening** *(Codex C6)* | by eye, screenshotted *(C4)* | play | ✅ by eye, twice — before and after the fixes |
| G.2 | Edge contact does NOT complete; the predicate fixture **and** the per-tick loop, both watched failing | unit | `voltagent-qa-sec:qa-expert` | ✅ both watched failing |
| G.3 | Containment DOES complete, at a named tick | unit | `voltagent-qa-sec:qa-expert` | ✅ tick 20, watched failing two ways |
| G.4 | `run` plays from first overlap to completion; jump AND attack locked on the **sim** state; the attack edge is consumed | unit + e2e | `voltagent-qa-sec:qa-expert` | ✅ sim state, edge consumed |
| G.4b | **Dying during the run-in cancels it** — the respawned player is free *(Codex C1, blocker)* | unit + hands-on | `voltagent-qa-sec:qa-expert` + play | ✅ real death, respawn, and a finished level |
| G.5 | Alpha reaches 0 over a tick-counted window; the curve has a red proof | unit + e2e | `voltagent-qa-sec:code-reviewer` | ✅ curve, window length and override all watched failing |
| G.6 | No blink-out, no pop-back — all 5 levels, by hand | `playwright-cli` + hands-on *(C4)* | play | ✅ 5 levels pre-fix; probe-driven re-check after |
| G.7a | No file > 400 lines; diff reviewed; adversarial pass | `code-reviewer` ×2 | `voltagent-qa-sec:code-reviewer` | ✅ 1 file over 400, cited |
| G.7b | Frame budget unchanged | amplified sweep on real GPU | `voltagent-qa-sec:performance-engineer` | ✅ **0.00038-0.00050 ms gpu, 0.00098-0.00188 ms work per exit, bound 0.05** — restated 2026-08-22 when the linearity guard was replaced; the 0.0009-0.0065 band it used to read came from the unpaired statistic that was retired |
| G.8 | Codex plan review ran; every finding applied or recorded | [the review](../reviews/session-gate-art-and-entry-plan.md) | — | ✅ **12 findings, 10 applied, 2 recorded** |
| G.9 | Codex implementation review ran on the diff; every finding applied or recorded | [the review](../reviews/session-gate-art-and-entry-impl.md) | codex | ✅ **BLOCK, 4 findings, all applied** |

---

## Hands-on, on the GREY BOX, before a cent was spent

Driven with `playwright-cli` against the dev server. Grey-box-before-art is a Global Constraint, and
the point of doing this first is that the art must not be bought against a broken sequence.

**Sampled once per animation frame, inside the page, returning an aggregate.** A wait expressed in
ticks cannot bound a sampling window — and `window.__game.tick` *stops* the moment a level
completes, so nothing here waits on a tick count. Every run waits on `ready`, then on `completed`.

### All five levels

| level | completed | armed at x | goal.x | fade frames | distinct alphas | biggest 1-frame drop | anims while armed | final α | popped back |
|---|---|---|---|---|---|---|---|---|---|
| level-01 | ✅ | 8577 | 8640 | 137 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |
| level-02 | ✅ | 10343 | 10368 | 169 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |
| level-03 | ✅ | 11975 | 11904 | 137 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |
| level-04 | ✅ | 13556 | 13440 | 137 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |
| level-05 | ✅ | 14910 | 14976 | 137 | **20** | **0.05** | `brass-courier-run` | 0 | **no** |

**`0.05` is exactly `1 / GOAL_ENTRY_TICKS`** — one step of the ramp, never more. That is the number
that rules out a blink-out: a character that winked out at the threshold would show a single drop
near 1.0. And **20 distinct alphas** is the whole ramp, seen on screen.

`tailAlphas` was `[0]` on every level across the 60 frames sampled *after* the level-complete panel
appeared — no pop-back, which is structural rather than remembered: the sim freezes at step 0 and
`goalEntryAlpha` keeps returning 0 from the held counter.

**level-04 travelled −30 px while armed** — it armed at 13556, right of the gate's 13536 centre,
and ran **left** into it. The auto-run is genuinely bidirectional and the dead zone settles it.

### Screenshots — [docs/evidence/gate-entry/](../evidence/gate-entry/)

| | |
|---|---|
| `01-approaching.png` | the courier on the floor, gate ahead, full opacity |
| `02-armed-first-contact.png` | at the doorway's left edge, sequence armed, still fully drawn |
| `03-mid-fade.png` | **counter 17, α 0.15 — the courier is inside the dark opening and nearly gone** |
| `04-complete.png` | LEVEL COMPLETE panel, the courier entirely absent, the void still drawn |

Looked at by eye, which is the only thing that can settle this *(C4)*: it reads as a character
walking into a doorway and being swallowed by the dark, not as a sprite being switched off.

### G.4b — dying mid-run-in, the blocker Codex predicted

Killed through the **kill plane**, not by writing `hp`. Writing `hp` directly bypasses `killPlayer`
and the death window, so the respawn never runs and the half that matters goes unobserved — the
first attempt did exactly that and produced a misleading pass.

| | |
|---|---|
| armed at | frame 156, x 8574 |
| killed at | frame 176, entry counter **5**, α 0.75 |
| `goalEntryTicks` after | `5 → **null**` — **cancelled** |
| alpha after | `0.75 → **1**` — fully opaque again |
| respawned | **true**, at the spawn (x 625, `world.spawn.x` 624) |
| hp after | **100** |
| then | ran to **x 2224** under held input — **the controls came back** |
| level completed | **false** — you do not finish by dying on the doorstep |

Without the cancel this is the unwinnable state: locked, auto-running, unable to jump, at a spawn
1600 px from the first pillar it has to clear.

### The same five levels again, on the REAL ART — G.1b and G.6

Re-run after `goal-gate` shipped. Identical numbers on all five, which is itself the point: swapping
a `Container` of two `Rectangle`s for a generated `Image` changed nothing about the sequence.

| level | completed | armed at x | goal.x | distinct alphas | biggest 1-frame drop | anims while armed | final α |
|---|---|---|---|---|---|---|---|
| level-01 | ✅ | 8574 | 8640 | **20** | **0.05** | `brass-courier-run` | 0 |
| level-02 | ✅ | 10302 | 10368 | **20** | **0.05** | `brass-courier-run` | 0 |
| level-03 | ✅ | 11838 | 11904 | **20** | **0.05** | `brass-courier-run` | 0 |
| level-04 | ✅ | 13374 | 13440 | **20** | **0.05** | `brass-courier-run` | 0 |
| level-05 | ✅ | 14910 | 14976 | **20** | **0.05** | `brass-courier-run` | 0 |

Every level arms at exactly `goal.x − 66` — the body's half-width — which is the geometry this
session is built on, observed rather than asserted.

**G.1b, settled by eye** *(C4)*, screenshots in [docs/evidence/gate-entry/](../evidence/gate-entry/)
as `art-01`…`art-04`:

- The gate reads as a **Victorian steampunk doorway** standing on the walkway: riveted iron jambs,
  brass arch and edging, two pressure gauges, a valve wheel, copper pipework, a lit lamp above the
  lintel. Not a slab, not a window, not a decorated wall.
- It is **the same height as the courier**, which is correct and not a coincidence — both are 288 px.
- **At counter 12 / α 0.40 the courier is a ghost inside the dark opening** (`art-03-mid-fade.png`).
  The void swallows them. That single frame is the whole feature and it does what it was for.
- At completion the courier is entirely gone and the opening is still drawn.

### Two things the probe got wrong first, both worth keeping

- **A synthetic `new KeyboardEvent` does not move the character.** Phaser's keyboard manager matches
  on `event.keyCode`, which the init dict cannot set. The first probe ran 3600 frames with the
  courier standing still and reported *"no fade, no arming"* — which reads exactly like a broken
  feature. Fixed with `Object.defineProperty(e, 'keyCode', …)`, and the difference between a broken
  probe and a broken feature is one line of evidence.
- **A jumping bot flies over the exit.** The goal rect is exactly the body height, so an airborne
  player's feet rise above `goal.y + goal.h` and `overlapsGoal` is false. On level-02 the bot
  bunny-hopped straight over the doorway and out the far side, never arming. **This is unchanged
  pre-existing behaviour** — the old rule used the identical vertical test — but it is worth
  recording: *you cannot enter the exit while jumping.* The bot stops jumping within 700 px of the
  gate; a human walks in.

**level-05's traversal is not claimed here.** The browser bot dies 21 times on it and never reaches
the exit — a limitation of a crude probe, not of the level: `level-completable.test.ts` finishes
level-05 under every gate seed. Its run-in above was observed by placing the courier 400 px left of
its exit and letting the game do the rest, which exercises arm → run → fade → complete in full.
Stated rather than glossed.

---

### The hands-on re-check, after the two fixes — and a third defect it found

The fixes changed what happens when the courier is hit at the door, so the earlier hands-on pass no
longer covers it. Re-driven in the running game with `playwright-cli`.

⚠️ **Level 01 could not be platformed through the CLI.** Each command is a round trip while the game
runs on real time in between, so a stall-triggered jump fires tens of pixels too late — the courier
died in the pit at 3840–4128 on every attempt. `levelDriver.ts` avoids this by running the whole
driver **inside the page**, sampling once per animation frame; a CLI loop structurally cannot. So the
observations below use an **instrumented probe**: the body is placed at the gate's mouth and the sim
then runs untouched from there. Stated plainly because it is not the same thing as playing the level,
and the earlier full five-level pass — which did play them — stands as the record for G.6.

#### The clean entry is unchanged by the fixes

| Measured, in the running game | Value |
|---|---|
| ticks from arming to completion | **21** (counter 0 → 20) |
| distinct alphas drawn | **21** |
| biggest single-tick drop | **0.05** — exactly 1/20 |
| sim states while armed | `run` only |
| frames at alpha 0 before completion | **0** |
| alpha after the panel | **0**, held |

Identical to the pre-fix pass. Neither fix touches the path a clean entry takes.

#### The hit at the door, watched

```
counter/alpha/state, one entry per tick

0/1/run  1/0.95/run  …  8/0.6/hurt      the hit lands mid-fade
null/1/hurt  × 17                        cancelled, opaque, the whole hurt window
0/1/run  1/0.95/run  …  20/0/idle        re-armed from zero, full window, completes
```

Which is the intended behaviour: being hit at the threshold costs the entry, the courier snaps back
to full opacity and takes the hit like anywhere else, then walks in again.

#### 🔴 …and the first run of that trace showed the counter FLICKERING

```
8/0.6/hurt  null/1/hurt  0/1/hurt  null/1/hurt  0/1/hurt  …
```

The cancel branch had learned about `hurt` and the arm branch had not, so the sequence cancelled at
9d and re-armed at 9d of the very next tick, for the whole hurt window.

**Nothing looked wrong on screen** — a counter of `0` draws at alpha 1 exactly as `null` does — so no
alpha assertion anywhere could have seen it, and none did. It was found by watching the *counter* in
the running game rather than the render. What it actually cost: `entryLocked` was true on every other
tick, so the auto-run fought the knockback on alternating ticks and hitstun was half-applied.

**APPLIED** — one `entryBlocked()` predicate, read by both branches *(vault 5.3)*. Watched red: with
the arm branch reverted, `stays cancelled for the whole hurt window` fails and nothing else does.
Re-watched in the running game afterwards: `null/1/hurt` × 17, no flicker.

This is the session's third defect found by driving rather than reading, and the second one no gate
in the suite could have caught — both because the wrong thing was being measured, not because a
bound was wrong.

#### Screenshots — [docs/evidence/gate-entry/](../evidence/gate-entry/)

| File | What it shows |
|---|---|
| `fix-01-fade-a.png` | counter 4, alpha 0.80 — the courier at the doorway's mouth, part-faded, with the scavenger beside it |
| `fix-02-fade-b.png` · `fix-03-fade-c.png` | counter 20, alpha 0 — gone, panel up |
| `fix-04-complete.png` | the finished state at true size |

**G.1b, by eye, again:** the gate reads as a Victorian brass-arched doorway with gauges down the
jambs and a genuinely dark opening. The figure standing opaque beside it in the completed shot is
the **scavenger**, not the courier — worth writing down, because it looks exactly like a pop-back
until you check which sprite it is.


---

### 🔴 The gate was the same height as the character, and nine machine gates said it was perfect

Found by the owner, looking at a screenshot: *"the gate is smaller than the character. This gate needs
to be bigger than the character."*

The goal rect is `192 x 288`. The courier's box is `PLAYER_BOX` 22 x 48 at `RENDER_SCALE` 6 =
`132 x 288`. The gate was authored at the rect's size and drawn `setDisplaySize(goal.w, goal.h)` — so
**the doorway stood exactly as tall as the person walking through it.** It read as a hatch.

#### Why nothing caught it

Every measurement in the suite compared the drawing to the rect, and **against the rect it was
correct**: `shipped-gate.test.ts` asserted `192 x 288` because that is what the rect is; the e2e
asserted the drawn bounds matched the trigger, because they did. The size was consistent, documented,
and wrong — there was no assertion anywhere that the door had to be bigger than the character,
because nobody had thought to say it.

That is exactly what a `play`-owned criterion is for, and it is the second time this session a human
eye found what the machine gates could not. *(C4.)*

#### The fix: art and trigger volume are now separate numbers

| | before | after |
|---|---|---|
| drawn size | 192 x 288 | **288 x 432** (`GATE_PX`) |
| anchor | centred on the rect | **bottom-centre on the rect** |
| trigger rect | 192 x 288 | **192 x 288, unchanged** |
| height vs the courier | **1.0x** | **1.5x** |

`GATE_PX` lives in `src/scenes/goalArtSize.ts` because it is needed on both sides of a boundary that
cannot be crossed: the scene draws with it and a `.mjs` build tool authors the PNG at it, and a `.mjs`
file cannot import a `.ts` module. `shipped-gate.test.ts` asserts the shipped PNG against the TS
constant, so the two copies cannot drift in silence *(vault 5.3)*.

**Anchored bottom-centre** so the door stands ON the threshold the sim tests and grows upward and
outward from it. Centring it on the rect instead would sink its base into the floor.

**Containment is untouched.** `overlapsGoal` and `containedInGoal` read `world.goal`, and the vertical
test is an exact equality against the rect's 288 — see `goal.ts`. This scales the IMAGE, never the
rect, and the `.tmj` files were not opened.

**No fal spend.** `npm run assets:world` re-downscaled the same 1636 x 2355 crop from the existing
generation. Rescaling the shipped 192 x 288 PNG would have been an upscale of already-downscaled
pixels; this is one clean downscale.

#### The bigger gate measurably improved the art

| measured on the shipped PNG | 192 x 288 | 288 x 432 |
|---|---|---|
| unbroken dark run at the courier's heights | 92 px | **138 px** |
| …against the 132 px courier | **0.70x — narrower than the body** | **1.05x — wider than the body** |
| dark fraction over the courier's real box | 0.794 | **0.973** |

At the old size ~30 % of the drawn character faded against brass jamb, and the gate could only
honestly ask for *half* the body width. Now the opening is genuinely wider than the person walking
through it, so **the test says so**: the bound is `BODY_W`, from `PLAYER_BOX`.

⚠️ 138 against 132 is ~4.5 % of headroom, which is thin, and deliberately: a re-shoot that dips under
is a real regression — the courier would fade against the jamb again — and the fix is a better
generation, **never** a lower bound.

Both counterexamples re-synthesised at the new size and watched red: a 96 px opening (narrower than
the body) fails 2 assertions, a barcode fails 4.


---

