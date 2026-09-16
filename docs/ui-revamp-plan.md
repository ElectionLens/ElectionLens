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
| B9 | **Data→map navigation is a race.** `BlogSection` closes itself, awaits a state load, then fires `onAssemblyClick` inside `setTimeout(…, 300)` — guessing how long geography takes. Misses on cold cache/slow network; click silently does nothing. Root cause of §2. | `BlogSection.tsx:203` | **High** — silent dead click |

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

---

## 2. Two navigation modes: data-based and map-based

> **This is the organising idea of the revamp.** §3 (width) is downstream of it.

There are two legitimate ways into the same fact, and they suit different questions:

| | **Map-based nav** | **Data-based nav** |
|---|---|---|
| Question | "what happened *here*?" | "*where* did X happen?" |
| Entry | click geography, drill down | rank/filter/search a list, jump to place |
| Good at | adjacency, clusters, regional patterns | superlatives, outliers, comparison |
| Bad at | "top 10 closest seats" | "is this seat coastal?" |
| Competitor | **absent** | their whole app (card directory + tabs) |
| Us today | **strong** | **exists but hidden and broken** |

The competitor only has data-nav *because they have no map*. We should not treat that
as a reason to copy it — we should treat it as the half we under-built. **Neither mode
is primary. They are peers over one shared selection state.**

### This reframes the earlier plan (and corrects it)

§3 framed panel width as "map vs data fighting over pixels". With two explicit modes
the three widths stop being an arbitrary compromise and become **the physical expression
of which mode you are in**:

| Mode | Panel | Map | Driving question |
|---|---|---|---|
| Map-first (Browse) | 360px | 75%+ | "what's around here?" |
| Balanced (Analyse) | 520px | ~64% | "what happened in this seat?" |
| Data-first (Deep-dive) | ~900px | strip/hidden | "which seats did X?" |

Same geometry as §3, better justification. **Panel width follows navigation mode, not
drill-down depth.** A user asking "top 20 closest contests statewide" wants data-first
at *state* level — depth alone would wrongly give them a narrow panel.

### We already have both halves — unevenly built

**Data-nav already exists in three places and none of them know about each other:**

1. `SearchBox` — finds `state | constituency | assembly | district`. **Geographic names
   only.** Cannot search a party, candidate, or booth. It's a gazetteer, not data-nav.
2. `browse-list/` (542 lines, 5 components) — hierarchical lists that take the *same*
   `onStateClick`/`onAssemblyClick` handlers as the map. **This is already a
   parallel navigation surface and is the correct foundation** — it just only offers
   alphabetical hierarchy, never "rank by margin".
3. `BlogSection` (687 lines) — genuinely analytical: flip lists, margin leaderboards,
   booth tables. Click a constituency and it navigates the map to it.

**The finding: `BlogSection` is real data-based navigation trapped in a blog modal.**
It already does the exact interaction we want — "rank constituencies by a metric, click
one, land on the map" — but it is reachable only via a Blog button, hardcoded to Tamil
Nadu 2021, and closes itself to navigate.

We don't need to invent data-nav. **We need to promote it out of the blog and
generalise it beyond one hardcoded post.**

### The bug this mode-split exposes

`BlogSection.tsx:203` — data→map navigation is wired through a **race condition**:

```js
onClose();
if (onNavigateToState) await onNavigateToState('Tamil Nadu');
if (onAssemblyClick) {
  setTimeout(() => { onAssemblyClick(acName.toUpperCase(), mockFeature); }, 300);
}
```

It guesses that a state's geography loads in 300ms. On a cold IndexedDB cache or a slow
connection it misses and the click silently does nothing.

*(Checked the other 8 `setTimeout`s in `useUrlNavigate.ts` — those are all `, 0)`,
ordinary "defer past this render" deferrals, not races. **This 300ms one is the only
genuine race.** Worth stating plainly so nobody rewrites the wrong eight.)*

The root cause is that **data-nav is bolted onto map-nav instead of both being peers
over shared selection state.** Promoting one to a first-class mode requires fixing this
properly: `selectLocation({state, ac})` awaits geography, then commits selection — both
modes call the same function, no timing guesses.

### What data-based navigation should offer

Beyond alphabetical lists we already have — all computable from data in hand:

- **Rank/sort** — closest contests, biggest margins, highest turnout, highest NOTA,
  most booths, biggest swing. (`boothwiseAnalysisEngine.ts` already computes most.)
- **Filter** — by party, alliance, reservation (GEN/SC/ST), district, margin band.
- **Compare** — pin 2–4 constituencies side by side.
- **Search that finds non-geography** — candidates and parties, not just place names.

Each row stays **map-linked**: hover highlights the polygon, click flies to it. That
bidirectional link is precisely what the competitor cannot do, and it only pays off if
both modes are first-class.

### Sequencing impact

Adds a phase, and **moves the shared-selection fix earlier** — it is a prerequisite for
data-nav, not polish. Revised in §7.

---


## 3. The map/data coexistence problem

> **This section supersedes the naive reading of Phase 2.** Their app has no map, so
> "copy their podium" is not directly portable. Getting this wrong means importing
> their layout and losing the thing that makes us better than them.

### The constraint, measured

Our sidebar is **`width: 360px` fixed** (`index.css:25`). Their podium cards are ~318px
each at a 1440px viewport. So:

| Layout | Card width | Verdict |
|---|---|---|
| Their podium, 4-across @1440px | ~318px | the reference |
| Ours, 4-across in a 360px sidebar | **74px** | impossible |
| Ours, 3-across | 101px | impossible |
| Ours, 2×2 grid | 156px | cramped |
| 7-cell KPI strip in 360px | **42px/cell** | impossible — `2,32,630` alone needs ~72px |

**A 360px sidebar cannot host their layout.** Any plan that says "add a podium" without
addressing width is hand-waving. The panel must widen — but widening it eats the map,
which is our differentiator. That tension is the actual design problem.

### Width budget

Map needs ~720px minimum to stay explorable (roughly a state-shaped viewport).

| Viewport | Panel 360 | Panel 440 | **Panel 520** | Panel 560 |
|---|---|---|---|---|
| 1280px | map 920 | map 840 | **map 760** | map 720 (floor) |
| 1440px | map 1080 | map 1000 | **map 920** | map 880 |
| 1920px | map 1560 | map 1480 | **map 1400** | map 1360 |

**520px is the sweet spot**: 236px podium cards (2×2) — comfortable — while the map keeps
920px at 1440px, still the dominant element. Below 1152px viewport, fall back to 360px.

### The resolution: three panel widths tied to intent

The insight is that **panel width should follow what the user is doing**, not be fixed.
Map-first and data-first are different modes, and drilling into an AC *is* the signal.

| Mode | Panel | Map | When |
|---|---|---|---|
| **Browse** | 360px | 75%+ | India/state level, picking a place. Map is the interface. |
| **Analyse** | 520px | ~64% | An AC/PC is selected. Podium + KPI strip fit. Map keeps context + selection highlight. |
| **Deep-dive** | ~900px / full | hidden or strip | Booth tables, all-candidates, analysis. Map has nothing left to say. |

Width animates on the existing `flex-shrink: 0` sidebar — one `width` transition, and
Leaflet's existing `MapResizer` already handles the reflow.

**Crucially: the map is never *replaced* by data. It is de-emphasised in proportion to
how zoomed-in the question is.** At India level the map answers everything; at booth
level it answers nothing.

### We already half-built this (dead code found)

`index.css` contains a **complete three-snap bottom-sheet system** — `panel-peek` (19
rules), `panel-half` (12 rules), `panel-full` — with height transitions, a drag handle,
swipe hints, and a peek-state winner line.

**`panel-peek`, `panel-half`, `bottom-sheet-handle`, `swipe-hint` and `peek-winner` have
zero TSX usages.** Only `panel-full` is wired (`ElectionResultPanel.tsx:407`). Someone
designed exactly the peek/half/full mobile interaction this plan needs and never
connected it.

So Phase 4's bottom sheet is **not new work — it is finishing existing work**, the same
story as the token layer. Either wire it up or delete it; leaving 40+ rules of dead CSS
is the worst of both.

### Map changes, concretely

The map stops being wallpaper behind panels and becomes the **third coordinated view**:

1. **Fix the basemap (B2)** — the watermark is the single biggest map problem.
2. **Desaturate the basemap under choropleth.** We fill polygons via `getPartyColor` at
   `fillOpacity` 0.6–0.75 over a full-colour Voyager basemap — two saturated layers
   competing. Switch to a muted/greyscale basemap under thematic fills so party colour
   is the *only* saturated thing on screen.
3. **Selection-linked highlight both ways.** Hovering a candidate/booth row highlights
   its geography; the reverse already works. This is the payoff they structurally
   cannot copy.
4. **Move map overlays out of the corners** where they collide with the panel and the
   floating red toggle (B7). `map-legend`/`map-toolbar` already get hidden on mobile
   detail view via `:has()` — generalise that to width-aware placement.
5. **Booth markers** get the mini-card treatment (S6) on click, not a separate tab.

### What this means for the podium (S1)

Keep it, but **adapted, not copied**:
- 2×2 grid at 520px, not 1×4 at 1440px.
- KPI strip wraps to 2 rows of 3–4 cells, never 7 across.
- Both collapse to a single summary row in 360px Browse mode.

The podium earns its space only in Analyse/Deep-dive. In Browse mode the map *is* the
overview, and a podium for a place you haven't chosen yet is noise.

---

## 4. What to steal from them (and what to ignore)

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


## 5. Phased plan

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

### Phase 2 — Shared selection + responsive panel width (4–5 days)
The structural change. **Read §2 and §3 first.**

- [ ] **`selectLocation()` as the single selection entry point.** One async function that
      awaits geography then commits selection; map clicks, browse-list clicks, search
      results and data-nav rows all call it. **Fixes B9** and removes the 300ms guess.
      Everything else in this phase depends on it.
- [ ] **Panel width modes.** `--panel-w` token driving 360 / 520 / ~900px, switched by
      *navigation mode* (§2), animated, with a user override that sticks. Below 1152px
      viewport, stay at 360px.
- [ ] `<ResultPodium>` — **2×2 grid** (Winner/Runner-up/3rd/Margin), party-coloured left
      border, vote count dominant, share % secondary. Collapses to one row at 360px. (S1)
- [ ] `<KpiStrip>` — Total / Valid / NOTA / Rejected / Winner-led / Runner-led / Booths,
      **wrapping to 2 rows**, never 7 across. Data already in
      `boothwiseAnalysisEngine.ts`. (S1, S2)
- [ ] `<CandidateBars>` — ranked horizontal bars beside the table. (S4)
- [ ] Reorder: **Podium → KPI strip → charts → full candidate table.**
- [ ] Real tab bar at ≥520px (`role="tablist"`/`tab`/`tabpanel`, arrow-key nav), keeping
      `<select>` at 360px and mobile.
- [ ] Bidirectional hover-link between candidate/booth rows and map geography.

### Phase 2.5 — Data-based navigation as a first-class mode (3–4 days)
Depends on `selectLocation()` landing in Phase 2. See §2.

- [ ] **Promote the analytical views out of `BlogSection`.** Its flip/margin
      leaderboards are already real data-nav — extract them into a reusable
      `<RankedConstituencyList>` driven by a metric prop, not a hardcoded TN-2021 post.
- [ ] **Rank/sort surface**: closest contests, biggest margins, turnout, NOTA, swing.
      Most already computed in `boothwiseAnalysisEngine.ts`.
- [ ] **Filters**: party, alliance, reservation (GEN/SC/ST), district, margin band.
- [ ] **Extend `SearchBox` beyond geography** — candidates and parties, not just place
      names. Currently `state | constituency | assembly | district` only.
- [ ] Every row map-linked: hover highlights polygon, click flies to it.
- [ ] Mode toggle in the panel header; remembered per session.
- [ ] *(Stretch)* pin 2–4 constituencies to compare side by side.

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
Mostly **wiring up CSS that already exists** — see §3.

- [ ] Desaturate/greyscale the basemap under thematic fills so party colour is the only
      saturated thing on screen (we currently stack 0.6–0.75 opacity party fills over a
      full-colour Voyager basemap).
- [ ] Replace the floating red × with an edge-anchored drawer handle (B7).
- [ ] Width-aware placement for `map-legend` / `map-toolbar` so they never sit under the
      panel or the toggle.
- [ ] **Wire up the existing `panel-peek` / `panel-half` / `panel-full` bottom sheet** —
      ~40 rules of finished CSS with zero TSX usage. Add the snap-point state + drag
      handling, or delete it. Do not leave it dead.
- [ ] Booth mini-cards on marker click, virtualized (S6).

### Phase 5 — Dark mode (1–2 days, optional)
Nearly free once Phase 1 lands — add a `[data-theme="dark"]` token block. **They don't have this.** Differentiator, and it matters for an app people use on phones at night on election day.

---

## 6. Charting decision

They use Chart.js 4.4.4 via CDN. Our house default for reports is Chart.js too, so it's the path of least resistance — but:

- We currently ship **zero** charting libraries. Our bars are CSS divs.
- Chart.js is ~70 KB gzipped and renders to `<canvas>` — **invisible to screen readers**, which fights Phase 3.
- Our two needs (doughnut for vote share, horizontal ranked bars) are genuinely trivial in CSS/SVG.

**Recommendation: don't add Chart.js.** Build `<VoteShareDonut>` (one SVG `stroke-dasharray` circle) and `<RankedBars>` (flex divs) as accessible SVG/CSS components. Keeps us offline-first — a CDN `<script>` tag would *break our core offline promise*, which is a differentiator we should not trade for a doughnut.

Revisit only if we need time-series/swing charts across many years, where hand-rolling stops being sensible.

> **Chart.js footgun, if we ever do adopt it:** wrap the `<canvas>` in a fixed-height
> `<div>` — `responsive: true` ignores the canvas `height` attribute.

---

## 7. Effort & sequencing

| Phase | Effort | Risk | Visible impact |
|---|---|---|---|
| 0 — Stop the bleeding | **0.5 d** | Very low | **Huge** |
| 1 — Token consolidation | 1–2 d | Low (no visual change) | None (enables rest) |
| 2 — Shared selection + panel width + podium | 4–5 d | Medium | **Huge** |
| 2.5 — Data-based navigation | 3–4 d | Medium | **High** (new capability) |
| 3 — WCAG 2.2 AA | 2 d | Low | Low visually, mandatory |
| 4 — Map & mobile | 2–3 d | Medium | High |
| 5 — Dark mode | 1–2 d | Low | Medium |
| | **~14–19 d** | | |

**Ship Phase 0 today.** Phases 1→2 are the real revamp. 3 is non-negotiable before any public push. 4–5 are polish.

### Guardrails
- Every phase ends green: `npm run validate` (typecheck + lint + 494 unit tests) and the 113 Playwright e2e tests.
- Commit per logical change, per repo convention — roll forward and back in time.
- Phase 1 must be provably behaviour-preserving: screenshot-diff before/after.
- Don't split files purely to hit 600 lines where it hurts cohesion.

---

## 8. The one-paragraph summary

Their app looks better than ours despite doing far less, because they spent their
effort on the first screen: a podium, a KPI strip, consistent party color, and Indian
number formatting. We spent ours on genuinely harder things — 5-level geographic
drill-down, offline IndexedDB caching, 84k booths, multi-year data, a 607-line booth
analysis engine — and then buried the payoff under a raw table, behind a dropdown,
beneath a map plastered with `API KEY REQUIRED`. **The revamp is not "make it look like
theirs." It is: fix the four embarrassing bugs, finish the token migration someone
already started, and promote the analysis we already compute to the top of the panel.**

But we cannot copy their layout directly, because **they have no map and we do**
(§3). Their podium needs ~318px cards; our 360px sidebar affords 74px. The fix is a
panel that widens with intent — 360px to browse, 520px to analyse, ~900px to deep-dive.

The organising idea (§2) is that **map-based and data-based navigation are peers, not
a hierarchy**: "what happened here?" and "where did X happen?" are different questions
over one shared selection. The competitor has only the second, because they have no map.
We have a strong first and a hidden, broken second — real analytical navigation exists
today but is trapped inside a blog modal, hardcoded to one state, and wired through a
300ms `setTimeout` race. Fix the shared selection, promote data-nav out of the blog, and
keep every row map-linked. **Hover a candidate, light up the geography — that is the
thing they structurally cannot copy, and it is worth more than the podium.**
