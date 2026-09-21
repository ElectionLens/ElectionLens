[< Back to index](./README.md)

# Filtering, ranking, and reproducible discovery

**Source inspiration:** [Building an Agentic Stock Picker with Anthropic](https://gigadom.in/2026/09/21/building-an-agentic-stock-picker-with-anthropic/) (21 Sep 2026).

The transferable idea is not “add an AI stock picker.” It is to make the discovery
pipeline explicit:

> **Eligibility filters → deterministic shortlist → transparent ranking → evidence-linked explanation → reproducible saved run**

ElectionLens should apply that pattern to constituencies and election results. The
source article uses hard filters before scoring; our UI should make the equivalent
separation visible instead of presenting one opaque “important” result.

## 1. Two filter lanes

### Narrow results — hard eligibility

These remove records from the matching set:

- Election year and election type
- Electoral level (Parliament / Assembly)
- State, district, PC, and AC
- Party, candidate, gender, and reservation category where data exists
- Minimum turnout, maximum winning margin, and minimum vote share
- Data completeness / verification status

A missing value must not pass a numeric filter as zero or neutral. The result summary
must distinguish **failed threshold**, **missing data**, and **not applicable**.

### Sort and prioritize — ranking only

These reorder eligible records without removing them:

- Closest contests / smallest margin
- Largest margin
- Highest turnout
- Highest NOTA share
- Largest vote-share swing
- Party turnover or contest fragmentation
- Data completeness or recency

The UI must name the metric and direction: “Top 20 by smallest winning margin,” not
“Top constituencies.”

## 2. Result accounting

Keep the funnel visible beside the result count:

> `543 constituencies → 214 match filters → 20 shown`

When possible, expose exclusion reasons:

> `329 excluded · 210 outside geography · 74 failed turnout · 45 missing required data`

This is especially important for cross-state comparisons: uneven data availability
must not masquerade as an electoral pattern.

## 3. Facets and progressive disclosure

Use a filter rail on desktop and a filter drawer on mobile. Start with Election,
Geography, Level, Search, and the common contest filters. Put less frequent controls
under labelled groups:

- **Contest competitiveness** — margin and vote-share bands
- **Participation** — turnout and NOTA
- **Party performance** — winner, runner-up, swing, turnover
- **Candidate profile** — candidate and demographic fields when populated
- **Data quality** — completeness, reconciliation, and verification

Facet options should show live counts where the underlying dataset supports them. Use
three separate states: `0 matching`, `No data available`, and `Not applicable`.
Only show context-valid facets (for example, booth controls only when trustworthy booth
records and identifiers are available). Do not imply booth geography until location data
is actually enriched; current booth rows have no coordinates or geometry.

Active filters become removable, accessible chips:

- `Year: 2021`
- `Level: Assembly`
- `State: Tamil Nadu`
- `Winning margin: 0–2 percentage points`
- `Sort: Closest contests`

Each chip needs an explicit remove label and a grouped clear action. On small screens,
collapse excess chips into `+N filters` and open the summary in the drawer.

## 4. Election-year table view

Each selected election year gets a dedicated **Table** view: a dense, Excel-like grid for
researchers who need to scan many constituencies without opening cards one by one. The
year selector is part of the table context, so the header should always say what is
loaded, for example `Tamil Nadu · Assembly · 2021`.

The table should support:

- Sticky header and frozen identity columns (constituency, district, and optionally
  party/winner) while the remaining metrics scroll horizontally.
- Virtualized rows for statewide and booth-scale datasets; never render thousands of
  DOM rows just because the user opened a tab.
- Column chooser and sensible year/level-specific defaults. Hide unsupported fields
  rather than filling them with fake zeroes.
- Sortable columns with clear direction and type-aware formatting: Indian digit
  grouping, percentages, margins, and dates.
- Resizable columns, compact/comfortable density, and a visible row count.
- Keyboard navigation, semantic table headers, focus indication, and a non-colour-only
  indication for sorted columns. On mobile, use a responsive column subset plus a
  row-detail drawer rather than an unreadable miniature spreadsheet.
- Export of the currently filtered result set, with the active election year, filters,
  ranking, data snapshot, and methodology metadata attached. Export is not a substitute
  for the accessible on-screen table.

The table and map/list must consume the same filtered dataset and selection state. A
user changing `Margin`, `Party`, or `Sort` in one surface should see the same matching
count and active chips in the others. Switching years must reset only year-incompatible
filters, explain what was cleared, and never silently carry an Assembly filter into a
Parliament dataset.

The table is a research surface, not a second source of truth: every derived column
needs a definition in the column help or detail drawer, and missing/unavailable values
remain visibly distinct from zero.

## 5. Explainability without opaque scoring

A result row or detail drawer should expose **Why included?** and **Why ranked here?**
For a closest-contest result, show margin in votes, margin share, comparison scope,
election date, calculation definition, and source record. If several dimensions matter,
show them separately (competitiveness, turnout, swing, data completeness) rather than
one unexplained score.

Generated summaries, if added later, remain an explanation layer over deterministic
calculations. They must not invent results, silently change formulas, treat missing data
as a pass, or mix election levels without confirmation. A compact “What would change
this?” disclosure should identify fragile assumptions such as boundary compatibility,
party normalization, denominator choice, or a corrected source record.

## 6. Saved runs and shareable state

A saved preset should include more than visible chips:

- Election/geography and all hard filters
- Ranking metric and direction
- Displayed columns, map layer, and comparison election
- Data snapshot/update date and methodology version

Show when it was saved and last recalculated. Serialize the same state into a shareable
URL, while preserving the existing rule that place segments stay in the path and view
settings belong in query parameters. Example:

`?level=ac&year=2021&margin_max=2&sort=margin_asc`

A deep link with a selected place still wins for navigation; the ranking applies to the
result context or highlight, as already proposed in Phase 2.

## 7. Delivery order and acceptance criteria

1. Extract analytical lists into a reusable metric-driven list.
2. Add hard-filter state and URL serialization.
3. Add visible chips, result accounting, and exclusion reasons.
4. Add ranking controls and metric-labelled empty states.
5. Add responsive filter drawer and context-aware facets.
6. Build the large election-year table view and shared column definitions.
7. Add saved presets only after query state is stable.

Acceptance criteria:

- A user can tell whether a record is absent because it failed, is missing data, or is
  not applicable.
- Clearing one chip preserves every other filter.
- Changing sort never changes the matching count.
- Refreshing or sharing a URL reproduces the same filter and ranking state for the same
  data snapshot.
- The table, map, and cards show the same matching count and active filter state.
- Each election-year table remains usable with thousands of rows through virtualization,
  sticky identity columns, and horizontal scrolling.
- Exported rows identify the election year, filters, ranking, snapshot, and methodology.
