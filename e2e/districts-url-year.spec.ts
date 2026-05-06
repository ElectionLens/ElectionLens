/**
 * State districts map view: assembly / parliament year (sidebar) must sync ?year= in the URL.
 *
 * Run locally (matches CI: build + Chromium): `npm run validate:e2e`
 * Requires: `npx playwright install chromium`. Playwright uses http://127.0.0.1:3000 (see playwright.config).
 */
import { test, expect } from '@playwright/test';

test.describe('Districts view — year query param', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tamil-nadu/districts?year=pc-2024');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await expect(page).toHaveURL(/tamil-nadu\/districts/);
    await expect(page).toHaveURL(/year=pc-2024/);
  });

  test('clicking assembly year in sidebar replaces year=pc- with assembly year', async ({
    page,
  }) => {
    const yearSelect = page.locator('#sidebar-map-year');
    await expect(yearSelect).toBeVisible({ timeout: 10000 });
    await yearSelect.selectOption('ac-2021');
    await expect(page).toHaveURL(/year=2021/, { timeout: 8000 });
    expect(page.url()).not.toContain('year=pc-');
  });

  test('clicking parliament year in sidebar sets year=pc-YYYY', async ({ page }) => {
    const yearSelect = page.locator('#sidebar-map-year');
    await yearSelect.selectOption('ac-2021');
    await expect(page).toHaveURL(/year=2021/);

    await yearSelect.selectOption('pc-2024');
    await expect(page).toHaveURL(/year=pc-2024/, { timeout: 8000 });
  });
});
