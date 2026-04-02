# ElectionLens Feature Roadmap

A comprehensive list of potential improvements and new features for ElectionLens, organized by priority and category.

---

## 🔴 High Priority - Data Gaps

### 1. Missing / outdated GeoJSON
**Status:** See [`ideas/missing-geojson-acs.md`](missing-geojson-acs.md) (updated Apr 2026)  
**Impact:** J&K — 15 schema ACs still lack polygons; Assam — boundaries pre-2023 delimitation; duplicate `schemaId` rows in some states.

**Data sources:** ECI, DataMeet, Lok Dhaba; desktop inputs for state-specific merges.

**Scripts:**
```bash
node scripts/cleanup-assembly-geojson-orphans.mjs --ci   # fail if orphan features exist
node scripts/add-jk-ac-geojson.mjs                      # needs j_and_k_assembly_new_borders.geojson path
node scripts/add-assam-pc-geojson.mjs                   # PC-level Assam
node scripts/replace-gujarat-ac-geojson.mjs               # Gujarat 2022 delimitation (local source file)
```

---

## 🟡 Architecture Improvements

### 2. Schema Migration Cleanup (Phase 4 ✅ Complete)
**Status:** Completed  
**Completed:** December 2024

- ✅ Removed `AC_NAME_MAPPINGS` (30 edge cases)
- ✅ Removed `createCanonicalKey` and `similarityScore`
- ✅ Simplified lookup to schema ID → name property matching
- ✅ ~150 lines of code removed

### 3. Manifest Generation (Phase 1)
**Status:** Not Started  
**Effort:** 1 day  
**Impact:** Medium - enables cache busting and data versioning

```json
// manifest.json
{
  "version": "2.0.0",
  "generated": "2025-12-22T00:00:00Z",
  "schema": {
    "path": "schema.json",
    "hash": "sha256:abc..."
  },
  "elections": {
    "ac": { "TN": { "years": [2011, 2016, 2021] } }
  }
}
```

### 4. Vector Tiles for Fast Map Loading
**Status:** ✅ Done  
**Effort:** 1 day (actual)  
**Impact:** High - 10x smaller tile size, crisp at any zoom

**Implemented:**
- ✅ VectorTileLayer component using protomaps-leaflet
- ✅ Minimal, Light, and Dark themes
- ✅ On-demand loading (126KB chunk only when selected)
- ✅ Layer switcher in toolbar with "Fast" badge

**Benefits:**
- Vector tiles: ~160MB for all of India (vs ~1.6GB raster)
- Crisp rendering at any zoom level
- Dynamic styling (dark mode ready)
- Lower bandwidth, faster loads

**Usage:**
```tsx
// Select "Vector" in the layer dropdown (top right)
// Marked with "Fast" badge
```

### 5. Service Worker / PWA Support
**Status:** Not Started  
**Effort:** 3 days  
**Impact:** High - enables offline access

Features:
- Cache election data for offline viewing
- Background sync for updates
- Install prompt on mobile
- Splash screen and status bar theming

```typescript
// sw.ts
const CACHE_NAME = 'electionlens-v2';
const DATA_CACHE = 'electionlens-data-v2';

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/data/')) {
    event.respondWith(cacheFirst(event.request));
  }
});
```

---

## 🟢 UI/UX Features

### 5. Dark Mode
**Status:** Not Started  
**Effort:** 1 day  
**Impact:** Medium - highly requested feature

```css
:root[data-theme="dark"] {
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --accent: #3b82f6;
  --border: #334155;
}
```

Implementation:
- Add theme toggle in toolbar
- Persist preference in localStorage
- Respect system preference via `prefers-color-scheme`
- Update map tile layer for dark mode

### 6. Enhanced Search
**Status:** Partial (SearchBox exists)  
**Effort:** 2 days  
**Impact:** Medium

Current: Basic substring matching  
Proposed improvements:
- Fuzzy matching with Fuse.js for typo tolerance
- Recent searches stored in localStorage
- Keyboard shortcut (⌘/Ctrl + K) to focus
- Search by candidate name
- Filter results by type (State/PC/AC)

```typescript
// Using Fuse.js
const fuse = new Fuse(searchIndex, {
  keys: ['displayName', 'state'],
  threshold: 0.3,
  includeScore: true,
});
```

### 7. Comparison View
**Status:** Not Started  
**Effort:** 3 days  
**Impact:** High - enables historical analysis

```
┌─────────────────────────────────────────────────┐
│  OMALUR - Compare Elections                     │
├────────────────┬────────────────┬───────────────┤
│     2016       │     2021       │    Change     │
├────────────────┼────────────────┼───────────────┤
│ DMK: 45.2%     │ DMK: 52.1%     │   +6.9%  📈   │
│ AIADMK: 42.3%  │ AIADMK: 38.1%  │   -4.2%  📉   │
│ Others: 12.5%  │ Others: 9.8%   │   -2.7%  📉   │
├────────────────┴────────────────┴───────────────┤
│ Turnout: 72.3% → 78.1% (+5.8%)                  │
│ Margin: 2.9% → 14.0% (+11.1%)                   │
└─────────────────────────────────────────────────┘
```

### 8. Party Color Coding
**Status:** Not Started  
**Effort:** 2 days  
**Impact:** Medium - improves visual understanding

```typescript
const PARTY_COLORS: Record<string, string> = {
  BJP: '#FF9933',
  INC: '#19AAED',
  DMK: '#E41C23',
  AIADMK: '#00FF00',
  TMC: '#00BFFF',
  SP: '#FF0000',
  BSP: '#22409A',
  // ... more parties
};
```

Features:
- Color-coded map polygons by winning party
- Party legend on map
- Consistent colors across all views
- Color-blind accessible palette option

### 9. Gesture Support (Mobile)
**Status:** Not Started  
**Effort:** 2 days  
**Impact:** Medium

- Swipe left/right between election years
- Pinch to zoom on map (already supported by Leaflet)
- Pull to refresh data
- Double-tap to zoom to constituency

---

## 🔵 Analytics & Insights

### 10. Dashboard View
**Status:** Not Started  
**Effort:** 1 week  
**Impact:** High

```
┌─────────────────────────────────────────────────┐
│  India Election Overview 2024                   │
├─────────────────────────────────────────────────┤
│  Total Seats: 543    Turnout: 66.2% ▲          │
├─────────────────────────────────────────────────┤
│  By Party:                                      │
│  ████████████████████░░░░░░░░░░ BJP: 240       │
│  ███████████░░░░░░░░░░░░░░░░░░░ INC: 99        │
│  ██████████████████░░░░░░░░░░░░ Others: 204    │
├─────────────────────────────────────────────────┤
│  Key Battlegrounds:                             │
│  • Maharashtra: Close race (BJP 23, INC 17)    │
│  • West Bengal: TMC dominance (31 seats)       │
│  • Karnataka: INC comeback (9 seats gained)    │
└─────────────────────────────────────────────────┘
```

### 11. Trend Charts
**Status:** Not Started  
**Effort:** 1 week  
**Impact:** Medium

Libraries: Chart.js or Recharts

Charts to implement:
- Vote share trends over elections (line chart)
- Margin of victory distribution (bar chart)
- Turnout heatmap by state (choropleth)
- Party performance over time (area chart)
- Swing analysis (waterfall chart)

### 12. Advanced Filters
**Status:** Not Started  
**Effort:** 3 days  
**Impact:** Medium

Filter options:
- By party (show only BJP/INC/etc. wins)
- By constituency type (GEN/SC/ST)
- By margin (<5% marginal, >20% safe)
- By turnout (high/low)
- By incumbent status (re-election/defeat)
- By gender of winner

### 13. NOTA Analysis
**Status:** Not Started  
**Effort:** 1 day  
**Impact:** Low

- Show NOTA votes percentage
- Highlight constituencies where NOTA > margin
- Trend of NOTA votes over elections

---

## 🟣 Technical Improvements

### 14. Performance Optimizations
**Status:** ✅ Done  
**Effort:** 1 day (actual)  
**Impact:** High

**Implemented:**
- ✅ Code splitting with React.lazy for panel components
- ✅ Improved Vite chunking (vendor, leaflet, icons, analytics separate)
- ✅ React.memo for candidate row components
- ✅ Preload hints for critical resources (states GeoJSON, CDN preconnect)
- ✅ Performance utilities module (debounce, throttle, cache, metrics)

**Results:**
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Main bundle | 435 KB | 321 KB | **-26%** |
| Initial load | ~110 KB gzip | ~87 KB gzip | **-21%** |
| Panel load | included | lazy (19 KB) | On-demand |

**Future optimizations (optional):**
```typescript
// Virtual scrolling for large candidate lists
import { useVirtualizer } from '@tanstack/react-virtual';

// TopoJSON for 70% smaller GeoJSON files
// Current: 11MB → TopoJSON: 4MB
```

### 15. Better Error Boundaries
**Status:** Not Started  
**Effort:** 1 day  
**Impact:** Low

```typescript
<ErrorBoundary 
  fallback={<DataUnavailable constituency={name} />}
  onError={(error) => trackError('data_load_failed', error)}
>
  <ElectionPanel />
</ErrorBoundary>
```

### 16. Analytics Integration
**Status:** Not Started  
**Effort:** 1 day  
**Impact:** Low

```typescript
// Track user behavior
trackEvent('constituency_view', { 
  state: 'TN', 
  constituency: 'omalur',
  year: 2021,
  source: 'map_click' | 'search' | 'url'
});

trackEvent('share', {
  type: 'twitter' | 'copy_link',
  constituency: 'omalur'
});
```

---

## 📊 Data Enhancements

### 17. Historical Data Expansion
**Status:** Not Started  
**Effort:** Variable  
**Impact:** Medium

Missing elections to add:
- 2004, 2009 Assembly elections (partial)
- By-election results
- Detailed booth-level data
- Postal ballot breakdowns

### 18. Candidate Profiles
**Status:** Not Started  
**Effort:** 1 week  
**Impact:** Medium

Data to add:
- Candidate photos
- Educational background
- Criminal cases (from ADR)
- Assets and liabilities
- Previous election history

### 19. Alliance Tracking
**Status:** Not Started  
**Effort:** 3 days  
**Impact:** Medium

```typescript
const ALLIANCES = {
  NDA: ['BJP', 'JD(U)', 'TDP', 'JD(S)', ...],
  INDIA: ['INC', 'DMK', 'TMC', 'SP', 'AAP', ...],
  // State-specific alliances
};
```

---

## 📋 Priority Matrix

| Priority | Feature | Effort | Impact | Dependencies |
|----------|---------|--------|--------|--------------|
| 1 | Assam GeoJSON | 2 days | 🔴 Critical | GeoJSON data |
| 2 | Dark Mode | 1 day | 🟡 Medium | None |
| 3 | Party Colors | 2 days | 🟡 Medium | None |
| 4 | PWA/Offline | 3 days | 🟢 High | None |
| 5 | Comparison View | 3 days | 🟢 High | None |
| 6 | Dashboard | 1 week | 🟢 High | Charts library |
| 7 | Enhanced Search | 2 days | 🟡 Medium | Fuse.js |
| 8 | Trend Charts | 1 week | 🟡 Medium | Charts library |
| 9 | Advanced Filters | 3 days | 🟡 Medium | None |
| 10 | Manifest | 1 day | 🟡 Medium | None |

---

## Quick Wins (< 1 day each)

1. **Dark Mode Toggle** - CSS variables already partially exist
2. **Keyboard Shortcuts** - ⌘K for search, Esc to close panels
3. **Share to WhatsApp** - Add WhatsApp share button
4. **Print Styles** - CSS for print-friendly views
5. **Accessibility Labels** - Add ARIA labels to map elements

---

## Future Considerations

### Mobile App
- React Native wrapper for iOS/Android
- Native map integration
- Push notifications for election results

### API/Embed
- Public API for election data
- Embeddable widgets for news sites
- iFrame integration

### AI Features
- Natural language queries ("Who won in Chennai 2021?")
- Prediction models
- Anomaly detection in voting patterns

---

*Last Updated: December 2024*
*Maintained by: ElectionLens Team*

