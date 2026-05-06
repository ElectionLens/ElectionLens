import { test, expect } from '@playwright/test';
import { expandMobileElectionPanelToFull } from './panel-helpers';
import { openSidebarSheet, sidebarYearSelectOption } from './sidebar-helpers';

test.describe('State map summary panel', () => {
  async function expandSummaryIfMobile(page: import('@playwright/test').Page) {
    const summary = page.locator('.sidebar-summary');
    await expandMobileElectionPanelToFull(summary, page);
  }

  test('assembly state map shows seats won and vote share in separate tabs', async ({ page }) => {
    await page.goto('/tamil-nadu/ac?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-interactive').length > 10,
      { timeout: 25000 }
    );
    await openSidebarSheet(page);

    const seatsPane = page.locator('.sidebar-summary[data-summary-pane="seats"]');
    await expect(seatsPane).toBeVisible({ timeout: 30000 });
    await expandSummaryIfMobile(page);

    await expect
      .poll(
        async () => {
          const text = await seatsPane.innerText();
          return /\d+\s+ACs counted/.test(text);
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);

    await sidebarYearSelectOption(page, 'sidebar-panel-view', 'votes');

    const votesPane = page.locator('.sidebar-summary[data-summary-pane="votes"]');
    await expect(votesPane).toBeVisible();

    await expect
      .poll(
        async () => {
          const text = await votesPane.innerText();
          return (
            text.includes('%') ||
            text.includes('Loading or no result file matched to the map.')
          );
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);
  });

  test('parliament state map shows seats won and vote share in separate tabs', async ({ page }) => {
    await page.goto('/tamil-nadu/pc?year=2024');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-interactive').length > 3,
      { timeout: 25000 }
    );
    await openSidebarSheet(page);

    const seatsPane = page.locator('.sidebar-summary[data-summary-pane="seats"]');
    await expect(seatsPane).toBeVisible({ timeout: 30000 });
    await expandSummaryIfMobile(page);

    await expect
      .poll(
        async () => {
          const text = await seatsPane.innerText();
          return /\d+\s+PCs counted/.test(text);
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);

    await sidebarYearSelectOption(page, 'sidebar-panel-view', 'votes');

    const votesPane = page.locator('.sidebar-summary[data-summary-pane="votes"]');
    await expect(votesPane).toBeVisible();

    await expect
      .poll(
        async () => {
          const text = await votesPane.innerText();
          return /\d+\s+PCs counted/.test(text) && text.includes('%');
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);
  });

  test('clicking a summary party dims other assembly polygons and toggles off', async ({ page }) => {
    await page.goto('/tamil-nadu/ac?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-interactive').length > 10, {
      timeout: 25000,
    });
    await openSidebarSheet(page);

    const summary = page.locator('.sidebar-summary[data-summary-pane="seats"]');
    await expect(summary).toBeVisible({ timeout: 30000 });
    await expandSummaryIfMobile(page);

    const partyBtn = summary.locator('.state-map-summary-party-link').first();
    await expect(partyBtn).toBeVisible();

    const countDimmed = async () =>
      page.evaluate(() => {
        const paths = Array.from(document.querySelectorAll<SVGPathElement>('.leaflet-interactive'));
        return paths.filter((p) => {
          const opRaw = p.getAttribute('fill-opacity');
          const op = opRaw == null ? NaN : Number(opRaw);
          return Number.isFinite(op) && op <= 0.21;
        }).length;
      });

    const baselineDimmed = await countDimmed();

    await partyBtn.click();
    await expect(partyBtn).toHaveAttribute('aria-pressed', 'true');

    await expect
      .poll(async () => countDimmed(), { timeout: 15000, intervals: [150, 300, 500] })
      .toBeGreaterThan(baselineDimmed);
    const dimmedAfterSelect = await countDimmed();

    await partyBtn.click();
    await expect(partyBtn).toHaveAttribute('aria-pressed', 'false');

    await expect
      .poll(async () => countDimmed(), { timeout: 15000, intervals: [150, 300, 500] })
      .toBeLessThanOrEqual(dimmedAfterSelect);
  });

  test('hides state map summary when an assembly is selected', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/anna-nagar?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await openSidebarSheet(page);
    await page.waitForSelector('.sidebar .election-panel', { timeout: 25000 });

    await expect(page.locator('.sidebar-summary')).toHaveCount(0);
  });

  test('hides state map summary when a PC is selected (PC boundary mode)', async ({
    page,
  }) => {
    // With showACs=false, map level is constituencies — summary hides when currentPC is set.
    await page.goto('/tamil-nadu/pc/salem?showACs=false');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await openSidebarSheet(page);
    await expect(page.locator('.pc-panel')).toBeVisible({ timeout: 20000 });

    await expect(page.locator('.sidebar-summary')).toHaveCount(0);
  });
});
