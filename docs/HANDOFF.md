# Session handoff — Phase 12, touch and responsive support

> ## 👉 Resuming Phase 12? Read [handoff/next-session-prompt-phase-12.md](handoff/next-session-prompt-phase-12.md) first.
>
> Branch `phase-12-touch`, **not merged**. Thirteen Codex implementation-review rounds applied, plus
> the 2026-08-31 close-out session. 3019 unit tests, **218 e2e across five projects**, 79 mutation
> rows and 26 holes found and closed.
>
> **Still reported FAILING**, and the remaining list is short: **12.14 is NOT MET** and **12.13,
> 12.23 and 12.24 are UNRUN**.
>
> - **12.8, 12.10, 12.17 → PASS.** The owner amended all three on 2026-08-31; no gate moved.
> - **12.11 → PASS.** Frames served against a vsync-locked display cannot order its own mutation, so
>   the statistic was replaced with paired per-frame GPU and main-thread deltas, red-proved both ways
>   (M72, M73) and confirmed on a held-out sweep.
> - **12.14 → still NOT MET**, and this is the live decision. The wrench re-shoot succeeded — every
>   stroke of all six faces clears 3:1 at 48 CSS px, `KNOWN_SHORTFALL` is gone — but the
>   `ui-ux-tester` briefs found `pause` (a cog: reads *settings*) and `walk` (two bars: reads as
>   nothing) do not say their actions at any size, and that **48 px is not the worst reachable size**:
>   controls stay live to 44, where `touch-pause` measures **2.91:1** against WCAG's 3:1. Options and
>   a recommendation are in `docs/qa/phase-12-touch.md` § 12.14.
> - **12.13 and 12.24** need the owner's hands on a phone; **12.23** is the Codex implementation
>   review on the final diff.

---

# Session handoff — Phase 11, the welcome screen and the volume repair

> # ✅ Phase 11 is COMPLETE — every criterion has a verdict and every verdict is a pass.
>
> The owner walked all four hands-on criteria on 2026-08-29 and **broke one of them by playing**:
> at volume 50 the game was barely audible. That is now fixed, measured, and gated. Merged to `main`.
>
> Three things in this phase were found by a human at the keyboard and by nothing else: the volume
> keys answering on **both** the Hebrew and the English layout, the first build reading as *"not
> looking good"*, and the loudness defect. **No gate in this repo could have produced any of them.**

## What shipped

**The volume bug, root-caused by measurement.** Phaser dispatches on `event.keyCode`
(`KeyboardPlugin.js:747`) — layout-dependent for punctuation, stable for letters, which is exactly
the split the owner reported (`M` worked, `[` / `]` did not). Audio keys now go through a raw DOM
listener on `event.code`, with its own `event.repeat` guard in **two** places, because the shared
mapper cannot share one.

**The welcome screen**, in both `config.ts` arms, as a parallel scene over a PAUSED `Game`. Redesigned
2026-08-29 after the owner said the first build *"is not looking good"*: a single static fal plate,
a full-width dimmed band, and ENTER to the level menu as the only way in.

**The mix repair — the defect the gate could not see.** `MIX_DB` was applied to peak-normalised
signals for the ten WAV cues and to the raw file for the two OGG beds, because Node cannot decode
OGG and `normalise` falls back to 1. With a 19 dB crest factor a `-13` landed ~19 dB lower on a bed
than on a one-shot. Beds are now mixed by measured RMS: **+12.05 dB**, −43.6 → −31.6 dBFS RMS
together, criterion 7.2 re-measured at −3.33 against its −1.0 ceiling.

## The traps, and they are not visible in the code

**`gameHarness.dismissTitle` SKIPS the screen through `__phaserGame`.** It does not press the keys a
player presses, and its docstring says why: walking the real route changes which level loads (menu
opens on the furthest unlocked, boot resolves the saved one) and when the sim starts. ~40 specs
depend on both. The player route is covered by exactly one spec, in
`phase-11-title-routes.spec.ts` — **do not delete it**, it is the only thing standing between a
broken `LevelSelectScene.play()` and a green suite.

**The `dismissed` latch in `TitleScene` has NO live gate**, deliberately and recorded. The sequence
it was written against needed `onPlay`, which is gone. Its docstring carries the reasoning; do not
"fix" the test that no longer gates it by inventing an assertion.

**`polishSeries.installRecorder` waits out the SPAWN's landing shake.** The spawn is a touchdown,
`landedTick` is 0, and `SHAKE.land` runs three ticks. The recorder was installing on tick 2. That
race was always there — the welcome screen only changed which side of it we landed on.

**`prodTitle` presses ENTER TWICE**, with a measured darkening bound between the presses as the
barrier. Production ships no debug surface, so pixels are the only signal.

🔴 **The audio gate that let a 25 dB defect ship was `max(bed.gain) < min(cue.gain)`** — the
same unit mismatch as the bug, so it was green the whole time. It is replaced, not re-bounded, and
**my first replacement was also wrong** in the other direction. Both mistakes are written into
`tests/unit/shipped-audio.test.ts`'s own docstring before you touch it.

⚠️ **The title plate must not contain a band.** The screen composites its own 0.82 scrim over the
middle third. Variant A was unusable because the prompt mentioned the compositing and the model drew
it. Describe what the IMAGE contains, never what will be laid over it.

## What is still owed — carried forward, not part of this phase

- **A fal ceiling FIGURE.** Spend is $55.50 against a last-stated ceiling of $55. Every overrun is
  cleared by an explicit owner decision; no new number has ever been named, and the log refuses to
  invent one.
- **No cancel route out of `LevelSelectScene`** — accepted in the plan, still true.

## The step size and the readout — fixed after the phase closed

The owner said *"yeah, fix it"* on 2026-08-29, so the deliberate non-fix became a fix. Two things:

**`VOLUME_STEP = 0.1` was an even step in the wrong unit.** Loudness is logarithmic; a tenth of gain
is 0.92 dB at the top of the range and 6.02 dB at the bottom, from the same key. It is now
`VOLUME_LADDER` — ten stops ~3 dB apart. ⚠️ **The printed percentages are deliberately uneven**
(100, 71, 50, 35…) because the *ratio* is what the ear hears; a ladder whose numbers look even is
the one that failed.

**The controls banner now prints the level**, which is the only readout in play and the whole answer
to *"`]` does nothing at 100 %"*. `gameInput` emits `AUDIO_CHANGED`; `HelpBannerLayer` marks itself
dirty and its next **layout** re-reads a content provider.

🔴 **Re-reading on layout rather than on the event is load-bearing, and the first version got it
wrong.** `attachHud` runs **before** `createAudio` in `GameScene.create()`, so a layer that only
re-read on the audio event drew a banner with no level in it until the player pressed a key — with
every unit gate green, because the fake's provider is ready immediately. An e2e test caught it.

## Two perf gates flake under full-suite load

`phase-05-perf` 5.11 and `phase-06-perf` 6.9 both failed one full `test:e2e` run and **both pass in
isolation**. GPU-ratio statistics whose denominator collapses when the box is busy — the shape
`docs/QA-LOG.md` already records. The final run before the merge failed `phase-09-polish` 9.1 and
`phase-10-production`'s dev-seam budget instead; both passed alone, 4 and 6 specs, at the same
sitting. **The full suite's wall-clock-bounded specs read a busy box as a broken game** — the rule
in CLAUDE.md §5 is not advisory.

---

# Superseded — the HUD banner's placement + the pit rule

> # ✅ The invisible blocker is FIXED — and this time it was REPRODUCED first.
>
> Reported **five** times; three fixes shipped against it, none of them the thing. The fifth report
> was handled by refusing to guess: an instrument was built, the owner drove it, and the stuck state
> was read off the screen with coordinates **before** any fix was proposed.
>
> **It was `01a518e`’s own platform widening.** Widening two platforms flush against their spike runs
> — itself a correct fix, and kept — made them abut their neighbours **exactly**. Two solid rects
> sharing a top edge and touching **draw as one platform and collide as two**: while grounded the body
> sits `0.675 px` inside its own floor when the horizontal pass runs, and `wasLeft` at `player.ts:343`
> is a **closed** comparison, so once snapped flush it re-fires every tick forever. Reverse frees it,
> jump frees it, holding the key never does.
>
> Seam census — `main` **0** in all five levels; the branch **2**, in levels **2 and 3**, the exact two
> the owner named. Confirmed on screen at `?pin=1`: feet `(8190, 1632)` and `(10686, 1536)`,
> `cause=geometry`. Fixed at build time by `tools/gen/mergeStrips.mjs`; gated over the **shipped
> bytes** by `tests/unit/no-flush-seams.test.ts`. Full record:
> [qa/session-hud-and-pits-04-flush-seams.md](qa/session-hud-and-pits-04-flush-seams.md).
>
> ## 🔴 TRACKED LATENT DEFECT — the resolver latch is still there
>
> The **data** no longer contains the trigger. `resolveCollisions` still latches, and it is
> deliberately **not** fixed — it is the file the 14-step tick contract and every combat window rest
> on, and the obvious repair has a documented **inverse** failure: give the horizontal pass a foot
> tolerance and the player enters a solid whose top is a few px above the feet, which the vertical
> pass at `player.ts:366` will not land them on because `previousY` was already below it — **the
> player falls through a low ledge**. Invisible to a flat-pin sweep, and worse than the bug it fixes.
>
> If it is ever authorised: 0/1/2/>2 px fixtures that **block or step up, never pass through**, plus a
> **new** player/enemy foot-tolerance parity fixture. ⚠️ `overlap-escape-parity.test.ts` stays
> **green** through that change — its fixture is a full-height wall with the body mid-span, so it
> offers the change no protection at all. Do not cite it as cover.
>
> **Do not delete `no-flush-seams.test.ts` because “the builder handles it now.”** The builder merges
> only strips sharing a top edge **and** a height; a same-top pair of different heights cannot be
> fused without inventing collision, and that gate is what stops it shipping.
>
> ### The instrument, which outlives the bug
>
> `?pin=1` on a dev build draws every collision rect (magenta) and hazard (red) over the level with a
> live per-tick readout and the last three stall incidents, each with a named cause.
> `src/sim/trace.ts` is a per-tick trace seam registered against a `World`; `src/sim/stallAnalysis.ts`
> is the engine-free classifier both the live probe and the offline sweep share.
>
> ⚠️ **Its first version was invisible on screen** and every check I ran said it existed — objects
> present, visible, alpha 1, right depth, inside the worldView, all true. An 18 % cyan wash on dark
> brick is simply unreadable, and its only visible edge sat under the floor’s own painted top edge.
> **“It is drawn” and “it can be seen” are different claims.** `tests/e2e/pin-probe.spec.ts` now counts
> magenta **pixels in a real screenshot** — and its own first version read a WebGL canvas through
> `drawImage` without `preserveDrawingBuffer`, which returns a **cleared** buffer: false red with the
> flag, false green without it. Decode `page.screenshot()`.
>
> ### Closed by the owner, by PLAYING — all five levels
>
> *"okay, it tested all the levels, and now it's working as expected."* Walked at `?pin=1` on the
> owner's own 60 Hz machine. That is what closed this, and it is the only thing that could have: the
> offline sweep was **negative**, and all three previous misses were green across the whole suite.

> ## Session `hud-and-pits` — FOUR defects the owner found by PLAYING the shipped build
>
> **Not a phase.** Phase 10 is still DONE and still shipped; its handoff follows below, unchanged.
> Branch `session-hud-and-pits`. Full record: [qa/session-hud-and-pits.md](qa/session-hud-and-pits.md)
> + [gate owners](qa/session-hud-and-pits-02-gate-owners.md)
> + [hazard clearance](qa/session-hud-and-pits-03-hazard-clearance.md) ·
> [plan review](reviews/session-hud-and-pits-plan.md) ·
> [impl review](reviews/session-hud-and-pits-impl.md).
>
> | | defect | what it turned out to be |
> |---|---|---|
> | 1 | the controls legend drew **full-width across the level** | it was `addHelpBanner()` at `x = 24` below the plate, wrapped to the whole 1872 px view. It now has its own layer, `src/scenes/helpBannerLayer.ts`, in the empty band right of the gear counter |
> | 2 | *"in levels 2, 3 and 4 the character can fall through tiles"* and nothing happens | a **bottomless** gap already kills via the kill plane. A **walled valley** has a bottom, so falling in cost nothing. Five shipped; **four had no spikes**, because spikes were a hand-typed per-level list and nothing ever compared it to the geometry |
> | 3 | *"there is a hazard that is not being seen"* | the spike tile was a **cool silver picket**, and STYLE.md §5 rule 2 makes the foreground warm and saturated. A cool desaturated foreground object reads as background *because the separation rules say it should* — and it shared a silhouette with the ornamental fence one cell over, which really is decoration. New tile generated as an isolated object and **composited into cell 12**; exactly one of sixteen cells changed |
> | 4 | *"okay, I still get stuck by a hazard that I cannot see"* — the SAME sentence again, after the tile fix | **geometry, not art.** Five floor hazard runs ended exactly **96 px** — one tile — before the wall facing them, and the player is **132 px** wide. There was nowhere to stand: land a beat late and you are pinned in the spikes with a wall in front of you, taking damage you cannot see *because you are standing on it* |
>
> ### The four things worth knowing before touching any of this
>
> **1. A tile is 96 px and the player is 132. Never write a level rule in tiles.**
> That one comparison is defect 4 in full. `tools/gen/hazardClearance.mjs` (+ `.d.mts`) states the
> rule — *a floor hazard run leaves either **no gap at all** to the wall facing it, or **at least
> one player width** of clear floor* — and it is read by `tests/unit/level-hazard-clearance.test.ts`
> over the **shipped bytes** and by `tools/gen/make-levels.mjs`, which re-reads each `.tmj` it wrote
> and **throws** *(vault 5.3)*. The bound is `PLAYER_BOX.w * RENDER_SCALE`, imported, never a tile
> count — a rule written in tiles would have called the defect legal.
>
> ⚠️ **Zero gap is LEGAL and is not a loophole.** Flush spikes, and a pit floor spiked wall to
> wall, are places you were never meant to stand — four shipped runs are that shape, including the
> level-03 cols 65-69 pit above. What is forbidden is the **almost**-gap.
>
> ⚠️ **Moving a pinning RUN is the fix that usually does not work.** It worked in levels 02, 03 and
> at level-05 cols 20-22. It failed in BOTH directions at level-04 cols 102-103 and level-05 cols
> 134-136: one column right lands where a descent touches down (unavoidable damage,
> `level-hazard-free` refuses it), one column left blocks the auto-player outright. Those two were
> fixed by widening the **ziggurat shelf** beside each one column, closing the gap to zero, with
> the run left exactly where it shipped. Reasoning is recorded beside every run and shelf involved.
>
> ⚠️ **Five existing gates were blind to this** — `level-hazard-free` (its auto-player jumps early
> and never lands in the gap), `level-completable` (tanks the damage), `level-pits` (asks whether a
> *pit* is spiked, not whether a *floor* has room), `level-reach` (ignores hazards), and
> `level-traversal` (reads a frozen retired level). Five gates over the same rectangles, and not
> one asks the question a player asks by standing still.
>
> **2. The pit rule is DERIVED, and it lives in one file two consumers import.**
> `tools/gen/pitDetect.mjs` (+ `.d.mts`) is read by `tools/gen/levelBuilder.mjs`, which paints the
> spikes, *and* by `tests/unit/level-pits.test.ts`, which checks the **shipped bytes** *(vault 5.3,
> vault 3.1)*. It is deliberately **two** clauses, not the five the plan specified: two reviewers
> found independently that three of the five were **dead code** — an out-of-bounds index reads
> `undefined` and `!undefined` is true, so `reachesGround` already subsumed the map-edge and
> bottomless tests, and **no fixture could ever have discriminated them**. `isWall()` asks the one
> question they were all circling: *is this column solid at the two rows just above the pit floor?*
>
> **3. Four of the five pits were FILLED IN, not spiked — and that was the right call.**
> Spiking all five made three of them **unavoidable damage**: they sit where a descent lands, which
> is the class `level-hazard-free.test.ts` exists to refuse. Owner decision, in order: *"Fill them
> in"* → *"Add hazard to levels 4 and 5"* → *"Fill level-3's remaining pit too"*. **One pit ships:
> level-03 cols 65-69**, reached jumping mass to mass rather than by a descent, and it keeps its
> spikes. `EXPECTED_PITS` in the gate is the inventory, and a layout edit that adds an unspiked pit
> now fails **with the level and the columns named**.
>
> ⚠️ **The rule did not get weaker when the pits went away.** The geometry stopped containing the
> shapes it catches. That is why `tests/fixtures/pit-levels/` holds **sixteen** committed fixtures:
> the shipped maps contain no negative case at all, so without them a far broader detector would
> return the same answer and the gate could not tell it from a correct one (Codex plan round 2,
> finding 6 — the sharpest finding of either round).
>
> **4. The banner lives in TWO camera spaces, and that is not an accident.**
> It is on `GameScene`'s display list; the counter it measures itself against is on `UIScene`'s.
> `gameEffects.ts` moves `GameScene`'s camera to `(-margin.x, -margin.y)` so a screen shake never
> uncovers the view edge — so a `setScrollFactor(0)` object draws about 10 px left of its own `x`.
> The layer places at `layout.x - camera.x`; `tests/e2e/bannerHelpers.ts` converts `getBounds()` back
> with `+ camera.x`. **Both halves are required and neither is optional.** Getting one without the
> other is how the right-margin assertion spent a run failing by 1.33 px on a banner that was drawing
> exactly where it should.
>
> ### Numbers that are floors, not preferences
>
> | constant | value | why it cannot move |
> |---|---|---|
> | `HELP_FONT_PX` | **43** | `18.66 × 1920 / 852 = 42.06`. Below that the banner leaves WCAG's 14 pt bold large-text class and the bar becomes 4.5:1, which `contrast-floor.test.ts`'s *road not taken* case shows this palette cannot reach without going white-on-black. It moved 44 → 43 at the owner's request on 2026-08-28; **anything smaller is a STYLE.md change and an approval checkpoint** |
> | `HELP_BANNER_MAX_ROWS` | 4 | a ceiling with room in it, never a row-count pin — the owner's decision is "every key printed, however many rows that takes" |
> | `HELP_LINE_BOX_SLACK` | 1.05 | Chrome's line box measures **1.216** per row against our nominal 1.2. The ceiling is a play-area bound, not a glyph-metrics claim |
> | `MIN_WALL_TILES` | 2 | one is a slope you walk back up; three is the shallowest shipped pit, and a threshold set AT the observed minimum has no room to be wrong safely |
>
> ### The art budget: $55.20 spent, the overrun CLEARED, no new ceiling set
>
> `GENERATION-LOG.md` stood at **$55.05 against a $55 ceiling** before this session — knowingly over,
> by an owner decision of 2026-08-26 — and its last line read *"the next generation needs a ceiling
> raise, not a decision."* The hazard tile cost **$0.15**, taking the total to **$55.20**.
>
> ✅ **The owner cleared the overrun on 2026-08-28**, with the $0.20 quoted to them before they
> answered. That spend is authorised and is not a breach.
>
> ⚠️ **But no new ceiling FIGURE exists.** They were never asked for a number and none was given, so
> nothing in this repo states what the limit now is. **The next generation needs that number first**
> — a ceiling invented by a document is a limit nobody set.
>
> ### What is still open
>
> - **The owner's own hands-on pass.** It cannot be closed on automated evidence *(C4)* — level 3,
>   the pit at cols 65-69, plus a look at the banner beside the health bar at a size they actually
>   play at. Both defects were found this way in the first place.
> - **The banner still extends below the HUD plate** by design: three rows at 43 px is 154.8 px
>   against a 128 px plate. Bounded, measured and written down rather than implied away. If that is
>   not acceptable, the lever is a **backing plate** behind the legend — a known dark background
>   makes contrast deterministic and would unlock a much smaller font, at the cost of a STYLE.md
>   decision.

# Session handoff — Phase 10 (build and ship)

> ## ✅ Phase 10 is DONE. 15 of 15 criteria PASS, merged to `main`, live in production.
> 
> **▶ Play it:** `https://steampunk-platformer-2n08tumsc-rois-projects-f9d9895d.vercel.app`
> 
> `main` at `266f0df`+, pushed. The owner has played **all five levels to the exit** on the
> production build, on both a 60 Hz and a 240 Hz display, and confirms the feel: *weighty and
> responsive, no dropped inputs*. That closed **10.12** and **2.8**, the latter carried open
> since Phase 2.
> 
> ### The two defects that only PLAYING could find — read these first
> 
> | | defect | why no gate here could see it |
> |---|---|---|
> | 1 | `FOLLOW_LERP` applied per **rendered frame** — camera 4x less responsive at 60 Hz than
> on the 240 Hz box it was tuned on: 66 px of trail instead of 16.5, and a **264 px** character
> swing per jump | every gate runs at ~240 fps, where it is four times smaller |
> | 2 | `pixelArt` never governed the **canvas→screen** resample. `FIT` keeps a 1920x1080 buffer
> and restyles only the CSS size, so nearest-neighbour at a fractional ratio **drops pixel
> columns whose positions MOVE as the world scrolls** | nothing in the suite looked at the
> canvas's presented geometry at all |
> 
> Both were reported in the same five words — *"blurry or smeared while moving"* — and fix 1
> genuinely helped, which is exactly what made fix 2 easy to mistake for its remainder.
> 
> ⚠️ **Anything the ENGINE applies per rendered frame, or per presented pixel, sits outside
> this project's tick rule** — which is written about `src/sim/`. The principle was never
> narrower than the rule; the rule's wording was, and that is what let a frame-rate dependency
> survive ten phases of review.
> 
> ### Outstanding, and none of it blocks
> 
> | item | status |
> |---|---|
> | **the rollback** | verbs confirmed from CLI 56.5.0's own `--help`, but **NOT rehearsed** —
> and rehearsing it moves the live alias, so it needs a deliberate decision |
> | **`.tmj` MIME** | Vercel serves `application/octet-stream`, `prod-server.mjs` says
> `application/json`. Harmless, but the substrate is more generous than production |
> | **Deployment Protection** | may be re-enabled; 10.6's evidence is already captured. With it
> on, README's "Play it" link works only for the owner |
> | **`_generated/`** | not archived, by owner decision. Production never reads it |

> Full record: [qa/phase-10-ship.md](qa/phase-10-ship.md) (including **§ Vault-out — Phase 10** and
> the ten-phase Codex-protocol verdict) · [plan review](reviews/phase-10-plan.md) ·
> [implementation review](reviews/phase-10-impl.md) ·
> [review sweep](qa/phase-10-ship-02-review-sweep.md)

## The traps this phase paid for — read these before touching the same ground

**1. A bare `vercel deploy` targets PRODUCTION on this project, and nothing on the command line says
so.** There is no git integration, so the CLI defaults to the production target. `vercel ls` shows
the first attempt as `Environment: Production` — it would have **bypassed the STOP gate entirely**,
and the only thing that stopped it was that it errored on trap 2. **Always `--target=preview`.**

**2. `.vercelignore` uses gitignore syntax, so an unanchored pattern matches at ANY depth.** A bare
`assets/`, meant for the 96 MB of root reference art, also matched `public/assets/` — **48 of the 60
files under `public/`**, i.e. every sprite sheet, tile set, parallax layer, portrait and sound. The
build box got the game without its art. **Every local gate was green**, because locally the files are
simply there. It failed loudly only by luck (`tsconfig.json` includes `tests/`, and the tests import
the catalog); otherwise it would have been a green build at a live URL serving a blank canvas.
Anchored now, and `tests/unit/vercelignore.test.ts` red-proves on any unanchored pattern.

**3. A gate can measure the wrong thing and look rigorous doing it.** The dev-seam gate asserted
`MIN_SENTINELS = 27` — a floor over a *global count*. Delete a guard, re-home its token in another
guarded body: count still 27, no token leaks, and the DEV body **ships**. Both gates printed OK. The
Codex implementation review found it; the mutation was built and run to confirm. The cause is worth
carrying: **every recorded red proof had been cooperative** — remove the guard, leave the token —
which is the mutation the person who wrote the gate naturally reaches for. It is now an exact
file→token manifest, and `tools/gen/devSeamManifest.mjs` is what you edit to add a seam.

**4. A comment that asserts a property is not the property, and this phase found FOUR.**
`tsconfig.build.json` said the plugin *"IS typechecked here"* — it was in no program at all.
`submit-clips.mjs` said `requirePresent` was *"implicit"* — it was not, and the script creates
`_generated/` itself moments later. `vite.config.ts` said neither of its imports touched `node:*` —
both do. `prodHarness.ts` claimed the single-source lookup while doing its own. Treat every 🔴 and ⚠️
paragraph as a claim to check, not as context.

**5. Two source-text gates were satisfied by a COMMENT.** The sentinel census counted
`__DEVSEAM_…__` anywhere in a file, comments included; the anchor-wiring and build-program tests
matched raw text. Comment the thing out and the gate stays green. All three strip comments now — and
the lesson is that fixing this in one place and not the others is how a lesson stays local.

**6. `Object.fromEntries` keeps the LAST duplicate key; a browser enforces the FIRST duplicate CSP
directive.** So `script-src *; … script-src 'self'` produced an object equal to the expected map,
passed the quoting check, raised no violation — and the enforced policy was `*`.

**7. A test that passes alone and fails in the suite is a flake generator, not a gate.** The
four-level playthrough completed levels 01–04 on a quiet box and stopped at level 03 inside
`npm run test:e2e`. Widening the budget until it stops would be measuring the box. The gate is now
level 01 → ENTER → level 02 boots and draws; the four-level run is recorded as a *measurement*.

**8. The QA gate's agent worktrees were created at `main`, not at the branch.** Every agent got its
own worktree as required and none of them contained the diff. Four worked around it by reading the
real checkout; two reported criteria as "unrun". The findings that landed are sound — each was
re-verified locally — but the *coverage* claim is weaker than it looks. If you re-run that gate,
check the worktree's commit first. Also: `voltagent-qa-sec:security-auditor` has **no Bash**, so it
cannot run `git` and cannot do the history half of a secret sweep.

**9. Two GPU perf gates false-red under full-suite load, and it is a DIFFERENT one each run.** Run 1
failed 9.5's cost-exponent floor at k = 0.893 (floor 0.9); run 2 passed 9.5 at k = 0.963 and failed
6.9's HUD GPU delta at 0.974 ms (bound 0.2). **Both pass alone, immediately after.** A code
regression does not alternate between two unrelated specs and then decline to reproduce in
isolation — and `git diff --name-only 048dae5..HEAD` touches **zero files under `src/`**. Do not
widen either bound: that is measuring the box, and 9.5's own failure text says *"do not move this
floor"*. What would refute the diagnosis: the same gate failing repeatedly, or failing in isolation
on a quiet box. Run 3 (after the camera fix) failed a THIRD spec — 10.12's campaign — which then
passed alone in 34.8 s against a 60 s budget. The production driver is position-blind (holds RIGHT,
taps Space on a cadence, reads `localStorage`), so a camera change cannot alter its decisions, and
the first two failures predate that change entirely.

**10. A camera lerp is applied PER RENDERED FRAME, so a constant is a frame-rate dependency — and
this project tunes on a 240 Hz box.** `FOLLOW_LERP = 0.12` gave a 35 ms time constant at 240 Hz and
**139 ms at 60 Hz**. On a 60 Hz screen the character sat 66 px off centre while running (16.5 px on
the dev box) and swung **264 px — a quarter of the screen height — on every jump** (96 px on the dev
box). The owner found it by PLAYING the shipped production build; **no gate here could have**, because
they all run at ~240 fps where the defect is four times smaller. Fixed by `followLerpForFrame`, which
re-bases it on elapsed time and returns 0.12 exactly at 240 Hz so the tuned feel is reproduced rather
than approximated. ⚠️ Two things stated rather than left to be discovered: an 18 % residual survives
(zero-order hold, ~3 px, half a source art pixel) and **sample-and-hold blur at 60 Hz is 4x that at
240 Hz as pure physics** — some difference between the displays will always remain. § the QA log's
60 Hz section. **The general lesson is bigger than the camera: anything Phaser applies per frame is
outside this project's tick rule, and the rule's wording — not its principle — is what let it
through.**

**11. `pixelArt: true` does NOT govern how the canvas is scaled to the screen.** It governs texture
sampling. `Phaser.Scale.FIT` leaves the backing store at 1920x1080 and restyles only the CSS size, so
the browser rescales it at a fractional ratio — and `image-rendering: pixelated` makes that
nearest-neighbour, which **drops and duplicates whole pixel columns whose positions MOVE as the world
scrolls**. Sharp when still, mush in motion. Measured, not modelled: with the fix disabled the boot
gate refuses with *"FRACTIONAL scale (1920x1080 buffer in 1280x720 css)"*. Now conditional — crisp at
an integer scale, smooth only where nearest cannot be exact. ⚠️ **And `?breakFilter=1` had quietly
stopped being a break**: it hardcoded `'auto'`, which became the CORRECT value at a fractional scale,
so on any non-multiple window the mutation set the right value and the red proof proved nothing while
still being counted green.

⚠️ **Traps 10 and 11 are the same lesson twice: anything the ENGINE applies per rendered frame, or
per presented pixel, sits outside this project's tick rule** — which is written about `src/sim/`.
The principle was never narrower than the rule; the rule's wording was. And *"it's physics"* is a
conclusion that ends investigation: I reached it from a model after trap 10 and it was premature,
because the model was silent about trap 11 entirely.

## Verification at the tip (`ef1eb9b`)

| run | result |
|---|---|
| `npm run typecheck` | clean |
| `npm run typecheck:build` | clean |
| `npm test` | **176 files, 2613 tests passed** |
| `npm run test:sim-isolated` | 2610 passed, 3 skipped — Phaser uninstalled, restored after |
| `npm run build` | 4 steps green · dev-seam gate ok, 27 sentinels folded, each dominated and sited · verify-dist ok |
| `npm run test:e2e` | **140 passed, 1 failed — a DIFFERENT spec on each of THREE runs, every one passing alone.** See trap 9 |

Counts are read, not inferred from exit codes.

## What is outstanding

- The four open items in the box above.
- **`README.md` still carries a `<!-- deployed-url -->` placeholder.** It gets the real URL once you
  decide what the real URL is.
- **`assets:fetch` / `assets:verify`** — Phase 5 called them binding debt and they still do not
  exist. They are what would make 10.9's *original* criterion achievable; until then the public repo
  cannot reconstruct its own art from its recorded provenance.
- ~~`_generated/` is the only copy of a non-regenerable input~~ — **owner decision 2026-08-27: not
  archived.** Production never reads it and the shipped game rebuilds from a clean clone forever;
  what the archive would have protected is *changing* the art later (re-cutting a sheet, re-shooting
  `brass-courier/fall`), which needs the ~115 MB of `.mp4` clips and ~18 MB of audio masters that
  fal cannot reproduce. Nothing is deleted; it is simply not duplicated. See the QA log.
- ~~The dev-seam gate's residual hole~~ — **closed 2026-08-27**, see the box at the top.
- Phase 9's three carried items (the perf-spec split, 9.5's absent bound, 9.3's three narrowings) —
  dispositioned in the QA log: all still true, none blocking.

# Superseded — Phase 9 (polish, juice, particles). **Superseded by the section above.**

> ## ✅ Phase 9 is APPROVED and MERGED. Owner tested it 2026-08-22; `main` is `a99c1f7`, pushed.
>
> **One defect came out of that playtest and is next session's first job — the jump clip. See below.**
>
> Both Codex reviews ran and every finding from both is applied or recorded with a reason. The gate
> owners ran twice each *(A7)* in isolated worktrees. The juice has been played by hand and the
> evidence clip approved — **twice**, because the first approval was withdrawn (see §3 below).
> **G.7b is FIXED** (`368577f`) — Phase 8's inherited gate, flaky ~3 runs in 8. Its statistic was
> replaced, not its bound: a paired 0/2560/5120 sweep with a 0.3 ms floor per gap and a MARGINAL
> per-exit cost, so the amplifier's count-independent overhead cancels. Verified independently.
>
> **~~The e2e suite now fails on criterion 1.4~~ — FIXED** in the tiers session (clearing the stale
> `node_modules/.vite` dep cache). e2e is **128 selected, 128 passed** as of 2026-08-23. The dev
> server / `dist/` boot gap was the cause and is recorded in `CLAUDE.md §1`; the citation that used
> to sit here pointed at a §0.2 the prompt no longer has.
>
> Full record: [qa/phase-09-polish.md](qa/phase-09-polish.md) (including
> **§ Vault-out — Phase 9**) · [plan review](reviews/phase-09-plan.md) ·
> [implementation review](reviews/phase-09-impl.md) · [evidence/phase-09/](evidence/phase-09/)

## What shipped

Hit-stop as a **per-body integer tick counter** — attacker and victim both freeze for the same count,
the rest of the world keeps ticking — armed at a new lettered step **9b** in the tick contract, with
`hitstopUntil` and `lastHitTick` as absolute deadlines. Screen shake, landing squash, impact sparks,
death plumes, hurt vents, landing dust, i-frame flicker, HUD gear flyers and a level-complete fade.
New sim modules `hitstop.ts`, `playerMotion.ts`, `playerSim.ts`; new scene modules
`particleTexture.ts`, `spriteFlash.ts`, `hudGearFlyers.ts`, `engineLiterals.ts`.

**The 14-step order was NOT renumbered.** Everything added went in as a lettered insert (4a/4b/4c,
9b/9c/9d). Renumbering is a balance change and needs a STOP-and-ask.

## The traps this phase paid for — read these before touching the same ground

**1. A draw-count gate cannot see an invisible particle.** Setting every generated particle texture
to fully transparent (`fillStyle(spec.tint, 0)`) left the unit suite 2150/2150 green and criterion
9.6 reporting `drawn 96 inView 96` **PASS** on a real GPU. Phaser submits a transparent quad exactly
as happily as an opaque one. Closed by an actual pixel read in `phase-09-draw.spec.ts` — **do not
weaken it.** Twenty-two gates of this same class were found and fixed this phase.

**2. `src/render/` modules need a draw-path gate or they are decoration.** `spriteFeedback.ts`
shipped with 221 source lines, a 306-line test file and **zero production consumers**; blanking all
four bodies left the game byte-identical with the suite green. `tests/unit/enemy-feedback.test.ts`
(behavioural, against a fake scene) is the stronger shape — prefer it over source-text scanning.

**3. Never infer an event edge from two samples of a level.** The landing edge used to be derived in
the render layer from `grounded` changing between render calls. At 1 sim tick per frame it emitted
dust and squashed; at 2 ticks per frame it emitted **zero**. Fixed at the source — `PlayerSim.landedTick`
stamped at step 10, read by the renderer. **The same mistake then recurred one layer out in criterion
9.2's own spec** and made it flake ~1 run in 3; that spec now reads the stamp too.

**4. The emit window was off by one and nothing had ever fired.** `(cursor, tickCount]` against
pre-increment stamps meant **no impact spark, death plume or hurt vent had ever appeared in the
shipped game**. Every unit fixture bumped the count before stamping — an ordering production never
performs — and 9.5/9.6 drove `explode()` on emitter handles directly, bypassing the trigger path.
The current form is `hitTick >= cursor && hitTick < tick`; restoring the old one reds six tests.

**5. Perf gates fail on an UNPAIRED median per arm.** Not on "a ratio with a quiet denominator" —
that first diagnosis was wrong and is corrected in the vault-out. `performance.now()` quantises to
**0.1 ms** here. Pair the rounds and separate the arms past the grid; never move the bound.

**6. The DEV hit-stop knob must fold away.** `?hitstop=` is `import.meta.env.DEV`-guarded and folds
to `function Yn(){return 1}` in `dist/`; `verify-dist.mjs` now fails the build on `URLSearchParams`
in the bundle. It also needs `Number.isSafeInteger` **and** a `MAX_HITSTOP_SCALE` — `isFinite` alone
accepted `1e308` and froze the game permanently, and `isSafeInteger` alone still accepted a
19-million-year freeze that death cannot release.

## Verification at the tip (`fbb0631`)

| gate | result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **2154 pass, 0 fail** (133 files) |
| `npm run build` + `verify-dist` | green |
| `npm run test:sim-isolated` | **2151 passed, 3 skipped**; Phaser restored |
| `npm run test:e2e` | **118 passed, 1 failed** — the failure is Phase 8's G.7b |
| criterion 9.2 in isolation | **8 consecutive green**, integrator-run, after 14 by the fixing agent |

Greenness was read **positively** — the test count, not the exit code, and never through a pipe.

## Next session's first job — the jump clip reads smaller and different (owner-reported, 2026-08-22)

The owner played the merged Phase 9 build and approved it, with one defect to fix next session:
**the jump animation looks different from the rest of the animations, and looks smaller.**

**Measured before writing this note**, so next session starts from numbers rather than an
impression. Drawn figure height per frame (opaque rows within the 336x384 cell, read off the shipped
`public/assets/characters/brass-courier/sheets/*.png` with `tools/gen/png.mjs`):

| clip | per-frame heights | mean | vs idle |
|---|---|---|---|
| idle | 287-289 | 288.1 | - |
| walk | 286-292 | 288.9 | 100% |
| attack | 283-289 | 287.6 | 100% |
| run | 261-279 | 275.7 | 96% |
| fall | 277,263,246,224,206,203,206,218,232 | 230.6 | starts full, tapers |
| **jump** | **215,186,195,201,204,197** | **199.7** | **69%** |
| death | 288 -> 64 | 145.2 | shrinks legitimately (collapse) |

**Jump never reaches full height on any of its six frames** (max 215). Fall's first frame is 277, so
an airborne pose *can* read near-full height on this character - jump is uniformly short, not merely
tucked. `renderHeightPx` is 288.

Two leads, in the order worth testing:

1. **Jump has no `_actionScale` override and may need one.** In
   `public/assets/config/character-bounds.json`, `fall` carries `scale: 0.6`, `attack` `0.6` and
   `death` `0.60504202` - per-(slug, action) overrides added because those were shot from PADDED
   generations. **`jump` carries none**, so it packs at the unpadded slug default `0.23723229`.
   Jump and fall are the airborne pair and share `verticalAnchor: "centroid"`; one having a padded
   scale and the other not is the asymmetry to check first. **Caveat, do not skip it:** a straight
   missing 0.6 override would make jump ~40% of idle, and it measures 69% - so if this is the cause
   the padding differs from fall's, and the number must be RE-DERIVED, never guessed.
   `node tools/gen/build-assets.mjs brass-courier jump --derive-scale` prints it; **a human pastes
   it** *(vault A5)*. The scale lives in the config on purpose - `assets:build` reads it and never
   computes it.
2. **"Looks different" is probably the derivation path, not the pose.** In `public/assets/index.json`
   `jump` and `fall` are `derivedFrom: "sim"` while `idle`/`walk`/`run` are `"authored"`. The two
   airborne clips came through a different pipeline from everything the owner is comparing them
   against.

**Before regenerating anything:** re-read `docs/ASSET-PIPELINE.md` and `docs/STYLE.md`, and note that
regenerating `idle` re-derives the slug scale and silently rescales **every** other animation
*(vault A5)* - so idle is rebuilt FIRST or not at all. A fal batch over 5 generations needs a
STOP-and-ask.

> ## ➡️ **Next session: CLOSE PHASE 9, then the last of Tier 5 — [SESSION-PROMPT-next.md](SESSION-PROMPT-next.md).**
>
> The bug-fix session ran 2026-08-22/23 and merged (`f0dbe21`), followed by a branch-cleanup and
> Tier-5 session. **Phase 10 is still deferred**, and the reason is now sharper than "defer it":
> **`PRD.md:35` reads `—` because seven of Phase 9's eleven criteria are unsubstantiated.** The phase
> was merged and approved on a verbal report the project's own records do not corroborate — agent-owned
> criteria that FAILED were fixed and never handed back to their owners. That is one gate round, and it
> is what unblocks Phase 10.
>
> ⚠️ **The prompt has been rewritten to hold ONLY what is still open.** It is no longer the ~60-item
> inventory; closed items live in [qa/session-bugfix-tiers.md](qa/session-bugfix-tiers.md) and
> [qa/session-tier5-and-cleanup.md](qa/session-tier5-and-cleanup.md).
>
> **The owner playtested and accepts the game as it plays** (2026-08-23, twice). Prompt §4 records
> exactly what that settles — including 2.2's judder, closed as not visible at play speed — and the
> four `play`-owned items it cannot settle, because ordinary play cannot reach them.

## What is outstanding

1. **The jump clip** — see the section above. Owner-reported, measured, not yet fixed.
2. **G.7b** (`tests/e2e/phase-08-gate-perf.spec.ts:264`) — inherited Phase 8 gate, both arms measured
   `0.0000 ms`. Under repair using 9.5's pattern: pair the rounds, widen the arm separation. Moving
   the bound, skipping and deleting are all forbidden.
3. ~~Phase 9 is unmerged~~ — **DONE.** Owner tested and approved 2026-08-22; merged to `main` as
   `a99c1f7` and pushed to `origin`.

---

# Superseded — the gate-art + gate-entry session (Phase 8). **Superseded by the section above.**

> ## ✅ Every criterion is green. **STOP for the owner's approval before merging.**
>
> All nine gates pass, both Codex reviews ran and every finding from both is applied or recorded, the
> gate owners ran twice each in isolated worktrees, and the whole thing has been played by hand.
> Nothing is merged and nothing should be until the owner says so.
>
> Full record: [qa/phase-08-gate-entry.md](qa/phase-08-gate-entry.md) ·
> [plan review](reviews/session-gate-art-and-entry-plan.md) ·
> [implementation review](reviews/session-gate-art-and-entry-impl.md) ·
> [generations/session-gate.md](generations/session-gate.md) ·
> [evidence/gate-entry/](evidence/gate-entry/)
>
> **The Codex implementation review returned BLOCK**, on two high-severity defects that six agent
> briefs and a five-level hands-on pass had all read past. Both were confirmed by driving the sim,
> both are fixed, and the story of fixing the first one is the most useful thing in this session:
>
> | | |
> |---|---|
> | **The jump is not locked on the arming tick** | `entryLocked` is cached before step 1 and 9d arms at the end of the tick. **Three attempts.** A position test at step 7 was useless — step 7 runs before the body is integrated, so it reads the previous position. Refusing to arm off the ground worked and took `level-completable` red on four seeds, because the auto-player jumps where the floor ends just past every exit. What shipped freezes the COUNTER while airborne: the run-in still arms mid-hop and still steers the body in, but the fade measures walking in, and you do not walk through air. |
> | **The ceiling was a blink, not a release** | It wrote `null` and the arm branch re-armed on the very next tick — **3 free ticks in 120** against a blocked doorway. The test passed because it measured the longest single armed span, which stays under the ceiling *because the ceiling works*. Now a latch, cleared only when the body leaves the rect: 120 in 120. |
>
> **Settled along the way:** G.7b measured on a real RTX 4080 (**0.0009–0.0065 ms of GPU per exit per
> frame**, plus a linearity check at two amplifications after Codex objected that marginal cost is not
> total cost) · the art-spend ceiling reconciled at **$55** · the gate rebuilt at **288 × 432** after
> the owner saw it was the same height as the character.

## What shipped

Branch `session-gate-art-and-entry`, off `main` at `3affbf8`.

**The exit is art.** One `fal-ai/nano-banana-pro` generation, two takes, **$0.30** — a Victorian
brass-arched doorway with gauges down its jambs and an opaque near-black opening, shipped at
192 × 288 as the `goal-gate` texture. `drawGoal`'s image branch, written dead in Phase 8, is now the
branch that runs.

**You enter the exit, you no longer brush it.** Completion changed from AABB overlap to a scripted
**20-tick run-in** at step 9d that completes only on **full containment**, with input locked, the
`run` animation forced, and the courier fading to alpha 0 as a **render decision** driven by a
sim-owned integer tick counter. No tween, no clock, no millisecond anywhere in `src/sim/`.

Step 9d's **meaning widened in place**; nothing was renumbered, inserted or lettered. Codex ruled on
that at plan review and `tick.ts`'s header states it.

## The traps this session paid for — read these before touching the same ground

1. **🔴 Never run mutation verification in a tree background agents can write to.** Six gate-owner
   agents ran concurrently in the primary working tree. Their briefs banned modifying files; at
   least one did anyway and did not restore. Two mutated lines — the fade deleted, the containment
   check dropped — were **committed as if they were the implementation**, and they were invisible
   because they were the same two mutations this session's own red proofs use. A ban in a brief is
   not an enforcement mechanism. The re-run used `isolation: worktree` and nothing leaked.
2. **Never chain a commit after a test run with `&&`.** The same commit captured a test RED.
3. **`git diff --quiet` after a `cp` proves the state at that instant and nothing about the next
   one.** Two restores did not hold; a third file turned up in a state nobody had written.
4. **Vitest serves an already-transformed test file a CACHED `import.meta.glob('?raw')` fixture.** A
   `.tmj` mutation that had definitely landed — `cmp` confirmed, the script read the bytes back —
   reported **green**. When a red proof mutates DATA rather than source, touch the test file and its
   fixture module before re-running, or the green is fake and looks exactly like a gate that cannot
   go red.
5. **`playwright-cli` cannot platform this game.** Every command is a round trip while the game runs
   on real time in between, so a stall-triggered jump fires tens of pixels late and the courier dies
   in level 01's pit every time. `levelDriver.ts` works because it runs the whole driver **inside the
   page**, sampling once per animation frame. For a hands-on look at something deep in a level, place
   the body with an instrumented probe and let the sim run untouched from there — and say that is
   what you did.
6. **The levels are LOCKED.** `resolveEntryLevel` silently hands back `order[0]` for a level the save
   has not unlocked, so an e2e asking for `level-02` gets `level-01` and times out looking like a
   bug. Seed `steampunk.progress` with `unlockAll()` the way the perf suite does.

## Three defects found by DRIVING the code, not by reading it

Six briefs, a Codex plan review and a five-level hands-on pass all read past the first two.

| | What was wrong |
|---|---|
| **A real hit at the door left the courier invisible OUTSIDE it** | The one thing the feature exists to prevent, in the paragraph that promised it could not happen. The cancel needed 162 px of travel; a knockback delivers 17.5 px/tick against an auto-run pulling back. Driven: the shove moved the player **25.9 px**, the cancel never fired, the counter ran to **25**, and the sprite drew at alpha 0 for **five ticks** while straddling the gate's edge. Now cancels on `hurt`. |
| **An armed run-in had no termination guarantee** | Overlapping but never containable satisfies neither half of the completion AND. One solid in the doorway, 4000 ticks: `counter=3938`, alive, grounded, invisible, no input, no jump, no attack — waiting to be killed was the only exit. Latent on shipped data; nothing stopped the next level. Now cancels above twice the window. |
| **The counter FLICKERED through hitstun** | The cancel learned about `hurt`; the arm branch did not. `null / 0 / null / 0` for the whole window. **Nothing looked wrong on screen** — a counter of 0 draws at alpha 1 exactly as `null` does — so no alpha assertion could have seen it. Found by watching the counter in the running game. It made `entryLocked` true on alternating ticks, so the auto-run fought the knockback and hitstun was half-applied. |

Eleven further gates asserted less than their names claimed and are now tighter, each watched red
under the mutation that motivated it — including a fade window whose **length** nothing pinned
(20 → 40 left the whole suite green), a `run` override evaluated at **one tick** of twenty, and an
art gate that passed a **64 px slit** and a **barcode**.

## And two the OWNER found, by looking

Both were invisible to every machine gate in the suite, and both were found from a screenshot.

| | |
|---|---|
| **The gate was the same height as the character** | The rect is 192 x 288 and the courier's box is 132 x 288, so the doorway stood exactly as tall as the person walking through it — a hatch, not a portal. Nothing caught it because every assertion compared the drawing to the **rect**, and against the rect it was perfect. No test said the door had to be bigger than the character, because nobody had thought to say it. |
| **The first frame-budget statistic was noise** | Its own first version compared *drawn* to *hidden* and reported a 1.5x main-thread ratio — which was the 0.1 ms clock quantum — and a GPU arm claiming that drawing an extra image made the frame 40 % **faster**. Replaced, not re-bounded. |

## Verification at the tip

| | |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **116 files / 1944 tests**, 0 failed |
| `npm run test:sim-isolated` | same count with Phaser uninstalled |
| `npm run test:e2e` | **114 passed**, including G.7b on a real GPU |
| `npm run build` | `verify-dist` ok — 5 levels and 11 audio files byte-identical, no dev-only key in the bundle |

`src/sim/tick.ts` is the one file over 400 lines (**428**), cited in
[qa/phase-08-gate-entry.md](qa/phase-08-gate-entry.md). `tests/unit/goal-entry.test.ts` crossed the
limit too and **split by subject** rather than taking a second exemption.

Dev servers killed by port *(C13)*.


---

# History — the bug-fix + perf-gate session

> ## 👉 Resuming? Read [handoff/next-session-prompt.md](handoff/next-session-prompt.md) first.
>
> **Phases 1–8 are ✅.** The owner played the shipped Phase 8 build, reported three bugs, and scoped
> one session to those plus the two perf gates blocking Phase 9. All five are done.
> **Phase 9 is unblocked.**
>
> That file is the whole brief — including the three perf numbers Phase 9 will be judged against and
> what each of them cannot see. Everything below it is history.
>
> This session's record: [qa/session-bugfix-perf-gates.md](qa/session-bugfix-perf-gates.md) ·
> [-02-gate-owners.md](qa/session-bugfix-perf-gates-02-gate-owners.md) ·
> [-03-hands-on.md](qa/session-bugfix-perf-gates-03-hands-on.md) ·
> [reviews/session-bugfix-perf-gates-plan.md](reviews/session-bugfix-perf-gates-plan.md) ·
> [reviews/session-bugfix-perf-gates-impl.md](reviews/session-bugfix-perf-gates-impl.md)

## 19. The bug-fix + perf-gate session — 2026-08-19. **This section supersedes §18.**

Three user-reported bugs and the two perf gates that blocked Phase 9. Verified at the end: typecheck ·
**1882** unit tests · **1882** with Phaser uninstalled · `build` + `verify-dist` clean · **102** e2e ·
**all five levels played by hand to completion, 0 deaths, 0 hazard contacts**.

**What the process caught that the code did not.** The three bugs were the easy part. Six gate-owner
briefs found **16 defects in the session's own work** — including that the enemy body's *height* was
completely unmeasured (the whole suite stayed green with a 1 px tall enemy), and that the boot gate and
the sim disagreed by one `patrolSpeed`. The Codex implementation review then found two more that all
six briefs had missed:

- `FOOT_TOLERANCE_PX` was applied to the hazard and gear tests as well as the solid test, so a spike
  one pixel under a creature's sole **passed the gate** while reading on screen as exactly the
  reported bug.
- 6.9's absolute HUD-work bound **claimed 1 ms in its docstring and permitted 5.557 ms in code**, and
  had never been watched failing — because the only mutation that existed was a scrim, and a scrim
  costs the CPU nothing. It survived a performance owner whose entire job was that spec, because every
  brief read the *statistic* and none read the *assertion*.

**Two new testing rules came out of it**, both in [TESTING-RULES.md](TESTING-RULES.md) and
[CLAUDE.md §5](../CLAUDE.md): a perf bound chosen from one set of runs must be **confirmed on a
held-out set** (it caught an overfit on *both* gates), and **a statistic that cannot order its own
mutation cannot be fixed by moving the bound** — replace the statistic.


## 18. Phase 7 — 2026-08-16. **This section supersedes §17.**

**Done and merged, all ten criteria passing.** 7.10 was closed by the owner listening to
`docs/evidence/phase-07-audition.html`; every other criterion is measured on `chromium-gpu` with the
renderer string recorded. Spend `$0.23` of a `$5` ceiling declared before the first generation.

Six gate-owner briefs (two per owner, brief 1 withheld from brief 2) produced **31 findings — 18
applied, 12 recorded, 1 rejected**. Both Codex reviews ran.

**What the gate caught that the code did not:** a footstep every 250 ms while standing still against
a wall; an out-of-phase footstep on every walk↔run change; death playing over hurt across a
multi-tick frame; and boot routing green on audio that never decoded, because Phaser's decode
failure emits no event and increments no counter.

**Two gates that could not go red, and one test with two false greens in four lines** — the full
account is in the QA log. The transferable lesson: **at ~240 fps against a 60 Hz sim, a percentile
over rAF frames cannot see a cost carried by under ~2 % of frames.** That is finding 1 of the next
session's three.

### Left open, deliberately, and now scoped as the next session's entire brief

1. **`MAX_BURST_RATIO` (Phase 5) is probably blind** for the same reason, and its only red-proof is
   a per-frame cost the median catches anyway.
2. **Criterion 6.9 fails under full-suite load**, proven pre-existing by re-running the suite on
   pre-audio `main` in a worktree.
3. **`GameScene.ts` is 432 lines**, and `file-size.test.ts` permitted the crossing on a Phase 4
   citation two phases stale.
4. **Criterion 4.23 is RED on `main`** — the drawn bottom sits **14.75 px** off the sim feet y while
   the player is vertically still. Added to scope by the owner after being shown it. Recorded as
   **D8b**.

🔴 **D8b's "environmental" reading has since weakened and the prompt says so.** Phase 7 recorded it
that way because it began after an `npm ci`. But the installed tree was afterwards checked against
the lockfile and **matches it exactly**, so the current tree is the canonical one — and
`test:sim-isolated` mutates `node_modules` on every run, which is the obvious way the earlier
*passing* tree drifted from it. The likelier story is that **4.23 is genuinely broken and the greens
were masking it.** It is the criterion that says the character's feet meet the ground, and Phase 8
is level design, so it is the right thing to settle first.

---

# Superseded — Phase 6 (collectibles, HUD, steampunk UI chrome)

**Branch:** `phase-06-hud`. **Written:** 2026-08-09 (Phase 5, session 1), amended each session since.
**§16 (2026-08-15) supersedes §15 and everything above it. Read §16 first.**
> ⚠️ **This document is stale from the first commit of any session that will rewrite it.**
> Two Codex blockers and one QA brief in session 7 were caused by reading it mid-flight.
> If you are reviewing during a session, ask which sections are known stale.

🔴 **§14 and §15 below say "Phase 5 is FAILING". That was true when they were written and is not
true now** — Phase 5 closed on 2026-08-15 and merged at `c38c76b`. **This header was itself the
example**: it carried "Phase 5 is NOT complete" for eleven days past the merge, while
[PRD.md](PRD.md) marked the phase done, and the Phase 6 plan review had to be told which documents
to disbelieve. Sections are superseded, never edited in place; the header is the one place that
tracks the truth, so it is the one place to look first.

Read this first, then [PRD.md](PRD.md), then
[prd/phase-06-hud.md](prd/phase-06-hud.md) §6 (the gate), then
[qa/phase-05-combat.md](qa/phase-05-combat.md) (what has already been decided and measured — **read
it before re-measuring anything**).

---

## The sessions, split into parts

**This document reached 1604 lines.** On 2026-08-15 the superseded sessions moved to
[`docs/handoff/`](handoff/). **The § numbers did not change.** `src/`, `tests/`, `tools/` and
`playwright.config.ts` cite sections as "HANDOFF.md §14", and every one of those citations still
lands here, on this index, one hop from its section.

**The rule going forward:** when a new session supersedes the one before it, the superseded
section moves to `docs/handoff/`. The live sessions stay in this file.

| § | Session | Where |
|---|---|---|
| §1–§7 | session 1 — 2026-08-09 | [handoff/session-01.md](handoff/session-01.md) |
| §8, §9 | sessions 2–3 — 2026-08-10 | [handoff/sessions-02-03.md](handoff/sessions-02-03.md) |
| §10, §11 | sessions 4–5 — 2026-08-11 | [handoff/sessions-04-05.md](handoff/sessions-04-05.md) |
| §12, §12b, §13 | sessions 6–7 — 2026-08-11/12 | [handoff/sessions-06-07.md](handoff/sessions-06-07.md) |
| §14 | session 8 — 2026-08-13 | below |
| §15 | sessions 9–10 — 2026-08-13/14 | below |
| §16 | Phase 6, session 1 — 2026-08-15 | below |
| §17 | **Phase 6, session 2 — 2026-08-16. Phase 6 CLOSED.** | below |

---

## 16. Phase 6, session 1 — 2026-08-15. **This section supersedes §15 and everything above it.**

> 🔴 **RESUMING PHASE 6? READ [handoff/phase-06-owed.md](handoff/phase-06-owed.md) FIRST.**
> It is the complete list of what is left, with two options and a recommendation on each, and it is
> the document the next session was written for. **Phase 6 is NOT done** — criterion 6.9's
> frame-budget half is unrun — and the branch `phase-06-hud` is not merged.

**Phase 5 is done.** Closed 2026-08-15, merged at `c38c76b`, and `b8546a8` then took the over-400-line
file count from seven to one. **`src/scenes/GameScene.ts` at 459 lines is now the only file over the
ceiling, and `tests/unit/file-size.test.ts` allows exactly one** — so any new Phase 6 file that
crosses 400 is a hard red, and `tilemap.ts` (374), `GymScene.ts` (399) and `build-assets.mjs` (398)
are all close enough that an ordinary edit tips them.

**Phase 6 opened on `phase-06-hud`.** Baseline before the first change: typecheck clean · 1146 unit
tests pass · `npm run build` + `verify-dist` ok.

### Four things the code does not tell you, found while planning this phase

- 🔴 **The player's health bar already has the vault 6.4 defect.** `healthBarFillWidth(99, 100, 156)`
  returns **154 of 156 px** — a visually full bar at 99 % health, which is vault 6.4's "315 of 318 px"
  case on the bar that matters most. It shipped in Phase 5 and no gate looks at it.
- 🔴 **The canvas is centred twice.** [index.html](../index.html) gives `#game` a flex centre while
  `config.ts:30` sets `autoCenter: CENTER_BOTH`, which writes CSS margins. Vault 6.6/6.7 exactly, and
  it is what criterion 6.7 exists to catch.
- 🔴 **`GameScene.update()` throws away events.** The split batch at `GameScene.ts:253-262` keeps only
  the last tick's events and discards those from `advance(world, input, ticks - 1)`. **This is a
  Phase 5 defect, not a Phase 6 one** — any edge landing in a dropped tick is silently lost — and no
  Phase 5 gate found it. Codex's plan review did (finding F8).
- **The HUD is not missing.** `assets/hud/health-assembly.png` ships, is catalogued as `hud-health`,
  and was generated on the **current** model, not a retired one. The phase doc's "drawn by a model we
  no longer use" is about the HUD *inside the anchor scene image*. The user chose to re-shoot anyway
  with that stated; the cost is a hand re-measure of `HUD_SLOT`, which no gate can catch.

### Decisions taken before any code

Recorded here because none of them is derivable from the diff: minimum supported resolution is
**both** 1280×720 and 852×480 · gears come from a **Tiled object layer**, like hazards and enemies ·
up to **10 fal generations** authorised · **every pixel, screenshot and timing number in this phase
comes from the `chromium-gpu` Playwright project**, headed and on a real GPU — the headless project
is for logic regression only, because SwiftShader inflates milliseconds ~21× and is not the
rasteriser a player sees.

---

## 14. Session 8 — 2026-08-13. **This section supersedes §13 and everything above it.**

**Phase 5 is still FAILING, and it is much closer than it was.** Every defect the session opened
with is closed. What is left is two criteria that do not measure what they claim, and one that needs
your eyes.

HEAD `b988e66` on `phase-05-combat`. **275 suites / 900 tests / 0 failed · 64 test files · e2e 47
passed · sim-isolated 900 with Phaser uninstalled · typecheck clean · verify-dist ok · port 5173
clear · $41.36 of $55, no spend this session.**

### What closed

| | was | now |
|---|---|---|
| **P1** dead enemies kept acting | shipped defect | guard at the **call site** in `stepEnemies`, so `stepProjectiles` stays outside it and shots in flight keep travelling. `0466b9a` |
| **P3** hitstun was cosmetic | no lock at all | locks horizontal **and** the jump **and** the jump-cut. Five ticks, not six — the asymmetry is derived in the docstring. `7a63f13`, `8bfeee5`, `ea0c6e4` |
| **S1/S2** the chase | 200 px teleports, floating scavengers | `deadZone` 96 as a **per-entity field** (a module constant cannot satisfy 5.9's sweep), clamp on both paths. `dca73f1` |
| **Knockback** | scoped in Phase 5 §1, **never built** | shipped at step 9b. Grounded **7.39 px**, airborne **25.59 px**. `5765227`, `626f8b3` |
| **Grey-box enemy** | a chasing scavenger was a permanent `Rectangle` | `fallbackAnimKey`. The 5.11 spec reads **20/20** where it read 12/20. `626f8b3` |
| **5.12** | 8 files over 400 | **0 over 400.** `49a7d30`, `4eb08f3`, `ea0c6e4` |
| **P4** the frame budget | "the parallax is 64% of it" | **a software-rasteriser artifact.** See below. `f370a48` |

### 🔴 P4 was never a defect on real hardware, and every number before this session was wrong about it

Real Chrome, **RTX 4080** (D3D11/ANGLE, confirmed in-page off `WEBGL_debug_renderer_info`, not
assumed), same sampling method, **reproduced identically three times**:

| | headless (SwiftShader) | real GPU |
|---|---:|---:|
| median frame | 90.10 ms | **4.2 ms** |
| sustained | ~11 fps | **240 fps**, vsync-locked |
| poses painted per cycle | 4–6 of 12 | **12, 12, 10, 12, 12, 12** |

Every P4 number that existed before — 5.11's 12–18 fps, the 70.30/25.50 A/B, "64 % of the frame
budget", the 5-of-12 drop — came from headless Chromium with no `launchOptions`. **The harness was
measuring itself.**

**A parallax retile was built on the strength of those numbers and then reverted.** Its own
interleaved A/B refuted the texture-size hypothesis (ratio **2.42** against 2.76 before), and a
playtest showed the crop put a **duplicated gauge panel in every single frame** — because the
cropped texture was exactly the view width, so the mirror pair is permanently on screen. `ca84554`.
The reasoning is written into `build-world.mjs` **at the point of temptation**, because the 21.4 MB
payload will tempt someone to try it again.

⚠️ **Your original dropped-frames report is still unexplained.** It was a real browser. Either this
session's fixes changed it or it was something else. **It needs your hands, not another probe.**

### The gate — honest per-criterion status at `b988e66`

| # | status | note |
|---|---|---|
| 5.1 5.3 5.4c 5.4d 5.5 5.6 5.9 5.15 | **PASS** | owner-verified, this session, evidence in `docs/qa/phase-05-combat.md` |
| 5.2 5.7 5.10 5.12 5.16 | **PASS**, named caveats | 5.16 ran for the first time and passed |
| 5.4 | **PASS** | scavenger walk, **11 distinct poses**, sampled per-rAF at paint time on real hardware |
| 5.13 5.14 | **PASS** | both Codex reviews ran; **all 4 implementation findings confirmed and dispositioned** |
| **5.8** | 🔴 **UNRESOLVED — needs you** | the health bar renders as a **small red sliver** at true sprite size. "Legible" is a human judgement *(C4)* and no agent may assert it. Screenshot is in the QA log's playtest section. |
| **5.11** | 🔴 **FAILING as a measurement** | the number is real; it is not measuring what the criterion says |

### Why 5.11 fails, and do not "fix" it by changing the tolerance

Three independent problems, all recorded with evidence:

1. **The gated spec has never once run on anything but a software rasteriser.** The 4.2 ms figure
   came from a separate manual probe, not from the test that gates the criterion.
2. **The "worst-case" fleet spawns entirely outside the viewport.** `DEV_FLEET_OFFSET_X` 200 sim
   units × `RENDER_SCALE` 6 = **1200 screen px**; the visible half-width is **960 px**. **0 of 20**
   on screen; exactly **8 of 20** inside `detectRadius`. That 8 is the same geometry that produced
   the 12 grey Rectangles — two unrelated findings confirming each other.
3. **`medianMs < 100` was never a budget.** No baseline exists (S4, PRD §7). Quiet-machine
   re-measure: **82.4 / 82.5 / 82.9 ms**, spread 0.5 ms, matching session 7's 82.10 — so the
   95–97 ms the owner saw was machine load, **not** a regression. One run's `maxMs` hit **99.80**.

**Cross-session comparison of absolute ms from this harness is not evidence in either direction.**
Four times this session those numbers moved with background load. The one A/B that decided anything
was run **interleaved**, A,B,A,B,A,B, in a single session.

### Do this next, in this order

1. **Play it.** 5.8 is yours, and your dropped-frames report needs confirming or retiring. While
   you are in there: the player **wedges against terrain at `x: 3198`** with a scavenger in contact
   and drains **100 → 35 hp** with no way past. Not diagnosed, not a Phase 5 criterion, and it did
   not read as a fight.
2. **Redesign 5.11** — it needs a decision from you, not a patch. Options in the QA log under P1–P4.
3. **The cheapest real improvements**, in order: `withinRadius`'s vertical term is untested
   (**T6** — every sentry fixture is `y:0`/`playerY:0`, so deleting `dy*dy` reds nothing); nothing
   swings an attack to an actual kill (**T2** — *the gap that let P1 ship past the whole gate*); the
   six extracted `GameScene` modules have no tests (**T13**).
4. **`verify-dist`'s four identifier greps cannot go red** under minification (**T8**). Codex's fix
   is better than more greps: a Vite `generateBundle` assertion that DEV-only modules contribute
   **zero rendered bytes**.

### Things you will not work out from the code

- **`window.__game` has EIGHT top-level fields, not nine.** CLAUDE.md, PRD.md, `GameScene.ts:150`
  and several of this session's own commit messages all say nine. Caught by Codex. The surface is
  closed either way and nothing leaked into it — **the count is wrong, the invariant is not.** Both
  files are outside this session's scope lock, so it is recorded and not edited.
- **`file-size.test.ts` asserts `over.length <= 10`, not `0`** — with 0 over it now has ten free
  slots and cannot go red. **You declined tightening it** (2026-08-13); it is recorded as **T7**.
  `GymScene.ts` sits at **399**.
- **Two agents destroyed uncommitted work with `git stash` in session 7.** Every brief since carries
  an explicit ban, and nothing was lost this session. Keep the ban.
- **The QA log's 5.12 record has now been wrong three times** — twice stale, and once, in this
  session, **false when written**: I ran the sweep, then fixed a file that grew `tick.ts` by 21
  lines, then wrote the sweep's result down. **A measurement written down after later edits is not a
  measurement of the tree it claims to describe.**
- **Hand your reviewers your own conclusions, not just the diff.** The prompt for Codex review 8
  listed the gate's known findings and asked it to say if any were wrong. **Both corrections came
  from that section**, including the blocker.

---

## 15. Sessions 9 and 10 — 2026-08-13/14. **This section supersedes §14 and everything above it.**

**Written 2026-08-14.** Session 9's eight commits were recorded in **no** handoff section at all —
this file stopped at §14 while the branch moved on — and two of session 10's own numbers were wrong
*because of that gap*. Both sessions are here.

**Phase 5 is FAILING and must be reported failing.** Most of the QA gate is unrun; it last ran at
`b988e66`, and thirteen commits have landed since.

### Session 9 — the ghost, chased through three wrong causes

The user reported the character *"moves too fast, like a ghost"* and *"two overlapping copies"*.
Three separate defects were found under that one report, and the first two fixes did not resolve it:

| commit | what |
|---|---|
| `74cdfb0` | DEV-only playable feel variants, to stop guessing |
| `dc76df2` | **A loop has no window to outrun** — locomotion cadence became AUTHORED (`character-bounds.json` → `animations.<name>.fps`), replacing a stride measurement with a ±20 % spread |
| `ce6a56f` | DEV-only live locomotion tuner: `[`/`]` cadence, `-`/`=` speed, SLIP on the overlay |
| `36ad73e` | **`cadenceTicks` rounds TICKS PER FRAME, not the cycle** — an unevenly-held frame is judder. Of the values a ±1 fps step reaches around 31, only 30 divides evenly; that is why the user reported the first tuner as making no difference in either direction |
| `7ccc4ad` | a falsifier for the ghost report, built BEFORE the fix |
| `01f2ae7` | **render interpolation** — the sim runs at 60 Hz on a 240 Hz display, so three frames in four were identical and the fourth jumped |

**Confirmed in real play at 240 Hz: the ghost is gone and the character does NOT feel less
responsive.** Interpolation costs up to one tick (16.7 ms) of visual latency by design and the trade
is accepted.

⚠️ **The lesson session 10 paid for: `01f2ae7` gave interpolation to the PLAYER only.** See below.

### Session 10 — five commits, and three things nobody had measured

| commit | what |
|---|---|
| `fd18032` | The sentry can fire and die. Both clips were bought in **session 6** and never packed — nothing in `src/` needed changing |
| `40a35a1` | The character slows to the speed its own feet describe |
| `336bf9b` | Three playtest bugs: speed, the shrinking turret, an invisible shove |
| `7ec5308` | The scavenger keeps coming, and its feet finally land |
| `83b0c1e` | The enemies never got session 9's ghost fix, only the player |
| `79ed371` | The spike strip was never jumpable, and `x:3198` was never a bug |

#### 🔴 The foot-plant invariant, and why session 9's fix was incomplete

Session 9 tuned foot-slide **by eye**. By eye is not the same as gone. Measured against the art's own
foot travel, the shipped tune was never planted:

```
         art foot travel   ticks/frame   speed   body px/frame   slide
  run    22.5 px           2             12.0    24.0            +6.7 %
  walk    9.0 px           2              5.54   11.08           +23 %   ← worse than the reported defect
```

Nothing was watching, because nothing had ever compared the sim's speed to the art's measured foot
travel — the two halves lived in different files, one of them a DEV-only scene.
`tests/unit/foot-plant.test.ts` is that comparison now, as an **exact** equality.

**The invariant collapses speed to a quotient.** `ticksPerFrame × topSpeed === footPxPerFrame` with a
whole `ticksPerFrame` means speed is `footPxPerFrame / n` and **nothing between**. Consequences that
will recur:

- `run` had to be **resampled 12 → 15 frames** to reach 9.0, because 12 frames offered only 11.25 and
  7.5. Cost: ~13 distinct poses per cycle, so 15 repeats some.
- The scavenger's decided `chaseSpeed` of "3/4 of run" (**6.75**) **does not exist**. 6.0 was taken.

**A design decision that names a speed must be checked against the sheet before it is agreed to.**

#### 🔴 Two defects that look identical, and the diagnostic was in the user's phrasing

*"The scavenger's animation is not smooth"* had **two** independent causes: foot-slide, and
tick-stepping. Re-timing the sheet fixed the first and the complaint survived. `enemyLayer.sync`
still wrote `body.setPosition(desc.x, desc.y)` — the raw tick position — because `01f2ae7` wired
interpolation into `GameScene.renderPlayer` **and nowhere else**.

The defect had become *more* visible for having been fixed on the character standing next to it. The
user's words named the comparison exactly: *"not smooth **like my character**"*.

**`interpolate.ts` was correct, engine-free and thoroughly unit-tested. Nothing asked who called
it.** That is vault 5.3 one step out — one definition with an incomplete set of consumers. And no
unit test could see it: **deleting `GameScene`'s snapshot call leaves every unit test green**, which
is why the enemy interpolation carries a unit gate *and* an e2e one.

#### 🔴 The spike strip was impassable, and `x:3198` is not a bug

`tests/unit/level-traversal.test.ts` runs the real `tick` over the real shipped `.tmj`. It found:

- **The spike strip at 384 px could not be jumped at any speed**, and had not been since Phase 4's
  rescale — four sessions, two of them playtested. The only reach gate in the suite was **vertical**.
  Narrowed to **192 px**, in `make-greybox-level.mjs` (the hazard rect is derived from the `SPIKES`
  array; hand-editing the `.tmj` desynchronises art from collision and `level-entities.test.ts`
  catches it immediately).
- **`x: 3198` is the player's box against the pillar at 3264** — `3198 + 66 = 3264` exactly. The
  "wedge bug" recorded 2026-08-12 and carried as an open unknown through two sessions is a collider
  working correctly on a solid the player is meant to jump.
- **The permanent-aggro blocker is settled by terrain.** The level scavenger stands on the floor
  beginning at 4128; the pit at 3840–4128 stops the chase over 400 px from the player. Red-proved:
  remove the ground veto and it closes to **92 px**.

#### 🔴 Knockback was firing correctly and was invisible

`KNOCKBACK_SPEED` was aliased to `walkMax` — **one tick of walking** — producing **9.7 px** of travel
against a 132 px body. What a player sees is a hurt pose, six ticks of movement lock, and no
movement: *"the knockback is not working… the animation got stuck"*. Both halves of that report are
the same defect. Now **17.5 px/tick = 64 px of travel**, tuned in the unit that matters (px of
**travel**, not px per tick) and asserted by summing the real decelerating series.

#### What the money did and did not buy

**$43.74 of the $55 ceiling. $2.38 spent this session, both clips REFUTED the hypothesis they tested.**

- The sentry's `fire` and `death` clips were bought in session 6 and sat unpacked. Adopting them cost
  **$0** and gave the turret a firing pose and a K.O.
- **Anchor padding scales a subject; it cannot scale an effect.** Two paid single-variable re-shoots
  established it. A muzzle flash and a debris plume exist *to leave the frame*. Both clips accepted
  under a written G6 exception naming the file and the edges (`tools/gen/edgeExceptions.mjs`).
- **Criterion 5.4e closed for $0.** Two `request_id`s recorded as permanently unrecoverable were both
  in `~/.genmedia/gallery/sessions/<id>/data.json`, with the download path. Check the tool's own
  records before declaring provenance lost.

### Traps this pair of sessions leaves behind

- **`brass-courier/death` still cannot pack** — it needs a 332 px cell against the courier's 288.
  STOP-and-ask, undecided.
- **`docs/GENERATION-LOG.md`'s "66 generations · $31.39" is an INVOICE reading from 2026-08-09**, not
  a running total. It was being quoted as current five days later. The live figure is the Phase 5
  total; everything after that date is quoted, not invoiced, and the two must not be summed.
- **The `window.__game` surface has EIGHT fields, not nine.** Three documents and three code comments
  said nine; nobody had counted. `src/debug/globals.ts` is the authority.
- **`enemyView.ts:66` returns `chasing ? 'chase' : 'walk'`**, and aggro is permanent — so after first
  sighting the scavenger's `walk` sheet is never drawn in play again. A consequence, not a defect.
- **Two gates that could not go red were found by mutation, not by reading.** `withinRadius`'s `dy`
  term (every fixture placed enemy and player at the same `y`) and `healthBarFillWidth`'s low-end
  compression (at the real 144 px slot the naive floor behaves almost identically). Both now fail
  under mutation; before, neither did.
- **A test harness that can produce a contradiction is worth more than one that quietly produces a
  plausible wrong answer.** `level-traversal.test.ts`'s first draft never jumped in any test — the
  tell was a run-up that failed while a standing hop succeeded, in the same run.

### Session 10, second half — the dwell fix, the 5.11 rebuild, and the gate

Five more commits after the four recorded above.

| commit | what |
|---|---|
| `d0fac00` | **Four one-shots juddered because a "permanent" exception was wrong.** `loop-dwell.test.ts` gated loops only and carried a `KNOWN_UNEVEN_ONE_SHOTS` list calling two of them unfixable. The reason given was half right — a one-shot's `simTicks` IS a sim window and rounding it would be a balance change — and half false: a one-shot's **frame count is declared**, in `VIDEO_MOTIONS[key].frames`, and `build-clips.mjs` samples exactly that many. Widening the gate found **five**, not two. Four re-extracted and repacked at $0. |
| `21c56ff` | **Criterion 5.11 was measuring a frame that drew none of its enemies.** `DEV_FLEET_OFFSET_X` 200 sim px against a 160 sim px visible half-width: 0 of 20 on screen. Rebuilt on a real GPU with the fleet in view, both enemy kinds, and bolts in flight. |
| `64ac651` | **The gate's adversarial briefs found three shipped defects** — see below. |

#### The three defects the second briefs found, and the first briefs did not

Vault **A7** paid for itself again, harder than usual. Brief 1 returned *no failures* for
`qa-expert` and *PASS with defects* for `code-reviewer`. Brief 2 of each found these:

- **`MAX_LEAP_PX` was smaller than the simulation's own vertical maximum.** The teleport guard was
  the literal `48` while `maxFallSpeed` is **51.6** and `jumpVelocity` **48.6** — so the takeoff
  tick of every jump and every tick at terminal velocity were drawn **unblended**. 51 of 120 ticks
  over a jump plus a run off a ledge. Session 9's ghosting fix was only ever horizontal.
  Its docstring said *"vertical travel is capped by terminal velocity, which is smaller"*, and its
  test restated a stale literal `12` instead of importing the tuning — which is exactly how the
  constant survived two speed changes.
- **The respawn handed out a free mid-air jump.** A corpse stays `grounded` for the whole death
  window, so step 10 re-armed the coyote window on all 45 ticks. Jump held while dead launched the
  courier **216 px above the spawn**. `respawnPlayer`'s own docstring claimed it could not.
- **`advance()` dropped four of its seven events.** Named assignments for three fields while
  `TickEvents` had grown to seven, so `GameScene` read `events.respawned` as **always false** and
  the interpolation guard added earlier the same session could never fire.

**All three are the same shape: a comment that named the behaviour, and code or a test that checked
something adjacent to it.** That is the failure mode this project is most exposed to, because its
comments carry so much of its knowledge.

#### 🔴 Things that are open and need YOUR decision — none of them are bugs to go and fix

| | what | why it is yours |
|---|---|---|
| **`brass-courier/fall`** | Needs **9** frames to stop juddering. Re-extracting at any count fails G6 on frames 0-4, and frame 0 is the same source frame at 6, 8 or 9 — **so the sheet shipping today never passed G6 either.** The courier is not cropped; what fails is green that does not key out on the fastest frames. Regenerating the rejected strip rebuilds `fall.png` **byte for byte**, which is how the write-then-gate path was confirmed. | Three unblocks: a keying tolerance, an `ACCEPTED_EDGE_BLEED` entry with a stateable reason, or a re-shoot. Tolerance and money are both STOP-and-ask. `jump` is the same batch and already known-bad. |
| **A 47.9 MB screen recording is still tracked in git** | `.gitignore` gained `Recording*.mp4` but that does nothing to an already-tracked file. Merging puts 48 MB into `main`'s history permanently. Needs `git rm --cached` before the merge. | It is your file, and deleting a file is a STOP-and-ask. |
| **A stationary chasing scavenger still runs its chase cycle** | Inside the dead zone or vetoed by the ledge probe it does not move, but `scavengerAnim` returns `chase` from the flag. Foot-plant violated by 18 px a frame. Permanent aggro means this never ends. | The fix needs a stationary pose the scavenger does not have — `rust-scavenger/idle` was descoped as art with no sim state. Buying it, or deriving the animation from real travel, is a design call. |
| **Aggro survives your death** | Nothing clears `chasing` on respawn, so scavengers walk to the new spawn and never patrol again. Invisible today because `level-01` has one. | Whether death releases aggro is a **balance** decision, and permanent aggro is what you asked for. |
| **The sentry re-derives `facing` every tick** | No dead zone, so a player oscillating around its `x` strobes `flipX` at 60 Hz. Its docstring claims the scavenger's rule; the code does not implement it. | Deferred rather than fixed blind — it is a visual claim nobody has observed, and no gate can see it. Next session's first candidate. |

#### The gate hole worth closing first next session

**G5 — the contact-frame gate — runs only from a CLI, by hand.** `reachGate.mjs` is unit-tested
against synthetic fixtures and **never against the shipped `attack.png`**. So repacking that sheet
this session invalidated 5.4c's recorded evidence and **nothing went red**; the criterion kept
reading PASS against a sheet that no longer existed. (Re-run by hand: it passes. The number was
fine; the mechanism was not.)

That is the shape vault 3.1 exists for — *the unit suite runs the real validator over the shipped
bytes* — and the art gates are the one place this project does not do it.

#### Smaller things worth knowing

- **A one-shot's frame count is load-bearing, not a taste setting.** It must divide its sim window.
  `tests/unit/one-shot-divisor.test.ts` gates the declared count; `loop-dwell.test.ts` gates the
  shipped catalog; `tests/unit/blockedDwell.ts` holds the one exception from **one** definition so
  both gates skip the same row and neither can widen quietly.
- **`assets:clips` and `assets:build` can disagree.** The first reads the motion spec; the second
  packs whatever strip is on disk and never reads the spec. `fall` had declared 6 while shipping 8.
- **`build-clips.mjs` writes the strip and gates it afterwards**, so a G6 failure leaves a complete,
  usable strip that `assets:build` will pack without complaint.
- **The 5.11 sampler is bounded in TICKS, not frames**, because every sentry volleys on the same
  tick and then waits 90. At 240 Hz a 120-frame window was a third of one cooldown, so the burst
  the gate exists to catch could fall outside it entirely.
- **`long-animation-frame` cannot gate a frame budget here.** It only emits above 50 ms; the game
  runs at 4.16 ms. Both halves reported zero, and `0 / 0` is a gate that cannot fail.
- **`file-size.test.ts`'s path check was dead for every test file.** Vite resolves glob keys against
  `tests/unit/`, so anything under `tests/` came back as `../e2e/…` — a form no QA log could
  contain — leaving only the basename fallback. A 648-line file counted as "recorded" because its
  name appeared in an unrelated citation.
- **The e2e suite now has two Playwright projects.** `chromium` for everything, and `chromium-gpu`
  — headed, real GPU — for `phase-05-perf.spec.ts` only. It opens a window when it runs.

---

## 17. Phase 6, session 2 — 2026-08-16. **This section supersedes §16.**

> ✅ **Phase 6 is DONE and marked ✅ in [PRD.md](PRD.md).** Criterion 6.9's frame budget — the
> blocker — is measured. The ten-item owed list is resolved. The A7 shortfall is closed: all three
> missing brief 2s ran, and eight gate-owner runs happened in total. Codex's implementation review
> ran a second time.
>
> **Not merged.** Stopped for approval, per the phase workflow.

**State, all re-run after the last edit:** typecheck clean · **1224 unit tests pass** · **1224 pass
with Phaser uninstalled** · `npm run build` + `verify-dist` ok · **48/48 headless e2e** · **23/23 on
`chromium-gpu`, 1 skipped** · port 5173 clear · Phaser 4.2.1 restored.

**The measurement that closed the phase.** The HUD costs **~0.1 ms of main thread and ~0.003 ms of
GPU per frame** — 0.6 % and 0.02 % of a 16.67 ms frame — measured as three interleaved
HUD-on/HUD-off pairs on a real GPU, in a damaged state so the bar actually draws. Full table,
bounds and red runs in [qa/phase-06-hud.md §Session 2](qa/phase-06-hud.md).

### The three things worth knowing before the next session

1. **The recorded "false green the suite cannot catch" does not exist.** Vitest fails both shapes —
   an unimportable test file and a file with zero tests — and exits non-zero. What happened in
   session 1 was a misread: the `Tests N passed` line stays green and merely *drops*, while the
   redness is on the `Test Files` line and in the exit code. No gate was built; building one would
   have been decoration.
2. **HUD lifetime by scene-event ordering is a trap.** Three implementations: a `GameScene` SHUTDOWN
   handler (deleted the HUD on restart — both code-reviewer briefs traced it from Phaser's sources
   before any test caught it), `attachHud` stop-then-launch (broke the dev-toggle teardown), and
   finally `UIScene.update()` retiring itself when `GameScene`'s status `>= SLEEPING`. Only the
   condition is order-independent. **PAUSED still renders and must be kept** — criterion 6.4's spec
   pauses `Game` deliberately.
3. **A real defect was found and fixed in the boot path.** A refusal that follows a *successful*
   boot left the HUD frozen over the error screen, with the render loop throwing
   `TypeError: … reading 'glTexture'`. The stop was in the right place but ran too late: on a restart
   the play scenes render on through the reload that frees their textures, and the crash kills the
   loop before `refuseToRoute` can stop anything. **Fixed by stopping `Game` and `UI` in
   `BootScene.init()`** — a no-op on a fresh boot. Found only by writing the test Codex said was
   missing; the old one used a fresh page where the HUD was never running, so it could not go red for
   the line it named.

### Carried forward

- ~~**Phase 7:** the three `hudObjects()` call sites that bypass `waitForHud`.~~ **Closed in Phase 7
  — there were four, not three:** `phase-06-hud.spec.ts:139` and `phase-06-health.spec.ts:101`,
  `:211`, `:268`. All four now call `waitForHud` before reaching `hudObjects()`.
- **Phase 8:** the gear-burial check misses a gear on the **seam between two floor rects** — a 96 px
  grid makes that the default authoring outcome, and Phase 8 is the phase that authors multi-rect
  floors. Also re-measure counter contrast against any new palette: the fill alone is 3.13:1 on
  mid-grey and 1.13:1 on bright sky.
- **Phase 9:** ~~`addHelpBanner`'s literal `18px`~~ (**both banner items CLOSED 2026-08-28** by
  session `hud-and-pits` — the font is 43 px scaled and the banner lives in its own type-only layer,
  `src/scenes/helpBannerLayer.ts`; `addHelpBanner` no longer exists and the `setScrollFactor(0)` is
  now reconciled against the owning camera rather than removed); DPR ≠ 1 centring; the collect-tween
  polish.
- **Phase 4 debt:** only **4.2b** (owner decision — an ordering violation no work can undo) and
  **4.27** remain. 4.10/4.12 were already closed; **4.16 closed this session**. The PRD row was
  stale and is corrected.