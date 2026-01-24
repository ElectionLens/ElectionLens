import { test, expect } from '@playwright/test';

test.describe('Booth Analysis', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to an AC with booth data
    await page.goto('/tamil-nadu/ac/gummidipundi?year=2021');
    // Wait for election panel to load
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
  });

  test('displays Analysis tab when booth data is available', async ({ page }) => {
    // Wait for panel tabs to be visible
    await page.waitForSelector('.panel-tabs', { timeout: 10000 });
    // Check if Analysis tab is visible
    const analysisTab = page.locator('.panel-tab:has-text("Analysis")');
    await expect(analysisTab).toBeVisible({ timeout: 10000 });
  });

  test('shows Booth Distribution section', async ({ page }) => {
    // Wait for panel to be ready
    await page.waitForSelector('.panel-tabs', { timeout: 10000 });
    // Click Analysis tab
    await page.click('.panel-tab:has-text("Analysis")');
    // Wait for tab content to load
    await page.waitForTimeout(500);

    // Check for Booth Distribution section
    const distribution = page.locator('.booth-distribution');
    await expect(distribution).toBeVisible({ timeout: 10000 });

    // Check for distribution bar
    const bar = page.locator('.distribution-bar');
    await expect(bar).toBeVisible({ timeout: 5000 });
  });

  test('shows Booths Won by Party section', async ({ page }) => {
    await page.waitForSelector('.panel-tabs', { timeout: 10000 });
    await page.click('.panel-tab:has-text("Analysis")');
    await page.waitForTimeout(500);

    // Check for party booth breakdown
    const breakdown = page.locator('.party-booth-breakdown');
    await expect(breakdown).toBeVisible({ timeout: 10000 });

    // Check for party cards
    const partyCards = page.locator('.party-booth-card');
    await expect(partyCards.first()).toBeVisible({ timeout: 5000 });
  });

  test('expands party booth card on click', async ({ page }) => {
    await page.waitForSelector('.panel-tabs', { timeout: 10000 });
    await page.click('.panel-tab:has-text("Analysis")');
    await page.waitForTimeout(500);

    // Get first party card
    const firstCard = page.locator('.party-booth-card').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });

    // Click to expand
    await firstCard.locator('.party-booth-header').click();
    await page.waitForTimeout(300);

    // Check if expanded
    await expect(firstCard).toHaveClass(/expanded/, { timeout: 5000 });

    // Check for booth list
    const boothList = firstCard.locator('.party-booth-list');
    await expect(boothList).toBeVisible({ timeout: 5000 });
  });

  test('shows Key Insights section', async ({ page }) => {
    await page.waitForSelector('.panel-tabs', { timeout: 10000 });
    await page.click('.panel-tab:has-text("Analysis")');
    await page.waitForTimeout(500);

    // Check for insights section
    const insights = page.locator('.analysis-insights');
    await expect(insights).toBeVisible({ timeout: 10000 });
  });

  test('shows Strike Rate table', async ({ page }) => {
    await page.waitForSelector('.panel-tabs', { timeout: 10000 });
    await page.click('.panel-tab:has-text("Analysis")');
    await page.waitForTimeout(500);

    // Check for strike rate table
    const strikeRateTable = page.locator('.strike-rate-table');
    await expect(strikeRateTable).toBeVisible({ timeout: 10000 });

    // Check for at least one row
    const strikeRateRow = page.locator('.strike-rate-row');
    await expect(strikeRateRow.first()).toBeVisible({ timeout: 5000 });
  });

  test('shows Quick Stats section', async ({ page }) => {
    await page.waitForSelector('.panel-tabs', { timeout: 10000 });
    await page.click('.panel-tab:has-text("Analysis")');
    await page.waitForTimeout(500);

    // Check for quick stats - may be in analysis-quick-stats-section
    const quickStats = page.locator('.analysis-quick-stats, .analysis-quick-stats-section');
    await expect(quickStats.first()).toBeVisible({ timeout: 10000 });

    // Check for stat items - may have different class names
    const statItems = page.locator('.quick-stat, .summary-stat');
    const count = await statItems.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Booth Data View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tamil-nadu/ac/gummidipundi?year=2021');
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
  });

  test('displays Booths tab', async ({ page }) => {
    await page.waitForSelector('.panel-tabs', { timeout: 10000 });
    const boothsTab = page.locator('.panel-tab:has-text("Booths")');
    await expect(boothsTab).toBeVisible({ timeout: 10000 });
  });

  test('shows booth selector dropdown', async ({ page }) => {
    await page.click('.panel-tab:has-text("Booths")');

    const dropdown = page.locator('.booth-dropdown');
    await expect(dropdown).toBeVisible();
  });

  test('shows booth stats summary', async ({ page }) => {
    await page.click('.panel-tab:has-text("Booths")');

    const statsSummary = page.locator('.booth-stats-summary');
    await expect(statsSummary).toBeVisible();
  });
});

test.describe('Postal Ballots View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tamil-nadu/ac/gummidipundi?year=2021');
    await page.waitForLoadState('networkidle');
  });

  test('displays Postal tab', async ({ page }) => {
    const postalTab = page.locator('.panel-tab:has-text("Postal")');
    await expect(postalTab).toBeVisible();
  });

  test('shows postal ballot summary', async ({ page }) => {
    await page.click('.panel-tab:has-text("Postal")');

    const summary = page.locator('.postal-summary');
    await expect(summary).toBeVisible();
  });

  test('shows postal candidates list', async ({ page }) => {
    await page.click('.panel-tab:has-text("Postal")');

    const candidatesList = page.locator('.postal-candidates');
    await expect(candidatesList).toBeVisible();
  });
});
