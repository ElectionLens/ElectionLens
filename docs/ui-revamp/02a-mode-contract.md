[< Back to index](./README.md)

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
