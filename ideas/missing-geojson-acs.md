# Assembly Constituencies GeoJSON Status

**Last updated:** April 2026  
**Summary:** Every **schema** assembly constituency either has at least one GeoJSON feature **or** is listed below as a **known gap**. Orphan features (boundaries not in the schema) have been removed from the master file.

---

## Coverage vs schema (`assemblyConstituencies`)

| Metric | Count | Notes |
|--------|------:|------|
| ACs in `schema.json` | 4,074 | Source of truth for the app |
| Features in `constituencies.geojson` (Apr 2026) | 4,124 | After orphan cleanup + Assam dedupe |
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

**Note:** The file may still have **duplicate `schemaId` rows** for some **JK** and **AR** features from earlier merges. **Assam** was consolidated to **one feature per `schemaId`** via `scripts/replace-assam-ac-geojson.mjs` (Apr 2026).

### 2. Assam — post‑2023 assembly boundaries

**Done (pipeline):** `scripts/replace-assam-ac-geojson.mjs` merges Assam AC polygons (DataMeet bundle and/or **Desktop `assam.geojson`**), dedupes by `AS-*`, and sets **`delimitation: 2024`** on Assam in `schema.json` and `public/data/elections/ac/AS/index.json` (year labels **boundaries after the 2023 round**, not the old 2008 vintage).

**Caveat:** Until ECI or Assam CEO publishes a single canonical shapefile, verify boundaries against your source of truth. See `scripts/data-sources/assam-ac-datameet/README.md`.

---

## Completed in-repo work

### Orphan feature cleanup (April 2026)

Removed **44** features whose `schemaId` was **not** in `assemblyConstituencies` — mostly legacy **Andhra Pradesh** ACs (pre-Telangana) plus `AP-217`, `AP-219`, `AP-270`, `ML-023` (those ids appear elsewhere in the schema for non-AC keys but are not assembly rows).

### Gujarat (January 2025)

28 new ACs from 2022 delimitation — `scripts/replace-gujarat-ac-geojson.mjs`.

### MP and Sikkim

Verified: all schema ACs for **MP** and **SK** have GeoJSON coverage (no missing ids).

### Assam AC boundaries (April 2026)

126 ACs: fetch `npm run data:assam-ac:fetch`, merge `npm run data:assam-ac:replace` — see `scripts/replace-assam-ac-geojson.mjs`.

---

## Follow-ups (optional cleanup)

### Features without `schemaId`

There are still **22** polygons with **no** `schemaId` (mostly `AC_NO === 0`, empty `AC_NAME`) in AP, Goa, Karnataka, Maharashtra, Sikkim. They are not referenced by the app by id; consider deleting or assigning ids in a dedicated pass if they cause map glitches.

### Duplicate `schemaId` polygons

Multiple features share the same `schemaId` for a subset of **JK** and **AR** rows. Consolidate to one feature per id when touching those states. (**Assam** addressed Apr 2026.)

---

## Data sources

| Source | URL | Used for |
|--------|-----|----------|
| DataMeet | [github.com/datameet/maps](https://github.com/datameet/maps) (`docs/data/geojson/ac.geojson`, MIT) | Most state boundaries; **Assam AC** subset in `scripts/data-sources/assam-ac-datameet/` |
| ECI | eci.gov.in | Official delimitation |
| User-provided | Local / Desktop files | Gujarat 2022, J&K merge script inputs, Assam PC (`add-assam-pc-geojson.mjs`) |

---

## Historical notes

Older versions of this file claimed “100% GeoJSON coverage” and listed `cleanup-legacy-ap-acs.mjs` as TODO. The **orphan** cleanup is now **`scripts/cleanup-assembly-geojson-orphans.mjs`**. True **per-schema-id** coverage still requires filling the **15 J&K** polygons.

Assam AC refresh is **`scripts/replace-assam-ac-geojson.mjs`** (replacing the stale `add-assam-ac-geojson.mjs` roadmap name). PC-level Assam work remains **`scripts/add-assam-pc-geojson.mjs`**.
