# Assembly Constituencies Missing GeoJSON Boundaries

These ACs were removed from the schema because GeoJSON boundary data is not available.
They have election data but cannot be displayed on the map.

**Add these back when official GeoJSON boundaries become available.**

---

## ⚠️ CRITICAL: Assam (126 ACs) - ENTIRE STATE MISSING

Assam assembly constituency GeoJSON data is **completely missing** from `constituencies.geojson`.
The 126 ACs are in the schema and have election data, but no map boundaries exist.

**Impact**: Navigating to any Assam AC shows "Unknown" on hover because `AC_NAME` property is missing.

**URL Example**: `/assam/pc/kokrajhar` - assemblies display but hover shows "Unknown"

**Priority**: HIGH - Source Assam AC boundaries from ECI or DataMeet.

---

## Gujarat (28 ACs) - 2022 Delimitation

New constituencies created by splitting existing ones. No official boundary data released yet.

| Schema ID | Name | AC# | Notes |
|-----------|------|-----|-------|
| GJ-045 | NARANPURA | 45 | Split from Ahmedabad area |
| GJ-046 | NIKOL | 46 | Split from Ahmedabad area |
| GJ-047 | NARODA | 47 | Split from Ahmedabad area |
| GJ-048 | THAKKARBAPA NAGAR | 48 | Split from Ahmedabad area |
| GJ-049 | BAPUNAGAR | 49 | Split from Ahmedabad area |
| GJ-050 | AMRAIWADI | 50 | Split from Ahmedabad area |
| GJ-051 | DARIAPUR | 51 | Split from Ahmedabad area |
| GJ-052 | JAMALPUR-KHADIA | 52 | Split from Ahmedabad area |
| GJ-053 | MANINAGAR | 53 | Split from Ahmedabad area |
| GJ-054 | DANILIMDA | 54 | Split from Ahmedabad area |
| GJ-055 | SABARMATI | 55 | Split from Ahmedabad area |
| GJ-056 | ASARWA | 56 | Split from Ahmedabad area |
| GJ-057 | Daskroi | 57 | New constituency |
| GJ-058 | Dholka | 58 | New constituency |
| GJ-059 | Dhandhuka | 59 | New constituency |
| GJ-060 | Dasada (SC) | 60 | New constituency |
| GJ-061 | Limbdi | 61 | New constituency |
| GJ-062 | Wadhwan | 62 | New constituency |
| GJ-063 | Chotila | 63 | New constituency |
| GJ-064 | Dhrangadhra | 64 | New constituency |
| GJ-160 | SURAT NORTH | 160 | Split from Surat |
| GJ-161 | VARACHHA ROAD | 161 | Split from Surat |
| GJ-162 | KARANJ | 162 | Split from Surat |
| GJ-163 | LIMBAYAT | 163 | Split from Surat |
| GJ-164 | UDHNA | 164 | Split from Surat |
| GJ-165 | MAJURA | 165 | Split from Surat |
| GJ-166 | KATARGAM | 166 | Split from Surat |
| GJ-167 | SURAT WEST | 167 | Split from Surat |

---

## Jammu & Kashmir (25 ACs) - 2024 Delimitation

New constituencies from the 2024 J&K delimitation. First election held in 2024.

| Schema ID | Name | AC# | Notes |
|-----------|------|-----|-------|
| JK-088 | TREHGAM | 88 | New constituency |
| JK-089 | WAGOORA - KREERI | 89 | New constituency |
| JK-090 | LAL CHOWK | 90 | New constituency |
| JK-091 | CHANNAPORA | 91 | New constituency |
| JK-092 | CENTRAL SHALTENG | 92 | New constituency |
| JK-093 | CHRAR-I-SHARIEF | 93 | New constituency |
| JK-094 | ZAINAPORA | 94 | New constituency |
| JK-095 | D.H. PORA | 95 | New constituency |
| JK-096 | ANANTNAG WEST | 96 | New constituency |
| JK-097 | SRIGUFWARA - BIJBEHARA | 97 | New constituency |
| JK-098 | SHANGUS - ANANTNAG EAST | 98 | New constituency |
| JK-099 | PADDER - NAGSENI | 99 | New constituency |
| JK-100 | BHADARWAH | 100 | New constituency |
| JK-101 | DODA WEST | 101 | New constituency |
| JK-102 | SHRI MATA VAISHNO DEVI | 102 | New constituency |
| JK-103 | UDHAMPUR WEST | 103 | New constituency |
| JK-104 | UDHAMPUR EAST | 104 | New constituency |
| JK-105 | JASROTA | 105 | New constituency |
| JK-106 | RAMGARH | 106 | New constituency |
| JK-107 | R. S. PURA - JAMMU SOUTH | 107 | New constituency |
| JK-108 | BAHU | 108 | New constituency |
| JK-109 | JAMMU NORTH | 109 | New constituency |
| JK-110 | KALAKOTE - SUNDERBANI | 110 | New constituency |
| JK-111 | BUDHAL | 111 | New constituency |
| JK-112 | THANNAMANDI | 112 | New constituency |

---

## Madhya Pradesh (4 ACs) - Indore Splits

Indore constituency split into multiple parts.

| Schema ID | Name | AC# | Notes |
|-----------|------|-----|-------|
| MP-205 | Indore-2 | 205 | Split from Indore |
| MP-206 | Indore-3 | 206 | Split from Indore |
| MP-207 | Indore-4 | 207 | Split from Indore |
| MP-208 | Indore-5 | 208 | Split from Indore |

---

## Sikkim (1 AC)

| Schema ID | Name | AC# | Notes |
|-----------|------|-----|-------|
| SK-032 | SANGHA | 32 | Buddhist monk constituency |

---

## How to Add These Back

1. **Source GeoJSON boundaries** from:
   - Election Commission of India (ECI)
   - Survey of India
   - State election commission websites
   - DataMeet community (https://datameet.org)

2. **Add to `public/data/geo/assembly/constituencies.geojson`**:
   ```json
   {
     "type": "Feature",
     "properties": {
       "ST_NAME": "GUJARAT",
       "AC_NO": 45,
       "AC_NAME": "NARANPURA",
       "schemaId": "GJ-045"
     },
     "geometry": { ... }
   }
   ```

3. **Re-add to schema** (`public/data/schema.json`):
   ```json
   "GJ-045": {
     "id": "GJ-045",
     "stateId": "GJ",
     "pcId": "GJ-XX",
     "acNo": 45,
     "name": "NARANPURA",
     "type": "GEN",
     ...
   }
   ```

4. **Run validation**:
   ```bash
   node scripts/validate-all-urls.mjs
   ```

---

## Summary

| State | Count | Reason |
|-------|-------|--------|
| Gujarat | 28 | 2022 delimitation |
| J&K | 25 | 2024 delimitation |
| MP | 4 | Indore splits |
| Sikkim | 1 | Special constituency |
| **Total** | **58** | |

Last updated: 2024-12-22

