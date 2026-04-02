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
- **Vintage caveat:** Layer attributes include `STATUS: "Pre delimitation"` on samples; Assam’s **2023 delimitation** adjusted reservations and some geography. This geometry is the best **open, downloadable** national AC layer we could wire in without a manual desktop file. When ECI or Assam CEO publishes an authoritative post-2023 AC shapefile, replace `assam-ac.geojson` and re-run the replace script.

## Refresh upstream snapshot

```bash
node scripts/fetch-datameet-assam-ac-geojson.mjs
```

Then merge into the app dataset:

```bash
node scripts/replace-assam-ac-geojson.mjs
```
