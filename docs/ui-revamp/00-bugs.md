[< Back to index](./README.md)

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
