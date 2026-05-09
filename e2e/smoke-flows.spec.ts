/**
 * Additional high-value smoke flows not fully covered elsewhere:
 * feedback modal, district routes, PC panel chrome, state AC map, sidebar/cache footer,
 * map toolbar, blog via sidebar (India `/?blog=` is normalized away during hydration).
 */
import { test, expect } from '@playwright/test';
import { ensureElectionPanelVisible } from './panel-helpers';
import { pcPanelViewNative } from './panel-select-helpers';
import { openSidebarSheet } from './sidebar-helpers';

test.describe('Smoke flows', () => {
  test('opens feedback modal from map toolbar and closes', async ({ page }) => {
    await page.goto('/karnataka');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });

    await page.locator('button.feedback-btn').click();
    await expect(page.getByRole('heading', { name: 'Send Feedback' })).toBeVisible({
      timeout: 10000,
    });

    await page.locator('.feedback-modal-close').click();
    await expect(page.locator('.feedback-modal')).toHaveCount(0);
  });

  test('district deep link loads district map and sidebar breadcrumb', async ({ page }) => {
    await page.goto('/tamil-nadu/district/chennai');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await expect(page).toHaveURL(/tamil-nadu\/district\/chennai/);

    await openSidebarSheet(page);
    await expect(page.locator('.breadcrumb-nav')).toBeVisible({ timeout: 15000 });
  });

  test('PC-only route shows parliament panel view control', async ({ page }) => {
    await page.goto('/west-bengal/pc/diamond-harbour');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });

    const panel = await ensureElectionPanelVisible(page);
    await expect(panel.locator('#pc-panel-view')).toBeVisible({ timeout: 20000 });
    const viewNative = pcPanelViewNative(panel);
    await expect(viewNative).toHaveValue('overview');
    await expect(viewNative.locator('option[value="candidates"]')).toHaveCount(0);
    await expect(
      panel.locator('.candidates-preview').getByRole('heading', { name: /^Candidates$/i })
    ).toBeVisible();
  });

  test('statewide assembly map loads many polygons', async ({ page }) => {
    await page.goto('/kerala/ac');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await expect(page).toHaveURL(/kerala\/ac/);

    await expect
      .poll(
        async () => page.locator('.leaflet-interactive').count(),
        { timeout: 25000, intervals: [200, 500, 1000] }
      )
      .toBeGreaterThan(10);
  });

  test('sidebar shows cache status when open', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await openSidebarSheet(page);
    await expect(page.locator('.cache-status')).toContainText('DB:', { timeout: 10000 });
  });

  test('map toolbar shows feedback control on state view', async ({ page }) => {
    await page.goto('/goa');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await expect(page.locator('.map-toolbar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button.feedback-btn')).toBeVisible();
  });

  test('blog button in sidebar opens blog from running app', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await openSidebarSheet(page);

    await page.locator('button.blog-btn').click();
    await expect(page.locator('.blog-section')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/blog=true/);
  });
});
