# Schema Migration Plan

## Overview

This document outlines the plan to consolidate ElectionLens data into a single source of truth using `schema.json`.

## Current State

| Data Type | Files | Size | Issues |
|-----------|-------|------|--------|
| GeoJSON (shapes) | 39 | 47 MB | Inconsistent naming (NAGALAND vs Nagaland) |
| Election AC | 139 | 49 MB | Missing fields (constituencyType) |
| Election PC | 187 | 81 MB | Duplicate state folders |
| **Total** | **366** | **177 MB** | Name matching bugs |

## New Architecture

### Schema File (`public/data/schema.json`)

**Size:** ~1.9 MB (compressed: ~200 KB)

```
{
  "version": "1.0.0",
  "states": { "TN": {...}, "MH": {...}, ... },           // 36 states
  "parliamentaryConstituencies": { "TN-01": {...}, ... }, // 545 PCs
  "assemblyConstituencies": { "TN-001": {...}, ... },     // 4095 ACs
  "districts": { "TN-D01": {...}, ... },                  // 588 districts
  "indices": {
    "stateByName": { "tamil nadu": "TN", ... },
    "pcByName": { "tiruvallur|TN": "TN-01", ... },
    "acByName": { "anna nagar|TN": "TN-042", ... },
    "districtByName": { "chennai|TN": "TN-D02", ... }
  }
}
```

### Entity ID Formats

| Entity | Format | Example |
|--------|--------|---------|
| State | 2-letter code | `TN`, `MH`, `KA` |
| PC | `{state}-{pcNo:02}` | `TN-01`, `MH-15` |
| AC | `{state}-{acNo:03}` | `TN-001`, `MH-150` |
| District | `{state}-D{code:02}` | `TN-D01`, `MH-D05` |

### Benefits

1. **Single Source of Truth**
   - Canonical names: "Tamil Nadu" (not "TAMIL NADU" or "Tamil Nādu")
   - Canonical IDs: `TN-001` works everywhere

2. **Eliminates Name Matching Bugs**
   - No more fuzzy matching
   - No more `AC_NAME_MAPPINGS` constants

3. **Type Safety**
   - `constituencyType` always present (derived from name if needed)
   - Parent relationships always defined (AC → PC → State)

4. **Smaller Bundles**
   - Load schema once (~200 KB gzipped)
   - GeoJSON and election files become ID-keyed

## Migration Steps

### Phase 1: Schema Generation ✅
- [x] Create `schema.ts` types
- [x] Create `generate-schema.mjs` script
- [x] Generate initial `schema.json`

### Phase 2: Add Schema IDs to Existing Files
- [ ] Add `schemaId` to GeoJSON features
- [ ] Add `schemaId` to election JSON entries
- [ ] Maintain backward compatibility

### Phase 3: Update Frontend
- [ ] Create `useSchema` hook to load and cache schema
- [ ] Update `useElectionData` to resolve IDs via schema
- [ ] Update `useElectionResults` to use schema IDs
- [ ] Remove `AC_NAME_MAPPINGS` and fuzzy matching

### Phase 4: Optimize Data Files
- [ ] Convert GeoJSON to use schema IDs only (remove redundant names)
- [ ] Convert election files to use schema IDs as keys
- [ ] Remove duplicate state folders in PC data

## File Changes

### Before (current)
```
public/data/
├── geo/
│   └── assembly/constituencies.geojson  # 11 MB, names as properties
├── elections/
│   └── ac/tamil-nadu/2021.json          # Names as keys
```

### After (migrated)
```
public/data/
├── schema.json                          # 1.9 MB, master reference
├── geo/
│   └── assembly/constituencies.geojson  # 9 MB, schemaId only
├── elections/
│   └── ac/TN/2021.json                  # IDs as keys
```

## Code Changes

### Before
```typescript
// Current: fuzzy matching nightmare
const result = results[acName.toUpperCase()];
if (!result) {
  const canonicalMatch = keys.find(k => createCanonicalKey(k) === canonicalKey);
  // ... more fuzzy matching
}
```

### After
```typescript
// New: direct ID lookup
const acId = schema.indices.acByName[`${acName.toLowerCase()}|${stateId}`];
const result = results[acId];
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Large schema file | Compress + cache aggressively |
| Breaking existing URLs | Keep name indices for backward compat |
| Data loss during migration | Validate counts before/after |
| Performance regression | Lazy load schema, memoize lookups |

## Timeline

| Phase | Effort | Status |
|-------|--------|--------|
| 1. Schema Generation | 2 hours | ✅ Done |
| 2. Add Schema IDs | 4 hours | 🔄 Pending |
| 3. Update Frontend | 8 hours | 🔄 Pending |
| 4. Optimize Files | 4 hours | 🔄 Pending |

## Next Steps

1. Review generated `schema.json` for accuracy
2. Create script to add `schemaId` to GeoJSON files
3. Create script to migrate election data keys
4. Build `useSchema` hook with caching

