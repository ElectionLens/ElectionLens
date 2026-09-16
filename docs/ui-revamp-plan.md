# ElectionLens UI Revamp Plan

Benchmark: [election-data-2026.vercel.app](https://election-data-2026.vercel.app/) (TNLA 2026 Form 20 portal)

> **Framing:** they are a static HTML/CSS/vanilla-JS site with Chart.js and no map,
> covering one state's one election. We are a React+TS offline-first app with 5-level
> geographic drill-down, 84k booths, and multi-year data. **We are not behind them on
> capability — we are behind them on presentation.** This plan steals their presentation
> and keeps our capability.

---

## 0. Bugs found during analysis (fix before any restyling)

These are not aesthetic. Found by reading the code, not by squinting at screenshots.

| # | Bug | Evidence | Severity |
|---|---|---|---|
| B1 | **Debug cache bar ships to production.** `DB: 39 \| 36/36 \| 545 \| 4102` sits at the bottom of the sidebar, always rendered. No `import.meta.env.DEV` gate exists anywhere in the codebase. | `Sidebar.tsx:786-799` | **High** — looks like a leaked internal build |
| B2 | **`API KEY REQUIRED` watermark tiled across the entire map.** CARTO basemaps now require a key; we call the unkeyed endpoint. ~40 repetitions of the phrase on screen. | `layerUrls.ts:12,17`, `MapView.tsx:1615` | **Critical** — makes the product look broken |
| B3 | **Locale-dependent number formatting.** 18 bare `.toLocaleString()` calls with no locale arg render `232,630` on a US machine and `2,32,630` on an Indian one. Indian users get the wrong grouping. | `BlogSection.tsx` ×16, `boothDataQuality.ts` | **High** — silent, data-credibility damage |
| B4 | **Three duplicate `formatNumber` implementations.** Two components redefine what `election-result-panel/shared.ts` already exports. This is *why* B3 exists. | `PCElectionResultPanel.tsx:9`, `BoothResultsPanel.tsx:6`, `shared.ts:28` | Medium — DRY |
| B5 | **Candidate rank skips.** List renders `1,2,3,4,6,7…` — rank 5 is missing (almost certainly NOTA filtered out *after* ranking, not before). | Visible in AC panel; `ElectionResultPanel.tsx:721` | Medium — reads as a data error |
| B6 | **Result panel opens mid-scroll.** Rank-1 winner row is clipped at the top on load; users land on rank 2. | AC drill-down | Medium |
| B7 | **Floating red  overlaps content** and reads as destructive. It is the sidebar toggle. | Bottom-left, all views | Medium |
| B8 | **`README` claims Tailwind CSS v4.** There is no Tailwind — no dependency, no config, no `@tailwind`/`@import` directive. It is 8,030 lines of hand-rolled CSS. | `package.json`, `src/styles/index.css` | Low (docs) but signals drift |

**B1–B3 are a half-day of work and buy more perceived quality than the entire rest of this plan.** Do them first.

---

## 1. Where we actually stand

### Our CSS reality
| Metric | Value | Comment |
|---|---|---|
| `src/styles/index.css` | **8,030 lines**, 151 KB | Single file, 393 classes |
| Design tokens (`--ui-*`) | 40 defined, **623 usages** | A real token layer exists and is good |
| Hardcoded hex literals | **278** | …bypassing those tokens |
| `rgba()` literals | 116 | mostly shadows |
| Distinct `border-radius` values | **12** (2,3,4,6,8,10,11,12,16,18,20,999px) | should be ~4 |
| Distinct `font-size` px values | **14** (9px→36px) | 9/10/11px text is too small |
| `:root` blocks | 3 (lines 747, 1393, 6929) | tokens defined in three places |
| `box-shadow` declarations | 93 | no elevation scale |
| Dark-mode references | 3 | effectively none |

**The honest read:** a "Civic Editorial" token system was introduced at line 6929 as an *override layer appended to the bottom of the file* rather than a refactor. So we have a good palette **and** 278 hexes that predate it, fighting each other. The revamp is mostly **finishing a migration someone already started**, not inventing a new design language.

### Accessibility gaps (measured)
- `aria-*` attributes: **25 total across the whole app**. `aria-selected` ×2, `aria-controls` ×1.
- `role="tab"` / `role="tablist"` / `role="tabpanel"`: **zero**. Our Overview/Booths/Postal/Analysis switcher is visually tabs but semantically not.
- Heading hierarchy: `h1` → `h3` → `h4`, **no `h2`**. Section titles ("Booth Distribution", constituency names) are `div`s.
- Landmarks: no `<main>`, `<nav>`, `<aside>`, `<footer>` exposed.
- `:focus-visible`: defined for `.interactive-row` only, hardcoded `#2563eb` — a blue that appears nowhere in the Civic Editorial palette.

Walmart front-end standard is **WCAG 2.2 AA**. We are not close.

---

## 2. What to steal from them (and what to ignore)

### Steal

**S1. The podium + KPI strip.** Their single best idea. Above the fold:
a 4-card row (Winner / Runner-up / 3rd / Margin) with party-colored left borders and
candidate photos, then a 7-cell KPI strip (Total, Valid, NOTA, Rejected, Winner-led
booths, Runner-led booths, Total booths). You know the whole result in two seconds.
Our equivalent data is *below* a raw candidate table. **Invert that.**

**S2. Winner-led vs runner-led booth counts as a headline stat.** They surface
`244 / 80` in the KPI strip. We compute richer versions of this in
`boothwiseAnalysisEngine.ts` (607 lines of it!) and bury it in a tab. Promote it.

**S3. Indian digit grouping everywhere.** They show `2,32,630`. We're inconsistent (B3).

**S4. Ranked horizontal bars beside the candidate table.** Their All-Candidates view
pairs a ranked bar chart with exact tabular numbers — scan *and* precision. Our
candidate list is numbers only, no visual weight.

**S5. Explicit tab bar with underline-active state.** Theirs is scannable at a glance;
ours is a `<select>` dropdown that hides sibling options.

**S6. Booth mini-cards with sparkline bars.** For 344 booths they use lightweight
repeated cards with 3 mini-bars instead of 344 charts. Good pattern for our 84k booths
— though we'll need virtualization they didn't bother with.

**S7. Their restraint with chart types.** Doughnut + bar. That's it. No chart that
needs a legend to decode.

### Do not steal
- **Their homepage.** A 234-card unpaginated scroll wall. Our map *is* the better index.
- **Their flat card grid as primary navigation.** We have geography; they don't. Don't throw away our biggest differentiator to imitate a site that lacks it.
- **Their single-state, single-year scope.** Obviously.
- **Chart.js as a hard dependency** — see §4.

---

## 3. Phased plan

### Phase 0 — Stop the bleeding (½ day)
Highest value-per-hour in this document.

- [ ] **B2**: Get a CARTO API key, or switch default basemap to an unkeyed provider
      (OSM raster / Stadia). Non-negotiable — everything else is lipstick while
      `API KEY REQUIRED` is tiled 40× across the screen.
- [ ] **B1**: Gate `.cache-status` behind `import.meta.env.DEV`.
- [ ] **B3 + B4**: Delete the two duplicate `formatNumber`s, export one from
      `shared.ts` using `'en-IN'`, replace all 18 bare `.toLocaleString()` calls.
      One function, one locale, one place.
- [ ] **B5**: Rank candidates after filtering NOTA.
- [ ] **B6**: Reset panel scroll to top on selection change.

**Exit:** app stops looking broken. Ship this alone if the rest gets deprioritized.

### Phase 1 — Consolidate the token layer (1–2 days)
No visual change intended. Pure groundwork. Behaviour-preserving.

- [ ] Merge the 3 `:root` blocks into one at the top of the file.
- [ ] Add the missing scales: `--space-*` (4/8/12/16/24/32), `--radius-*` (sm 4 / md 8 / lg 12 / pill 999 — collapse 12 values to 4), `--text-*` (**floor at 12px**), `--elev-*` (3 shadows, replacing 93 ad-hoc ones).
- [ ] Codemod the 278 hex literals → tokens. Party colors are the exception: they stay literal in `partyData.ts`, which is correct and should be the single source.
- [ ] Split `index.css` (8,030 lines → ~10 files under `src/styles/`, one per surface: `tokens`, `base`, `sidebar`, `map`, `panels`, `booth`, `blog`, `mobile`). **Per house rule: no file over 600 lines.**

**Exit:** `grep -c '#[0-9a-f]\{3,6\}' src/styles/*.css` ≈ 0 outside `tokens.css`. Visual diff via Playwright screenshots shows no unintended change.

### Phase 2 — Rebuild the result panel around the podium (3–4 days)
The headline change. This is where we visibly beat them.

- [ ] `<ResultPodium>` — 4 cards (Winner/Runner-up/3rd/Margin), party-colored left border, vote count as the dominant number, share % secondary. (S1)
- [ ] `<KpiStrip>` — Total / Valid / NOTA / Rejected / Winner-led / Runner-led / Booths. Data already exists in `boothwiseAnalysisEngine.ts`. (S1, S2)
- [ ] `<CandidateBars>` — ranked horizontal bars next to the existing table. (S4)
- [ ] Reorder: **Podium → KPI strip → charts → full candidate table.** Currently the table is first.
- [ ] Replace the `<select>` view switcher with a real tab bar on desktop
      (`role="tablist"`/`role="tab"`/`role="tabpanel"`, arrow-key navigation),
      keeping the `<select>` at mobile widths where it genuinely is the better control. (S5)

### Phase 3 — Accessibility to WCAG 2.2 AA (2 days)
Mandatory, not optional.

- [ ] Landmarks: `<main>`, `<nav>`, `<aside>`, `<footer>`.
- [ ] Heading hierarchy `h1→h2→h3`; constituency name becomes the `h2`.
- [ ] Global `:focus-visible` using a palette token, not the orphaned `#2563eb`.
- [ ] Contrast-audit every token pair; kill remaining sub-12px text.
- [ ] Charts get accessible text equivalents (their gap too — a chance to be *better*, not equal).
- [ ] Verify 44×44px touch targets. `--row-min-height: 44px` is already right; audit icon buttons.
- [ ] Add `@axe-core/playwright` to the e2e suite so this can't regress.

### Phase 4 — Map & mobile polish (2–3 days)
- [ ] Reduce basemap/choropleth competition: desaturate basemap under thematic fills, drop label opacity.
- [ ] Replace the floating red  with a conventional edge-anchored drawer handle (B7).
- [ ] Mobile: proper bottom-sheet with snap points (peek / half / full) instead of a 92%-width drawer that hides the map with no affordance.
- [ ] Booth mini-cards, virtualized (S6).

### Phase 5 — Dark mode (1–2 days, optional)
Nearly free once Phase 1 lands — add a `[data-theme="dark"]` token block. **They don't have this.** Differentiator, and it matters for an app people use on phones at night on election day.

---

## 4. Charting decision

They use Chart.js 4.4.4 via CDN. Our house default for reports is Chart.js too, so it's the path of least resistance — but:

- We currently ship **zero** charting libraries. Our bars are CSS divs.
- Chart.js is ~70 KB gzipped and renders to `<canvas>` — **invisible to screen readers**, which fights Phase 3.
- Our two needs (doughnut for vote share, horizontal ranked bars) are genuinely trivial in CSS/SVG.

**Recommendation: don't add Chart.js.** Build `<VoteShareDonut>` (one SVG `stroke-dasharray` circle) and `<RankedBars>` (flex divs) as accessible SVG/CSS components. Keeps us offline-first — a CDN `<script>` tag would *break our core offline promise*, which is a differentiator we should not trade for a doughnut.

Revisit only if we need time-series/swing charts across many years, where hand-rolling stops being sensible.

> **Chart.js footgun, if we ever do adopt it:** wrap the `<canvas>` in a fixed-height
> `<div>` — `responsive: true` ignores the canvas `height` attribute.

---

## 5. Effort & sequencing

| Phase | Effort | Risk | Visible impact |
|---|---|---|---|
| 0 — Stop the bleeding | **0.5 d** | Very low | **Huge** |
| 1 — Token consolidation | 1–2 d | Low (no visual change) | None (enables rest) |
| 2 — Podium + KPI strip | 3–4 d | Medium | **Huge** |
| 3 — WCAG 2.2 AA | 2 d | Low | Low visually, mandatory |
| 4 — Map & mobile | 2–3 d | Medium | High |
| 5 — Dark mode | 1–2 d | Low | Medium |
| | **~10–14 d** | | |

**Ship Phase 0 today.** Phases 1→2 are the real revamp. 3 is non-negotiable before any public push. 4–5 are polish.

### Guardrails
- Every phase ends green: `npm run validate` (typecheck + lint + 494 unit tests) and the 113 Playwright e2e tests.
- Commit per logical change, per repo convention — roll forward and back in time.
- Phase 1 must be provably behaviour-preserving: screenshot-diff before/after.
- Don't split files purely to hit 600 lines where it hurts cohesion.

---

## 6. The one-paragraph summary

Their app looks better than ours despite doing far less, because they spent their
effort on the first screen: a podium, a KPI strip, consistent party color, and Indian
number formatting. We spent ours on genuinely harder things — 5-level geographic
drill-down, offline IndexedDB caching, 84k booths, multi-year data, a 607-line booth
analysis engine — and then buried the payoff under a raw table, behind a dropdown,
beneath a map plastered with `API KEY REQUIRED`. **The revamp is not "make it look like
theirs." It is: fix the four embarrassing bugs, finish the token migration someone
already started, and promote the analysis we already compute to the top of the panel.**
