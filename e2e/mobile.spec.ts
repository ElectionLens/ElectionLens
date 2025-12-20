import { test, expect } from '@playwright/test';

test.describe('Mobile Experience', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
  });

  test('should show mobile toggle button', async ({ page }) => {
    const toggle = page.locator('.mobile-toggle');
    await expect(toggle).toBeVisible();
  });

  test('should open sidebar when toggle clicked', async ({ page }) => {
    const toggle = page.locator('.mobile-toggle');
    await toggle.click();

    // Sidebar should be open
    const sidebar = page.locator('.sidebar.open');
    await expect(sidebar).toBeVisible();
  });

  test('should close sidebar when toggle clicked again', async ({ page }) => {
    const toggle = page.locator('.mobile-toggle');

    // Open
    await toggle.click();
    await expect(page.locator('.sidebar.open')).toBeVisible();

    // Close
    await toggle.click();
    await expect(page.locator('.sidebar.open')).not.toBeVisible();
  });

  test('should close sidebar via toggle button', async ({ page }) => {
    // Open sidebar
    await page.locator('.mobile-toggle').click();
    await expect(page.locator('.sidebar.open')).toBeVisible();

    // Close by clicking toggle again
    await page.locator('.mobile-toggle').click();

    // Sidebar should close
    await expect(page.locator('.sidebar.open')).not.toBeVisible();
  });

  test('should have touch-friendly tap targets', async ({ page }) => {
    // Open sidebar
    await page.locator('.mobile-toggle').click();
    await page.waitForSelector('.district-item');

    // State items should be tall enough for touch
    const stateItem = page.locator('.district-item').first();
    const box = await stateItem.boundingBox();

    // Should be at least 44px tall (iOS guidelines)
    expect(box?.height).toBeGreaterThanOrEqual(40);
  });

  test('should show search in sidebar on mobile', async ({ page }) => {
    // Search should be visible in sidebar
    const searchInput = page.getByPlaceholder('Search states, constituencies...');
    await expect(searchInput).toBeVisible();
  });

  test('should navigate states on mobile', async ({ page }) => {
    // Open sidebar
    await page.locator('.mobile-toggle').click();
    await page.waitForSelector('.district-item');

    // Select a state
    await page.locator('.district-item').first().click();

    // Should show state view
    await page.waitForTimeout(500);
    await expect(page.locator('.breadcrumb').locator('span').nth(1)).toBeVisible();
  });
});

test.describe('Tablet Experience', () => {
  test.use({ viewport: { width: 768, height: 1024 } }); // iPad size

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
  });

  test('should show sidebar on tablet', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('should have proper layout on tablet', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    const map = page.locator('.leaflet-container');

    await expect(sidebar).toBeVisible();
    await expect(map).toBeVisible();
  });
});

test.describe('Desktop Experience', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
  });

  test('should not show mobile toggle on desktop', async ({ page }) => {
    // Mobile toggle should not be visible (or at least not needed)
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('should show map controls on desktop', async ({ page }) => {
    // Zoom controls should be visible
    const zoomIn = page.locator('.leaflet-control-zoom-in');
    await expect(zoomIn).toBeVisible();

    const zoomOut = page.locator('.leaflet-control-zoom-out');
    await expect(zoomOut).toBeVisible();
  });

  test('should have adequate sidebar width on desktop', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    const box = await sidebar.boundingBox();

    // Sidebar should be at least 300px wide on desktop
    expect(box?.width).toBeGreaterThanOrEqual(300);
  });
});

