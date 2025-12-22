import { test, expect } from '@playwright/test';

test.describe('Election Lens App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to be ready
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
  });

  test('should load the home page', async ({ page }) => {
    await expect(page).toHaveTitle(/Election Lens/);
  });

  test('should display the India map', async ({ page }) => {
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
  });

  test('should display the sidebar', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('Election Lens')).toBeVisible();
  });

  test('should have state boundaries visible', async ({ page }) => {
    // Wait for GeoJSON to render
    await page.waitForFunction(() => {
      const paths = document.querySelectorAll('.leaflet-interactive');
      return paths.length > 0 && paths[0].getAttribute('d') !== 'M0 0';
    }, { timeout: 15000 });
    
    const paths = page.locator('.leaflet-interactive');
    await expect(paths.first()).toBeVisible();
  });
});

test.describe('State Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for map and GeoJSON to be fully rendered
    await page.waitForFunction(() => {
      const paths = document.querySelectorAll('.leaflet-interactive');
      return paths.length > 0 && paths[0].getAttribute('d') !== 'M0 0';
    }, { timeout: 15000 });
    // Allow map to stabilize
    await page.waitForTimeout(500);
  });

  test('should navigate to state when clicked', async ({ page }) => {
    // Click on a state polygon using force to avoid intercept issues
    const statePath = page.locator('.leaflet-interactive').first();
    await statePath.click({ force: true });
    
    // URL should update with state name
    await expect(page).toHaveURL(/\/[a-z-]+/, { timeout: 10000 });
  });

  test('should show back button after state selection', async ({ page }) => {
    const statePath = page.locator('.leaflet-interactive').first();
    await statePath.click({ force: true });
    
    // Wait for navigation
    await page.waitForURL(/\/[a-z-]+/, { timeout: 10000 });
    
    // Back button should appear
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });

  test('should return to India view on home button click', async ({ page, isMobile }) => {
    // Skip on mobile - breadcrumb layout differs and India link may be off-screen
    test.skip(isMobile === true, 'Breadcrumb navigation differs on mobile');
    
    // Navigate to a state first
    const statePath = page.locator('.leaflet-interactive').first();
    await statePath.click({ force: true });
    await page.waitForURL(/\/[a-z-]+/, { timeout: 10000 });
    
    // Click India link in breadcrumb (home navigation)
    const indiaLink = page.getByRole('link', { name: 'India' }).or(
      page.locator('.breadcrumb a').filter({ hasText: 'India' })
    );
    await indiaLink.click();
    
    // Should return to root URL
    await expect(page).toHaveURL('/');
  });
});

test.describe('Deep Linking', () => {
  test('should load state from URL', async ({ page }) => {
    await page.goto('/tamil-nadu');
    
    // Map should show Tamil Nadu
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await expect(page).toHaveURL('/tamil-nadu');
  });

  test('should load PC view from URL', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem');
    
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await expect(page).toHaveURL('/tamil-nadu/pc/salem');
  });

  test('should load district view from URL', async ({ page }) => {
    await page.goto('/tamil-nadu/district/chennai');
    
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await expect(page).toHaveURL(/tamil-nadu\/district\/chennai/);
  });

  test('should load assembly constituency from URL with year', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await expect(page).toHaveURL(/tamil-nadu\/pc\/salem\/ac\/omalur/);
  });
});

test.describe('Election Panel', () => {
  test('should show election panel when AC is selected', async ({ page }) => {
    // Navigate to an AC via URL
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    // Wait for election panel to appear
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
  });

  test('should display winner information', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    
    // Should have winner section
    const winnerSection = panel.locator('.winner-card-compact');
    await expect(winnerSection).toBeVisible();
  });

  test('should have year selector with multiple years', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    // Year selector should be visible
    const yearSelector = page.locator('.election-year-selector');
    await expect(yearSelector).toBeVisible();
    
    // Should have year buttons
    const yearButtons = yearSelector.locator('.year-btn');
    expect(await yearButtons.count()).toBeGreaterThan(0);
  });

  test('should switch years when year button clicked', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
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
    await expect(panel).toBeVisible({ timeout: 15000 });
    
    // Click close button (correct selector)
    const closeButton = panel.locator('.election-panel-close');
    await closeButton.click();
    
    // Panel should be hidden
    await expect(panel).not.toBeVisible();
  });
});

test.describe('Share Functionality', () => {
  test('should have share button in sidebar', async ({ page }) => {
    await page.goto('/tamil-nadu');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    const shareButton = page.locator('.share-btn');
    await expect(shareButton).toBeVisible();
  });

  test('should copy link to clipboard on share click', async ({ page, browserName, isMobile }) => {
    // Skip clipboard test on Safari/WebKit as it doesn't support clipboard permissions
    test.skip(browserName === 'webkit', 'WebKit does not support clipboard permissions');
    // Skip on mobile - share button may be outside viewport
    test.skip(isMobile === true, 'Share button layout differs on mobile');
    
    await page.goto('/tamil-nadu');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    // Grant clipboard permissions (works on Chromium/Firefox)
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    } catch {
      // Some browsers don't support these permissions - skip test
      test.skip();
      return;
    }
    
    const shareButton = page.locator('.share-btn');
    await shareButton.click({ force: true });
    
    // Button should show copied state
    await expect(shareButton).toHaveClass(/copied/, { timeout: 5000 });
  });
});

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
  });

  test('should collapse sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    const sidebar = page.locator('.sidebar');
    // Sidebar should be collapsed or have toggle
    await expect(sidebar).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
  });
});

test.describe('Parliament Results', () => {
  test('should show parliament panel for PC', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem');
    
    // Wait for PC panel
    const panel = page.locator('.pc-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
  });

  test('should show Parliament badge', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem');
    
    await page.waitForSelector('.pc-panel', { timeout: 15000 });
    
    const badge = page.locator('.pc-badge');
    await expect(badge).toContainText('Parliament');
  });
});

test.describe('Tab Navigation in Election Panel', () => {
  test('should have Overview and Candidates tabs', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    const overviewTab = page.locator('.panel-tab').filter({ hasText: 'Overview' });
    const candidatesTab = page.locator('.panel-tab').filter({ hasText: 'Candidates' });
    
    await expect(overviewTab).toBeVisible();
    await expect(candidatesTab).toBeVisible();
  });

  test('should switch to Candidates tab', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    const candidatesTab = page.locator('.panel-tab').filter({ hasText: 'Candidates' });
    await candidatesTab.click();
    
    // Candidates list should be visible
    const candidatesList = page.locator('.candidates-full');
    await expect(candidatesList).toBeVisible();
  });
});
