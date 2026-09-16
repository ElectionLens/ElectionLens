[< Back to index](./README.md)

## 2b. Card-mode visual spec (measured from the benchmark)

> Source: direct inspection + screenshots of
> [election-data-2026.vercel.app](https://election-data-2026.vercel.app/) at 1280px and 390px.
> §4 lists *which ideas* to steal (S1–S7); this section is the measured detail needed to
> build them. **`tnmla.in` could not be analysed** — see the gap note at the end.

### Correctness warning: do not copy their party colours

The benchmark renders **AIADMK in red and TVK in blue**. Both are wrong, and our
`partyData.ts` already has them right:

| Party | Benchmark renders | `partyData.ts` (correct) |
|---|---|---|
| AIADMK | red `#e31f26` | **green `#138808`** |
| TVK | blue `#1d4ed8` | **maroon `#7C1F3E`** |
| DMK | brown/orange accent | **red `#E31E24`** |

Their palette appears to be positional (1st = blue, 2nd = red) rather than party-derived.
On their own AC-001 page this makes DMK's red go to AIADMK while DMK gets orange.

**`partyData.ts` remains the single source of truth for party colour.** Steal their
*layout*, never their palette. This also protects S1: a party-coloured left border is
only useful if the colour is true.

### Measured card geometry (1280px viewport)

| Token | Directory card | Podium card (S1) |
|---|---|---|
| Width | ~365px (3 cols) | ~292px (4 cols) |
| Height | ~185px (min 180) | ~146px |
| Padding | 24px | 20px 24px |
| Radius | 14px | 10px |
| Gap | 20px | 16px |
| Border | 1px `#e5e7eb` | 1px + party-coloured left edge |
| Shadow | none at rest | none at rest |
| Hover | `translateY(-4px)` + soft shadow | — |

Maps onto §3's width analysis: their 4-across podium needs ~292–318px cards, which is
exactly why §3 lands on **520px** for a 2x2 podium rather than the fixed 360px sidebar.

Round these to our §1 scale rather than copying literally: radius 14/10 → `--radius-lg`
(12) / `--radius-md` (8); gaps 20/16 → `--space-*`. Do not introduce a 13th radius value.

### Typography actually used

Inter. Hero H1 44px/800, card title 21.6px/700, card ID 12.8px/700, badge ~11.5px bold
uppercase, body 16px/1.6, metric value ~32-36px/800, metric label 12px/700 uppercase.

The pattern worth taking: **a very large bold number paired with a small uppercase
label.** That contrast is what makes the KPI strip readable at a glance. Note their
badge/label sizes (11.5-12px) sit at or below our agreed **12px floor** (§1) — clamp to
12px, don't copy 11.5px.

### Directory card: their biggest miss (and our opening)

Their directory card carries only AC number, name, status pill, and two buttons — no
result data at all:

```text
AC-001                  INTERACTIVE
Gummidipoondi
[Analyze Results] [View Form 20 PDF]
```

234 cards and you cannot compare a single outcome without opening each one. Our card
mode should carry **winner + party + margin + turnout** on the card face, which turns
the grid from a directory into the comparison surface §2 wants data-nav to be.

They also ship **no sort and no filter** — text search only. Since §2 puts data-nav's
sort/filter in query params (`?sort=margin&party=DMK`), this is precisely where we beat
them rather than imitate them.

### Detail layout worth adopting wholesale

Their vertical rhythm is genuinely good and matches S1/S2:

```text
[Back] Name  AC-001
[Overview | Win Margin | All Candidates | Booth Cards]   <- real tabs, underline-active
[Winner | Runner-up | 3rd | Margin]                      <- 4 podium cards
[Total | Valid | NOTA | Rejected | Win-led | Run-led | Booths]  <- 7-cell KPI strip
[Doughnut: vote share]  [Bar: top 4]                     <- exactly two charts
```

KPI values confirmed on AC-001: `2,32,630 / 2,31,585 / 937 / 108 / 244 / 80 / 344` —
Indian digit grouping throughout (S3), and the 244/80 booth split is S2.

### Accessibility gaps to fix, not inherit

Beyond §2a's keyboard rules, the benchmark has three defects we must not reproduce:

1. **Canvas charts with no text alternative.** Chart.js draws to `<canvas>`; a screen
   reader gets nothing. Every chart needs an adjacent data table or text summary —
   reinforces §6's "charts are decoration over an accessible table".
2. **Status pill colour-only semantics.** "Interactive" is green-on-green. Pair status
   with text or an icon.
3. **Mobile tab clipping.** At 390px their 4th tab (`Booth Cards`) is not visible and
   does not scroll into view — a discoverability bug. Our tab bar needs horizontal
   scroll with visible affordance, or overflow into a menu.

Also note `Analyze Results` wraps to two lines at 390px. Short labels for card actions.

### Responsive behaviour observed

390px: 3 cols → 1 col, cards ~358px wide; hero H1 44 → 32px; podium cards stack full
width (~145px tall) keeping candidate photos; KPI strip reflows from one row to a grid.
Stacking rather than shrinking the podium is the right call — adopt it.

### Gap: tnmla.in not analysed

`https://tnmla.in/` is **blocked by the corporate web gateway** ("Blocked by URL Filter
Database", reputation: Unverified), both via browser and direct fetch. None of the above
reflects tnmla.in, and nothing here should be attributed to it.

To include it: request access at `https://puppy.walmart.com/url-allowlist` (auto-approved,
~5 min), then re-run this analysis. Worth doing — a second reference would tell us which
patterns are genuinely conventional for Indian election UIs versus one team's choices.
The single-benchmark risk is real: several decisions above rest on one site's opinion.

---
