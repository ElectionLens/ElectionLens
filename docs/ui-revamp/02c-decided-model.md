[< Back to index](./README.md)

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
