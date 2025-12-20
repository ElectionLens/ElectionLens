# Election Lens - India Electoral Map

An interactive, offline-first web application for exploring India's electoral boundaries across multiple administrative levels.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![Tests](https://img.shields.io/badge/tests-431%20passed-success.svg)

[![Netlify Status](https://api.netlify.com/api/v1/badges/85695e58-4a2f-4b81-8165-050d0dc940e7/deploy-status)](https://app.netlify.com/projects/electionlens/deploys)

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

### 🔍 Smart Search
- Search across states, parliamentary constituencies, and assembly constituencies
- Keyboard navigation with Arrow keys and Enter to select
- Type-ahead filtering with instant results

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
- Unified color scheme (Amber for states, Violet for PC, Emerald for AC)
- [Lucide React](https://lucide.dev/) icons throughout the UI
- Hover highlighting with boundary emphasis
- Animated zoom transitions
- Dynamic legend with hover info

### 🧭 Breadcrumb Navigation
- Always shows current location: `India › Tamil Nadu › Chennai › Mylapore`
- Click any level to navigate back instantly
- URL state syncing for deep linking

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/ElectionLens/ElectionLens.git
cd ElectionLens

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:3000` in your browser.

### Build for Production

```bash
npm run build
npm run preview  # Preview production build
```

## 🧪 Testing

### Unit Tests (Vitest)
```bash
npm run test          # Watch mode
npm run test:run      # Single run
npm run test:coverage # With coverage report
```

### E2E Tests (Playwright)
```bash
npm run e2e           # Run all e2e tests
npm run e2e:ui        # Open Playwright UI
npm run e2e:headed    # Run in visible browser
npm run e2e:chromium  # Chromium only
```

**Test Coverage:**
- 431 unit tests (67%+ function coverage)
- 45 e2e tests covering all major user flows

## 📁 Project Structure

```
├── src/
│   ├── components/
│   │   ├── MapView.tsx      # Leaflet map component
│   │   ├── Sidebar.tsx      # Navigation sidebar
│   │   └── SearchBox.tsx    # Global search
│   ├── hooks/
│   │   ├── useElectionData.ts  # Data fetching & caching
│   │   └── useUrlState.ts      # URL state management
│   ├── utils/
│   │   ├── db.ts            # IndexedDB operations
│   │   └── helpers.ts       # Utility functions
│   ├── styles/
│   │   └── index.css        # Tailwind + custom styles
│   └── types/
│       └── index.ts         # TypeScript types
├── public/
│   └── data/geo/            # GeoJSON data files
├── e2e/                     # Playwright e2e tests
└── scripts/
    └── optimize-geojson.mjs # GeoJSON optimization
```

## 📊 Data Coverage

| Level | Count | Source |
|-------|-------|--------|
| States & UTs | 36 | Latest boundaries |
| Parliamentary Constituencies | 543 | 2019 delimitation |
| Assembly Constituencies | 4,000+ | Pre-2014 boundaries |
| Districts | 700+ | Current boundaries |

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Mapping | Leaflet + React-Leaflet |
| Icons | Lucide React |
| Styling | Tailwind CSS v4 |
| Storage | IndexedDB |
| Unit Testing | Vitest + Testing Library |
| E2E Testing | Playwright |
| CI/CD | GitHub Actions + Netlify |

## 📜 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run unit tests (watch mode) |
| `npm run test:run` | Run unit tests once |
| `npm run test:coverage` | Run tests with coverage |
| `npm run e2e` | Run Playwright e2e tests |
| `npm run lint` | Lint source files |
| `npm run format` | Format with Prettier |
| `npm run typecheck` | TypeScript type checking |
| `npm run validate` | Run all checks |

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
| Global search | ✅ | ❌ | ❌ | ❌ |
| All levels in one tool | ✅ | ❌ | ❌ | ❌ |

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure:
- All tests pass (`npm run validate`)
- Code is formatted (`npm run format`)
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

## 📄 License

MIT License - Feel free to use, modify, and distribute.

## 🙏 Acknowledgments

- Map tiles by [CARTO](https://carto.com/), [OpenTopoMap](https://opentopomap.org/), [Esri](https://www.esri.com/)
- Boundary data from various open sources
- Built with [Leaflet](https://leafletjs.com/) and [React-Leaflet](https://react-leaflet.js.org/)
- Icons by [Lucide](https://lucide.dev/)

---

**Election Lens** - Making India's electoral geography accessible to everyone.
