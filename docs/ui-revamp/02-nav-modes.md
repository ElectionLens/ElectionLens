[< Back to index](./README.md)

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
