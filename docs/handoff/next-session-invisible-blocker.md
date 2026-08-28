# Next session — the invisible blocker, attempt 4

> **Paste the block under "The prompt" into a fresh session.** Everything above and below it is the
> evidence that prompt refers to.

---

## The prompt

```
Read docs/handoff/next-session-invisible-blocker.md in full before doing anything else.

I keep getting stuck in something invisible while walking. I have now reported this FOUR times.
Three fixes have shipped against it and none of them was the thing. Do not ship a fourth guess.

Your first job this session is NOT to fix it. It is to REPRODUCE it — to see the stuck state
yourself, on my machine, with me driving, and to know the exact coordinates and the exact rectangle
I am standing in. Only then propose a fix.

Constraints: branch off session-hud-and-pits. No fal spend (the art budget is breached at $55.20
against a $55 ceiling and I have set no new one). Every project non-negotiable in CLAUDE.md still
applies. Kill dev servers by port before you report done.

Start by telling me what you need me to do to reproduce it.
```

---

## Why this needs a whole session

Four reports, three fixes, zero reproductions.

| # | what I reported | what was shipped | did it fix it |
|---|---|---|---|
| 1 | *"there is a hazard that is not being seen"* | new spike tile art — the old one was a cool silver picket that read as background under STYLE.md §5 rule 2 | **no** |
| 2 | *"I still get stuck by a hazard that I cannot see"* | the 96 px clearance rule — five floor hazard runs left exactly one tile of floor before the wall facing them, against a 132 px player | **no** |
| 3 | *"I still get stuck in something invisible"* | — | — |

**Both shipped fixes were real defects and both are worth keeping.** Neither was the reported one.
The pattern is the problem: each fix was aimed at a *proxy* for the complaint — a plausible
mechanism found by measuring the level data — and not once did anyone put the actual stuck state on
screen first. Three rounds of that is enough.

⚠️ **Do not start from the level geometry again.** Start from the screen.

## Ruled out, with the measurement

Do not re-derive these. Each cost real time this session.

| hypothesis | measurement | verdict |
|---|---|---|
| a collision rect with no tile painted under it | swept every solid rect in all five levels, cell by cell, against the tile layer | **0 unpainted solid cells** in any level |
| collision rects drawn with a transparent tile | per-gid opaque fractions: gid 13 (spikes) 48 %, gids 5-8 (brackets) 48-57 %, everything else 100 % — and none of the partial gids is used by a *collision* rect | ruled out |
| a hazard run with no room to stand in front of it | every floor run in every level now measures gap `0`, `∞`, or `≥ 192 px` | **fixed, and it was not this** |
| the collision box is wider than the drawn character (so you stop short of what you can see) | measured the opaque width of every `idle` / `walk` / `run` frame against `collisionBox.widthPx = 132`: idle 145-158, walk 141-189, run 135-226 game px | **the opposite** — the art is *wider* than the box, so the sprite overlaps geometry rather than stopping short of it |
| enemies block movement | `tick.ts` step 9b applies enemy contact as **damage**, never as collision resolution | enemies do not block |

## The leads that are still open

**1. The horizontal anchor offset — measured only as a width, never as a position.**
The check above measured how *wide* the art is, not where it sits relative to the origin.
`PLAYER_BOX` is `{ x: -11, w: 22 }`, so the box is symmetric about the origin at ±66 game px. If the
drawn art is not centred on that origin — and nothing pins that it is — then one side of the box can
extend past the art even though the total width does not. **That is exactly an invisible wall on one
side only, and it would be direction-dependent.** Measure the opaque `minx`/`maxx` per frame against
the origin, not the width.

⚠️ `character-bounds.json`'s `collisionBox._source` asserts *"The ART is narrower than this (36 px at
the anchor), which is the safe direction."* The 145-226 px measurement above **contradicts that
sentence** unless "at the anchor" means the narrowest slice at the feet only. Resolve which it is
before trusting either number.

**2. Nobody has reproduced the stuck state.** `window.__game` carries `player.{x,y,vx,vy,state}` but
is **dev-build only** — I play the production build, where it is absent by design. So the cheapest
path to a reproduction is: run me on the **dev** build with a debug overlay that draws every solid
and hazard rect over the level, and have me screenshot the frame where I am stuck. Then the
coordinates and the rectangle are both on the same image and the argument is over.

⚠️ Whatever overlay gets built must be `import.meta.env.DEV`-guarded at the point of creation *and*
inside everything that names it — the scene roster, the key binding, the toggle body, and
`refuseToRoute`'s stop list. A "DEV ONLY" label in a document is not a build gate; Phase 2 shipped
one to `dist/`.

**3. The frame-rate gap.** I play on **60 Hz**; the dev box is **240 Hz**. Two shipped defects this
project have been found only by playing, and that gap is why. If the blocker is a landing or a
contact resolved differently across frame pacing, no gate on this machine will see it.

**4. My exact words, which have not been taken literally enough.** The original report was:

> *"there is hazard is not being seen. In level 3 for example, there is a player that can try to
> walk, and suddenly I get stuck in something, and then I need to jump above him."*

*"I need to jump above him"* is a specific claim: the stuck state is **escapable by jumping**, and it
happens **while walking**, mid-level, not at a level boundary. Whatever the mechanism is, it has to
be consistent with both. Ask me to describe it again in fresh words before theorising — I may name
something nobody has thought to check.

## Where the state is

- Branch `session-hud-and-pits`, last commit `01a518e`, working tree clean.
- Regression at that commit, counts read positively: `typecheck` clean · vitest **2705 passed / 0
  failed** across 183 files · `test:sim-isolated` 2701 + 4 skipped with Phaser uninstalled ·
  `npm run build` ok · playwright **expected 148, unexpected 0**.
- Session record: [../qa/session-hud-and-pits.md](../qa/session-hud-and-pits.md) ·
  [gate owners](../qa/session-hud-and-pits-02-gate-owners.md) ·
  [hazard clearance](../qa/session-hud-and-pits-03-hazard-clearance.md).
- **Art budget is breached** — $55.20 spent against a $55 ceiling. The owner cleared the overrun but
  set **no new number**. Any generation needs a ceiling agreed first.
