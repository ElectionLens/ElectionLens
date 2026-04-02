# Assembly Constituencies GeoJSON Status

**Last updated:** April 2026  
**Summary:** Every **schema** assembly constituency either has at least one GeoJSON feature **or** is listed below as a **known gap**. Orphan features (boundaries not in the schema) have been removed from the master file.

---

## Coverage vs schema (`assemblyConstituencies`)

| Metric | Count | Notes |
|--------|------:|------|
| ACs in `schema.json` | 4,074 | Source of truth for the app |
| Features in `constituencies.geojson` (Apr 2026) | 4,131 | After orphan cleanup |
| Schema ACs with **no** GeoJSON feature | **15** | All **J&K** — see below |
| Orphan features (removed Apr 2026) | 0 | Was 44; see cleanup script |

Run a CI-style check (fails if orphans reappear):

```bash
node scripts/cleanup-assembly-geojson-orphans.mjs --ci
```

Remove orphan features (dry-run without `--write`):

```bash
node scripts/cleanup-assembly-geojson-orphans.mjs
node scripts/cleanup-assembly-geojson-orphans.mjs --write
```

---

## Open gaps

### 1. Jammu & Kashmir — 15 ACs in schema, no polygon

These ids exist in `schema.json` but have **no** feature with matching `properties.schemaId` in `public/data/geo/assembly/constituencies.geojson`:

`JK-092`, `JK-094`, `JK-095`, `JK-096`, `JK-098`, `JK-100`, `JK-101`, `JK-102`, `JK-105`, `JK-106`, `JK-107`, `JK-109`, `JK-110`, `JK-111`, `JK-112`

**To fix:** Extend the same J&K delimitation source used in `scripts/add-jk-ac-geojson.mjs` (or an official 2024 shapefile), map `seat_id` → `schemaId`, merge into the master GeoJSON, then dedupe if needed.

**Note:** The file still has **duplicate `schemaId` rows** for some other JK (and a few Assam / Arunachal) features from earlier merges. That is separate from “missing”; the map layer should prefer a single feature per id (verify in app).

### 2. Assam — 2023 delimitation vs 2008 boundaries

Boundaries in the dataset still reflect **pre-2023** delimitation. Schema / PC naming and 2024 Lok Sabha AC splits may not line up with current ECI geography.

**To fix:** Source post-2023 Assam AC (and PC) GeoJSON, update schema + mappings, then refresh election data as needed. See also `ideas/delimitation-handling.md`.

---

## Completed in-repo work

### Orphan feature cleanup (April 2026)

Removed **44** features whose `schemaId` was **not** in `assemblyConstituencies` — mostly legacy **Andhra Pradesh** ACs (pre-Telangana) plus `AP-217`, `AP-219`, `AP-270`, `ML-023` (those ids appear elsewhere in the schema for non-AC keys but are not assembly rows).

### Gujarat (January 2025)

28 new ACs from 2022 delimitation — `scripts/replace-gujarat-ac-geojson.mjs`.

### MP and Sikkim

Verified: all schema ACs for **MP** and **SK** have GeoJSON coverage (no missing ids).

---

## Follow-ups (optional cleanup)

### Features without `schemaId`

There are still **22** polygons with **no** `schemaId` (mostly `AC_NO === 0`, empty `AC_NAME`) in AP, Goa, Karnataka, Maharashtra, Sikkim. They are not referenced by the app by id; consider deleting or assigning ids in a dedicated pass if they cause map glitches.

### Duplicate `schemaId` polygons

Multiple features share the same `schemaId` for a subset of **JK**, **AS**, and **AR** rows. Consolidate to one feature per id when touching those states.

---

## Data sources

| Source | URL | Used for |
|--------|-----|----------|
| DataMeet | datameet.org | Most state boundaries |
| ECI | eci.gov.in | Official delimitation |
| User-provided | Local / Desktop files | Gujarat 2022, J&K merge script inputs |

---

## Historical notes

Older versions of this file claimed “100% GeoJSON coverage” and listed `cleanup-legacy-ap-acs.mjs` as TODO. The **orphan** cleanup is now **`scripts/cleanup-assembly-geojson-orphans.mjs`**. True **per-schema-id** coverage still requires filling the **15 J&K** polygons and updating **Assam** to 2023 delimitation when data is available.

The feature roadmap reference to `scripts/add-assam-ac-geojson.mjs` is stale; this repo has **`scripts/add-assam-pc-geojson.mjs`** for PC-level Assam work — AC-level Assam refresh still needs a new pipeline once boundaries are sourced.
