[< Back to index](./README.md)

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
