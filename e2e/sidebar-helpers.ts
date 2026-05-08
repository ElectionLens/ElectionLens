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
  await page.waitForLoadState('domcontentloaded');
  const wide = isWideLayout(page);

  await page.waitForFunction(() => document.querySelector('.sidebar') != null, {
    timeout: 40000,
  });
  await page.waitForFunction(() => document.querySelector('.mobile-toggle') != null, {
    timeout: 40000,
  });

  const hasUsefulDockWidth = async (): Promise<boolean> => {
    return page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) return false;
      const box = sidebar.getBoundingClientRect();
      return box.width > 100;
    });
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const { open, wideDock, hasSidebar } = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) return { open: false, wideDock: false, hasSidebar: false };
      const open = sidebar.classList.contains('open');
      const box = sidebar.getBoundingClientRect();
      return { open, wideDock: box.width > 100, hasSidebar: true };
    });

    if (!hasSidebar) {
      await page.waitForTimeout(200);
      continue;
    }
    if (wide) {
      if (open && wideDock) return;
    } else if (open) {
      return;
    }

    await page.evaluate(() => {
      document.querySelector<HTMLElement>('.mobile-toggle')?.click();
    });
    await expect(page.locator('.sidebar').first()).toHaveClass(/open/, { timeout: 20000 });
    if (wide) {
      await expect.poll(hasUsefulDockWidth, { timeout: 15000 }).toBeTruthy();
    }
  }

  throw new Error('openSidebarSheet: sidebar did not reach an open, usable state');
}
