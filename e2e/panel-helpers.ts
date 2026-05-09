import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openSidebarSheet } from './sidebar-helpers';

/** Matches mobile portrait bottom-sheet CSS (`max-width: 768px`). */
const MOBILE_MAX_WIDTH = 768;

function isNarrowViewport(page: Page): boolean {
  const s = page.viewportSize();
  return !!s && s.width <= MOBILE_MAX_WIDTH;
}

/**
 * Portrait bottom-sheet handle often sits beside the FAB; synthetic click avoids viewport scroll limits.
 */
export async function tapBottomSheetHandle(panel: Locator): Promise<void> {
  const handle = panel.locator('.bottom-sheet-handle').first();
  if ((await handle.count()) === 0) return;
  await handle.evaluate((el) => {
    (el as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    );
  });
}

/**
 * Mobile portrait panels use peek/half/full; winner cards are hidden until `panel-full`.
 * Clicks the drag handle until full (peek→half→full). No-op on desktop / landscape.
 */
export async function expandMobileElectionPanelToFull(panel: Locator, page: Page): Promise<void> {
  if (!isNarrowViewport(page)) return;

  if ((await panel.locator('.bottom-sheet-handle').count()) === 0) return;

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

    await tapBottomSheetHandle(panel);
    const becameFull = await waitUntilFull(5000);
    if (becameFull) return;
  }
}

/**
 * Sidebar `sidebar-scroll` clips content; `isVisible()` is false until ancestors scroll.
 */
export async function scrollElectionPanelIntoView(panel: Locator): Promise<void> {
  await panel.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {});
  for (const sel of [
    'select#ac-panel-view-proxy, select#ac-panel-view',
    'select#pc-panel-view-proxy, select#pc-panel-view',
    '#ac-panel-view',
    '#pc-panel-view',
    '.controls-card',
    '.overview-view',
  ]) {
    const inner = panel.locator(sel).first();
    if ((await inner.count()) === 0) continue;
    await inner.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  }
}

/**
 * First DOM match for a comma selector may be hidden on mobile (winner card in half mode, loading).
 * Poll until something substantive is visible — including half-mode preview rows or year control.
 */
export async function expectFirstVisibleMatch(panel: Locator, selector: string): Promise<void> {
  await scrollElectionPanelIntoView(panel);
  await expect
    .poll(
      async () => {
        await scrollElectionPanelIntoView(panel);
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
        const tableRow = panel.locator('.candidates-table-full .candidate-row');
        for (let i = 0; i < (await tableRow.count()); i++) {
          if (await tableRow.nth(i).isVisible().catch(() => false)) return true;
        }
        const postalRows = panel.locator('.postal-candidate-row');
        for (let i = 0; i < (await postalRows.count()); i++) {
          if (await postalRows.nth(i).isVisible().catch(() => false)) return true;
        }
        const boothRows = panel.locator('.booth-candidate-row');
        for (let i = 0; i < (await boothRows.count()); i++) {
          if (await boothRows.nth(i).isVisible().catch(() => false)) return true;
        }
        const yearSel = panel.locator('select.year-dropdown');
        for (let i = 0; i < (await yearSel.count()); i++) {
          if (await yearSel.nth(i).isVisible().catch(() => false)) return true;
        }
        const trigger = panel.locator('button.year-dropdown-trigger');
        for (let i = 0; i < (await trigger.count()); i++) {
          if (await trigger.nth(i).isVisible().catch(() => false)) return true;
        }
        if (
          await panel
            .locator('.prepoll-banner-body')
            .filter({ hasText: /Loading results/i })
            .isVisible()
            .catch(() => false)
        ) {
          return true;
        }
        if (
          await panel
            .getByText(/No sourced candidate names for this constituency yet/i)
            .isVisible()
            .catch(() => false)
        ) {
          return true;
        }
        if (await panel.locator('#ac-panel-view').isVisible().catch(() => false)) return true;
        if (await panel.locator('#pc-panel-view').isVisible().catch(() => false)) return true;
        return false;
      },
      { timeout: 45000, intervals: [100, 200, 400, 800, 1200] }
    )
    .toBe(true);
}

/**
 * Ensure an election panel is visible.
 * If deep-link hydration does not auto-open a panel, click a visible assembly list row to open it.
 */
export async function ensureElectionPanelVisible(page: Page): Promise<Locator> {
  await openSidebarSheet(page);
  /** Hosted in Sidebar `renderDetailHost` — avoid matching other `.election-panel` roots if any appear in the tree. */
  const panel = page.locator('.sidebar .sidebar-detail-host .election-panel').first();
  try {
    await expect(panel).toBeVisible({ timeout: 35000 });
    await scrollElectionPanelIntoView(panel);
    return panel;
  } catch (firstErr) {
    await openSidebarSheet(page);
    const assemblyRow = page.locator('.district-list .assembly-item, .assembly-item').first();
    const pcRow = page.locator('.district-list .constituency-item, .constituency-item').first();

    if (await assemblyRow.isVisible().catch(() => false)) {
      await assemblyRow.click({ force: true });
      await expect(panel).toBeVisible({ timeout: 25000 }).catch(() => {
        throw firstErr;
      });
      await scrollElectionPanelIntoView(panel);
      return panel;
    }

    if (await pcRow.isVisible().catch(() => false)) {
      await pcRow.click({ force: true });
      await expect(panel).toBeVisible({ timeout: 25000 }).catch(() => {
        throw firstErr;
      });
      await scrollElectionPanelIntoView(panel);
      return panel;
    }

    await page
      .locator('.mobile-toggle')
      .evaluate((el) => (el as HTMLElement).click())
      .catch(() => {});
    await openSidebarSheet(page);
    try {
      await expect(panel).toBeVisible({ timeout: 20000 });
      await scrollElectionPanelIntoView(panel);
      return panel;
    } catch {
      throw new Error(
        firstErr instanceof Error
          ? `Election panel not visible: ${firstErr.message}`
          : 'Election panel not visible and no selectable row or PC row to open panel'
      );
    }
  }
}
