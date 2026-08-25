# §4 — the `play`-owned capture round, 2026-08-25

Driven with the `playwright-cli` skill's browser against the dev server on :5173, on the real GPU
(`ANGLE (NVIDIA, RTX 4080 … D3D11)`). **The deliverable is images and readings a human can scan**, not
a new metric asserting the layout is fine. Full write-up in
[`docs/qa/session-tier5-gate-holes-03-sweep.md`](../../qa/session-tier5-gate-holes-03-sweep.md) §Batch 10.

⚠️ Every screenshot here is of the **fixed** page — the first pass had scrollbars at every size and
they are what this round found. The defect and its measurement are in the log; re-shooting after the
fix is deliberate, so the images show what ships.

## Viewport and DPR

| file | viewport | DPR | what to look at |
|---|---|---|---|
| `design-1920x1080-dpr1-02-level-01.png` | 1920×1080 | 1 | the baseline everything else is read against |
| `design-1920x1080-dpr2-02-level-01.png` | 1920×1080 | 2 | **the DPR-2 reading.** The canvas backing store stays 1920×1080, so this is a 2× *nearest-neighbour* upscale of pixel art — crisp doubling, not blur |
| `desktop-1280x720-dpr1-02-level-01.png` | 1280×720 | 1 | 16:9, one step down |
| `phone-852x480-dpr1-01-menu.png` | 852×480 | 1 | the menu at the smallest supported size |
| `phone-852x480-dpr1-02-level-01.png` | 852×480 | 1 | **the 852×480 reading.** The HUD is a 1920×1080 layout downsampled to 44 % — it is not re-laid-out |
| `phone-852x480-dpr2-02-level-01.png` | 852×480 | 2 | the same, with DPR 2 giving back roughly what the downscale took |

## The judder probe

| file | what it shows |
|---|---|
| `probe-240hz-readout.png` | `?probe=1` running, with its on-screen refresh readout |

🔴 **The probe's OUTCOME is not recorded here and could not be.** It is decided by a pair of eyes on a
high-refresh display comparing the STEPPED and SMOOTH lanes; the harness measured **173–174 Hz** on
this box, which is high-refresh and therefore the right substrate, but nobody looked. The three
outcomes and what each decides are in `src/scenes/devMotionProbe.ts`. **Still owed.**

## Sentry coverage

| file | sentry | lost spots |
|---|---|---|
| `sentry-level-01-x5472.png` | `level-01 @(5472,1152)` | 2 |
| `sentry-level-02-x5664.png` | `level-02 @(5664,1440)` | 5 |
| `sentry-level-05-x14304.png` | `level-05 @(14304,1440)` | 6 |

**Recommendation: NOT a defect.** All 13 lost spots are at `dy` **616** or **712** — six to seven
tiles *below* the muzzle — with `dx` inside ±421, so the player is on the ground floor almost directly
beneath a sentry standing on a raised block. The screenshots show the block: several tiles of solid
brick between muzzle and target. Those bolts used to travel through it. The levels read as authored
for each sentry to cover **its own ledge**, which is exactly the coverage that survived.
