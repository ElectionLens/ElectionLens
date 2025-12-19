# Election Lens - India Electoral Map

An interactive, offline-first web application for exploring India's electoral boundaries across multiple administrative levels.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

## 🌟 Overview

Election Lens provides a unified interface to navigate India's complex electoral geography - from states down to individual assembly constituencies. Unlike fragmented online resources, this tool connects all levels of electoral boundaries in a single, fast, mobile-friendly application.

## ✨ Key Features

### 🗺️ Multi-Level Drill-Down Navigation
- **India → State → Parliamentary Constituency → Assembly Constituency**
- **India → State → District → Assembly Constituency**
- 4 levels of hierarchical navigation with seamless animated transitions

### 🗳️ Dual View System
- Toggle between **Parliamentary Constituencies (543 Lok Sabha seats)** and **District boundaries** for any state
- Single toggle to switch views while maintaining context

### 🏛️ Assembly Constituency Drill-Down
- Click any **Parliamentary Constituency** → See its component Assembly segments
- Click any **District** → See its component Assembly segments
- PC-to-AC and District-to-AC mapping in one tool

### 📊 Smart Data Mapping
- Handles **post-2014 district reorganizations**:
  - Telangana's 21 new districts (2016)
  - Tamil Nadu's 8 new districts (2019-2020)
  - Andhra Pradesh, Gujarat, UP, and more
- Maps new districts to parent districts for accurate assembly data

### 💾 Offline-First Architecture
- All GeoJSON data cached in browser's IndexedDB
- **Works completely offline** after first load
- Fast subsequent loads from local cache
- Background preloading of all state data

### 📱 Fully Responsive Design
- Collapsible sidebar for mobile devices
- Touch-optimized map interactions
- PWA-ready with proper meta tags
- Works on phones, tablets, and desktops

### 🎨 Interactive Visual Features
- Color-coded regions with consistent palettes
- Hover highlighting with boundary emphasis
- Animated zoom transitions
- Live coordinate display (lat/lng)
- Dynamic legend updates

### 🔍 Clickable Sidebar Lists
- Alphabetically sorted lists of all regions
- Click to navigate directly from list
- Color dots matching map regions
- Synced highlighting between map and list

### 🧭 Breadcrumb Navigation
- Always shows current location: `India › Tamil Nadu › Chennai › Mylapore`
- Click any level to navigate back instantly

### 🗂️ Multiple Base Map Layers
- **Streets** - Default detailed view
- **Light** - Minimal clean background
- **Satellite** - Aerial imagery
- **Terrain** - Topographic view

### ⚡ Performance Optimizations
- Parallel data loading for all states
- Memory + IndexedDB dual-layer caching
- Background preloading of district data
- Sub-second state loading after initial cache

## 🚀 Getting Started

### Quick Start
1. Clone or download the repository
2. Serve the files with any HTTP server:
   ```bash
   # Using Python
   python3 -m http.server 8080
   
   # Using Node.js
   npx serve
   
   # Using PHP
   php -S localhost:8080
   ```
3. Open `http://localhost:8080` in your browser

### Files Structure
```
├── index.html                      # Main application
├── india_states.geojson           # State boundaries
├── india_parliament.geojson       # Parliamentary constituencies
├── india_parliament_alternate.geojson
├── india_assembly.geojson         # Assembly constituencies
└── states/                        # District-level data
    ├── andhra-pradesh.geojson
    ├── tamil-nadu.geojson
    └── ... (36 state/UT files)
```

## 📊 Data Coverage

| Level | Count | Source |
|-------|-------|--------|
| States & UTs | 36 | Latest boundaries |
| Parliamentary Constituencies | 543 | 2019 delimitation |
| Assembly Constituencies | 4,000+ | Pre-2014 boundaries |
| Districts | 700+ | Current boundaries |

## 🔧 Developer Mode

When running on `localhost`:
- **Clear Cache button** appears (🗑️ icon)
- Cache status shows loaded items count
- Console logging for debugging

## 📱 Browser Support

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers (iOS Safari, Chrome for Android)

Requires IndexedDB support for offline caching.

## 🆚 Comparison with Online Tools

| Feature | Election Lens | ECI Website | Wikipedia | Other Maps |
|---------|--------------|-------------|-----------|------------|
| PC → AC drill-down | ✅ | ❌ | ❌ | ❌ |
| District → AC drill-down | ✅ | ❌ | ❌ | ❌ |
| New district mapping | ✅ | ❌ | Partial | ❌ |
| Offline support | ✅ | ❌ | ❌ | ❌ |
| Interactive boundaries | ✅ | ❌ | ❌ | Limited |
| Mobile responsive | ✅ | ❌ | ✅ | Varies |
| All levels in one tool | ✅ | ❌ | ❌ | ❌ |

## 🛠️ Technical Stack

- **Leaflet.js** - Interactive mapping
- **IndexedDB** - Client-side storage
- **Vanilla JavaScript** - No framework dependencies
- **CSS3** - Modern responsive styling
- **GeoJSON** - Geographic data format

## 📄 License

MIT License - Feel free to use, modify, and distribute.

## 🙏 Acknowledgments

- Map tiles by [CARTO](https://carto.com/), [OpenTopoMap](https://opentopomap.org/), [Esri](https://www.esri.com/)
- Boundary data from various open sources
- Built with [Leaflet](https://leafletjs.com/)

---

**Election Lens** - Making India's electoral geography accessible to everyone.

