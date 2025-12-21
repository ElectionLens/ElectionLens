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
    // Rollup options
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          leaflet: ['leaflet', 'react-leaflet']
        }
      }
    }
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
        'scripts/**'
      ],
      // Coverage thresholds - focused on testable utilities and hooks
      thresholds: {
        lines: 20,
        functions: 60,
        branches: 70,
        statements: 20
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


