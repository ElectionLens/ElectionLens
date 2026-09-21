[< Back to index](./README.md)

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

The next analytical layer should borrow one more pattern from the stock-picker benchmark:
**separate narrowing from ranking**. Hard filters must say why records are excluded;
sorting must only reorder survivors. Add live facet counts where data supports them,
removable filter chips, explicit `matching → shown` accounting, and evidence-linked
“why” details. Pair that with a dense, virtualized **Excel-like table per election year**
for researchers who need sortable columns, frozen constituency identity, column selection,
and metadata-aware export—not just cards. Save the full query and data snapshot in the
URL/preset so a shared view means the same thing tomorrow. An agent, if added later, may
translate natural language into this structured state, but it must remain an explanation
layer—not the source of truth.
