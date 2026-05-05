# Assam assembly constituency boundaries (source bundle)

## Triage summary (2026-04)

| Tier | Candidate | Result |
|------|-----------|--------|
| A | ECI delimitation orders (eci.gov.in) | Final 2023 documents are PDF-centric; no stable public GeoJSON/Shapefile bundle for Assam AC polygons was found. |
| A | Assam CEO (ceoassam.nic.in) | Maps and PDFs; no AC polygon shapefile download located. |
| B | DataMeet / ECI GIS-derived layers ([datameet/maps](https://github.com/datameet/maps)) | **Used.** National AC GeoJSON (`docs/data/geojson/ac.geojson`) filtered to `ST_CODE` 18 / Assam. Same lineage as historic ECI `GIS_AC_Data` shapefiles. |

## Chosen artifact

- **File in repo:** `assam-ac.geojson` (133 raw features → **126** after dedupe by `AC_NO` in `scripts/replace-assam-ac-geojson.mjs`).
- **Upstream URL:** `https://raw.githubusercontent.com/datameet/maps/master/docs/data/geojson/ac.geojson`
- **License:** [MIT](https://raw.githubusercontent.com/datameet/maps/master/LICENSE) (DataMeet India community, 2020).
- **Delimitation label in app:** **`2024`** — reflects **post‑2023** boundaries (Desktop/Eci-derived GeoJSON or refreshed layers). The DataMeet national snapshot alone may still lag the full 2023 legal order; prefer replacing `assam-ac.geojson` or pass `--input=/path/to/assam.geojson` when you have a newer extract.

## Refresh upstream snapshot

```bash
node scripts/fetch-datameet-assam-ac-geojson.mjs
```

Then merge into the app dataset:

```bash
node scripts/replace-assam-ac-geojson.mjs
```

After replacing Assam **assembly** polygons (e.g. from Desktop), align **Lok Sabha** PC shapes and `PC_NO` on each AC for PC 2024 / assembly 2026 views:

```bash
npm run data:assam-sync-assembly-pc
```

This uses each AC’s centroid inside the **last-committed** Assam PC map from git, then dissolves ACs by seat 1–14. Set `ASSAM_PC_BASE_REF` if you need a different base PC layer.
