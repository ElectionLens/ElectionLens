import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function expectNoAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  if (results.violations.length > 0) {
    console.table(
      results.violations.map((violation) => ({
        context,
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.length,
      }))
    );
  }
  expect(results.violations, `${context} axe violations`).toEqual([]);
}

test.describe('automated accessibility scan', () => {
  test('desktop home landmarks and browse UI', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main', { name: 'Interactive election map' })).toBeVisible();
    await expectNoAxeViolations(page, 'desktop home');
  });

  test('desktop Assembly detail', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/bargur?year=2021');
    await expect(page.getByRole('heading', { name: 'BARGUR', level: 2 })).toBeVisible();
    await expectNoAxeViolations(page, 'desktop AC detail');
  });

  test('mobile sidebar and detail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tamil-nadu/ac/bargur?year=2021');
    const toggle = page.locator('.mobile-toggle');
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.getByRole('complementary', { name: 'Election navigation' })).toBeVisible();
    await expectNoAxeViolations(page, 'mobile AC detail');
  });
});
