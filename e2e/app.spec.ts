import { test, expect } from '@playwright/test';

test.describe('Election Lens App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the home page', async ({ page }) => {
    await expect(page).toHaveTitle(/Election Lens/);
  });

  test('should display the India map', async ({ page }) => {
    // Wait for map to load
    await page.waitForSelector('.leaflet-container');
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
  });

  test('should display the sidebar', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('Election Lens')).toBeVisible();
  });

  test('should have state boundaries visible', async ({ page }) => {
    await page.waitForSelector('.leaflet-container');
    // GeoJSON layers should be rendered
    const paths = page.locator('.leaflet-interactive');
    await expect(paths.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('State Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-interactive', { timeout: 10000 });
  });

  test('should navigate to state when clicked', async ({ page }) => {
    // Click on a state polygon
    const statePath = page.locator('.leaflet-interactive').first();
    await statePath.click();
    
    // URL should update with state name
    await expect(page).toHaveURL(/\/[a-z-]+/);
  });

  test('should show back button after state selection', async ({ page }) => {
    const statePath = page.locator('.leaflet-interactive').first();
    await statePath.click();
    
    // Wait for navigation
    await page.waitForURL(/\/[a-z-]+/);
    
    // Back button should appear
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeVisible();
  });

  test('should return to India view on home button click', async ({ page }) => {
    // Navigate to a state first
    const statePath = page.locator('.leaflet-interactive').first();
    await statePath.click();
    await page.waitForURL(/\/[a-z-]+/);
    
    // Click home button
    const homeButton = page.getByRole('button', { name: /home/i });
    await homeButton.click();
    
    // Should return to root URL
    await expect(page).toHaveURL('/');
  });
});

test.describe('Deep Linking', () => {
  test('should load state from URL', async ({ page }) => {
    await page.goto('/tamil-nadu');
    
    // Map should show Tamil Nadu
    await page.waitForSelector('.leaflet-container');
    await expect(page).toHaveURL('/tamil-nadu');
  });

  test('should load PC view from URL', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem');
    
    await page.waitForSelector('.leaflet-container');
    await expect(page).toHaveURL('/tamil-nadu/pc/salem');
  });

  test('should load district view from URL', async ({ page }) => {
    await page.goto('/tamil-nadu/district/chennai');
    
    await page.waitForSelector('.leaflet-container');
    await expect(page).toHaveURL(/tamil-nadu\/district\/chennai/);
  });

  test('should load assembly constituency from URL with year', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.leaflet-container');
    await expect(page).toHaveURL(/tamil-nadu\/pc\/salem\/ac\/omalur/);
  });
});

test.describe('Election Panel', () => {
  test('should show election panel when AC is selected', async ({ page }) => {
    // Navigate to an AC via URL
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    // Wait for election panel to appear
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
  });

  test('should display winner information', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
    
    // Should have winner section
    const winnerSection = panel.locator('.winner-card-compact');
    await expect(winnerSection).toBeVisible();
  });

  test('should have year selector with multiple years', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.election-panel');
    
    // Year selector should be visible
    const yearSelector = page.locator('.election-year-selector');
    await expect(yearSelector).toBeVisible();
    
    // Should have year buttons
    const yearButtons = yearSelector.locator('.year-btn');
    expect(await yearButtons.count()).toBeGreaterThan(0);
  });

  test('should switch years when year button clicked', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.election-panel');
    
    // Click a different year
    const yearButton = page.locator('.year-btn').filter({ hasText: '2016' });
    if (await yearButton.count() > 0) {
      await yearButton.click();
      await expect(page).toHaveURL(/year=2016/);
    }
  });

  test('should close panel on close button click', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
    
    // Click close button
    const closeButton = panel.locator('.close-btn');
    await closeButton.click();
    
    // Panel should be hidden
    await expect(panel).not.toBeVisible();
  });
});

test.describe('Share Functionality', () => {
  test('should have share button in sidebar', async ({ page }) => {
    await page.goto('/tamil-nadu');
    
    const shareButton = page.locator('.share-btn');
    await expect(shareButton).toBeVisible();
  });

  test('should copy link to clipboard on share click', async ({ page }) => {
    await page.goto('/tamil-nadu');
    
    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    
    const shareButton = page.locator('.share-btn');
    await shareButton.click();
    
    // Button should show copied state
    await expect(shareButton).toHaveClass(/copied/);
  });
});

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
  });

  test('should collapse sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    const sidebar = page.locator('.sidebar');
    // Sidebar should be collapsed or have toggle
    await expect(sidebar).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
  });
});

test.describe('Parliament Results', () => {
  test('should show parliament panel for PC', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem');
    
    // Wait for PC panel
    const panel = page.locator('.pc-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
  });

  test('should show Parliament badge', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem');
    
    await page.waitForSelector('.pc-panel');
    
    const badge = page.locator('.pc-badge');
    await expect(badge).toContainText('Parliament');
  });
});

test.describe('Tab Navigation in Election Panel', () => {
  test('should have Overview and Candidates tabs', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.election-panel');
    
    const overviewTab = page.locator('.panel-tab').filter({ hasText: 'Overview' });
    const candidatesTab = page.locator('.panel-tab').filter({ hasText: 'Candidates' });
    
    await expect(overviewTab).toBeVisible();
    await expect(candidatesTab).toBeVisible();
  });

  test('should switch to Candidates tab', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.election-panel');
    
    const candidatesTab = page.locator('.panel-tab').filter({ hasText: 'Candidates' });
    await candidatesTab.click();
    
    // Candidates list should be visible
    const candidatesList = page.locator('.candidates-full');
    await expect(candidatesList).toBeVisible();
  });
});

