[< Back to index](./README.md)

## 10. Phase 2.5 implementation plan — filtering, ranking, and the year table

**Corrects a mistake in [§5](./05-phases.md):** an earlier pass through that doc read the
`[x]` items under Phase 2 (podium, panel widths, tabs, hover-link) and reported the whole
phase done. It is not. Phase 2's checklist has **13 more unchecked items** beneath those —
filter/rank pipeline, chips, saved runs, the election-year table, promoting `BlogSection`'s
ranked lists, extending search, per-row map-linking, a mode toggle, and a compare stretch
goal. That block is the same scope [§7](./07-sequencing.md) calls **"Phase 2.5"** and
[§9](./09-filtering-and-ranking.md) specifies in full — it just never got its own `###`
heading in §5, which is why a header-only pass missed it. This document is the "how" for
that "what."

### What this plan does NOT cover

Two other unfinished pieces of the revamp are real but **out of scope here** — do not
fold them into Phase 2.5 work:

1. **Card-mode navigation** ([§2a](./02a-mode-contract.md), [§2c](./02c-decided-model.md)) —
   replacing the map with a card grid at India/state/district level, `?surface=cards`, a
   `RegionMapInset`. This is a bigger, separate architectural decision (splitting the
   1,601-line `MapView.tsx`) with its own six-item exit checklist, none of it started.
2. **National / cross-state ranking.** See "The one new fact that reshapes this plan"
   below — this plan scopes ranking to one state+year at a time, which is buildable with
   zero new data pipeline. Ranking across all states (the `543 constituencies →`
   phrasing in §9's example, which is literally the Lok Sabha's total seat count) needs a
   prebuilt summary index and belongs in a follow-up once v1 ships.

---

### The one new fact that reshapes this plan

`09-filtering-and-ranking.md` reads as if a new data/metrics pipeline is required before
any of this can start. It is not, for the common case. Checked directly:

- `public/data/elections/ac/TN/2021.json` is **one 1.1MB file holding all 234 Tamil Nadu
  constituencies**, keyed by AC ID — not one file per constituency. The app already
  fetches and IndexedDB-caches this whole file today (`ELECTIONS.getYearPath()`,
  `src/constants/paths.ts`) just to show one AC's detail panel.
- `ACElectionResult` already carries everything a v1 filter/rank pass needs per
  constituency: `constituencyType` (GEN/SC/ST), `districtName`, `turnout`,
  `candidates[].margin` / `.marginPct` / `.voteShare` / `.party`.
- **Consequence:** filtering and ranking *within the currently-selected state and year*
  needs **no new backend/build step at all** — it's a pure client-side pass over data
  already sitting in memory. This is most of what §9's spec actually asks for in practice
  (its own worked example is `Tamil Nadu · Assembly · 2021`).
- What genuinely doesn't exist yet and does need new code (not new data): **swing**
  (comparing two years of the same state's already-cached files, joined by AC ID — no
  fetch problem, just no function yet) and a **generic metrics engine** (today the only
  ranked list in the app is `BlogSection`'s hardcoded TN-2026 alliance-flip JSON).
- What genuinely doesn't exist and **would** need a new prebuilt index: ranking or
  searching **across states** in one pass. Fetching every state's file for one year to
  rank nationally is ~8.9MB (measured: all 36 states' PC 2024 files). That's a real
  "build a lightweight summary-index script" task — flagged as a follow-up, not built here.

This means the plan below front-loads a small, well-tested metrics module, then layers
UI on top of data that's already loaded — rather than starting with a data pipeline no
one asked for.

---

### Sequencing (mirrors §9 §7's delivery order, adjusted for the fact above)

Each sub-phase is sized to be one branch/PR, ends green (`tsc`, `eslint`,
`npm run validate`, relevant e2e), and is independently shippable — later sub-phases
depend on earlier ones, but nothing here is a big-bang rewrite.

#### 2.5a — Metrics module (no UI)
**Effort: 0.5–1 d. Risk: very low (pure functions).**

New `src/utils/constituencyMetrics.ts`:
- `computeMargin`, `computeNotaShare`, `computeTurnoutPct` — thin wrappers, mostly
  exposing fields that already exist on `ACElectionResult`/`ElectionCandidate`, given a
  reason to live in one place (there are currently zero of these — every consumer reaches
  into `candidates[0]`/`candidates[1]` by hand).
- `computeSwing(current: ACElectionResult, prior: ACElectionResult | null)` — **new
  logic**, not a wrapper. Joins two already-cached year files by `schemaId`/AC number;
  returns `null` (not `0`) when the prior year is missing, a different constituency count
  (delimitation), or a party didn't contest both years. A missing swing must read as
  "not applicable," never as "no swing."
- `rankConstituencies(results: ACElectionResult[], metric, direction)` — pure sort, no
  filtering. Ties broken by constituency number for a stable, reproducible order.
- Exit: unit tests for every metric including the "prior year missing/incompatible"
  branches of swing — this is the exact kind of edge case this session's `useVirtualList`
  work showed tests catch and manual QA doesn't.

#### 2.5b — Generalize `BlogSection`'s ranked list
**Effort: 1–1.5 d. Risk: low-medium (real component extraction).**

- New `<RankedConstituencyList>` in `src/components/`, driven by
  `metric: 'margin' | 'turnout' | 'nota' | 'swing'`, `direction`, and the current
  state+year's already-loaded `ACElectionResult[]` — not a bespoke alliance JSON.
- Wire it into the sidebar as a real data-nav surface (not the blog modal). This is the
  literal "promote the analytical views out of `BlogSection`" checklist item.
- **Decision needed from you:** does the existing NDA-alliance blog post
  (`ammk-admk-alliance-2026.json`, hardcoded TN-2026 alliance math) stay as its own blog
  post using the new list component for its row rendering, or does it retire once the
  general margin/turnout rankings ship? It's bespoke analysis (combined alliance vote
  totals), not a metric `computeMargin` etc. can produce, so it can't just disappear into
  the new component automatically either way.
- Exit: `<RankedConstituencyList>` renders correctly for at least two states/years in
  Storybook-less browser QA (screenshot, not just DOM assertions — per this session's own
  lesson that DOM-correct bars can still read wrong visually); e2e test clicking a row
  selects that AC through `selectLocation()` (the Phase 2 single entry point), not a
  parallel path.

#### 2.5c — Hard-filter state + URL serialization
**Effort: 1–1.5 d. Risk: medium (touches `UrlState`).**

- Extend `UrlState`/`UrlUpdateInput` (`src/hooks/useUrlState.ts`) with filter/sort query
  params, following the existing rule already written into §9 and honoured by the rest of
  the URL schema: **place stays in the path, filters/sort are query params**
  (`?margin_max=2&sort=margin_asc`), so a deep link to a place still wins for navigation.
- Pure predicate functions in `constituencyMetrics.ts` (or a sibling
  `constituencyFilters.ts` if that file would exceed ~300 lines): each filter answers
  "excluded / included / not applicable" per §9 — a missing turnout value must not silently
  pass a turnout filter as zero.
- No chip/facet UI yet — a minimal filter form is enough to prove the state machine.
- Exit: unit tests that changing sort never changes the matching count (this is §9's own
  acceptance criterion #3); refresh/share of a filtered URL reproduces the same result set.

#### 2.5d — Filter chips + result accounting
**Effort: 1 d. Risk: low.**

- Removable, accessible chips for each active filter (`Year: 2021`, `Margin: 0–2pp`),
  grouped clear action, matching the existing sidebar row a11y conventions
  (`role="button"`, keyboard-activatable — same pattern as `StateBrowseList`).
- Visible funnel: `234 constituencies → 41 match filters → 20 shown`, plus exclusion
  reasons (`21 failed margin threshold · 3 missing turnout data`) per §9 §2.
- Exit: axe scan on the new chip row; screen-reader label per chip includes the remove
  action, not just the value.

#### 2.5e — Ranking controls + evidence
**Effort: 1 d. Risk: low.**

- Sort control naming the metric and direction explicitly ("Top 20 by smallest winning
  margin" — never a bare "Top constituencies," per §9 §1).
- "Why ranked here?" detail per row/drawer: margin in votes and share, comparison scope,
  election date, calculation definition, source path — no opaque single score.
- Exit: every visible ranked row's detail panel resolves to a real source file path (no
  placeholder text).

#### 2.5f — Responsive filter rail / drawer + facets
**Effort: 1–1.5 d. Risk: medium (new responsive surface, another a11y surface to scan).**

- Desktop: filter rail. Mobile: drawer, collapsing excess chips into `+N filters` per §9.
- Facet groups (Contest competitiveness / Participation / Party performance / Candidate
  profile / Data quality) with live counts computed from the already-loaded state-year
  data — three explicit states per option: `0 matching`, `No data available`,
  `Not applicable`. Booth-scoped facets stay out per §9's own instruction: booth records
  still have no coordinates/geometry (confirmed again this session while building the
  booth mini-card grid), so don't imply booth geography exists.
- Exit: axe scan on both rail and drawer; 44px touch targets in the drawer (matching this
  repo's existing mobile touch-target audit).

#### 2.5g — Election-year table view
**Effort: 2–2.5 d. Risk: medium-high (the biggest single surface in this plan).**

- Dense, Excel-like table per selected state+year, sharing the same filtered/ranked
  dataset as the list/map (not a second source of truth).
- **Virtualize with the existing `useVirtualList` hook** (`src/hooks/useVirtualList.ts`,
  shipped this session for the booth mini-card grid) rather than a new library or a
  second bespoke windowing implementation — it's already fixed-row-height, dependency-free,
  and unit-tested for the stale-scrollTop edge case a table will hit identically when
  switching years. This is the direct reuse §9 hoped for when it said "never render
  thousands of DOM rows."
- Sticky/frozen identity columns (constituency, district, winner), horizontal scroll for
  the rest, column chooser, Indian-formatted numbers (reuse `formatNumber` from
  `election-result-panel/shared.ts` — do not write a fourth copy after this repo already
  deleted three duplicates in Phase 0/B4), sortable headers with a non-colour sort
  indicator, keyboard navigation, metadata-carrying export.
- Exit: table usable with the largest state's constituency count without dropped frames
  (largest AC count observed this session: TN at 234; largest PC count nationally is
  higher — verify against the biggest state before calling this done); e2e covering
  keyboard sort + column chooser.

#### 2.5h — Saved, shareable runs
**Effort: 1 d. Risk: low, but only after 2.5c–g are stable.**

- Serializes filters, ranking, displayed columns, comparison year, and a data-snapshot/
  methodology marker into the URL/preset — deliberately last, per §9 §7's own delivery
  order, since it has nothing to serialize until the query state above is settled.
- Exit: a saved/shared URL reproduces identical filter, ranking, and matching-count state
  for the same data snapshot (§9's own acceptance criterion).

#### Slots in around 2.5c/d, not its own sub-phase — Extend `SearchBox`
**Effort: 0.5–1 d (state-scoped only).**

- `SearchBox` currently indexes geography only (`state | constituency | assembly |
  district` — confirmed by reading `SearchBox.tsx`). Extending to candidates/parties
  *within the currently loaded state+year* is cheap (the data's already in memory, same
  fact as 2.5a). Extending it to search **every** state's candidates without a page load
  is the same national-index problem flagged above — scope this to the loaded state+year
  for v1 and say so in the empty state, rather than silently returning incomplete results.

#### Explicitly deferred, not forgotten
- Per-row map hover-link for ranked-list rows — mechanically identical to the browse-list
  hover-link shipped in Phase 2 (`rowHoverProps` in `sidebar-panels/shared.ts`); slot into
  2.5b once `<RankedConstituencyList>` exists, don't build it twice.
- Mode toggle in the panel header, remembered per session (map-first desktop default,
  data-nav mobile default per §2/§8) — small, but touches `App.tsx` selection wiring;
  do after 2.5b so there are two real modes worth toggling between.
- *(Stretch, §5's own words)* pinning 2–4 constituencies to compare side by side.
- National cross-state ranking + a prebuilt lightweight summary-index build script — real
  work, but a data-platform task; see the companion
  [`../data-platform-roadmap.md`](../data-platform-roadmap.md) rather than bolting it onto
  this UI plan.

---

### Total effort

| Sub-phase | Effort |
|---|---|
| 2.5a Metrics module | 0.5–1 d |
| 2.5b Generalize ranked list | 1–1.5 d |
| 2.5c Hard filters + URL | 1–1.5 d |
| 2.5d Chips + accounting | 1 d |
| 2.5e Ranking controls + evidence | 1 d |
| 2.5f Filter rail/drawer + facets | 1–1.5 d |
| 2.5g Election-year table | 2–2.5 d |
| 2.5h Saved runs | 1 d |
| Search extension (slots into 2.5c/d) | 0.5–1 d |
| **Total** | **~10–13 d** |

Close to §7's original 4–6 day estimate for "Phase 2.5" as a single line item, once split
into real sub-phases with tests, a11y scans, and the table view priced honestly — the
table alone is the biggest single surface in the whole revamp plan after `MapView.tsx`.

### Open decisions before starting 2.5a

1. Does the NDA-alliance blog post retire once general rankings ship, or keep existing
   alongside them (see 2.5b)?
2. Is state-scoped filtering/ranking/table an acceptable v1, with national cross-state
   ranking explicitly deferred to a data-platform follow-up — or is national ranking a
   launch requirement that changes the sequencing above?
3. Sequencing preference: ship 2.5a→2.5h in order as separate branches (matches this
   repo's established one-branch-per-checklist-item-cluster habit), or batch a few
   together (e.g. 2.5a+2.5b as one branch, since 2.5b has nothing to render without 2.5a)?

---
