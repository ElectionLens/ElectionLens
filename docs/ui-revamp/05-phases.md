[< Back to index](./README.md)

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
