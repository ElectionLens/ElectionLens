import { test, expect } from '@playwright/test';

test.describe('Booth Analysis', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to an AC with booth data
    await page.goto('/tamil-nadu/ac/gummidipundi?year=2021');
    await page.waitForLoadState('networkidle');
  });

  test('displays Analysis tab when booth data is available', async ({ page }) => {
    // Check if Analysis tab is visible
    const analysisTab = page.locator('.panel-tab:has-text("Analysis")');
    await expect(analysisTab).toBeVisible();
  });

  test('shows Booth Distribution section', async ({ page }) => {
    // Click Analysis tab
    await page.click('.panel-tab:has-text("Analysis")');

    // Check for Booth Distribution section
    const distribution = page.locator('.booth-distribution');
    await expect(distribution).toBeVisible();

    // Check for distribution bar
    const bar = page.locator('.distribution-bar');
    await expect(bar).toBeVisible();
  });

  test('shows Booths Won by Party section', async ({ page }) => {
    await page.click('.panel-tab:has-text("Analysis")');

    // Check for party booth breakdown
    const breakdown = page.locator('.party-booth-breakdown');
    await expect(breakdown).toBeVisible();

    // Check for party cards
    const partyCards = page.locator('.party-booth-card');
    await expect(partyCards.first()).toBeVisible();
  });

  test('expands party booth card on click', async ({ page }) => {
    await page.click('.panel-tab:has-text("Analysis")');

    // Get first party card
    const firstCard = page.locator('.party-booth-card').first();
    await expect(firstCard).toBeVisible();

    // Click to expand
    await firstCard.locator('.party-booth-header').click();

    // Check if expanded
    await expect(firstCard).toHaveClass(/expanded/);

    // Check for booth list
    const boothList = firstCard.locator('.party-booth-list');
    await expect(boothList).toBeVisible();
  });

  test('shows Key Insights section', async ({ page }) => {
    await page.click('.panel-tab:has-text("Analysis")');

    // Check for insights section
    const insights = page.locator('.analysis-insights');
    await expect(insights).toBeVisible();
  });

  test('shows Strike Rate table', async ({ page }) => {
    await page.click('.panel-tab:has-text("Analysis")');

    // Check for strike rate table
    const strikeRateTable = page.locator('.strike-rate-table');
    await expect(strikeRateTable).toBeVisible();

    // Check for at least one row
    const strikeRateRow = page.locator('.strike-rate-row');
    await expect(strikeRateRow.first()).toBeVisible();
  });

  test('shows Quick Stats section', async ({ page }) => {
    await page.click('.panel-tab:has-text("Analysis")');

    // Check for quick stats
    const quickStats = page.locator('.analysis-quick-stats');
    await expect(quickStats).toBeVisible();

    // Check for stat items
    const statItems = page.locator('.quick-stat');
    await expect(statItems.first()).toBeVisible();
  });
});

test.describe('Booth Data View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tamil-nadu/ac/gummidipundi?year=2021');
    await page.waitForLoadState('networkidle');
  });

  test('displays Booths tab', async ({ page }) => {
    const boothsTab = page.locator('.panel-tab:has-text("Booths")');
    await expect(boothsTab).toBeVisible();
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
