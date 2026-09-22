/**
 * Automated WCAG 2.2 AA regression scans (Phase 3 checklist item: "Add
 * @axe-core/playwright so automated WCAG scans cannot regress").
 *
 * This is deliberately separate from accessibility.spec.ts, which hand-checks
 * specific behaviours (focus-visible rings, keyboard tab navigation, landmark
 * roles) that axe's static analysis cannot verify. Axe catches the mechanical,
 * broad-sweep stuff instead: missing alt text, invalid ARIA, contrast
 * regressions, duplicate ids, unlabelled controls. Together they cover more
 * ground than either alone.
 *
 * One scan per distinct page "mode" the app can render, not one per route -
 * scanning every constituency would be redundant since they share markup.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { openSidebarSheet } from './sidebar-helpers';

/** wcag2a/2aa/21aa cover WCAG 2.1 AA; wcag22aa adds the 2.2 additions the
 * project explicitly targets (see readme.md). best-practice is deliberately
 * excluded - it flags style opinions, not WCAG failures, and would make this
 * suite flaky against axe-core version bumps. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function scan(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
}

/** Pretty-print violations so a CI failure tells you what to fix without
 * needing to reproduce locally first. */
function describeViolations(violations: Awaited<ReturnType<typeof scan>>['violations']): string {
  return violations
    .map(
      (v) =>
        `\n[${v.impact}] ${v.id}: ${v.help}\n  ${v.helpUrl}\n  nodes: ${v.nodes
          .map((n) => n.target.join(' '))
          .join(', ')}`
    )
    .join('\n');
}

test.describe('Automated WCAG 2.2 AA scans', () => {
  test('India browse view (states list + map)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    const results = await scan(page);
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });

  test('state view (seats-won summary + map)', async ({ page }) => {
    await page.goto('/tamil-nadu');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    const results = await scan(page);
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });

  test('AC detail view (podium, KPI strip, result tabs)', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/bargur?year=2021');
    await expect(page.getByRole('heading', { name: 'BARGUR', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    const results = await scan(page);
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });

  test('AC detail view, dark theme', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/bargur?year=2021');
    await expect(page.getByRole('heading', { name: 'BARGUR', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    await page.locator('.theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const results = await scan(page);
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });

  test('mobile sidebar sheet open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await openSidebarSheet(page);
    const results = await scan(page);
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });
});
