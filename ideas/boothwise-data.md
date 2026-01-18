# Booth-wise Election Data Feature

**Status:** Planning  
**Branch:** `feature/boothwise-data`  
**Created:** January 2025

---

## Overview

Add booth-wise (polling station level) election results for every assembly constituency, showing:
- Candidate-wise votes per booth
- Booth location/address from booth list
- Support for special booths like Women's booths `37(W)`

---

## Key Documents

### Form 20 (Result Declaration)
- **Purpose:** Official document showing candidate-wise votes at each polling booth
- **Parts:**
  - Header: Constituency name, election details
  - Body: Booth-wise breakdown with votes for each candidate
  - Footer: Total votes, rejected votes, NOTA
- **Source:** State Election Commission / CEO websites after counting
- **Format:** Usually PDF, sometimes Excel

### Booth List (Electoral Roll)
- **Purpose:** List of all polling booths with locations/addresses
- **Contains:**
  - Booth number
  - Booth name/location
  - Address
  - Building/landmark details
- **Source:** CEO websites before elections
- **Format:** PDF or HTML tables

### Special Booth Types
| Suffix | Meaning | Example |
|--------|---------|---------|
| `(W)` | Women's booth / Sakhi booth | `37(W)` |
| `(A)` | Auxiliary booth | `37(A)` |
| `(S)` | Special/Accessible booth | `37(S)` |
| None | Regular booth | `37` |

---

## Sample Data (Gummidipoondi, Tamil Nadu)

### Available Files
```
Desktop/
├── Gummidipoondi booths - 2021.pdf    # Booth list with addresses
├── Gummidipoondi form20 - 2021.pdf    # Candidate-wise results
├── Gummidipoondi booths - 2024.pdf    # Booth list for 2024
└── Gummidipoondi form20 - 2024.pdf    # Results for 2024
```

### Data to Extract
1. **From Booth List:**
   - Booth number (e.g., `1`, `2`, `37`, `37(W)`)
   - Booth name/location
   - Address/building name
   - Latitude/longitude (if available, or geocode from address)

2. **From Form 20:**
   - Booth number
   - Candidate-wise votes
   - Total valid votes
   - Rejected votes
   - NOTA votes

---

## Data Schema

### Booth Entity
```typescript
interface Booth {
  /** Unique booth ID: {acId}-{boothNo} e.g., "TN-001-037W" */
  id: string;
  
  /** Parent AC schema ID */
  acId: string;
  
  /** Booth number (as string to handle "37(W)") */
  boothNo: string;
  
  /** Booth number (numeric part for sorting) */
  boothNoNumeric: number;
  
  /** Booth type */
  type: 'regular' | 'women' | 'auxiliary' | 'special';
  
  /** Booth name/location */
  name: string;
  
  /** Full address */
  address: string;
  
  /** Geocoded location (optional) */
  location?: {
    lat: number;
    lng: number;
  };
  
  /** Total registered electors (optional) */
  electors?: number;
}
```

### Booth Results Entity
```typescript
interface BoothResult {
  /** Booth ID */
  boothId: string;
  
  /** Election year */
  year: number;
  
  /** Candidate-wise votes */
  candidates: {
    name: string;
    party: string;
    votes: number;
  }[];
  
  /** Total valid votes */
  validVotes: number;
  
  /** Rejected/invalid votes */
  rejectedVotes: number;
  
  /** NOTA votes */
  notaVotes: number;
  
  /** Turnout percentage */
  turnout?: number;
}
```

---

## File Structure

```
public/data/
├── booths/
│   ├── TN/                          # By state
│   │   ├── TN-001/                  # By AC (Gummidipundi)
│   │   │   ├── booths.json          # Booth master list
│   │   │   ├── 2021.json            # 2021 results
│   │   │   └── 2024.json            # 2024 results
│   │   ├── TN-002/
│   │   └── ...
│   └── GJ/
│       └── ...
└── elections/
    └── ac/                          # Existing AC-level data
```

### Booth List File (`booths.json`)
```json
{
  "acId": "TN-001",
  "acName": "Gummidipundi",
  "totalBooths": 287,
  "lastUpdated": "2024-01-15",
  "booths": [
    {
      "id": "TN-001-001",
      "boothNo": "1",
      "boothNoNumeric": 1,
      "type": "regular",
      "name": "Panchayat Union Primary School",
      "address": "Athipattu Village, Gummidipundi"
    },
    {
      "id": "TN-001-037W",
      "boothNo": "37(W)",
      "boothNoNumeric": 37,
      "type": "women",
      "name": "Government Girls Higher Secondary School",
      "address": "Main Road, Gummidipundi"
    }
  ]
}
```

### Results File (`2021.json`)
```json
{
  "acId": "TN-001",
  "year": 2021,
  "electionType": "assembly",
  "totalBooths": 287,
  "candidates": [
    { "name": "RAJA P", "party": "DMK" },
    { "name": "KUMAR S", "party": "AIADMK" },
    { "name": "SELVAM R", "party": "IND" }
  ],
  "results": {
    "TN-001-001": {
      "votes": [1245, 987, 123],
      "valid": 2355,
      "rejected": 12,
      "nota": 45
    },
    "TN-001-037W": {
      "votes": [567, 432, 45],
      "valid": 1044,
      "rejected": 5,
      "nota": 23
    }
  },
  "summary": {
    "totalVotes": 156789,
    "winner": { "name": "RAJA P", "party": "DMK", "votes": 85432 }
  }
}
```

---

## Data Processing Pipeline

### Step 1: Extract Booth List from PDF
```javascript
// scripts/extract-booth-list.mjs
// Input: "Gummidipoondi booths - 2021.pdf"
// Output: booths.json

// Parse PDF tables
// Handle booth number formats: "1", "37(W)", "37(A)"
// Extract: booth_no, name, address
```

### Step 2: Extract Form 20 Results
```javascript
// scripts/extract-form20.mjs
// Input: "Gummidipoondi form20 - 2021.pdf"
// Output: 2021.json

// Parse candidate names from header
// Parse booth-wise votes
// Match booth numbers between booth list and form20
```

### Step 3: Geocode Booth Addresses (Optional)
```javascript
// scripts/geocode-booths.mjs
// Use Google Maps / Nominatim API
// Add lat/lng to booth entries
```

### Step 4: Validate Data
```javascript
// scripts/validate-booth-data.mjs
// - All booths in form20 exist in booth list
// - Vote totals match AC-level totals
// - No duplicate booth numbers
```

---

## Booth Number Normalization

Handle various formats in source data:

| Source Format | Normalized ID | Type |
|---------------|---------------|------|
| `37` | `TN-001-037` | regular |
| `37(W)` | `TN-001-037W` | women |
| `37 (W)` | `TN-001-037W` | women |
| `37(A)` | `TN-001-037A` | auxiliary |
| `37-A` | `TN-001-037A` | auxiliary |

```javascript
function normalizeBoothNo(raw) {
  // Extract numeric part and suffix
  const match = raw.match(/^(\d+)\s*[\(\-]?([WASwas])?[\)\-]?$/);
  if (!match) return { num: raw, suffix: '', type: 'regular' };
  
  const num = match[1].padStart(3, '0');
  const suffix = (match[2] || '').toUpperCase();
  
  const typeMap = { 'W': 'women', 'A': 'auxiliary', 'S': 'special' };
  const type = typeMap[suffix] || 'regular';
  
  return { num, suffix, type, id: `${num}${suffix}` };
}
```

---

## UI Components

### 1. Booth List View (in AC Panel)
```
┌─────────────────────────────────────────────────┐
│  GUMMIDIPUNDI - Booth Results 2021              │
├─────────────────────────────────────────────────┤
│  Filter: [All ▼] [Women ▼]  Search: [______]   │
├──────┬────────────────────┬──────┬──────┬──────┤
│ Booth│ Location           │ DMK  │AIADMK│ Total│
├──────┼────────────────────┼──────┼──────┼──────┤
│  1   │ Athipattu PS       │ 1245 │  987 │ 2355 │
│  2   │ Periyakuppam MS    │ 1102 │  856 │ 2001 │
│  ...                                            │
│ 37(W)│ Govt Girls HSS  👩 │  567 │  432 │ 1044 │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

### 2. Booth Map View
- Show booth locations as markers on map
- Color by winning party
- Size by turnout
- Filter by booth type

### 3. Booth Detail Popup
```
┌─────────────────────────────────────┐
│  Booth 37(W) - Women's Booth   👩   │
│  Govt Girls Higher Secondary School │
│  Main Road, Gummidipundi            │
├─────────────────────────────────────┤
│  DMK     ████████████  567 (54.3%)  │
│  AIADMK  █████████     432 (41.4%)  │
│  Others  █              45 ( 4.3%)  │
├─────────────────────────────────────┤
│  Valid: 1,044  Rejected: 5  NOTA: 23│
│  Turnout: 72.3%                     │
└─────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Data Extraction (1 week)
- [ ] Create PDF parser for booth list format
- [ ] Create PDF parser for Form 20 format
- [ ] Process Gummidipundi sample data (2021, 2024)
- [ ] Validate booth matching between sources

### Phase 2: Data Schema & Storage (3 days)
- [ ] Finalize booth schema
- [ ] Create folder structure
- [ ] Write validation scripts
- [ ] Add to manifest.json

### Phase 3: Basic UI (1 week)
- [ ] Add "Booth Results" tab to AC panel
- [ ] Create booth list table component
- [ ] Add filtering (booth type, search)
- [ ] Show candidate-wise breakdown

### Phase 4: Map Integration (1 week)
- [ ] Geocode booth addresses
- [ ] Add booth markers layer
- [ ] Color markers by winning party
- [ ] Booth detail popup on click

### Phase 5: Scale (ongoing)
- [ ] Process more constituencies
- [ ] Build bulk extraction tools
- [ ] Consider crowdsourcing data entry

---

## Data Sources

| Source | Type | Availability |
|--------|------|--------------|
| State CEO websites | Official | Post-election |
| ECI results portal | Official | Limited |
| Political parties | Unofficial | Variable |
| News media | Unofficial | Partial |

### Tamil Nadu CEO Website
- Booth lists: https://elections.tn.gov.in/
- Form 20: Published after counting

---

## Challenges

1. **PDF Parsing Variability**
   - Different states use different formats
   - Scanned PDFs vs text PDFs
   - Table structure variations

2. **Booth Number Matching**
   - Form 20 may use different format than booth list
   - Special booth suffixes vary by state

3. **Missing Data**
   - Not all states publish Form 20
   - Some booths may be missing from source

4. **Geocoding Accuracy**
   - Rural addresses hard to geocode
   - May need manual verification

5. **Scale**
   - ~1 million booths across India
   - Need efficient storage/loading

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Constituencies with booth data | Start with 50 (TN) |
| Booth-to-results match rate | >99% |
| Geocoding accuracy | >80% |
| Page load time (booth view) | <2s |

---

## Related Files

- `scripts/extract-booth-list.mjs` - TODO
- `scripts/extract-form20.mjs` - TODO
- `src/components/BoothResultsPanel.tsx` - TODO
- `src/hooks/useBoothData.ts` - TODO

---

*Last Updated: January 2025*
