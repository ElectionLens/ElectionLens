import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Native `<select>` for Sidebar `YearSelector`: desktop uses `#{fieldId}`, mobile uses hidden `#{fieldId}-proxy`. */
export function sidebarYearSelectorSelect(page: Page, fieldId: string): Locator {
  return page.locator(`select#${fieldId}-proxy, select#${fieldId}`);
}

/** `selectOption` on mobile uses a hidden proxy `<select>` (`aria-hidden`), so `force: true` is required. */
export async function sidebarYearSelectOption(
  page: Page,
  fieldId: string,
  value: string
): Promise<void> {
  await sidebarYearSelectorSelect(page, fieldId).selectOption(value, { force: true });
}

/** Ensures the sidebar is open (taps FAB if closed on any viewport). */
export async function openSidebarSheet(page: Page): Promise<void> {
  const sidebar = page.locator('.sidebar');
  const isOpen = await sidebar.evaluate((el) => el.classList.contains('open'));
  if (isOpen) {
    return;
  }
  await page.locator('.mobile-toggle').click();
  await expect(sidebar).toHaveClass(/open/);
}
