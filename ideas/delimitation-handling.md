# Handling Delimitation Across States and Time

**Status:** Planning  
**Created:** December 2024  
**Priority:** Medium - Foundation for future data completeness

---

## Problem Statement

Delimitation (redistricting) happens at different times across states:

| Event | Year | States Affected | Impact |
|-------|------|-----------------|--------|
| National Delimitation | 2008 | All states | Current baseline |
| Gujarat Delimitation | 2022 | Gujarat | 28 new/split ACs in Ahmedabad & Surat |
| Assam Delimitation | 2023 | Assam | PC boundaries changed, 4 PCs renamed |
| J&K Reorganization | 2024 | Jammu & Kashmir | 25 new ACs, complete restructuring |
| Future Census-Based | ~2031 | All states | Expected national delimitation |

**Current limitation:** Single `delimitation: number` field per entity doesn't support:
- Multiple delimitation periods
- Historical boundary viewing
- Split/merge tracking
- Different timelines per state

---

## Current Implementation

```typescript
// src/types/schema.ts
interface ACEntity {
  delimitation: number;  // Single year, usually hardcoded to 2008
}

// scripts/process-election-data.mjs
// Filters for DelimID=4 (post-2008 only)
if (delimId !== 4) {
  skippedRows++;
  continue;
}
```

**File structure:**
```
public/data/geo/
├── assembly/
│   └── constituencies.geojson  # Single file, mixed delimitations
```

---

## Proposed Approaches

### Approach 1: Versioned Boundaries (Recommended) ⭐

Store boundaries per delimitation period, not per entity.

```typescript
// New types
interface DelimitationPeriod {
  id: string;              // "2008", "2024-JK", "2022-GJ"
  year: number;
  states: string[];        // ["GJ"] or ["*"] for national
  validFrom: number;       // First election year using these boundaries
  validUntil: number | null; // null = current
  source: string;          // "Delimitation Commission 2008"
}

interface ACEntity {
  id: string;
  // ... existing fields
  delimitationId: string;  // Points to DelimitationPeriod
  predecessorIds?: string[]; // ACs this was split from
  successorIds?: string[];   // ACs this was split into
}
```

**File structure:**
```
public/data/
├── delimitations.json           # Registry of all delimitation periods
├── geo/
│   ├── assembly/
│   │   ├── 2008/                # National 2008 delimitation
│   │   │   └── constituencies.geojson
│   │   ├── 2022-GJ/             # Gujarat 2022 delimitation
│   │   │   └── constituencies.geojson
│   │   └── 2024-JK/             # J&K 2024 delimitation
│   │       └── constituencies.geojson
```

**Pros:**
- Clean separation of boundary versions
- Can show historical boundaries for old elections
- Supports split/merge tracking
- Easy to add future delimitations
- Works well with lazy loading

**Cons:**
- More complex data loading logic
- Some GeoJSON duplication for unchanged states
- Migration effort required

---

### Approach 2: Time-Based Schema IDs

Encode delimitation in the AC ID:

```
// Current (ambiguous)
GJ-045

// Proposed (explicit)
GJ-2022-045  or  GJ-D4-045
```

**Schema example:**
```json
{
  "GJ-2008-045": { 
    "name": "OLD AHMEDABAD", 
    "delimitation": 2008, 
    "validYears": [2008, 2012, 2017],
    "successorIds": ["GJ-2022-045", "GJ-2022-046"]
  },
  "GJ-2022-045": { 
    "name": "NARANPURA", 
    "delimitation": 2022, 
    "validYears": [2022],
    "predecessorId": "GJ-2008-045"
  }
}
```

**Pros:**
- Self-documenting IDs
- No ambiguity
- Clear lineage

**Cons:**
- Breaking change for existing URLs
- Verbose IDs
- Major migration required

---

### Approach 3: Election-Linked Boundaries (Pragmatic)

Keep current schema, add boundary links at election level:

```json
// elections/ac/gujarat/2022.json
{
  "meta": {
    "year": 2022,
    "delimitation": "2022-GJ",
    "boundaryFile": "geo/assembly/2022-GJ/constituencies.geojson"
  },
  "results": {
    "GJ-045": { /* NARANPURA results */ }
  }
}
```

**Frontend logic:**
```typescript
function getBoundaryFile(state: string, year: number): string {
  const delimitation = findDelimitation(state, year);
  return `/data/geo/assembly/${delimitation}/constituencies.geojson`;
}
```

**Pros:**
- Minimal schema changes
- Clear election → boundary mapping
- Can be implemented incrementally
- Doesn't break existing URLs

**Cons:**
- Must track delimitation-to-election mappings
- Less elegant than Approach 1

---

### Approach 4: Delimitation Registry

Central registry mapping (state, year) → boundary version:

```json
// delimitations.json
{
  "version": "1.0.0",
  "periods": {
    "2008": {
      "year": 2008,
      "type": "national",
      "states": "*",
      "source": "Delimitation Commission of India",
      "effectiveFrom": 2008
    },
    "2022-GJ": {
      "year": 2022,
      "type": "state",
      "states": ["GJ"],
      "source": "Gujarat State Election Commission",
      "effectiveFrom": 2022,
      "changes": {
        "splits": ["Ahmedabad → 12 ACs", "Surat → 8 ACs"],
        "newACs": 28
      }
    },
    "2024-JK": {
      "year": 2024,
      "type": "reorganization",
      "states": ["JK"],
      "source": "Delimitation Commission (J&K Reorganization)",
      "effectiveFrom": 2024,
      "changes": {
        "totalACs": 90,
        "previousACs": 87,
        "newACs": 25
      }
    }
  },
  "stateTimelines": {
    "GJ": [
      { "from": 2008, "to": 2017, "period": "2008" },
      { "from": 2022, "to": null, "period": "2022-GJ" }
    ],
    "JK": [
      { "from": 2008, "to": 2014, "period": "2008" },
      { "from": 2024, "to": null, "period": "2024-JK" }
    ],
    "*": [
      { "from": 2008, "to": null, "period": "2008" }
    ]
  }
}
```

**Lookup function:**
```typescript
function getDelimitation(state: string, electionYear: number): string {
  const stateTimeline = registry.stateTimelines[state] || registry.stateTimelines['*'];
  const period = stateTimeline.find(r => 
    electionYear >= r.from && (r.to === null || electionYear <= r.to)
  );
  return period?.period || '2008';
}
```

---

## Recommended Implementation Plan

### Phase 1: Foundation (1-2 days)
- [ ] Create `public/data/delimitations.json` registry
- [ ] Add `delimitationId` field to schema types
- [ ] Update `generate-schema.mjs` to populate delimitation info
- [ ] Create `useDelimitation` hook for lookups

### Phase 2: Boundary Versioning (2-3 days)
- [ ] Reorganize GeoJSON files into `geo/assembly/{delimitation}/`
- [ ] Create symlinks or copy for backward compatibility
- [ ] Update GeoJSON loading to be delimitation-aware
- [ ] Add boundary version to election data meta

### Phase 3: Historical Support (3-5 days)
- [ ] Add predecessor/successor fields to AC schema
- [ ] Create migration script to populate lineage
- [ ] Show "boundary changed" indicator in UI
- [ ] Enable historical boundary viewing for old elections

### Phase 4: UI Enhancements (optional)
- [ ] Show delimitation info in constituency panel
- [ ] Add "compare boundaries" overlay feature
- [ ] Timeline slider for boundary evolution
- [ ] Visual diff of old vs new boundaries

---

## Quick Wins (Can do now)

1. **Document delimitation timeline in schema:**
   ```json
   "states": {
     "GJ": {
       "delimitations": [2008, 2022],
       "currentDelimitation": 2022
     }
   }
   ```

2. **Add delimitation to GeoJSON properties:**
   ```json
   {
     "properties": {
       "AC_NAME": "NARANPURA",
       "schemaId": "GJ-045",
       "delimitation": 2022
     }
   }
   ```

3. **Graceful degradation for missing boundaries:**
   ```typescript
   // Instead of "Unknown"
   "Boundary data unavailable (2022 delimitation - not yet mapped)"
   ```

4. **Create constants file:**
   ```typescript
   // src/constants/delimitations.ts
   export const STATE_DELIMITATIONS: Record<string, number[]> = {
     GJ: [2008, 2022],
     JK: [2008, 2024],
     MP: [2008], // Indore splits pending
     // ... other states default to [2008]
   };
   ```

---

## Data Sources for New Boundaries

| Source | URL | Notes |
|--------|-----|-------|
| ECI | https://eci.gov.in | Official boundaries post-delimitation |
| DataMeet | https://datameet.org | Community-sourced GeoJSON |
| Survey of India | https://surveyofindia.gov.in | Official maps |
| State Election Commissions | Various | State-specific updates |

---

## Related Files

- `ideas/missing-geojson-acs.md` - Current missing boundaries
- `src/types/schema.ts` - Schema type definitions
- `scripts/generate-schema.mjs` - Schema generation
- `scripts/process-jk-ac.mjs` - J&K 2024 handling (reference)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Dec 2024 | Document approaches | Need to handle Gujarat/J&K delimitation gaps |
| TBD | Select approach | Pending review |

---

*Last Updated: December 2024*




