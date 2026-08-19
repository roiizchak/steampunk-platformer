# bad-levels

Committed broken levels, one defect each. `tests/unit/tilemap-data.test.ts` asserts every one is
**rejected** by the real `describeLevelProblem`, and that each fails for its **own distinct
reason** — so a rule weakened into a regex that matches nothing turns the suite red instead of
silently losing coverage *(vault C2: a gate that cannot go red is decoration)*.

They are `.fixture`, not `.json`, so `tsc` and vitest never try to compile or import them and
`resolveJsonModule` cannot pull one into a build.

| Fixture | The single defect |
|---|---|
| `not-an-object.fixture` | a JSON array where a map object is required |
| `zero-size-map.fixture` | `width: 0` |
| `non-square-tiles.fixture` | `tilewidth` 16 against `tileheight` 32 |
| `no-tile-layer.fixture` | collision but nothing to draw |
| `no-solid-objects.fixture` | an object layer where nothing carries `solid: true` |
| `zero-size-solid.fixture` | a solid with `width: 0` |
| `two-spawns.fixture` | two objects carry `spawn: true` |
| `spawn-outside-map.fixture` | spawn `x` beyond the map's pixel width |
| `malformed.fixture` | not JSON at all |
| `hazard-zero-size.fixture` | a `hazard` with `width: 0` — invisible to the swept contact test and to the eye |
| `enemy-unknown-slug.fixture` | `enemy: "brass-gorilla"`, a slug `src/sim/enemies.ts` cannot build |
| `enemy-not-a-rect.fixture` | an enemy authored as a point, so its patrol beat collapses |
| `enemy-over-a-pit.fixture` | an enemy whose patrol **centre** is over ground but whose right edge is not |
| `no-goal.fixture` | no object carries `goal: true` — a level nobody can finish |
| `two-goals.fixture` | two exits, so completion would depend on the order objects sit in the file |
| `goal-not-a-rect.fixture` | an exit authored as a point: zero size can never overlap the player's box |
| `goal-outside-map.fixture` | an exit running past the map's right edge |
| `goal-inside-solid.fixture` | an exit **entirely** inside the floor — the player can never be there |
| `goal-on-spawn.fixture` | an exit overlapping the body of a player standing at the spawn |
| `goal-over-a-pit.fixture` | an exit with no solid beneath its bottom-centre |

`enemy-over-a-pit` is authored that way on purpose: with the whole body off the platform, a
centre-only ground check would also reject it and the both-ends rule would be ungated. Watched go
red by weakening the check to the centre — 1 failing spec, `enemy-over-a-pit` *(C1)*.

The seven `goal-*` fixtures are Phase 8's. Two of them exist only because the Codex plan review
constructed the placements that would otherwise have made criterion 8.1 green on an unplayable level
(`docs/reviews/phase-08-plan.md` F4/B2):

- **`goal-on-spawn`** is the important one. With the exit over the spawn, `world.completed` is true on
  tick 1 — the scripted traversal proof passes without moving, and the `jumpVelocity` margin sweep
  passes too because a zero-jump route survives any tuning. Worse, `respawnPlayer` restores
  `state: 'idle'` with full hp at step 4c, so step 9d's "death wins ties" guard is already false on the
  respawn tick: **dying anywhere would complete the level.** Watched go red by deleting the overlap
  rule — 3 failing specs, naming `goal-on-spawn` *(C1)*.
- **`goal-over-a-pit`** needs the same care `enemy-over-a-pit` did. Its floor is narrowed and its spawn
  moved left so the exit sits clear of the standing spawn box; otherwise it would trip the overlap rule
  first and the pit rule would be ungated.

⚠️ Every `goal-*` fixture is valid in **every other respect**, because `describeGoalProblem` is called
**last** in `describeLevelProblem`. That ordering is load-bearing and the reason is in
`src/game/tiledGoal.ts`'s header: move the goal check earlier and all 23 pre-Phase-8 fixtures start
reporting "no object carries the `goal` property" before reaching the defect they were committed to
demonstrate, collapsing the distinct-reason set from 30 to 1.

`tests/unit/level-goal.test.ts` additionally asserts each `goal-*` fixture against its OWN message. The
directory sweep only proves "rejected, distinctly"; it cannot tell which rule fired, and a rule that
rejects for the wrong reason is not a gate — mutation M20 survived a loose `/solid/i` assertion exactly
that way.

Rows for `blank-tile-layer`, `group-layer`, `layer-offset`, `spawn-not-a-point`, `spawn-over-a-pit`
and `truncated-tile-data` are missing above; the table was already stale before Phase 5 touched it.
The sweep in `tilemap-data.test.ts` globs the directory, so the coverage is real either way — this
table is documentation, not the gate.

The valid shape they each deviate from is a 4 × 4 tile map with one tile layer, one object layer
carrying a single solid strip and a single spawn point — plus, since Phase 8, **a `goal` rectangle**,
because a level without one is no longer valid.

In that 128 px-wide base the exit has exactly one legal column. The spawn's feet are at x 48 and the
standing body is 132 px wide, so the box a goal must not overlap spans x −18…114 — leaving x 114…128.
That is not a quirk of the fixtures; it is the 4 × 4 base being narrower than the character, and it is
why `TINY_MAP` in `tests/unit/tilemap-data-fixtures.ts` had to grow from 7 × 5 @ 16 px to 13 × 9 @ 48 px
when `LevelData.goal` became required.

## The three placement fixtures (2026-08-18)

`enemy-standing-in-a-hazard`, `gear-inside-an-enemy` and `enemy-beat-into-a-wall` are the committed
red proofs for `describePlacementProblem` — the rule that nothing may share space with an enemy.
They were written because the user played the shipped build and saw **a sentry standing in spikes**
and **gears inside an enemy's body**, in four of the five levels, with the whole suite green. The
only cross-object rule in the parser before them was goal-versus-spawn.

They do **not** use the 4 × 4 base above. A sentry's body is `SENTRY_BOX` at `RENDER_SCALE` 6 —
96 × 192 px — which is taller than a 128 px map, so a fixture built on that base could not express
"beside the enemy" and "inside the enemy" as different places. These are 20 × 10 @ 32 px = 640 × 320,
with the sentry's feet on the floor strip at y 256 and its swept beat spanning x 176…336. Each
fixture then adds exactly ONE object inside that span, so each trips exactly one of the three rules
and the directory sweep's distinct-reason assertion stays meaningful.
