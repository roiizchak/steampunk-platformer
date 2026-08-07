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

The valid shape they each deviate from is a 4 × 4 tile map with one tile layer, one object layer
carrying a single solid strip and a single spawn point.
