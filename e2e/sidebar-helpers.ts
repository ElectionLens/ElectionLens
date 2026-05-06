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

/** Wide layout (>768): docked sidebar is width 0 with pointer-events:none when missing `.open` (see index.css). */
function isWideLayout(page: Page): boolean {
  const w = page.viewportSize()?.width ?? 1280;
  return w > 768;
}

/**
 * Ensures the sidebar is open and usable:
 * — Mobile: `.open` slides the sheet in.
 * — Desktop: `.open` is required plus non-zero width; class alone is not enough if the dock was collapsed.
 */
export async function openSidebarSheet(page: Page): Promise<void> {
  const sidebar = page.locator('.sidebar').first();
  const toggle = page.locator('.mobile-toggle');
  const wide = isWideLayout(page);

  await sidebar.waitFor({ state: 'attached', timeout: 45000 });

  const hasUsefulDockWidth = async (): Promise<boolean> => {
    const box = await sidebar.boundingBox();
    return box != null && box.width > 100;
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const isOpen = await sidebar.evaluate((el: HTMLElement) => el.classList.contains('open'));
    if (wide) {
      if (isOpen && (await hasUsefulDockWidth())) return;
    } else if (isOpen) {
      return;
    }

    await toggle.click();
    await expect(sidebar).toHaveClass(/open/, { timeout: 15000 });
    if (wide) {
      await expect.poll(hasUsefulDockWidth, { timeout: 12000 }).toBeTruthy();
    }
  }
}
