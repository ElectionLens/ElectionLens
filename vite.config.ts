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
    open: true
  },
  preview: {
    port: 3000
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
        // Complex data hook - tested via E2E tests
        'src/hooks/useElectionData.ts'
      ],
      // Coverage thresholds - focused on testable utilities and hooks
      thresholds: {
        lines: 80,
        functions: 85,
        branches: 70,
        statements: 80
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


