[< Back to index](./README.md)

## 5. Phased plan

### Phase 0 — Stop the bleeding (½ day)
Highest value-per-hour in this document.

- [x] **B2**: Get a CARTO API key, or switch default basemap to an unkeyed provider
      (OSM raster / Stadia). Non-negotiable — everything else is lipstick while
      `API KEY REQUIRED` is tiled 40× across the screen.
- [x] **B1**: Gate `.cache-status` behind `import.meta.env.DEV`.
- [x] **B3 + B4**: Delete the two duplicate `formatNumber`s, export one from
      `shared.ts` using `'en-IN'`, replace all 18 bare `.toLocaleString()` calls.
      One function, one locale, one place.
- [x] **B5**: Rank candidates after filtering NOTA.
- [x] **B6**: Reset panel scroll to top on selection change.
- [x] **B7**: Use a non-destructive active colour for the sidebar toggle.
- [x] **B8**: Correct README's styling documentation to match the hand-written CSS codebase.
- [x] **B9**: Remove the fixed 300ms Blog → AC navigation delay; await the real load promise.
- [x] **T4/T5** (from [§2d](./02d-tnmla-benchmark.md)): Add a "not an official ECI /
      Government source" line plus footer data-provenance and a correction contact.
      Hours of work, and it is the honest counterpart to our booth data being only
      ~71% source-extracted. Credibility asset, not an apology.

**Exit:** app stops looking broken. Ship this alone if the rest gets deprioritized.

**Completed on `fix/ui-phase-0`:** lint, TypeScript, production build, and focused
`formatNumber` tests pass. B5's source-data position gap is handled at display time so
historical JSON remains untouched; the fix applies across all states and years.

### Phase 1 — Consolidate the token layer (1–2 days)
No visual change intended. Pure groundwork. Behaviour-preserving.

- [x] Merge the 3 `:root` blocks into one at the top of the file.
- [x] Add the missing scales: `--space-*` (4/8/12/16/24/32), `--radius-*` (sm 4 / md 8 / lg 12 / pill 999 — collapse 12 values to 4), `--text-*` (**floor at 12px**), `--elev-*` (3 shadows, replacing 93 ad-hoc ones).
- [x] Codemod the repeated hex literals → semantic tokens via `scripts/codemod_css_color_tokens.py`
      (89 replacements; 183 → 94 non-definition literals). Party colors are the exception: they stay
      literal in `partyData.ts`, which is correct and should be the single source. Also deliberately
      left literal: third-party brand colors, alpha-suffixed values like `#6366f115` whose alpha is
      load-bearing, and one-off colors that a token would only obfuscate.
- [x] Split `index.css` into 14 ordered chunks under `src/styles/legacy/` (all <=591 lines), imported by the stable `index.css` entrypoint. The chunks are intentionally mechanical to preserve cascade order; semantic surface renaming (`tokens`, `sidebar`, `map`, etc.) is a later cleanup, not mixed into a behaviour-preserving split.

**Phase 1 progress on `feat/phase-1-css-tokens`:** the duplicate root token block is merged,
the new scales are available, the stylesheet is split into cascade-preserving chunks, and a
conservative first colour pass aliases repeated semantic literals. Full literal codemodding
and semantic surface renaming remain separate follow-up work; party colours and alpha
suffixes were deliberately not touched.

**Phase 1 completion on `feat/phase-1-css-semantic-cleanup`:**

- Fixed a live bug shipped by the earlier aliasing pass: it had rewritten the alias
  *definitions* as well as their call sites, producing self-referential cycles
  (`--legacy-navy: var(--legacy-navy)`). Such a property is invalid at computed-value
  time, so all 97 consuming declarations silently lost their colour. Values were
  recovered by pairing removed/added lines in `76f78e02`.
- Added 23 role-based tokens (named for the job the colour does, not its hue) and
  codemodded 89 call sites.
- The codemod refuses to rewrite the right-hand side of a token definition, which is
  precisely the mistake that caused the cycles, and uses a negative lookahead so
  `#6366f1` cannot match inside `#6366f115` and destroy an alpha channel.
- Verified behaviour-preserving by building before and after, fully resolving every
  token in both bundles, and diffing: **all rules byte-identical (109,609 bytes each)**.
  The only bundle difference is the `:root` block, which is where the new definitions live.
- Browser-verified: all 23 tokens resolve to non-empty hex, layout intact
  (map 920×720, not height 0), no console errors. 663 tests and `tsc` pass.

**Exit:** the remaining 94 literals are one-offs, brand colours and alpha-suffixed values,
all intentionally left alone — tokenising them would produce a hex dictionary, not a design
system. Verified no unintended change by resolving tokens in the built bundle and diffing
rules byte-for-byte, which is stronger than a screenshot comparison.

### Phase 2 — Shared selection + responsive panel width (4–5 days)
The structural change. **Read §2 and §3 first.**

- [x] **`selectLocation()` as the single selection entry point.** One async function that
      awaits geography then commits selection; map clicks, browse-list clicks, search
      results and data-nav rows all call it. **Fixes B9** and removes the 300ms guess.
      Everything else in this phase depends on it.
      <br>**Landed in `6588ff24`** (`src/hooks/useSelectLocation.ts`). This was not merely
      tidying — the duplicated paths had *drifted*, so search was carrying real bugs the
      map-click path did not:

      | target | step missing from search |
      |---|---|
      | state | `clearElectionResult`, `clearPCElectionResult`, PC-year repair |
      | pc | `selectAssembly(null)`, `clearElectionResult`, `getPCResult` |
      | district | `selectAssembly(null)` |

      All also skipped analytics. Net effect: searching a PC left the previous AC
      highlighted with its panel open and showed no PC results at all. `SelectionTarget`
      is a discriminated union so the compiler rejects half-specified targets;
      `ensureAssembliesView` is an explicit caller decision because search must load the
      statewide layer while a map click inside a PC must not. Browser-verified that both
      routes now produce identical panel content and identical URLs. App.tsx −135 lines.
- [x] **Panel width modes.** `--panel-w` token driving 360 / 520 / ~900px, switched by
      *navigation mode* (§2), animated, with a user override that sticks. Below 1152px
      viewport, stay at 360px.
      <br>**Landed in `745664a2`.** `resolvePanelMode()` (`src/utils/panelMode.ts`) is a
      pure function, so the CSS selectors and any future card surface cannot disagree
      about the answer. Two deliberate refinements to the spec:
      <br>• deep-dive is `min(900px, 62vw)`, not a flat 900px — on a 1280px screen a flat
      value would leave the map a sliver. Measured 892.797px at 1440px.
      <br>• the 1152px floor **outranks the user override**, because it is a hard
      constraint rather than a preference; honouring an override there would squeeze the
      map below its usable minimum.
      <br>The override ships as a real control (`PanelWidthToggle`, `aria-pressed`,
      hidden rather than disabled below the breakpoint). Tab and override both reset on
      selection change so a stale `booths` cannot hold the next constituency at full
      width. Verified in-browser at all three widths, the floor, and the toggle.
- [x] `<ResultPodium>` — **2×2 grid** (Winner/Runner-up/3rd/Margin), party-coloured left
      border, vote count dominant, share % secondary. Collapses to one row at 360px. (S1)
      <br>**Landed in `10bacc35`.** Explicit 2×2 rather than `auto-fit`: auto-fit gave
      3-across at 520px, orphaning Margin onto its own row and breaking the paired
      Winner/Runner-up reading.
- [x] `<KpiStrip>` — Total / Valid / NOTA / Rejected / Winner-led / Runner-led / Booths,
      **wrapping to 2 rows**, never 7 across. (S1, S2)
      <br>**Landed in `10bacc35`.** Unknown values render as an *absent cell*, never a
      fabricated `0`. Booth-lead counts reuse `computeBoothwiseAnalysis` so the strip and
      the Analysis tab cannot disagree about the same number.
      <br>** Data bug found and worked around — needs a real fix upstream.** Four TN 2021
      booth files record the runner-up's per-booth votes as a few hundred against an
      official total in the tens of thousands:

      | AC | party | official | booth-sum |
      |---|---|---:|---:|
      | Bargur | ADMK | 84,642 | 107 |
      | Gummidipundi | PMK | 75,514 | 196 |
      | Kalasapakkam | ADMK | 84,912 | 239 |
      | Singanallur | DMK | 70,390 | 135 |

      Summed booth leads therefore claimed the winner led **350 of 350** booths in a race
      won 49.2–42.8. `dataQuality.acTotalsReconciled` does *not* catch these — it is absent
      on exactly these files. `selectKpiValues` now cross-checks the top two candidates'
      booth columns against the official totals and suppresses the lead cells on
      disagreement (7 of 234 TN 2021 ACs; the other 227 are unaffected). **This is a UI
      guard, not a data fix** — the underlying booth files are still wrong and the Booths
      and Analysis tabs still read from them. **Fixed at source in `8c72e4c4`, below.**
- [x] **Fix the corrupt booth columns at source.** **Done in `8c72e4c4`.**
      <br>Root cause: `scripts/fix-final-postal-booth-100-percent-2021.py` (commit
      `eba47f73`, "Achieve 100% match rate") keyed its official-results lookup by
      candidate *name*:

      ```python
      official_candidates = {c['name']: c for c in ac_data['candidates']}
      ```

      Thirteen TN 2021 ACs ran two candidates with the same normalised name, so the later
      overwrote the earlier. The script then "corrected" the real candidate's booth column
      down to the namesake's total and rescaled every row total to suit — reconciling
      perfectly against the wrong target, which is why it self-reported 100% success.
      <br>`scripts/restore_2021_duplicate_name_columns.py` restores the columns from
      `6b6dd162`, rescaling for the differing postal convention (that commit stores
      `column == official`; current files store `column + postal == official`). Only
      genuinely clobbered columns are touched; 3 of 12 eligible ACs proved healthy and
      were left alone. Bargur went from `350 / 0` to `211 / 139` of 350 booths. ACs
      passing the trust check: 227 → 233.
- [ ] **TN-181 Thirumayam**: its 2021 booth file holds **TN-234's** booth IDs and a
      different candidate list entirely. Excluded from the restore above and still covered
      by the `selectKpiValues` guard. Needs its own investigation.
- [ ] Consider promoting the `selectKpiValues` trust check into a shared data-quality
      helper, now that it has caught a real fault `dataQuality.acTotalsReconciled` missed.
- [x] `<CandidateBars>` — ranked horizontal bars beside the table. (S4)
      <br>**Landed in `436762b4`, corrected in `ae3b8167`.** Implemented as a background
      fill *behind* each row rather than a separate column: the panel is 360px in browse
      mode and a second column would squeeze the candidate names. Bars scale **relative to
      the leader**, so a 38-vs-35 race reads as the near-tie it is rather than two stubs.
      <br>Three defects the DOM assertions passed over, caught only by reading the
      rendered screenshot:
      <br>• every candidate got a bar, down to **0.45px** — a smudge behind the 24px rank
      column. 11 of 14 Bargur rows were narrower than that column. Bars under 6% are now
      dropped (the `%` column is still exact); deliberately *not* rounded up to a visible
      minimum, which would overstate small candidates.
      <br>• bars started at `x=0`, behind the rank digit, reading as a selection
      highlight. They now start after the rank column on a common origin.
      <br>• that inset forced `width%` → `scaleX` inside a fixed track, since a percentage
      width still measures the whole row and would have silently overstated every bar.
      Ratios verified intact afterwards (ADMK/DMK `0.87045` vs expected `0.86992`).
- [x] Reorder: **Podium → KPI strip → charts → full candidate table.**
      <br>Done as part of `10bacc35`; bars are integrated into the table rather than
      sitting as a separate chart block between the strip and the table.
- [x] Real tab bar at ≥520px (`role="tablist"`/`tab`/`tabpanel`, arrow-key nav), keeping
      `<select>` at 360px and mobile.
      <br>**Landed in `436762b4`.** Full APG pattern: arrow keys move and wrap, Home/End
      jump to the ends, roving `tabindex` keeps only the active tab in the page tab order.
      <br>Threshold is **460px measured on the panel itself** via `ResizeObserver`, not
      ≥520px on the viewport — panel width is set by the panel-mode token *and* the user's
      width override, so a viewport query would offer tabs while the user has deliberately
      narrowed the panel. Unknown width degrades to the select. `role="tabpanel"` is
      applied only while the tablist is rendered, or `aria-labelledby` would point at a
      tab that does not exist.
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
