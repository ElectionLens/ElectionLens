import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Matches mobile portrait bottom-sheet CSS (`max-width: 768px`). */
const MOBILE_MAX_WIDTH = 768;

function isNarrowViewport(page: Page): boolean {
  const s = page.viewportSize();
  return !!s && s.width <= MOBILE_MAX_WIDTH;
}

/**
 * Mobile portrait panels use peek/half/full; winner cards are hidden until `panel-full`.
 * Clicks the drag handle until full (peek→half→full). No-op on desktop / landscape.
 */
export async function expandMobileElectionPanelToFull(panel: Locator, page: Page): Promise<void> {
  if (!isNarrowViewport(page)) return;

  const dragHandle = panel.locator('.bottom-sheet-handle');
  if ((await dragHandle.count()) === 0) return;

  const waitUntilFull = async (timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await panel.evaluate((el) => el.classList.contains('panel-full'))) return true;
      await page.waitForTimeout(80);
    }
    return await panel.evaluate((el) => el.classList.contains('panel-full'));
  };

  for (let i = 0; i < 5; i++) {
    if (await panel.evaluate((el) => el.classList.contains('panel-full'))) return;

    const state = await panel.evaluate((el) => {
      if (el.classList.contains('panel-full')) return 'full';
      if (el.classList.contains('panel-peek')) return 'peek';
      if (el.classList.contains('panel-half')) return 'half';
      return 'none';
    });
    if (state === 'none' || state === 'full') return;

    await dragHandle.click();
    const becameFull = await waitUntilFull(5000);
    if (becameFull) return;
  }
}

/** First matching element in DOM order may be hidden on mobile (e.g. winner card in half mode). */
export async function expectFirstVisibleMatch(panel: Locator, selector: string): Promise<void> {
  const matches = panel.locator(selector);
  const n = await matches.count();
  for (let i = 0; i < n; i++) {
    const item = matches.nth(i);
    if (await item.isVisible().catch(() => false)) {
      await expect(item).toBeVisible({ timeout: 10000 });
      return;
    }
  }
  await expect(matches.first()).toBeVisible({ timeout: 10000 });
}
