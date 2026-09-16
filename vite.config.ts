import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/components': resolve(__dirname, './src/components'),
      '@/hooks': resolve(__dirname, './src/hooks'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/constants': resolve(__dirname, './src/constants'),
      '@/types': resolve(__dirname, './src/types')
    }
  },
  server: {
    port: 3000,
    // Explicit dual-stack bind: without this, Vite's default host resolution
    // can land on IPv6-only (::1) depending on OS DNS order, so a literal
    // http://127.0.0.1:3000 healthcheck (e.g. Playwright's webServer.url)
    // never sees this server, spawns a redundant second instance, and that
    // instance then can't take the already-held port -- a permanent hang.
    host: true,
    open: true
  },
  preview: {
    port: 3000,
    host: true
  },
  // Vite handles SPA routing by default (appType: 'spa')
  build: {
    // Generate source maps for production builds
    sourcemap: true,
    // Target modern browsers for smaller bundles
    target: 'es2020',
    // Rollup options for optimal chunking
    rollupOptions: {
      output: {
        manualChunks: {
          // Core framework
          vendor: ['react', 'react-dom'],
          // Map library (large, separate chunk)
          leaflet: ['leaflet', 'react-leaflet'],
          // Vector tiles (loaded on demand)
          vectortiles: ['protomaps-leaflet', 'pmtiles'],
          // Icons (lazy loaded on demand)
          icons: ['lucide-react'],
          // Firebase analytics (optional, loaded async)
          analytics: ['firebase/app', 'firebase/analytics'],
        },
        // Optimize chunk names for caching
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Use esbuild minification (default, faster than terser)
    minify: 'esbuild',
    // Report compressed sizes
    reportCompressedSize: true,
    // Chunk size warning limit (300KB)
    chunkSizeWarningLimit: 300,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.tsx'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'src/test/',
        'src/main.tsx',
        'src/types/**',
        '**/*.d.ts',
        '**/*.config.{js,ts,cjs}',
        'scripts/**',
        // UI components - tested via E2E tests
        'src/App.tsx',
        'src/components/MapView.tsx',
        'src/components/ElectionResultPanel.tsx',
        'src/components/PCElectionResultPanel.tsx',
        'src/components/SearchBox.tsx',
        'src/components/Sidebar.tsx',
        'src/components/BlogSection.tsx',
        'src/components/BoothMarkersLayer.tsx',
        'src/components/VectorTileLayer.tsx',
        // Complex browser-orchestrator hooks - exercised by Playwright flows
        // rather than isolated unit tests (keep business logic in pure helpers).
        'src/hooks/useMapWinners.ts',
        'src/hooks/useUrlNavigate.ts',
        // Detail views are integration surfaces; their browser behavior is
        // covered by booth-analysis, postal and panel E2E suites.
        'src/components/election-result-panel/BoothWiseView.tsx',
        'src/components/election-result-panel/BoothwiseAnalysis.tsx',
        'src/components/election-result-panel/CandidateRow.tsx',
        'src/components/election-result-panel/InsightCard.tsx',
        'src/components/election-result-panel/PostalBallotsView.tsx',
        'src/components/election-result-panel/shared.ts',
        'src/components/election-result-panel/boothwiseAnalysisEngine.ts',
        // Barrel-only modules have no executable behavior of their own.
        'src/components/map-view/index.ts',
        'src/components/sidebar-panels/index.ts',
        // Parliament contribution composition is exercised through the PC/AC
        // panel E2E flows; its source data is integration-shaped.
        'src/utils/parliamentContributions.ts',
        // Complex data hook - exercised through browser data-loading flows.
        'src/hooks/useElectionData.ts'
      ],
      // Coverage thresholds - focused on testable utilities and hooks
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 75
      }
    },
    // Reporter options
    reporters: ['default', 'verbose'],
    // Watch mode options
    watch: {
      include: ['src/**'],
      exclude: ['node_modules', 'dist']
    },
    // Test timeout
    testTimeout: 10000,
    // Retry failed tests
    retry: 1
  }
});


