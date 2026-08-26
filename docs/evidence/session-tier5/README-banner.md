# The controls banner — before and after (2026-08-26)

All four captures are the **production bundle** (`vite preview` on `dist/`), not the dev server. The
earlier capture in `session-tier5-gate-holes-03-sweep.md` was a dev build, which adds a dev-key
suffix and so over-stated the wrapping.

| file | what it shows |
|---|---|
| `prod-phone-852x480-controls-banner.png` | **BEFORE.** 852×480, one line, `#8f8776`, no stroke |
| `prod-852x480-banner-zoom6x.png` | the same band at 6× — 8 CSS px of ink over the boiler gauges |
| `prod-1920x1080-banner-zoom2x.png` | the same band at design size, 18 px, for comparison |
| `prod-852x480-banner-AFTER.png` | **AFTER.** 44 px bold, counter ink pair, two wrapped lines |

## What was wrong, measured

- **8 CSS px** of ink at 852×480 (`HELP_FONT_PX` 28 × the 0.44375 FIT scale = a 12.4 px em box).
- **No stroke and no plate**, over the busiest band of `mid.png` — worst-case glyph contrast
  **2.27:1**, under even the 3:1 large-text bar the gear counter is held to.

⚠️ **`ESC levels` is NOT clipped**, contrary to a first reading of the zoom. Measured at runtime the
production string is **1771 px** wide at `x = 24`, so its right edge is 1795 of 1920 with 125 px
spare, and `wordWrap` was already set at 1872. What looked like clipping was the same low contrast
over a bright pipe highlight. One defect, not two.

## The fix, and why it is the SIZE and not only the colour

For two inks over an arbitrary background the worst case has a closed form —
`sqrt((Lfill + 0.05) / (Lstroke + 0.05))` — so clearing WCAG AA's small-text **4.5:1** needs those
terms 20.25× apart. That pins the fill within a hair of pure white and the stroke at `#060606` or
darker:

| pair | worst case |
|---|---|
| `#ffffff` / `#000000` | 4.583 ✅ |
| `#fffdf8` / `#000000` | 4.545 ✅ — the warmest fill that clears |
| `#fffaf0` / `#000000` | 4.493 ❌ |
| `#ffffff` / `#070707` | 4.488 ❌ |

White-on-black, a locked-palette change, **and the text would still be 8 px**. So the size moved
instead: **44 px bold = 19.5 physical px**, over WCAG's 14 pt bold large-text threshold (≈18.66 px),
which makes the bar **3:1** — and the shipped ink pair measures **3.80:1**. Formal conformance,
palette untouched, and the banner is legible rather than merely high-contrast.

## The constraint that had to be measured, not argued

`hud-layout.test.ts` capped `HELP_FONT_PX` at 40, noting that above ~40 the DEV line needs three rows.
That note was correct, and the two requirements genuinely conflict:

| design px | physical px | shipped rows | DEV rows (old suffix) |
|---|---|---|---|
| 41 | 18.19 — under the threshold | 2 | 2 |
| 42 | 18.64 — under by 0.02 | 2 | 3 |
| 44 | **19.52 ✅** | 2 | 3 |

**No size is both large text (≥42) and two DEV rows (≤41).** Rather than trade the shipped banner
against a dev-only string, the dev suffix was abbreviated to `P play · O editor · G gym`, which no
player ever sees. Both forms are two rows at 44.

⚠️ The new cap is **45**, not the 54 first written here — swept live, the shipped line holds two rows
to 58 and needs a third at **59**, while the DEV line needs a third at **46**. A cap of 54 would have
silently re-allowed the three-row DEV banner the cap exists to prevent. The cap has to be the DEV
threshold, not the shipped one.

`tools/gen/verify-dist.mjs` gained `'p play'` and `'o editor'` alongside the superseded phrases, so
abbreviating the suffix could not quietly narrow the guard that keeps dev prose out of `dist/`.
