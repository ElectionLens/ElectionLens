import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.jsx'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        'src/main.jsx',
        '**/*.config.{js,cjs}'
      ],
      // Coverage thresholds - adjust as needed
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60
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
})
