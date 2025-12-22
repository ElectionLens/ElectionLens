# Data Architecture Proposal

## Executive Summary

Evolve from flat files to a **Schema-Driven Data Architecture** that provides:
- Single source of truth (`schema.json`)
- Consistent ID-based lookups
- Optimized file structure for web delivery
- Future-proof extensibility

## Current vs Proposed

```
CURRENT                              PROPOSED
───────────────────────────────────────────────────────────────
366+ files, ~177 MB                  Consolidated structure
                                     
public/data/                         public/data/
├── elections/                       ├── manifest.json          # NEW
│   ├── ac/{state}/{year}.json       ├── schema.json            # Master registry
│   └── pc/{state}/{year}.json       ├── geo/
├── geo/                             │   ├── states.geojson     # All states
│   ├── assembly/                    │   ├── pc.geojson         # All PCs
│   │   └── constituencies.geojson   │   ├── ac.geojson         # All ACs  
│   ├── parliament/                  │   └── districts/         # By state (lazy)
│   │   └── constituencies.geojson   │       └── {stateId}.geojson
│   ├── districts/{state}.geojson    └── elections/
│   └── boundaries/                      ├── ac/{stateId}/      # ID-based paths
└── schema.json                          │   └── {year}.json
                                         └── pc/{stateId}/
                                             └── {year}.json
```

## Core Principles

### 1. Schema as Single Source of Truth

```typescript
// All lookups go through schema
const ac = schema.acs["TN-042"];     // Direct ID lookup
const pc = schema.pcs[ac.pcId];      // Follow relationships
const state = schema.states[pc.stateId];

// Name resolution via indices
const id = schema.indices.acByName["anna nagar|TN"]; // → "TN-042"
```

### 2. Manifest for Data Discovery

```json
// manifest.json
{
  "version": "2.0.0",
  "generated": "2025-12-22T00:00:00Z",
  "schema": {
    "path": "schema.json",
    "size": 1984732,
    "hash": "sha256:abc..."
  },
  "geo": {
    "states": { "path": "geo/states.geojson", "size": 2048576 },
    "pc": { "path": "geo/pc.geojson", "size": 5242880 },
    "ac": { "path": "geo/ac.geojson", "size": 11534336 },
    "districts": {
      "TN": { "path": "geo/districts/TN.geojson", "size": 524288 },
      // ... per-state files
    }
  },
  "elections": {
    "ac": {
      "TN": {
        "years": [2011, 2016, 2021],
        "paths": {
          "2021": "elections/ac/TN/2021.json"
        }
      }
    },
    "pc": { /* similar */ }
  }
}
```

### 3. ID-Based File Naming

```
Current:  elections/ac/tamil-nadu/2021.json
Proposed: elections/ac/TN/2021.json

Benefits:
- Shorter paths
- No slug normalization needed  
- Matches schema IDs directly
```

### 4. Optimized Election Data Format

```json
// Current: Name as key (requires fuzzy matching)
{
  "GUMMIDIPUNDI": { "constituencyNo": 1, ... },
  "PONNERI (SC)": { "constituencyNo": 2, ... }
}

// Proposed: Schema ID as key (direct lookup)
{
  "TN-001": { "name": "Gummidipundi", ... },
  "TN-002": { "name": "Ponneri", "type": "SC", ... }
}
```

## Implementation Phases

### Phase 1: Manifest Generation (Week 1)
- [ ] Create `manifest.json` with file inventory
- [ ] Add content hashes for cache busting
- [ ] Update frontend to load manifest first

### Phase 2: Path Normalization (Week 1)
- [ ] Rename election folders to use state IDs (TN, MH, etc.)
- [ ] Update path constants in frontend
- [ ] Add redirects for old paths

### Phase 3: Election Data Migration (Week 2)
- [ ] Convert election file keys from names to schema IDs
- [ ] Remove redundant fields (derive from schema)
- [ ] Create migration script

### Phase 4: Remove Fuzzy Matching (Week 2)
- [ ] Remove `AC_NAME_MAPPINGS` from constants
- [ ] Remove `createCanonicalKey` helpers
- [ ] Simplify lookup code in hooks

### Phase 5: Optional Optimizations (Future)
- [ ] MessagePack encoding (30-40% smaller)
- [ ] Service Worker for offline support
- [ ] Delta updates for schema changes

## File Format Comparison

### Election Data (AC)

| Format | Size (TN 2021) | Parsing | Compression |
|--------|---------------|---------|-------------|
| Current JSON | 892 KB | Native | 67% gzip |
| ID-keyed JSON | 780 KB | Native | 70% gzip |
| MessagePack | 520 KB | Library | 75% gzip |

### GeoJSON

| Format | Size (All ACs) | Partial Load | Browser Support |
|--------|---------------|--------------|-----------------|
| GeoJSON | 11 MB | No | Native |
| TopoJSON | 4 MB | No | D3 library |
| FlatGeobuf | 8 MB | Yes (range) | Library |

**Recommendation**: Keep GeoJSON for browser compatibility, use TopoJSON for size-critical deployments.

## Data Relationships

```
                    ┌─────────────┐
                    │   STATE     │
                    │ (TN, MH...) │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │  DISTRICT   │ │     PC      │ │  ELECTION   │
    │ (TN-D01...) │ │ (TN-01...)  │ │  METADATA   │
    └──────┬──────┘ └──────┬──────┘ └─────────────┘
           │               │
           │        ┌──────▼──────┐
           └───────►│     AC      │◄─── GeoJSON
                    │ (TN-001...) │     (boundaries)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  ELECTION   │
                    │   RESULTS   │
                    │ (per year)  │
                    └─────────────┘
```

## API Design

```typescript
// New DataService abstraction
interface DataService {
  // Schema operations
  getSchema(): Promise<Schema>;
  
  // Entity lookups (cached)
  getState(id: string): StateEntity | null;
  getPC(id: string): PCEntity | null;
  getAC(id: string): ACEntity | null;
  
  // Name resolution
  resolveStateName(name: string): string | null;  // Returns ID
  resolveACName(name: string, stateId: string): string | null;
  
  // Data loading (lazy)
  loadStateGeo(id: string): Promise<GeoJSON.FeatureCollection>;
  loadACElection(stateId: string, year: number): Promise<ElectionData>;
  
  // Batch operations
  preloadState(id: string): Promise<void>;  // Load all data for a state
}
```

## Migration Script

```bash
# Run migration
node scripts/migrate-to-schema-ids.mjs

# Validate
node scripts/validate-migration.mjs

# Generate manifest
node scripts/generate-manifest.mjs
```

## Rollback Plan

1. Keep old file paths as symlinks for 30 days
2. Add fallback logic in frontend for old URLs
3. Monitor 404s in analytics

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Lookup failures | ~5% | <0.1% |
| Name matching code | 200 LOC | 0 LOC |
| Avg data load time | 800ms | 400ms |
| Cache hit rate | 60% | 90% |

## Appendix: Alternative Technologies Considered

### SQLite WASM
- **Pros**: Full SQL, single file
- **Cons**: 1MB overhead, must load entire DB
- **Verdict**: Overkill for this use case

### DuckDB WASM  
- **Pros**: Advanced queries, Parquet support
- **Cons**: 3MB overhead
- **Verdict**: Too heavy for simple lookups

### GraphQL
- **Pros**: Flexible queries, type safety
- **Cons**: Requires server
- **Verdict**: Not suitable for static hosting

### IndexedDB (client-side)
- **Pros**: Already used for caching
- **Cons**: Can't pre-populate, browser-only
- **Verdict**: Keep for caching, not primary storage

