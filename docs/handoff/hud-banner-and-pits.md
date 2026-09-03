[← HANDOFF.md index](../HANDOFF.md)


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
> [qa/session-hud-and-pits-04-flush-seams.md](../qa/session-hud-and-pits-04-flush-seams.md).
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
> Branch `session-hud-and-pits`. Full record: [qa/session-hud-and-pits.md](../qa/session-hud-and-pits.md)
> + [gate owners](../qa/session-hud-and-pits-02-gate-owners.md)
> + [hazard clearance](../qa/session-hud-and-pits-03-hazard-clearance.md) ·
> [plan review](../reviews/session-hud-and-pits-plan.md) ·
> [impl review](../reviews/session-hud-and-pits-impl.md).
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

