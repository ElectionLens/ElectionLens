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
as a reason to copy it — we should treat it as the half we under-built.

### Which one is primary?

**Map-based navigation is primary. Data-based navigation is a peer entry point, not a
co-equal home screen.**

(An earlier draft of this document said "neither is primary, they are peers." That was
a dodge. Something has to render on first paint, own the URL, and win ties — refusing to
name it just pushes the decision into a hundred small inconsistent choices later.)

The evidence is that **the app has already decided, and the URL schema proves it.**
Places are *path segments*; everything else is a query param:

```
/state/tamil-nadu/district/tiruvallur/ac/gummidipoondi?year=2021&tab=booths
└─ path: WHERE ─────────────────────────────────────┘ └─ query: lens ─┘
```

Every one of the 8 query params (`year`, `tab`, `showACs`, `pane`, `paneView`,
`paneParty`, `blog`, `blogPost`) is a **view setting or a time**. **Not one is a
query/filter/sort.** The canonical identity of any screen in this app is a *place*.
That is the definition of map-primary, and it is already true in code.

Three more reasons to keep it that way:

1. **It is our differentiator.** The competitor is a list of 234 cards. If our front
   door becomes a list of 234 rows, we have voluntarily become them, minus their
   simplicity. Our moat is that a constituency has *neighbours*.
2. **Geography is the stable index; metrics are not.** A place exists across every
   election year. "Closest contests" is meaningless without first fixing a year and a
   scope — i.e. it is a *lens applied to* places, which is exactly a query param.
3. **It degrades better.** A map with no results data is still a usable, explorable
   map. A ranked list with no results data is an empty page.

### What "primary" does and does not mean

**Does mean:**
- Cold load with no URL state → map, every time. No mode-picker splash.
- Places stay in the path; data-nav's sort/filter state goes in query params
  (`?sort=margin&party=DMK`) — shareable, but never the canonical identity of a screen.
- On a tie (deep link specifies both a place and a ranking), the **place wins** and the
  ranking is applied as a highlight over it.
- Data-nav is always *dismissible back to* the map. The map is the resting state.

**Does not mean:**
- Data-nav is second-class in *quality*, hidden behind a hamburger, or allowed to stay
  the 300ms-race afterthought it is today (B9).
- The map is always the biggest thing on screen. At Deep-dive width the panel dominates
  — **primary is about authority and default, not pixel count.**
- Mobile follows desktop: see below.

### The honest exception: mobile

On mobile the default **inverts**, and we should say so rather than pretend one rule
fits both. `App.tsx:355` already opens the sidebar only when `innerWidth > 768`.

A 390px map shows roughly one constituency with no useful adjacency — the thing that
justifies map-primacy is precisely what a phone screen cannot render. So on mobile,
**data-nav is the sensible landing surface** (search + ranked list), with the map one
tap away and the peek/half/full sheet (§3) mediating between them.

This is a genuine split, not a compromise: map-primary is a claim about *what the app
is*, while the mobile default is a claim about *what 390px can usefully show*.

### Consequence for the build

`selectLocation()` (Phase 2) is the shared commit point for both modes, so "primary"
never means "the other one is a special case". Both call the same function; the map just
owns the default and the URL.

### This reframes the earlier plan (and corrects it)

§3 framed panel width as "map vs data fighting over pixels". With two explicit modes
the three widths stop being an arbitrary compromise and become **the physical expression
of which mode you are in**:

| Mode | Panel | Map | Driving question |
|---|---|---|---|
| Map-first (Browse) | 360px | 75%+ | "what's around here?" |
| Balanced (Analyse) | 520px | ~64% | "what happened in this seat?" |
| Data-first (Deep-dive) | ~900px | strip/hidden | "which seats did X?" |

**Map-first is the cold-load default on desktop** (§2). The other two are reached by
acting, not by choosing from a splash screen.

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

The root cause is that **data-nav is bolted onto map-nav as an afterthought rather than
sharing one commit point.** Map-nav being *primary* (§2) is about default and authority;
it is not licence for the other path to be a 300ms guess. Fixing this properly:
`selectLocation({state, ac})` awaits geography, then commits selection — both modes call
the same function, no timing guesses.

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


## 2a. Implementation contract: map mode / card mode

> §2 decides *which mode is primary*; §3 decides *how wide things are*. This section is
> the missing third piece: the concrete types, URL keys, and component boundaries the
> two modes must agree on. Written from a read of the current code, so the traps below
> are real ones, not hypotheticals.

### Trap 1: `ViewMode` is already taken — do not overload it

The obvious name is wrong. `ViewMode` already exists and means *geographic level*:

```ts
// src/types/index.ts:178
export type ViewMode = 'constituencies' | 'districts' | 'assemblies';
```

It is threaded through 9 files (`useUrlState`, `useMapWinners`, `useElectionData`,
`BrowseList`, `Sidebar`, `mapYearOptions`, `urlLocation`, `App`). Adding `'map' | 'cards'`
to that union would silently widen every one of those call sites, and the compiler would
*not* catch the ones that switch on it exhaustively today.

**Use a separate, orthogonal type.** The two concepts genuinely are independent — you can
be at `districts` level in either presentation:

```ts
/** How results are presented. Orthogonal to ViewMode (which geographic level). */
export type NavSurface = 'map' | 'cards';
```

Naming it `NavSurface` rather than `DisplayMode` keeps the "…Mode" suffix unambiguous.

### Trap 2: the card grid mostly exists already — extend, don't rebuild

`src/components/sidebar-panels/browse-list/` already implements hierarchical
India → state → district/PC → AC navigation, complete with winner colors via
`BrowseListWinnersContext`. Verified: **it imports no Leaflet** — it is already
map-independent and therefore already the card surface in list form.

Card mode should be a **presentation variant of `BrowseList`**, not a parallel tree.
Writing a second one guarantees the two drift on the "which AC is selected" question.

```
BrowseList (dispatch by nav depth)  ← keep, it is the shared brain
  └── layout: 'list' (sidebar, 360px) | 'grid' (card mode, full width)
```

If a `BrowseList` variant genuinely cannot carry the richer card (winner, runner-up,
margin, turnout), promote the shared row→card data derivation into
`browse-list/cardData.ts` and let both layouts consume it. **One derivation, two layouts.**

### Trap 3: MapView owns ~45 props — don't unmount it casually

`App.tsx:1369` passes MapView roughly 45 props (27 destructured in the signature),
including year selectors, share URLs, and PC-contribution state. Two consequences:

1. **Good news: the result panels are already hoisted.** `ElectionResultPanel` and
   `PCElectionResultPanel` render from `sidebar-panels/DetailPanelHost.tsx`, **not** from
   MapView, and `DetailPanelHost` imports no Leaflet. The shared shell this section
   originally called for largely exists — card mode can reuse `DetailPanelHost` directly
   rather than reimplementing panels.
2. **Unmount is now the correct default** — see §2c. Under the decided model the map is
   scoped to one region and lives *inside* a card detail, so there is no full-screen
   Leaflet instance to preserve while browsing cards. The old "hide, don't unmount"
   advice applied to a side-by-side toggle we are no longer building.

### The contract

| Concern | Decision |
|---|---|
| Type | `NavSurface = 'map' \| 'cards'`, new and orthogonal to `ViewMode` |
| URL key | `?surface=cards`. Omitted ⇒ `map`, so every existing link stays valid |
| Canonical identity | Unchanged: **place stays in the path** (§2). Surface is a lens, so it is a query param — consistent with all 8 existing params |
| Shared selection | **Required.** Both surfaces read the same `currentState/PC/District/Assembly`. Toggling never loses the user's place |
| Default | Desktop `map`; mobile `cards` — this is §2's "honest exception", not a new rule |
| Round-trip | `getUrlState`/`updateUrl`/`getShareableUrl` must all carry `surface`, or shared links silently drop the mode |
| Scope of replacement | Card mode replaces the **entire** map area. The map returns only as an inset inside a leaf detail card (§2c) |

### Accessibility (WCAG 2.2 AA)

The strongest argument for card mode is not aesthetics — **a Leaflet choropleth is close
to unusable for keyboard and screen-reader users.** Card mode is the accessible path to
the same data, so it must be reachable without a mouse, not buried behind a map interaction.

- Toggle is a real `<button>` pair (or `role="radiogroup"`) with `aria-pressed`, reachable
  in tab order, labelled "Map view" / "Card view".
- Cards are semantic `<a>`/`<button>` elements — not click-handled `<div>`s — so they are
  focusable and announce as interactive.
- Never encode the winner by party color alone: every card carries the party **as text**.
  This is the same colour-independence rule the map needs, and cards make it easy.
- Respect `prefers-reduced-motion` on any grid transition.

### Exit criteria

- [ ] `?surface=cards` survives refresh, back/forward, and copy-paste into a new tab.
- [ ] Drill to an AC in map mode, toggle to cards → **same AC still selected** (and vice versa).
- [ ] Full keyboard traversal: India → state → district → AC, no mouse, visible focus throughout.
- [ ] Card mode renders correctly with the map never having mounted (cold deep-link).
- [ ] No duplicated navigation logic: one `BrowseList` brain, two layouts.
- [ ] Existing URLs without `surface=` behave exactly as they do today.

---


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


## 2c. Decided model: card mode replaces the map; the map returns as a detail inset

> **This is a decision, not an option.** It resolves the question §2a left open and
> partially supersedes §3: the "how do map and panel share horizontal space" problem
> largely dissolves, because in card mode they no longer compete for it.

### The model

```text
CARD MODE
  India            →  grid of state cards          (no map)
  State            →  grid of district/PC cards    (no map)
  District / PC    →  grid of AC cards             (no map)
  Leaf (AC/state)  →  DETAIL VIEW
                        podium + KPI strip + charts
                        └─ map inset, scoped to this one region
```

The map stops being the navigation surface and becomes **one component inside a detail
view** — answering "where is this?", not "what do I click next?".

### Why this is the right call

It matches how the map actually earns its keep. A full-screen India choropleth is a
*navigation* device; but at a leaf constituency the useful question is "where is this
place, and what is next to it?" — which a small scoped inset answers just as well as a
full-screen map, at a fraction of the cost.

Three concrete wins:

1. **Card mode becomes genuinely map-free.** No Leaflet on the India/state/district
   grids at all — so those screens are fast, keyboard-navigable, and server-renderable
   in a way a choropleth never is. This is the §2a accessibility argument, fully realised.
2. **§3's width fight mostly disappears.** §3 agonises over a 360px sidebar versus a
   ~318px podium card competing with the map. In card mode there is no map to protect,
   so the detail view can use the full viewport: a 4-across podium fits trivially.
3. **Loading gets cheaper.** Only the leaf detail needs geometry, and only for *one*
   region — not the full state or national GeoJSON.

### What the inset is (and is not)

**Is:** a small, scoped, mostly-static locator. One region's geometry, fitted bounds,
neighbours shown as context, a single `invalidateSize()` after layout settles.

**Is not:** a second full MapView. Do **not** pass the 27-prop MapView signature into a
card. If the inset grows a year selector, a toolbar, and a share button, it has become
the thing card mode was meant to replace.

```ts
interface RegionMapInsetProps {
  geometry: GeoJSONData;          // this region (+ optional neighbours)
  highlightId: string;            // which feature is "this one"
  onExpand?: () => void;          // hand off to full map mode
  interactive?: boolean;          // default false: locator, not navigator
}
```

Reuse `FitBounds` and `MapResizer` from `map-view/` — both are already standalone. Do not
reuse `MapView` itself.

### The trap: MapView is 1,601 lines

`MapView.tsx` is **1,601 lines** — nearly 3x our 600-line rule — and mixes Leaflet
rendering, navigation callbacks, hover/selection state, legend chrome, and a feedback
modal. The inset must *not* be carved out by importing it.

The honest sequencing: extracting a small `RegionMapInset` is the **forcing function** to
split MapView at last. Pull the pure Leaflet-rendering core out from the navigation and
chrome; the inset consumes the core, full map mode consumes core + chrome. Attempting the
inset without this split will end with a second copy of the GeoJSON styling logic, and
the two will drift.

### Consequences to accept

- **Card mode must own drill-down entirely.** Today's drill-down is partly map-click
  driven (`onStateClick`/`onDistrictClick`/`onConstituencyClick`/`onAssemblyClick` at
  `MapView.tsx:103-106`). Cards must invoke the *same* callbacks — not parallel ones — or
  the two surfaces will diverge on selection semantics.
- **A leaf needs a "back to grid" affordance** distinct from the browser back button,
  since the grid is now a real place in the hierarchy.
- **`?surface=cards` must survive drill-down.** Navigating India → TN → Dharapuram inside
  card mode must not silently revert to map mode on any hop.
- **Deep links to a leaf in card mode** must render the detail (with inset) without ever
  mounting the full map.

### Open question deliberately left open

Whether the leaf detail is a *route* (`…/ac/gummidipoondi?surface=cards`) or an expanding
card in place. Route is more consistent with §2 (place = path) and gives free
back-button behaviour; in-place expansion feels more "card-like". **Recommendation:
route** — consistency with the existing URL schema is worth more than the animation.

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
- **Their party colours.** See the correctness warning in §2b — they are wrong, and copying
  them would import a factual error into our design system.

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
- [ ] Mode toggle in the panel header; remembered per session. **Map-first is the
      desktop cold-load default (§2); mobile lands on data-nav.**
- [ ] Sort/filter state in query params (`?sort=margin&party=DMK`) — shareable, but
      places stay in the path. On a deep link specifying both, **the place wins** and the
      ranking applies as a highlight.
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

The organising idea (§2) is that **map-based and data-based navigation are two entry
points to one shared selection** — "what happened here?" and "where did X happen?". The
**map is primary**: the URL already proves it (places are path segments, all 8 query
params are view settings or years — none is a filter), it is our differentiator, and it
degrades better. Data-nav is a first-class peer *entry point*, not a co-equal home
screen — except on mobile, where 390px cannot show adjacency and the default sensibly
inverts. The competitor has only data-nav because they have no map.
We have a strong map and a hidden, broken data path — real analytical navigation exists
today but is trapped inside a blog modal, hardcoded to one state, and wired through a
300ms `setTimeout` race. Fix the shared selection, promote data-nav out of the blog, and
keep every row map-linked. **Hover a candidate, light up the geography — that is the
thing they structurally cannot copy, and it is worth more than the podium.**
