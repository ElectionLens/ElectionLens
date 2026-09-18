import { test, expect } from '@playwright/test';

import { openSidebarSheet } from './sidebar-helpers';

async function focusWithKeyboard(page: import('@playwright/test').Page, locator: import('@playwright/test').Locator): Promise<void> {
  // Establish keyboard modality before focusing the target. Calling locator.focus()
  // alone does not make Chromium match :focus-visible, which is exactly the bug
  // this test is intended to catch.
  await page.keyboard.press('Tab');
  await locator.focus();
}

test.describe('Phase 3 accessibility foundations', () => {
  test('exposes labelled landmarks and a real constituency heading', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/bargur?year=2021');
    await expect(page.getByRole('main', { name: 'Interactive election map' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Election navigation' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
    await expect(page.locator('footer.data-provenance-footer')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'BARGUR', level: 2 })).toBeVisible();
  });

  test('uses the semantic focus ring for an assembly browse row', async ({ page }) => {
    await page.goto('/tamil-nadu/ac');
    await page.locator('#sidebar-layer-mode').selectOption('assemblies');
    await page.locator('.sidebar .left-pane-btn--back').click();
    await expect(page.locator('.assembly-item.interactive-row').first()).toBeVisible({ timeout: 30000 });
    const row = page.locator('.assembly-item.interactive-row').first();
    await focusWithKeyboard(page, row);

    await expect
      .poll(() => row.evaluate((el) => el.matches(':focus-visible')))
      .toBe(true);
    await expect
      .poll(() => row.evaluate((el) => getComputedStyle(el).outlineColor))
      .toBe('rgb(15, 110, 99)');
    await expect(row).toHaveCSS('outline-width', '2px');
    await expect(row).toHaveCSS('outline-offset', '2px');
  });

  test('supports keyboard navigation through the result tablist', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/bargur?year=2021');
    const tablist = page.getByRole('tablist', { name: 'Result view' });
    await expect(tablist).toBeVisible();

    const overview = page.getByRole('tab', { name: 'Overview' });
    await focusWithKeyboard(page, overview);
    await page.keyboard.press('ArrowRight');

    await expect(page.getByRole('tab', { name: 'Booths' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      /ac-panel-tabpanel-tab-booths/
    );
    await expect(page.getByRole('tabpanel')).toContainText('Select Booth');
  });
});
