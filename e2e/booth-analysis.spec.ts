import { test, expect, type Page } from '@playwright/test';
import { ensureElectionPanelVisible } from './panel-helpers';
import { acPanelViewNative } from './panel-select-helpers';

/** Avoid networkidle — Vite/HMR and background requests often prevent it from settling. */
async function waitForAcPanelReady(page: Page): Promise<void> {
  await page.waitForSelector('.leaflet-container', { timeout: 15000 });
  await ensureElectionPanelVisible(page);
  await page.waitForSelector('#ac-panel-view', { timeout: 15000 });
}

test.describe('Booth Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tamil-nadu/ac/gummidipundi?year=2021');
    await waitForAcPanelReady(page);
  });

  test('displays Analysis tab when booth data is available', async ({ page }) => {
    await expect(page.locator('#ac-panel-view')).toBeVisible({ timeout: 10000 });
    await expect(acPanelViewNative(page).locator('option[value="analysis"]')).toHaveCount(1);
  });

  test('shows Booth Distribution section', async ({ page }) => {
    // Wait for panel to be ready
    await acPanelViewNative(page).selectOption('analysis', { force: true });
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
    await acPanelViewNative(page).selectOption('analysis', { force: true });
    await page.waitForTimeout(500);

    // Check for party booth breakdown
    const breakdown = page.locator('.party-booth-breakdown');
    await expect(breakdown).toBeVisible({ timeout: 10000 });

    // Check for party cards
    const partyCards = page.locator('.party-booth-card');
    await expect(partyCards.first()).toBeVisible({ timeout: 5000 });
  });

  test('expands party booth card on click', async ({ page }) => {
    await acPanelViewNative(page).selectOption('analysis', { force: true });
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
    await expect(firstCard.locator('.booth-list-item').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows Key Insights section', async ({ page }) => {
    await acPanelViewNative(page).selectOption('analysis', { force: true });
    await page.waitForTimeout(500);

    // Check for insights section
    const insights = page.locator('.analysis-insights');
    await expect(insights).toBeVisible({ timeout: 10000 });
  });

  test('shows Strike Rate table', async ({ page }) => {
    await acPanelViewNative(page).selectOption('analysis', { force: true });
    await page.waitForTimeout(500);

    // Check for strike rate table
    const strikeRateTable = page.locator('.strike-rate-table');
    await expect(strikeRateTable).toBeVisible({ timeout: 10000 });

    // Check for at least one row
    const strikeRateRow = page.locator('.strike-rate-row');
    await expect(strikeRateRow.first()).toBeVisible({ timeout: 5000 });
  });

  test('shows Quick Stats section', async ({ page }) => {
    const viewNative = acPanelViewNative(page);
    if ((await viewNative.locator('option[value="analysis"]').count()) === 0) {
      test.skip(true, 'Analysis view not available for this constituency/year');
    }
    await viewNative.selectOption('analysis', { force: true });
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
    await waitForAcPanelReady(page);
  });

  test('displays Booths tab', async ({ page }) => {
    await expect(page.locator('#ac-panel-view')).toBeVisible({ timeout: 10000 });
    await expect(acPanelViewNative(page).locator('option[value="booths"]')).toHaveCount(1);
  });

  test('shows booth selector dropdown', async ({ page }) => {
    await acPanelViewNative(page).selectOption('booths', { force: true });

    const dropdown = page.locator('.booth-dropdown');
    await expect(dropdown).toBeVisible();
  });

  test('shows booth stats summary', async ({ page }) => {
    await acPanelViewNative(page).selectOption('booths', { force: true });

    const statsSummary = page.locator('.booth-stats-summary');
    await expect(statsSummary).toBeVisible();
  });
});

test.describe('Postal Ballots View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tamil-nadu/ac/gummidipundi?year=2021');
    await waitForAcPanelReady(page);
  });

  test('displays Postal tab', async ({ page }) => {
    await expect(acPanelViewNative(page).locator('option[value="postal"]')).toHaveCount(1);
  });

  test('shows postal ballot summary', async ({ page }) => {
    await acPanelViewNative(page).selectOption('postal', { force: true });

    const summary = page.locator('.postal-summary');
    await expect(summary).toBeVisible();
  });

  test('shows postal candidates list', async ({ page }) => {
    await acPanelViewNative(page).selectOption('postal', { force: true });

    const candidatesList = page.locator('.postal-candidates');
    await expect(candidatesList).toBeVisible();
  });

  test('postal tab renders candidate rows in the card list', async ({ page }) => {
    await acPanelViewNative(page).selectOption('postal', { force: true });
    await expect(page.locator('.postal-candidates-list')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.postal-candidate-row').first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Booth Data View — candidate cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tamil-nadu/ac/gummidipundi?year=2021');
    await waitForAcPanelReady(page);
  });

  test('shows booth-wise candidate card rows when a booth is selected', async ({ page }) => {
    await acPanelViewNative(page).selectOption('booths', { force: true });
    const dropdown = page.locator('.booth-dropdown');
    await expect(dropdown).toBeVisible();
    const optionCount = await dropdown.locator('option').count();
    if (optionCount <= 1) {
      test.skip(true, 'No booth options for this fixture');
    }
    await dropdown.selectOption({ index: 1 });
    await expect(page.locator('.booth-candidate-row').first()).toBeVisible({ timeout: 20000 });
  });
});
