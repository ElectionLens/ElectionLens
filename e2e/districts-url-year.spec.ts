/**
 * State districts map view: assembly / parliament year toolbar must sync ?year= in the URL.
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

  test('clicking assembly year in toolbar replaces year=pc- with assembly year', async ({
    page,
  }) => {
    const acBtn = page.locator('button.toolbar-year-btn[title^="Assembly Election"]');
    await expect(acBtn.first()).toBeVisible({ timeout: 10000 });
    await acBtn.filter({ hasText: '2021' }).first().click();
    await expect(page).toHaveURL(/year=2021/, { timeout: 8000 });
    expect(page.url()).not.toContain('year=pc-');
  });

  test('clicking parliament year in toolbar sets year=pc-YYYY', async ({ page }) => {
    // Switch to assembly year first so we can switch back to PC
    const acBtn = page.locator('button.toolbar-year-btn[title^="Assembly Election"]');
    await acBtn.filter({ hasText: '2021' }).first().click();
    await expect(page).toHaveURL(/year=2021/);

    const pcBtn = page.locator('button.toolbar-year-btn[title^="Parliament Election"]');
    await expect(pcBtn.filter({ hasText: '2024' }).first()).toBeVisible({ timeout: 5000 });
    await pcBtn.filter({ hasText: '2024' }).first().click();
    await expect(page).toHaveURL(/year=pc-2024/, { timeout: 8000 });
  });
});
