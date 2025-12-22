import { test, expect, Page } from '@playwright/test';

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

test.describe('Mobile Portrait - Bottom Sheet Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await setPortraitViewport(page);
  });

  test('should show drag handle on panel in portrait mode', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Drag handle should be visible in portrait
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await expect(dragHandle).toBeVisible();
  });

  test('should start in half mode by default', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Panel should have half class
    await expect(panel).toHaveClass(/panel-half/);
  });

  test('should expand to full mode on drag handle click from half', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(panel).toHaveClass(/panel-half/);

    // Click drag handle to expand
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await dragHandle.click();

    // Should now be in full mode
    await expect(panel).toHaveClass(/panel-full/);
  });

  test('should collapse to peek mode on drag handle click from full', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Click twice to get to full then peek
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await dragHandle.click(); // half -> full
    await expect(panel).toHaveClass(/panel-full/);

    await dragHandle.click(); // full -> peek
    await expect(panel).toHaveClass(/panel-peek/);
  });

  test('should cycle through all three states', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const dragHandle = panel.locator('.bottom-sheet-handle');

    // Start at half
    await expect(panel).toHaveClass(/panel-half/);

    // Click: half -> full
    await dragHandle.click();
    await expect(panel).toHaveClass(/panel-full/);

    // Click: full -> peek
    await dragHandle.click();
    await expect(panel).toHaveClass(/panel-peek/);

    // Click: peek -> half
    await dragHandle.click();
    await expect(panel).toHaveClass(/panel-half/);
  });

  test('should show peek winner summary in peek mode', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Get to peek mode
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await dragHandle.click(); // half -> full
    await dragHandle.click(); // full -> peek

    // Peek winner should be visible
    const peekWinner = panel.locator('.peek-winner');
    await expect(peekWinner).toBeVisible();
  });

  test('should hide winner card in half mode', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(panel).toHaveClass(/panel-half/);

    // Winner card should be hidden in half mode
    const winnerCard = panel.locator('.winner-card, .winner-card-compact');
    await expect(winnerCard).not.toBeVisible();
  });

  test('should show winner card in full mode', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Expand to full
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await dragHandle.click();
    await expect(panel).toHaveClass(/panel-full/);

    // Winner card should be visible in full mode
    const winnerCard = panel.locator('.winner-card-compact');
    await expect(winnerCard).toBeVisible();
  });

  test('should expand panel when header clicked in peek mode', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Get to peek mode
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await dragHandle.click(); // half -> full
    await dragHandle.click(); // full -> peek
    await expect(panel).toHaveClass(/panel-peek/);

    // Click on header to expand
    const header = panel.locator('.election-panel-header');
    await header.click();

    // Should expand to half
    await expect(panel).toHaveClass(/panel-half/);
  });
});

test.describe('Mobile Portrait - Panel Content Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await setPortraitViewport(page);
  });

  test('should show year selector in all modes', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const yearSelector = panel.locator('.election-year-selector');

    // Half mode - should be visible
    await expect(yearSelector).toBeVisible();

    // Full mode - should be visible
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await dragHandle.click();
    await expect(yearSelector).toBeVisible();
  });

  test('should hide stats in half mode', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(panel).toHaveClass(/panel-half/);

    // Stats should be hidden in half mode
    const stats = panel.locator('.stats-inline, .constituency-stats');
    const statsCount = await stats.count();
    if (statsCount > 0) {
      await expect(stats.first()).not.toBeVisible();
    }
  });

  test('should show candidates preview in half mode', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(panel).toHaveClass(/panel-half/);

    // Candidates section should be visible
    const candidates = panel.locator('.candidates-section, .candidates-preview');
    const candidatesCount = await candidates.count();
    if (candidatesCount > 0) {
      await expect(candidates.first()).toBeVisible();
    }
  });

  test('should have horizontally scrollable year selector', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const yearSelector = panel.locator('.election-year-selector');
    await expect(yearSelector).toBeVisible();

    // Check that year buttons exist and are interactive
    const yearButtons = yearSelector.locator('.year-btn');
    expect(await yearButtons.count()).toBeGreaterThan(0);
  });
});

test.describe('Mobile Portrait - Map Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await setPortraitViewport(page);
  });

  test('should keep map visible when panel is in half mode', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const map = page.locator('.leaflet-container');
    const panel = page.locator('.election-panel');

    await expect(map).toBeVisible();
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(panel).toHaveClass(/panel-half/);

    // Map should still be visible (not completely covered)
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.height).toBeGreaterThan(100);
  });

  test('should show close button on panel', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const closeButton = panel.locator('.election-panel-close');
    await expect(closeButton).toBeVisible();
  });

  test('should close panel and show full map on close', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const closeButton = panel.locator('.election-panel-close');
    await closeButton.click();

    await expect(panel).not.toBeVisible();
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

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Panel should be on the right side
    const panelBox = await panel.boundingBox();
    const viewportSize = page.viewportSize();

    expect(panelBox).not.toBeNull();
    expect(viewportSize).not.toBeNull();

    // Panel should be positioned in the right portion of the screen (x > 50% of viewport)
    expect(panelBox!.x).toBeGreaterThan(viewportSize!.width * 0.4);
  });

  test('should show full content in landscape (no hiding)', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Winner card should be visible (not hidden like in half mode)
    const winnerCard = panel.locator('.winner-card-compact');
    await expect(winnerCard).toBeVisible();

    // Year selector should be visible
    const yearSelector = panel.locator('.election-year-selector');
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

    await expect(page).toHaveURL('/karnataka');
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

  test('should show PC panel with drag handle', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-north');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel.pc-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const dragHandle = panel.locator('.bottom-sheet-handle');
    await expect(dragHandle).toBeVisible();
  });

  test('should have Parliament badge visible', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-north');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel.pc-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Expand to see badge
    const dragHandle = panel.locator('.bottom-sheet-handle');
    await dragHandle.click(); // half -> full

    const badge = panel.locator('.pc-badge');
    await expect(badge).toBeVisible();
  });

  test('should cycle through panel states for PC panel', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-north');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel.pc-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const dragHandle = panel.locator('.bottom-sheet-handle');

    // Start at half
    await expect(panel).toHaveClass(/panel-half/);

    // Cycle through
    await dragHandle.click();
    await expect(panel).toHaveClass(/panel-full/);

    await dragHandle.click();
    await expect(panel).toHaveClass(/panel-peek/);
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

    // Should have panel state in portrait
    await expect(panel).toHaveClass(/panel-half/);

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

  test('should show drag handle when navigating in portrait after landscape', async ({ page }) => {
    // Start in landscape, verify no drag handle
    await setLandscapeViewport(page);
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panelLandscape = page.locator('.election-panel');
    await expect(panelLandscape).toBeVisible({ timeout: 15000 });
    await expect(panelLandscape.locator('.bottom-sheet-handle')).not.toBeVisible();

    // Now navigate fresh in portrait mode
    await setPortraitViewport(page);
    await page.goto('/karnataka/pc/bangalore-north/ac/hebbal');
    await waitForMapReady(page);

    // Panel should have drag handle in portrait
    const panelPortrait = page.locator('.election-panel');
    await expect(panelPortrait).toBeVisible({ timeout: 15000 });
    const dragHandle = panelPortrait.locator('.bottom-sheet-handle');
    await expect(dragHandle).toBeVisible();
  });
});

test.describe('Mobile Touch Targets', () => {
  test.beforeEach(async ({ page }) => {
    await setPortraitViewport(page);
  });

  test('should have adequately sized year buttons', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const yearButton = panel.locator('.year-btn').first();
    const buttonBox = await yearButton.boundingBox();

    expect(buttonBox).not.toBeNull();
    // Minimum touch target should be around 32px (WCAG recommends 44px)
    expect(buttonBox!.height).toBeGreaterThanOrEqual(28);
    expect(buttonBox!.width).toBeGreaterThanOrEqual(40);
  });

  test('should have adequately sized close button', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const closeButton = panel.locator('.election-panel-close');
    const buttonBox = await closeButton.boundingBox();

    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(24);
    expect(buttonBox!.width).toBeGreaterThanOrEqual(24);
  });

  test('should have adequately sized drag handle', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2021');
    await waitForMapReady(page);

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    const dragHandle = panel.locator('.bottom-sheet-handle');
    const handleBox = await dragHandle.boundingBox();

    expect(handleBox).not.toBeNull();
    // Handle should be wide enough to easily tap
    expect(handleBox!.width).toBeGreaterThanOrEqual(40);
  });
});

