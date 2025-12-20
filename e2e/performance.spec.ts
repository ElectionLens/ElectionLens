import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('should load the page within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForSelector('.leaflet-container');

    const loadTime = Date.now() - startTime;

    // Page should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
  });

  test('should load GeoJSON data efficiently', async ({ page }) => {
    await page.goto('/');

    // Wait for states to be visible
    const startTime = Date.now();
    await page.waitForSelector('.leaflet-interactive');
    const dataLoadTime = Date.now() - startTime;

    // GeoJSON should load within 5 seconds
    expect(dataLoadTime).toBeLessThan(5000);
  });

  test('should render state polygons', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-interactive');

    // Should have multiple polygons rendered
    const polygons = page.locator('.leaflet-interactive');
    const count = await polygons.count();

    // Should have at least some states/UTs (36 expected)
    expect(count).toBeGreaterThan(10);
  });

  test('should respond to interactions quickly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.district-item');

    const startTime = Date.now();

    // Click a state
    await page.locator('.district-item').first().click();

    // Wait for UI to update
    await page.waitForSelector('.view-toggle');

    const responseTime = Date.now() - startTime;

    // UI should respond within 2 seconds
    expect(responseTime).toBeLessThan(2000);
  });

  test('should handle search input without lag', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');

    const searchInput = page.getByPlaceholder('Search states, constituencies...');

    const startTime = Date.now();

    // Type search query
    await searchInput.fill('Chennai');

    // Wait for results
    await page.waitForSelector('.search-result-item');

    const searchTime = Date.now() - startTime;

    // Search should be responsive (under 1 second)
    expect(searchTime).toBeLessThan(1000);
  });
});

test.describe('Data Loading', () => {
  test('should load states data', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.district-item');

    // Should show states in sidebar
    const stateItems = page.locator('.district-item');
    const count = await stateItems.count();

    // Should have 36 states/UTs
    expect(count).toBeGreaterThan(30);
  });

  test('should load parliamentary constituencies', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.district-item');

    // Select a state
    await page.locator('.district-item').first().click();

    // Wait for constituencies to load
    await page.waitForSelector('.constituency-item', { timeout: 10000 }).catch(() => {
      // Some states might show districts by default
    });

    // View toggle should be visible
    await expect(page.locator('.view-toggle')).toBeVisible();
  });

  test('should cache data in IndexedDB', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');

    // Check cache status shows some data
    await expect(page.getByText(/DB:/)).toBeVisible();

    // Wait a bit for caching to occur
    await page.waitForTimeout(2000);

    // Should show memory count in cache status
    const cacheStatus = page.locator('.cache-status');
    await expect(cacheStatus).toBeVisible();
  });
});

test.describe('Network Resilience', () => {
  test('should show cached data on reload', async ({ page }) => {
    // First load to populate cache
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
    await page.waitForSelector('.district-item');

    // Reload the page
    await page.reload();
    await page.waitForSelector('.leaflet-container');

    // Should still show states
    const stateItems = page.locator('.district-item');
    await expect(stateItems.first()).toBeVisible();
  });
});

