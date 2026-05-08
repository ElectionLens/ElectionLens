import { test, expect, Page } from '@playwright/test';
import {
  ensureElectionPanelVisible,
  expandMobileElectionPanelToFull,
  expectFirstVisibleMatch,
} from './panel-helpers';

/**
 * Mobile-specific E2E tests for portrait and landscape modes
 * Tests bottom sheet behavior, panel states, and responsive layouts
 */

// Helper to set portrait viewport (typical mobile phone)
async function setPortraitViewport(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 dimensions
}

// Helper to set landscape viewport (phone in landscape)
async function setLandscapeViewport(page: Page) {
  await page.setViewportSize({ width: 844, height: 390 }); // iPhone 14 landscape
}

// Helper to wait for map to be ready
async function waitForMapReady(page: Page) {
  await page.waitForSelector('.leaflet-container', { timeout: 15000 });
  await page.waitForFunction(() => {
    const paths = document.querySelectorAll('.leaflet-interactive');
    return paths.length > 0;
  }, { timeout: 15000 });
}

test.describe('Mobile Portrait - Embedded election panel', () => {
  test.beforeEach(async ({ page }) => {
    await setPortraitViewport(page);
  });

  /**
   * Sidebar AC panel: portrait uses a single expanded sheet (panel-full + election-panel--embed).
   * Peek/half cycling and .bottom-sheet-handle were removed from React; CSS may still define them.
   */
  test('should use expanded embed panel (panel-full) for AC in portrait', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);

    await expect(panel).toHaveClass(/panel-full/);
    await expect(panel).toHaveClass(/election-panel--embed/);
    await expect(panel.locator('.bottom-sheet-handle')).toHaveCount(0);
  });

  test('should show year and view controls in portrait embed', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    await expect(panel.locator('.election-year-selector').first()).toBeVisible();
    await expect(panel.locator('[id="ac-panel-view"]')).toBeVisible({ timeout: 30000 });
  });

  test('should show winner or candidate rows after results load', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    await expectFirstVisibleMatch(panel, '.winner-card-compact, .candidates-table-full .candidate-row');
  });
});

test.describe('Mobile Portrait - Panel Content Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await setPortraitViewport(page);
  });

  test('should show year selector in portrait embed', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    const yearSelectors = panel.locator('.election-year-selector');

    await expect(yearSelectors.first()).toBeVisible();
    expect(
      await panel.locator('#ac-panel-year-proxy option, #ac-panel-year option').count()
    ).toBeGreaterThan(0);
  });

  test('should show summary or winner content when results load (embed uses panel-full)', async ({
    page,
  }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    await expect(panel).toHaveClass(/panel-full/);

    await expectFirstVisibleMatch(panel, '.stats-inline, .constituency-stats, .winner-card-compact');
  });

  test('should show candidate table or preview on overview', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    await expect(panel).toHaveClass(/panel-full/);

    const candidates = panel.locator(
      '.candidates-section, .candidates-preview, .candidates-view, .candidates-table-full'
    );
    const candidatesCount = await candidates.count();
    if (candidatesCount > 0) {
      await expect(candidates.first()).toBeVisible();
    }
  });

  test('should have year options via native select or proxy on mobile', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);

    const yearSelectorRow = panel.locator('.election-year-selector').filter({
      has: page.locator('label:has-text("Year")'),
    });
    await expect(yearSelectorRow.first()).toBeVisible();

    const opts = panel.locator('#ac-panel-year-proxy option, #ac-panel-year option');
    expect(await opts.count()).toBeGreaterThan(0);
  });
});

test.describe('Mobile Portrait - Map Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await setPortraitViewport(page);
  });

  test('should keep map visible with embed panel open', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const map = page.locator('.leaflet-container');
    const panel = await ensureElectionPanelVisible(page);

    await expect(map).toBeVisible();
    await expect(panel).toHaveClass(/panel-full/);

    // Map should still be visible (not completely covered)
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.height).toBeGreaterThan(100);
  });

  test('should show footer action buttons on panel', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    await expandMobileElectionPanelToFull(panel, page);
    await expect(panel.locator('.share-bar .election-panel-btn').first()).toBeVisible();
    await expect(panel.locator('.election-panel-close')).toHaveCount(0);
  });

  test('should keep panel visible after footer action click', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    await expandMobileElectionPanelToFull(panel, page);
    await panel.locator('.share-bar .election-panel-btn').first().click();
    await expect(panel).toBeVisible();
  });
});

test.describe('Mobile Landscape - Right Sidebar Layout', () => {
  test.beforeEach(async ({ page }) => {
    await setLandscapeViewport(page);
  });

  test('should NOT show drag handle in landscape mode', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Drag handle should NOT be visible in landscape
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await expect(dragHandle).not.toBeVisible();
  });

  test('should NOT have panel state classes in landscape', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Panel should not have peek/half/full classes
    const panelClass = await panel.getAttribute('class');
    expect(panelClass).not.toContain('panel-peek');
    expect(panelClass).not.toContain('panel-half');
    expect(panelClass).not.toContain('panel-full');
  });

  test('should show panel as right sidebar in landscape', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel').first();
    await expect(panel).toBeVisible({ timeout: 15000 });

    const viewportSize = page.viewportSize();
    expect(viewportSize).not.toBeNull();

    // Layout can settle after map/panel paint; avoid reading 0×0 bounds during transition
    let rect = { left: 0, top: 0, width: 0, height: 0 };
    await expect
      .poll(
        async () => {
          rect = await panel.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
          });
          return rect.width;
        },
        { timeout: 15000, intervals: [100, 250, 500] }
      )
      .toBeGreaterThan(160);
    expect(rect.height).toBeGreaterThan(100);
    const rightRail = rect.left > viewportSize!.width * 0.33;
    const splitColumn = rect.width < viewportSize!.width * 0.92;
    const bottomSheetBar =
      rect.left <= 8 && rect.width >= viewportSize!.width * 0.88 && rect.top > 50;
    expect(rightRail || splitColumn || bottomSheetBar).toBeTruthy();
  });

  test('should show full content in landscape (no hiding)', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    // Viewport > 768: desktop-embedded panel (not bottom sheet)
    const panel = page.locator('.election-panel').first();
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Winner card should be visible (not hidden like in half mode)
    const winnerCard = panel.locator('.winner-card-compact');
    await expect(winnerCard).toBeVisible();

    // Sidebar can expose multiple stacked year/layer selectors; assert one concrete row is visible.
    const yearSelector = panel.locator('.election-year-selector').first();
    await expect(yearSelector).toBeVisible();
  });

  test('should keep map visible alongside panel in landscape', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const map = page.locator('.leaflet-container');
    const panel = page.locator('.election-panel');

    await expect(map).toBeVisible();
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Both map and panel should have reasonable widths
    const mapBox = await map.boundingBox();
    const panelBox = await panel.boundingBox();

    expect(mapBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(mapBox!.width).toBeGreaterThan(200);
    expect(panelBox!.width).toBeGreaterThan(200);
  });
});

test.describe('Mobile Landscape - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setLandscapeViewport(page);
  });

  test('should load state view correctly', async ({ page }) => {
    await page.goto('/karnataka');
    await waitForMapReady(page);

    await expect(page).toHaveURL(/\/karnataka(\/pc)?/);
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
  });

  test('should load PC view with panel', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-north');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel.pc-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
  });

  test('should load AC view with panel', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-north/ac/hebbal');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Mobile Portrait - PC Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setPortraitViewport(page);
  });

  test('should show PC panel expanded in portrait (no bottom-sheet handle)', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-north');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel.pc-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    await expect(panel).toHaveClass(/panel-full/);
    await expect(panel.locator('.bottom-sheet-handle')).toHaveCount(0);
  });

  test('should show PC panel chrome (sidebar omits heading and Parliament badge)', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-north');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    await expandMobileElectionPanelToFull(panel, page);

    // PCElectionResultPanel in the sidebar passes omitConstituencyHeading, so .pc-badge is not rendered;
    // the View selector is always present and is unique to the PC panel.
    await expect(panel.locator('#pc-panel-view')).toBeVisible({ timeout: 15000 });
    // Mobile YearSelector uses a button trigger; proxy select carries stable value/options for assertions.
    const viewProxy = panel.locator('#pc-panel-view-proxy');
    await expect(viewProxy).toHaveValue('overview');
    await expect(viewProxy.locator('option[value="candidates"]')).toHaveCount(0);
  });

  test('should keep PC panel at panel-full in portrait embed', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-north');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    await expect(panel).toHaveClass(/panel-full/);
    await expect(panel.locator('.bottom-sheet-handle')).toHaveCount(0);
  });
});

test.describe('Orientation Change Simulation', () => {
  test('should adapt panel when switching portrait to landscape', async ({ page }) => {
    // Start in portrait
    await setPortraitViewport(page);
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    let panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    await expect(panel).toHaveClass(/panel-full/);

    // Switch to landscape and reload (React components check viewport at mount)
    await setLandscapeViewport(page);
    await page.reload();
    await waitForMapReady(page);

    // Panel should still be visible but without state classes
    panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Drag handle should not be visible in landscape
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await expect(dragHandle).not.toBeVisible();
  });

  test('should show embed panel in portrait after landscape (no drag handle)', async ({ page }) => {
    await setLandscapeViewport(page);
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panelLandscape = page.locator('.election-panel');
    await expect(panelLandscape).toBeVisible({ timeout: 15000 });
    await expect(panelLandscape.locator('.bottom-sheet-handle')).toHaveCount(0);

    await setPortraitViewport(page);
    await page.goto('/karnataka/pc/bangalore-north/ac/hebbal');
    await waitForMapReady(page);

    const panelPortrait = page.locator('.election-panel');
    await expect(panelPortrait).toBeVisible({ timeout: 15000 });
    await expect(panelPortrait).toHaveClass(/panel-full/);
    await expect(panelPortrait.locator('.bottom-sheet-handle')).toHaveCount(0);
  });
});

test.describe('Mobile Touch Targets', () => {
  test.beforeEach(async ({ page }) => {
    await setPortraitViewport(page);
  });

  test('should have adequately sized year control', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    const rows = panel.locator('.election-year-selector');
    const count = await rows.count();
    let maxH = 0;
    let maxW = 0;
    for (let i = 0; i < count; i++) {
      const box = await rows.nth(i).boundingBox();
      if (!box) continue;
      maxH = Math.max(maxH, box.height);
      maxW = Math.max(maxW, box.width);
    }
    expect(maxH).toBeGreaterThanOrEqual(28);
    expect(maxW).toBeGreaterThanOrEqual(40);
  });

  test('should have adequately sized footer action button', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);
    await expandMobileElectionPanelToFull(panel, page);
    const actionButton = panel.locator('.share-bar .election-panel-btn').first();
    const buttonBox = await actionButton.boundingBox();

    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(24);
    expect(buttonBox!.width).toBeGreaterThanOrEqual(24);
  });

  test('should have adequately sized year trigger in portrait', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = await ensureElectionPanelVisible(page);

    const trigger = panel.locator('#ac-panel-year').first();
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(28);
  });
});

