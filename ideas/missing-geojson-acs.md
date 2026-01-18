# Assembly Constituencies GeoJSON Status

**Last Updated:** January 2025  
**Status:** ⚠️ MOSTLY COMPLETE (delimitation issues remain)

---

## Current Coverage

| Metric | Count | Status |
|--------|-------|--------|
| ACs in Schema | 4,074 | |
| ACs with GeoJSON | 4,118 | ✅ |
| **GeoJSON Coverage** | **100%** | ✅ |
| Assam 2023 delimitation | Outdated | ⚠️ |

All assembly constituencies in the schema have GeoJSON boundary data, but **Assam boundaries are from 2008** and don't reflect the 2023 delimitation changes.

---

## Recent Updates

### Gujarat (January 2025) ✅

Added 28 new ACs from 2022 delimitation using `gujarat_AC.geojson`:

**Ahmedabad splits (12):**
| Schema ID | Name | AC# |
|-----------|------|-----|
| GJ-045 | NARANPURA | 45 |
| GJ-046 | NIKOL | 46 |
| GJ-047 | NARODA | 47 |
| GJ-048 | THAKKAR BAPANAGAR | 48 |
| GJ-049 | BAPUNAGAR | 49 |
| GJ-050 | AMRAIWADI | 50 |
| GJ-051 | DARIYAPUR | 51 |
| GJ-052 | JAMALPUR-KHADIA | 52 |
| GJ-053 | MANINAGAR | 53 |
| GJ-054 | DANILIMDA | 54 |
| GJ-055 | SABARMATI | 55 |
| GJ-056 | ASARWA | 56 |

**Surat splits (8):**
| Schema ID | Name | AC# |
|-----------|------|-----|
| GJ-160 | SURAT NORTH | 160 |
| GJ-161 | VARACHHA ROAD | 161 |
| GJ-162 | KARANJ | 162 |
| GJ-163 | LIMBAYAT | 163 |
| GJ-164 | UDHNA | 164 |
| GJ-165 | MAJURA | 165 |
| GJ-166 | KATARGAM | 166 |
| GJ-167 | SURAT WEST | 167 |

**Script:** `scripts/replace-gujarat-ac-geojson.mjs`

### Jammu & Kashmir ✅

90 ACs from 2024 delimitation already present with schemaIds (JK-001 to JK-090).

### Assam ✅

133 ACs present in GeoJSON (126 in schema) - complete coverage.

---

## ⚠️ Delimitation Issues

### Assam 2023 Delimitation

Assam underwent delimitation in **2023** but our data still reflects **2008 boundaries**.

| Issue | Current | Should Be |
|-------|---------|-----------|
| Delimitation year | 2008 | 2023 |
| PCs in schema | 12 | 14 |
| PC-to-AC mapping | 5 broken | All mapped |

**Renamed PCs:**
- Mangaldoi → Darrang-Udalguri
- Kaliabor → Kaziranga  
- Autonomous District → Diphu
- Tezpur → Sonitpur

**Impact:**
- 2024 Lok Sabha results cannot show AC-wise breakdown
- PC boundaries in GeoJSON are outdated
- AC boundaries may not match current reality

**To fix:**
1. Source new Assam AC/PC GeoJSON (post-2023 delimitation)
2. Update schema with new PC names and AC mappings
3. Add 2024 PC election data

---

## Cleanup Opportunity

### Legacy Andhra Pradesh Constituencies

44 ACs in GeoJSON but NOT in schema (pre-Telangana split):

```
AP-120 to AP-175 (approximately)
```

These are old AP constituencies before Telangana was carved out in 2014. They can be safely removed from `constituencies.geojson` as a cleanup task.

**To clean up:**
```bash
# Remove AP ACs not in schema
node scripts/cleanup-legacy-ap-acs.mjs  # TODO: create this script
```

---

## Data Sources

| Source | URL | Used For |
|--------|-----|----------|
| DataMeet | datameet.org | Most state boundaries |
| ECI | eci.gov.in | Official delimitation data |
| User-provided | Desktop files | Gujarat 2022 delimitation |

---

## Historical Notes

This file previously tracked missing GeoJSON for:
- ~~Assam (126 ACs)~~ - Actually present
- ~~Gujarat (28 ACs)~~ - Fixed January 2025
- ~~J&K (25 ACs)~~ - Actually present (90 ACs total)
- ~~MP (4 ACs)~~ - Indore splits - verify status
- ~~Sikkim (1 AC)~~ - Sangha constituency - verify status

The original gaps were due to:
1. Name matching issues between GeoJSON and schema
2. Missing schemaId properties in some features
3. Actual missing boundaries (Gujarat 2022 delimitation)

---

*File updated after Gujarat GeoJSON integration*
