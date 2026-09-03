[← Phase 10 QA log index](phase-10-ship.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-10-ship.md)

---

## 🔴 The 60 Hz camera defect — found by PLAYING the production build, 2026-08-27

**This is criterion 10.12's hands-on half doing the only job it has, and it is the best evidence
this project produced for why *(vault C4)* exists.** The phase was reported, the deploy was live,
every gate was green — 2,613 unit tests, 141 e2e, two Codex reviews, six QA agents, twelve
adversarial briefs. The owner opened the URL on a 60 Hz screen and said it was *"not smooth …
blurry or smeared while moving"*.

### What it was

Phaser's `Camera.preRender` applies the follow lerp **once per rendered frame**:

```js
scrollX += (target - scrollX) * lerp.x
```

`cameraRig.ts` handed it a constant `0.12`. That makes the camera's time constant `frameMs / 0.12`
— which is a function of the **display rate**, not of game time. Every tuning decision in this
repository was made on a box that renders at ~240 fps.

Modelled against `DEFAULT_TUNING` (`runMax` 9, `maxFallSpeed` 51.6, `jumpVelocity` 48.6):

| display | time constant | trails a running player | character swing per jump |
|---|---|---|---|
| 240 Hz — the tuning box | 35 ms | 16.5 px | 96 px — 8.9 % of screen height |
| 144 Hz | 58 ms | 27.5 px | 143 px — 13.2 % |
| **60 Hz** | **139 ms** | **65.9 px** | **264 px — 24.5 %** |

The character is the one object the player's eye is locked onto. On a 60 Hz screen it drifted a
**quarter of the screen height on every jump** and sat 66 px off centre while running, while the
world scrolled underneath it — two independent motions on the thing being tracked, which is what
"smeared while moving" describes.

⚠️ **The project's own rule already forbade this** — *"every duration is an integer count of 60 Hz
ticks; never a `deltaTime` multiply"*. The camera escaped it because the rule is written about
`src/sim/` and the camera lives in Phaser. The principle was not narrower than the rule; the rule's
wording was.

### Why no gate could have caught it

Every gate in this repository — unit, e2e, GPU — runs on this box, at ~240 fps, where the defect is
**four times smaller and invisible**. There is no bound that would have gone red, because there was
no run at 60 Hz to bound. A perf gate would not have found it either: the frame *cost* was never
the problem, only the frame *rate's* effect on a constant.

### The fix

`followLerpForFrame(deltaMs)` in `src/render/cameraRig.ts` re-bases the lerp on elapsed time:

```
FOLLOW_LERP_PER_TICK = 1 - (1 - 0.12) ** 4          // what 240 Hz already did per tick: 0.4003
followLerpForFrame(ms) = 1 - (1 - FOLLOW_LERP_PER_TICK) ** (ms / MS_PER_TICK)
```

Derived, never typed *(vault 5.3)*, from the value that was actually tuned — so at 240 Hz it
returns **0.12 exactly** and the approved feel is reproduced bit for bit rather than approximated.
`GameScene.update()` writes it onto `cameras.main.lerp` every frame, because `Camera.preRender`
reads `lerp` during the render step *after* `update()`; `startFollow`'s argument only ever applies
to the first frame.

⚠️ **Not the naive `L * deltaMs / MS_PER_TICK`.** A lerp is exponential decay; the multiply is a
first-order approximation that diverges as the frame lengthens and **exceeds 1 past ~2.5 ticks** —
making the camera snap past its target in exactly the conditions (a stalled frame) where a snap is
most visible. Gated: `camera-follow-rate.test.ts` asserts the naive form breaks and the shipped one
does not.

### What the fix does NOT do — stated, not discovered later

A residual difference survives: **16.5 px at 240 Hz against 13.5 px at 60 Hz, an 18 % spread where
the shipped constant gave 300 %.** The cause is the zero-order hold, not the lerp — within a frame
the target jumps its whole travel and *then* the camera closes a fraction of the gap, so one large
step settles at a different phase than four small ones. Closed form: `pxPerFrame x (1 - L) / L`.

Removing it entirely needs the camera integrated against sub-frame time instead of lerped once per
frame, which is a larger change than the defect justifies. **3 px at `RENDER_SCALE` 6 is half a
source art pixel**, against the 49 px the fix removes. The bound in the gate is set at the ratio,
not at equality, and the derivation is written beside it so a later reader can tell a *measured*
bound from a *loosened* one.

⚠️ **And one thing no software fix can touch:** sample-and-hold persistence blur is proportional to
how long each frame is held on screen. At 60 Hz that is 16.7 ms against 4.2 ms at 240 Hz, so a
moving image sweeps ~4x further across the retina. Some difference between the two displays is
physics and will remain.

### What was left after the fix — measured, and two candidate fixes REJECTED on the measurement

The owner re-tested the redeploy: *"it['s] better, but when the scavenger run[s] and the spikes when
I jump are still [a] bit blur[ry]"*. Both remaining complaints name objects with high **on-screen**
velocity — the character is camera-locked and therefore nearly still on screen, while the world and
the enemies are not.

First, the thing that is NOT wrong: **enemy interpolation is wired and consumed.**
`gameFrameDraw.ts:71` calls `enemies.sync(renderAlpha(accumulatorMs))` and `enemyLayer.ts:186` calls
`interpolatedPosition` per body against a snapshot taken before the last tick. Checked, not assumed.

What remains is **sample-and-hold persistence blur** — the display holds each frame for the whole
refresh period, so a tracked object slides that far across the retina. Measured, with the fix in:

| | 240 Hz | 60 Hz |
|---|---|---|
| world sweep during a jump | 13.0 px/frame | **43.5 px/frame** |
| world sweep while running | 2.3 px/frame | **9.0 px/frame** |

The ratio is the frame-rate ratio, because that is what sample-and-hold is. ⚠️ **And it is amplified
by `RENDER_SCALE` 6**: the world is drawn six times larger than the source art, so every gameplay
speed is six times more *screen* pixels per tick than a native-resolution pixel-art game would
produce. That is the Phase 4 world contract, `src/game/constants.ts` is its authority, and changing
it is a STOP-and-ask that would invalidate every sheet.

**Two fixes were modelled before being built, and both were rejected on the numbers:**

| candidate | measured | verdict |
|---|---|---|
| **Vertical dead zone** — the camera ignores the player inside a box, standard platformer practice | 200 px → **3 %** less sweep; 600 px → **10 %** | **REJECTED.** The jump arc is far taller than any sensible dead zone, so the player leaves the box almost immediately and the camera chases anyway. It would add a mechanism and a tuning knob for ~5 % |
| **Slower `lerpY`** — track vertically more gently so jumps sweep less | 0.40 → 0.03 (13x slower) buys **48 %** less sweep and costs a character swing of **65 px → 732 px, 68 % of the screen** | **REJECTED.** That trades a little less smear for a camera that loses the player entirely — it re-creates the original defect, worse, to treat a symptom |

**So the honest position is: the bug is fixed and the remainder is the display.** A 60 Hz
sample-and-hold panel will smear roughly four times more than a 240 Hz one for the same motion, and
no camera constant changes that. The levers that would are design changes — slow the game down, or
lower `RENDER_SCALE` — and both are STOP-and-ask against a locked contract, neither is mine to take,
and each would invalidate work from several phases.

⚠️ Recorded here rather than quietly attempted, because *"a deliberate non-fix with its reason"* is
what this log is for — and because the next person to look at this will have the same two ideas.

### Gates, and their watched reds

`tests/unit/camera-follow-rate.test.ts` — 11 tests:

| assertion | red proof |
|---|---|
| returns 0.12 exactly at 240 Hz | pins the tuned feel; a retune reddens it |
| the same elapsed time closes the same fraction at 60/120/240/480 Hz | the OLD constant is asserted to FAIL this in the same file, so the property is shown discriminating |
| monotonic in elapsed time, never exceeds 1 | a long frame must not overshoot |
| rejects the naive multiply | asserted to exceed 1 where the shipped form does not |
| NaN / infinite / negative delta → 0 | Phaser hands out NaN deltas after a tab restore |
| run lag no longer display-dependent | 300 % spread → 18 %, ratio bounded at 1.25 |
| the OLD behaviour measured in player-visible units | > 3.5x, > 60 px — the reported defect, quantified |
| **draw path**: `GameScene` imports it, calls it with `delta`, writes `cameras.main.lerp.set` | **watched red**: replacing the write with a bare `followLerpForFrame(delta)` call — decision function intact, consumer gone — fails with *"nothing writes the computed lerp onto cameras.main.lerp"*. `lerp.set` count 1 → 0, confirmed by *content changed AND the count dropped by one* *(C12)*, reverted to a clean tree |

The draw-path gate exists because `spriteFeedback.ts` shipped in Phase 9 with 221 source lines, a
306-line test file and **zero production consumers** — a pure function can be perfect, fully tested,
and have no effect on the shipped game.

### `GameScene.ts` hit 406 lines and was SPLIT, not exempted

The 400-line rule fired. The comment block explaining the fix was cut to five lines pointing at
`followLerpForFrame`'s header, which already carries the measurement table — so the explanation
lives in **one** place. That is also this phase's trap 4 avoided by construction: two copies of a
measurement is two things to falsify. 400 lines exactly.

### Regression at this fix

| run | result |
|---|---|
| `npm run typecheck` · `typecheck:build` | clean |
| `npm test` | **176 files, 2613 tests passed** |
| `npm run test:sim-isolated` | 2610 passed, 3 skipped |
| `npm run build` | 4 steps green · 27 sentinels folded, dominated and sited · verify-dist ok |
| `npm run test:e2e` | 140 passed, 1 failed — the campaign spec, **which passes alone in 34.8 s** |

⚠️ That is now **three full e2e runs, three DIFFERENT wall-clock-bounded specs failing, each passing
in isolation** — 9.5's cost exponent, 6.9's HUD GPU delta, and 10.12's campaign. The first two
predate the camera change entirely, and the production driver is **position-blind**: it holds RIGHT,
taps Space on a fixed cadence and reads `localStorage`, touching no pixel and no camera, so a camera
change cannot alter its decisions. The suite is over-subscribing this box. **No bound was moved.**

---

## ✅ CONFIRMED BY THE OWNER, 2026-08-27 — *"now it looks good in 60Hz and 240Hz"*

Both defects are closed against the only oracle that could ever have closed them: **a person playing
the shipped build, on both displays.**

### What the two of them cost, and what that says

| | defect | found by | could a gate have found it? |
|---|---|---|---|
| 1 | `FOLLOW_LERP` applied per RENDERED frame — 4x less responsive at 60 Hz than on the tuning box | playing | **No.** Every gate here runs at ~240 fps, where the defect is four times smaller |
| 2 | `pixelArt` never governed the canvas→screen resample; `FIT` leaves a 1920x1080 buffer to be rescaled fractionally | playing | **No.** Nothing in the suite looked at the canvas's presented geometry at all |

Both reported in the same five words — *"blurry or smeared while moving"* — and the first fix
genuinely helped, which is exactly what made the second one easy to mistake for the first's
remainder.

⚠️ **And the honest record of how that nearly went wrong:** after fix 1 I told the owner the
remainder was sample-and-hold persistence blur and therefore physics. That was **premature**. The
model was right about what it modelled and completely silent about the second resample, which I had
not read `ScaleManager` for yet. *"It is physics"* is a conclusion that ends investigation, and it
should never be reached from a model alone — only after the mechanism has been read.

### The reusable lesson, which is bigger than either bug

**Anything the ENGINE applies per rendered frame sits outside this project's tick rule.** CLAUDE.md
§3 says *"every duration is an integer count of 60 Hz ticks; never a `deltaTime` multiply"* — and it
is written about `src/sim/`. The camera lerp is a duration, applied per frame, in Phaser. The
principle was never narrower than the rule; **the rule's wording was**, and that is what let a
frame-rate dependency ship through ten phases of review.

Before touching anything visual here, two questions are now worth asking by default:

1. **Is this constant applied per FRAME or per TICK?**
2. **Does this survive a non-integer window scale?** `RENDER_SCALE` 6 makes every scaling artifact
   six times larger in screen pixels than in source art.

A third, procedural: **ask for F11 fullscreen early.** On a 1080p screen that is an exact 1.0 canvas
scale, and it separates scaling artifacts from motion artifacts in about ten seconds. It would have
split these two defects apart on the first report instead of the third.

---

## ✅ 10.6 CLOSED — the CSP as ACTUALLY SERVED, 2026-08-27

The owner disabled Vercel Authentication. The deployment is publicly reachable and every header
`vercel.json` declares arrives on every path, including a 404:

```
GET /                            -> 200   text/html
GET /assets/index.json           -> 200   application/json
GET /assets/levels/level-01.tmj  -> 200   application/octet-stream
GET /no-such-file-here           -> 404   text/plain

  content-security-policy: default-src 'self'; script-src 'self';
    style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
    media-src 'self' data: blob:; connect-src 'self'; font-src 'self';
    object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'
  x-content-type-options: nosniff
  referrer-policy: same-origin
  permissions-policy: accelerometer=(), camera=(), … xr-spatial-tracking=()
  cross-origin-resource-policy: same-origin
  strict-transport-security: max-age=63072000; includeSubDomains; preload
```

**All five declared headers, on all four paths.** Vercel's catch-all `"source": "/(.*)"` matches the
404 too, which is the case a header rule most often misses. HSTS is the sixth and is applied by the
platform, not by us.

Every quoted keyword survived the round trip — `'self'`, `'unsafe-inline'`, `'none'` all still
quoted. That was the specific failure the criterion was written against *(vault 10.5)*: a bare
`self` blanks the game rather than erroring, so it is invisible until someone loads the page.

**Both halves of 10.6 now agree**, which is what makes the local substrate trustworthy going
forward: `tools/dev/prod-server.mjs` reads `vercel.json` itself and five e2e specs assert the same
map against it.

### 🔴 The one divergence the deploy exposed — `.tmj` MIME

| server | `Content-Type` for `.tmj` |
|---|---|
| `tools/dev/prod-server.mjs` | `application/json; charset=utf-8` |
| **Vercel** | **`application/octet-stream`** |

Vercel's MIME table does not know Tiled's extension. **It is harmless here, and that is a
measurement rather than a hope:** `X-Content-Type-Options: nosniff` blocks a wrong MIME on scripts
and stylesheets, not on `XMLHttpRequest`, and `bootLevels.ts` loads levels through Phaser's
`tilemapTiledJSON` — an XHR read as text and `JSON.parse`d. The owner has played the deployed build
through multiple levels, so the path is exercised, not merely argued.

⚠️ **But the local substrate is more generous than production, and that is the wrong direction for
a substrate to err in.** A future asset type could work locally and 404-in-spirit in production
with nothing to catch it. Recorded as a known divergence rather than fixed silently: matching
`prod-server.mjs` to Vercel's table would make the local run a truer test, and is a small deliberate
change rather than a slip to be patched over.

### What this leaves

Criterion 10.6 asked for the CSP verified *"against the production header config, never the dev
server"*. Both halves are now done: the config half locally against `vercel.json`, and the served
half against a real Vercel edge response. **PASS.**

---

## `_generated/` will NOT be archived — owner decision, 2026-08-27

*"We don't really need to do it because there's no need to regenerate anything for production."*

**Correct, and the reasoning holds for the claim it makes.** `public/assets/` is tracked in git, it
is what the game loads, and `tools/gen/verify-dist.mjs` asserts every level and every audio file
reaches `dist/` byte for byte on each build — including on Vercel's own machine. **No production
path reads `_generated/`.** The shipped game is reproducible from a clean clone indefinitely.

What the archive would have protected is narrower than "the art", and worth writing down so the
decision is not later remembered as covering more than it did:

| | |
|---|---|
| **Safe forever** | Building, deploying and re-deploying the game exactly as it is |
| **At risk** | *Changing* the art later — re-cutting a sheet at different framing, pulling a new animation out of an existing clip, re-keying a background, re-shooting `brass-courier/fall`'s judder |

Those need the raws: ~115 MB of `.mp4` clips and ~18 MB of audio masters, which are **fal.ai
outputs and not regenerable** — the generator is not seed-deterministic, and `assets:fetch` /
`assets:verify` still do not exist *(Phase 5's binding debt, dispositioned under 10.13)*.

⚠️ **Nothing is deleted by this decision and nothing is lost today.** `_generated/` is 541 MB on the
owner's disk, untouched; it is simply not duplicated anywhere else. The risk it accepts is a disk
failure between now and the next art change, and that is the owner's to accept.

---

## ✅ 10.12 and 2.8 CLOSED — the owner played it, 2026-08-27

*"I played all the levels."* — **all five completed to the exit**, on the production build, and the
feel check with it: **weighty and responsive, no dropped inputs.**

That closes the two criteria this project could never have closed on its own, and it is worth being
exact about why neither was reachable any other way.

### 10.12 — and `level-05` in particular

The production driver is **position-blind by construction**: `dist/` exposes no `__phaserGame` and
no `simWorld`, so `playToExit` holds RIGHT, taps Space on a fixed cadence, and reads
`localStorage`. It cannot choose a route, backtrack deliberately, or decide to kill something. It
completes 01–04 with a back-up move and stops at 05.

So the automated evidence stopped exactly where a human's begins, and the two together are the
whole claim:

| | evidence | what it establishes |
|---|---|---|
| sim | `level-completable.test.ts` — the exact shipped world, enemies live, three disjoint gate seeds, a `jumpVelocity`-1 margin and a `jumpVelocity`-0 negative control | every level is **mechanically** completable |
| e2e | `phase-10-campaign.spec.ts` against `dist/` — level 01 completes, ENTER advances, level 02 boots and draws | the **shipped** progression flow carries a player forward |
| **hands-on** | **the owner, all five to the exit, on the live production deployment** | **a person can actually find and play the route** |

⚠️ Earlier in this phase I reported `level-05` as *"unmeasured, not claimed either way"* and that
**overstated the gap** — the sim proof already existed and was stronger than the e2e one. The
correction is recorded in this log's § 10.12. What was genuinely missing was only this: a human
finishing it. It is no longer missing.

### 2.8 — carried open since Phase 2

*"Feel check in browser: weighty, responsive, no input drops."* Owned by `play`, hands-on, **never
closeable by a gate** *(vault C4)*. It was re-verified and dispositioned by 10.11 rather than left
silent, and it is now closed by the same playthrough — which is also the strongest available check
on the two forgiveness windows in `tick.ts`, since a dropped jump at the lip of a ledge is exactly
what they exist to prevent and exactly what a person notices.

### Phase 10 is now **fifteen of fifteen PASS**

Every criterion run, green, and carrying a QA-LOG row. **10.12 was the last PARTIAL.**
