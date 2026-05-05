import { test, expect } from '@playwright/test';
import { expandMobileElectionPanelToFull } from './panel-helpers';

test.describe('State map summary panel', () => {
  async function expandSummaryIfMobile(page: import('@playwright/test').Page) {
    const summary = page.locator('.election-panel.state-map-summary-panel');
    await expandMobileElectionPanelToFull(summary, page);
  }

  test('assembly state map shows summary with seats and vote sections', async ({ page }) => {
    await page.goto('/tamil-nadu/ac?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-interactive').length > 10,
      { timeout: 25000 }
    );

    const summary = page.locator('.election-panel.state-map-summary-panel.state-map-summary-assembly');
    await expect(summary).toBeVisible({ timeout: 30000 });
    await expandSummaryIfMobile(page);

    await expect(summary.getByRole('heading', { name: /Assembly •/ })).toBeVisible();
    await expect(summary.getByRole('heading', { name: /Seats won \(ACs\)/ })).toBeVisible();
    await expect(summary.getByRole('heading', { name: /Vote share \(statewide\)/ })).toBeVisible();

    await expect
      .poll(
        async () => {
          const text = await summary.innerText();
          return (
            /\d+\s+ACs counted/.test(text) &&
            (text.includes('%') || text.includes('Loading or no result file matched to the map.'))
          );
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);
  });

  test('parliament state map shows summary with seats and vote sections', async ({ page }) => {
    await page.goto('/tamil-nadu/pc?year=2024');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-interactive').length > 3,
      { timeout: 25000 }
    );

    const summary = page.locator('.election-panel.state-map-summary-panel.state-map-summary-parliament');
    await expect(summary).toBeVisible({ timeout: 30000 });
    await expandSummaryIfMobile(page);

    await expect(summary.getByRole('heading', { name: /Lok Sabha •/ })).toBeVisible();
    await expect(summary.getByRole('heading', { name: /Seats won \(PCs\)/ })).toBeVisible();
    await expect(summary.getByRole('heading', { name: /Vote share \(state\)/ })).toBeVisible();

    await expect
      .poll(
        async () => {
          const text = await summary.innerText();
          return /\d+\s+PCs counted/.test(text) && text.includes('%');
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);
  });

  test('hides state map summary when an assembly is selected', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/anna-nagar?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForSelector('.election-panel', { timeout: 25000 });

    await expect(page.locator('.state-map-summary-panel')).toHaveCount(0);
  });

  test('hides state map summary when a PC is selected (PC boundary mode)', async ({
    page,
  }) => {
    // With showACs=false, map level is constituencies — summary hides when currentPC is set.
    await page.goto('/tamil-nadu/pc/salem?showACs=false');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await expect(page.locator('.pc-panel')).toBeVisible({ timeout: 20000 });

    await expect(page.locator('.state-map-summary-panel')).toHaveCount(0);
  });
});
