# Performance Optimization Ideas for Election Lens

## Overview

This document captures performance optimization strategies analyzed for the Election Lens application - an interactive electoral map visualization for India.

---

## SSR Analysis

### Would SSR Speed Up This Site?

**Conclusion: No significant benefit, adds complexity.**

#### Why SSR Won't Help Much Here

1. **Leaflet/Maps are Client-Only**
   - Leaflet requires `window` and DOM access
   - The map would still hydrate on the client regardless
   - Users would see a flash of empty content → then map loads

2. **Heavy Data is the Bottleneck**
   - GeoJSON files are large (districts, constituencies, assemblies)
   - SSR can't reduce network transfer size
   - Existing IndexedDB caching is already smart

3. **Interactive-First App**
   - Users come to interact with the map immediately
   - There's no "content to read" while waiting
   - SSR benefits are mostly for content-heavy pages

---

## Recommended Optimizations

### 1. Service Worker / PWA (High Impact) ⭐

Cache assets and GeoJSON for instant repeat visits.

**Implementation:**

```bash
npm install vite-plugin-pwa -D
```

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Election Lens',
        short_name: 'ElectionLens',
        description: 'India Electoral Map Visualization',
        theme_color: '#1a1a2e',
        background_color: '#f5f5f5',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/geo\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'geojson-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.basemaps\.cartocdn\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              }
            }
          }
        ]
      }
    })
  ]
});
```

**Benefits:**
- Instant load on repeat visits
- Offline support for cached regions
- App-like experience on mobile
- Better Lighthouse scores

---

### 2. Preload Critical Assets (Easy Win) ⭐

Add resource hints to `index.html`:

```html
<!-- Preconnect to external services -->
<link rel="preconnect" href="https://basemaps.cartocdn.com">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<!-- Preload critical GeoJSON (India states boundary) -->
<link rel="preload" href="/data/geo/boundaries/states.geojson" as="fetch" crossorigin>

<!-- Preload critical CSS chunks -->
<link rel="modulepreload" href="/src/main.tsx">
```

**Benefits:**
- Faster initial data load
- Parallel resource fetching
- Reduced connection overhead

---

### 3. GeoJSON Compression (Easy Win)

Ensure Netlify/hosting compresses `.geojson` files with Brotli/Gzip.

**netlify.toml:**
```toml
[[headers]]
  for = "/*.geojson"
  [headers.values]
    Content-Type = "application/geo+json"
    Cache-Control = "public, max-age=31536000, immutable"
```

**Benefits:**
- 60-80% reduction in transfer size
- Faster downloads on slow connections

---

### 4. Lazy Load Non-Critical Data (Medium Impact)

Currently loading parliament and assembly GeoJSON upfront. Consider:

```typescript
// Only load assembly data when user clicks into a constituency
const loadAssemblyData = async (stateName: string) => {
  if (!assemblyCache.has(stateName)) {
    const data = await fetch(`/data/geo/assembly/${stateName}.geojson`);
    assemblyCache.set(stateName, await data.json());
  }
  return assemblyCache.get(stateName);
};
```

**Benefits:**
- Faster initial page load
- Reduced memory usage
- Better mobile performance

---

### 5. Vector Tiles (High Impact, Future) 🔮

For massive performance gains, convert GeoJSON to vector tiles:

**Options:**
- **PMTiles** - Single-file vector tiles, no server needed
- **Mapbox Vector Tiles** - Industry standard
- **Protomaps** - Open source alternative

**Benefits:**
- Only load visible data at current zoom
- 10-100x faster for large datasets
- Smooth zoom/pan at any level

**Considerations:**
- Requires tile generation pipeline
- More complex setup
- Best for very large datasets

---

### 6. Image/Asset Optimization

- Convert PNG icons to SVG where possible ✅ (Done with Lucide)
- Use WebP for any raster images
- Lazy load below-fold images

---

## Current Optimizations (Already Implemented)

| Optimization | Status | Impact |
|-------------|--------|--------|
| Code splitting (vendor/leaflet) | ✅ Done | High |
| IndexedDB caching | ✅ Done | High |
| GeoJSON optimization script | ✅ Done | Medium |
| Lucide React icons | ✅ Done | Low |
| Netlify CDN deployment | ✅ Done | High |

---

## Priority Roadmap

### Phase 1 (Quick Wins)
1. [ ] Add resource preloading hints to index.html
2. [ ] Add cache headers for GeoJSON in netlify.toml
3. [ ] Verify Brotli compression is enabled

### Phase 2 (PWA)
1. [ ] Install vite-plugin-pwa
2. [ ] Configure service worker for GeoJSON caching
3. [ ] Add PWA manifest and icons
4. [ ] Test offline functionality

### Phase 3 (Advanced)
1. [ ] Evaluate vector tiles for assembly data
2. [ ] Consider splitting assembly GeoJSON by state
3. [ ] Add performance monitoring (Web Vitals)

---

## Metrics to Track

- **Largest Contentful Paint (LCP)** - Target < 2.5s
- **First Input Delay (FID)** - Target < 100ms
- **Cumulative Layout Shift (CLS)** - Target < 0.1
- **Time to Interactive (TTI)** - Target < 3.5s
- **GeoJSON load time** - Track per-state load times

---

## Resources

- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- [Workbox Caching Strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview/)
- [PMTiles](https://protomaps.com/docs/pmtiles)
- [Web Vitals](https://web.dev/vitals/)

