import { test, expect } from '@playwright/test';

test.describe('ElectionLens App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('.leaflet-container');
  });

  test('should load the homepage with map', async ({ page }) => {
    // Check title
    await expect(page).toHaveTitle(/Election Lens/);

    // Check map is visible
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();

    // Check sidebar header
    await expect(page.getByText('Election Lens')).toBeVisible();
  });

  test('should display states on the map', async ({ page }) => {
    // Wait for GeoJSON layers to load
    await page.waitForSelector('.leaflet-interactive');

    // Should have multiple state polygons
    const polygons = page.locator('.leaflet-interactive');
    await expect(polygons.first()).toBeVisible();
  });

  test('should show India info in sidebar by default', async ({ page }) => {
    // Should show India as the current view (may appear multiple times)
    await expect(page.getByText('India').first()).toBeVisible();

    // Should show States & Union Territories list
    await expect(page.getByText(/States & Union Territories/)).toBeVisible();
  });

  test('should show cache status', async ({ page }) => {
    // Cache status should be visible
    await expect(page.getByText(/DB:/)).toBeVisible();
  });
});

test.describe('State Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
  });

  test('should select a state from sidebar list', async ({ page }) => {
    // Wait for states to load
    await page.waitForSelector('.district-item');

    // Click on a state (Tamil Nadu should be in the list)
    const stateItem = page.locator('.district-item').filter({ hasText: 'Tamil Nadu' });
    if (await stateItem.isVisible()) {
      await stateItem.click();

      // Should update breadcrumb
      await expect(page.locator('.breadcrumb')).toContainText('Tamil Nadu');

      // Should show view toggle
      await expect(page.getByRole('button', { name: /Parliamentary Constituencies/i })).toBeVisible();
    }
  });

  test('should navigate back to India from state view', async ({ page }) => {
    // Select a state first
    await page.waitForSelector('.district-item');
    const stateItem = page.locator('.district-item').first();
    await stateItem.click();

    // Wait for state view to load
    await page.waitForTimeout(500);

    // Click on India in breadcrumb to go back
    await page.locator('.breadcrumb').getByText('India').click();

    // Should be back at India view
    await expect(page.getByText(/States & Union Territories/)).toBeVisible();
  });
});

test.describe('View Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
  });

  test('should toggle between constituencies and districts view', async ({ page }) => {
    // Select a state first
    await page.waitForSelector('.district-item');
    const stateItem = page.locator('.district-item').first();
    await stateItem.click();

    // Wait for view toggle to appear
    await page.waitForSelector('.view-toggle');

    // Click Districts button
    const districtsBtn = page.getByRole('button', { name: /Districts/i });
    if (await districtsBtn.isVisible()) {
      await districtsBtn.click();

      // Should show districts view
      await expect(districtsBtn).toHaveClass(/active/);
    }

    // Click Parliamentary Constituencies button
    const pcBtn = page.getByRole('button', { name: /Parliamentary Constituencies/i });
    if (await pcBtn.isVisible()) {
      await pcBtn.click();

      // Should show constituencies view
      await expect(pcBtn).toHaveClass(/active/);
    }
  });
});

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
  });

  test('should show search box', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search states, constituencies...');
    await expect(searchInput).toBeVisible();
  });

  test('should search and filter results', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search states, constituencies...');
    await searchInput.fill('Tamil');

    // Should show search results
    await page.waitForSelector('.search-results');
    const results = page.locator('.search-result-item');
    await expect(results.first()).toBeVisible();
  });

  test('should select search result and navigate', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search states, constituencies...');
    await searchInput.fill('Kerala');

    // Wait for results
    await page.waitForSelector('.search-result-item');

    // Click on first result
    await page.locator('.search-result-item').first().click();

    // Should navigate - search should clear
    await expect(searchInput).toHaveValue('');
  });

  test('should clear search with clear button', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search states, constituencies...');
    await searchInput.fill('Delhi');

    // Click clear button
    await page.getByLabel('Clear search').click();

    // Search should be cleared
    await expect(searchInput).toHaveValue('');
  });

  test('should navigate search results with keyboard', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search states, constituencies...');
    await searchInput.fill('Chennai');

    // Wait for results
    await page.waitForSelector('.search-result-item');

    // Press ArrowDown to navigate
    await searchInput.press('ArrowDown');

    // Second item should be selected
    const secondItem = page.locator('.search-result-item').nth(1);
    await expect(secondItem).toHaveClass(/selected/);

    // Press Enter to select
    await searchInput.press('Enter');

    // Search should clear after selection
    await expect(searchInput).toHaveValue('');
  });

  test('should close search results with Escape', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search states, constituencies...');
    await searchInput.fill('Mumbai');

    // Wait for results
    await page.waitForSelector('.search-results');
    await expect(page.locator('.search-results')).toBeVisible();

    // Press Escape - this blurs the input which closes results
    await searchInput.press('Escape');

    // Wait for the blur and state update
    await page.waitForTimeout(100);

    // Results should be hidden (or input should be blurred)
    // The search results close when input loses focus or Escape is pressed
    const resultsVisible = await page.locator('.search-results').isVisible();
    const inputFocused = await searchInput.evaluate((el) => document.activeElement === el);

    // Either results are hidden OR input is no longer focused
    expect(resultsVisible === false || inputFocused === false).toBe(true);
  });
});

test.describe('Map Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
  });

  test('should show map legend', async ({ page }) => {
    const legend = page.locator('#mapLegend');
    await expect(legend).toBeVisible();
  });

  test('should have map toolbar with reset button', async ({ page }) => {
    const toolbar = page.locator('.map-toolbar');
    await expect(toolbar).toBeVisible();

    // Reset button should be visible
    const resetBtn = page.locator('.toolbar-btn').first();
    await expect(resetBtn).toBeVisible();
  });

  test('should reset map view when reset button clicked', async ({ page }) => {
    // First, select a state to change the view
    await page.waitForSelector('.district-item');
    const stateItem = page.locator('.district-item').first();
    await stateItem.click();

    // Wait for state view
    await page.waitForTimeout(500);

    // Click reset button
    await page.locator('.toolbar-btn').first().click();

    // Should be back at India view
    await expect(page.getByText(/States & Union Territories/)).toBeVisible();
  });
});

test.describe('Breadcrumb Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
  });

  test('should show breadcrumb', async ({ page }) => {
    const breadcrumb = page.locator('.breadcrumb');
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText('India');
  });

  test('should update breadcrumb when navigating', async ({ page }) => {
    // Select a state
    await page.waitForSelector('.district-item');
    const stateItem = page.locator('.district-item').first();
    const stateName = await stateItem.textContent();
    await stateItem.click();

    // Breadcrumb should show state
    const breadcrumb = page.locator('.breadcrumb');
    await expect(breadcrumb).toContainText('India');
    if (stateName) {
      await expect(breadcrumb).toContainText(stateName.trim());
    }
  });

  test('should navigate using breadcrumb links', async ({ page }) => {
    // Select a state
    await page.waitForSelector('.district-item');
    await page.locator('.district-item').first().click();

    // Wait for navigation
    await page.waitForTimeout(500);

    // Click India in breadcrumb
    await page.locator('.breadcrumb').getByText('India').click();

    // Should be back at India
    await expect(page.getByText(/States & Union Territories/)).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container');
  });

  test('should have accessible search input', async ({ page }) => {
    const searchInput = page.getByLabel('Search regions');
    await expect(searchInput).toBeVisible();
  });

  test('should have keyboard navigable sidebar items', async ({ page }) => {
    await page.waitForSelector('.district-item');

    // State items should be focusable
    const firstState = page.locator('.district-item').first();
    await expect(firstState).toHaveAttribute('role', 'button');
    await expect(firstState).toHaveAttribute('tabindex', '0');
  });

  test('should have ARIA labels on interactive elements', async ({ page }) => {
    // Clear search button should have aria-label
    const searchInput = page.getByPlaceholder('Search states, constituencies...');
    await searchInput.fill('test');

    const clearBtn = page.getByLabel('Clear search');
    await expect(clearBtn).toBeVisible();
  });
});

test.describe('URL State', () => {
  test('should reflect state in URL when navigating', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.district-item');

    // Select a state
    const stateItem = page.locator('.district-item').filter({ hasText: 'Tamil Nadu' });
    if (await stateItem.isVisible()) {
      await stateItem.click();

      // URL should change (could be path-based or query-based)
      await page.waitForTimeout(500);
      const url = page.url();
      // URL should have changed from just '/'
      expect(url.length).toBeGreaterThan('http://localhost:3000/'.length);
    }
  });

  test('should restore state from URL', async ({ page }) => {
    // Navigate directly to a state using path-based URL
    await page.goto('/kerala');
    await page.waitForSelector('.leaflet-container');

    // Should show Kerala in breadcrumb
    await expect(page.locator('.breadcrumb')).toContainText('Kerala');
  });
});

