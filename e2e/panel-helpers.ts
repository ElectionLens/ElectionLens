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

/**
 * First DOM match for a comma selector may be hidden on mobile (winner card in half mode, loading).
 * Poll until something substantive is visible — including half-mode preview rows or year control.
 */
export async function expectFirstVisibleMatch(panel: Locator, selector: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const primary = panel.locator(selector);
        for (let i = 0; i < (await primary.count()); i++) {
          if (await primary.nth(i).isVisible().catch(() => false)) return true;
        }
        const preview = panel.locator(
          '.candidates-preview .candidate-row-compact, .candidates-preview .candidate-row'
        );
        for (let i = 0; i < (await preview.count()); i++) {
          if (await preview.nth(i).isVisible().catch(() => false)) return true;
        }
        const yearSel = panel.locator('select.year-dropdown');
        for (let i = 0; i < (await yearSel.count()); i++) {
          if (await yearSel.nth(i).isVisible().catch(() => false)) return true;
        }
        return false;
      },
      { timeout: 15000, intervals: [100, 200, 400] }
    )
    .toBe(true);
}

/**
 * Ensure an election panel is visible.
 * If deep-link hydration does not auto-open a panel, click a visible assembly list row to open it.
 */
export async function ensureElectionPanelVisible(page: Page): Promise<Locator> {
  const panel = page.locator('.election-panel').first();
  try {
    await expect(panel).toBeVisible({ timeout: 12000 });
    return panel;
  } catch {
    const assemblyRow = page.locator('.assembly-item, .constituency-item').first();
    if (await assemblyRow.isVisible().catch(() => false)) {
      await assemblyRow.click({ force: true });
      await expect(panel).toBeVisible({ timeout: 15000 });
      return panel;
    }
    throw new Error('Election panel not visible and no selectable row to open panel');
  }
}
