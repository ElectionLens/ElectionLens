# ElectionLens UI Revamp Plan

Benchmarks:
[election-data-2026.vercel.app](https://election-data-2026.vercel.app/) (TNLA 2026 Form 20 portal, measured directly)
and [tnmla.in](https://tnmla.in/) (member directory — described, not measured; see [§2d](./02d-tnmla-benchmark.md))

> **Framing:** they are a static HTML/CSS/vanilla-JS site with Chart.js and no map,
> covering one state's one election. We are a React+TS offline-first app with 5-level
> geographic drill-down, 84k booths, and multi-year data. **We are not behind them on
> capability — we are behind them on presentation.** This plan steals their presentation
> and keeps our capability.

Split from a single 860-line document (house rule: no file over 600 lines). Content is
unchanged; only the packaging is different.

---

## Read in this order

| # | Document | What it settles |
|---|---|---|
| 0 | [Bugs to fix first](./00-bugs.md) | 9 concrete defects. **Highest value-per-hour in the plan** |
| 1 | [Where we stand](./01-current-state.md) | Measured CSS reality: 8,030 lines, 278 hex literals, 12 radii |
| 2 | [Two navigation modes](./02-nav-modes.md) | Map-nav vs data-nav, and **which is primary** |
| 2a | [Mode contract](./02a-mode-contract.md) | `NavSurface` type, `?surface=` URL key, a11y, exit criteria |
| 2b | [Card visual spec](./02b-card-visual-spec.md) | Measured geometry/type from the benchmark |
| 2c | [Decided model](./02c-decided-model.md) | **Card mode replaces the map; map returns as a leaf inset** |
| 2d | [tnmla.in benchmark](./02d-tnmla-benchmark.md) | Member-centric model; what we can and cannot copy |
| 3 | [Coexistence](./03-coexistence.md) | Width math for map + panel (largely dissolved by 2c) |
| 4 | [Steal list](./04-steal-list.md) | S1–S9 worth copying, and what to refuse |
| 5 | [Phased plan](./05-phases.md) | Phase 0–5 with exit criteria |
| 6 | [Charting](./06-charting.md) | Chart library decision |
| 7 | [Sequencing](./07-sequencing.md) | Effort estimates and order |
| 8 | [Summary](./08-summary.md) | The one-paragraph version |
| 9 | [Filtering & ranking](./09-filtering-and-ranking.md) | Hard filters, transparent ranking, facets, chips, and saved runs |

## If you only read three things

1. **[§0 Bugs](./00-bugs.md)** — B1–B3 are half a day and buy more perceived quality
   than the entire rest of the plan.
2. **[§2c Decided model](./02c-decided-model.md)** — the organising decision for card mode.
3. **[§2b Visual spec](./02b-card-visual-spec.md)** — includes a **correctness warning**:
   the benchmark's party colours are wrong. Steal their layout, never their palette.

## Known gaps

- **`tnmla.in` measurements are still missing.** The site is blocked by the corporate web
  gateway. [§2d](./02d-tnmla-benchmark.md) captures its structure from a user-supplied
  description, but carries **no verified pixel values** — unlike §2b. All hard numbers in
  this plan come from a single benchmark.
- **We hold no person-level data** (assets, cases, contacts, photos), and `age`/`sex` are
  effectively unpopulated — so several tnmla.in features are not buildable today. See the
  verified table in [§2d](./02d-tnmla-benchmark.md).
- Two open questions are flagged inline in [§2c](./02c-decided-model.md): route vs
  in-place expansion for the leaf detail, and how far `MapView.tsx` (1,601 lines) must be
  split before the inset can be built.

## Companion documents

- [`../data-platform-roadmap.md`](../data-platform-roadmap.md) — the data-side counterpart.
- [`../boothwise-ocr-scale-plan.md`](../boothwise-ocr-scale-plan.md) — booth extraction at scale.
