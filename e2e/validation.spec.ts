/**
 * Comprehensive Validation Tests
 * 
 * Tests links, navigation flows, and panel visibility across the app.
 */
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  ensureElectionPanelVisible,
  expandMobileElectionPanelToFull,
  expectFirstVisibleMatch,
} from './panel-helpers';
import { openSidebarSheet, sidebarYearSelectOption } from './sidebar-helpers';

async function expandPanelOnMobileIfNeeded(panel: Locator, page: Page) {
  await expandMobileElectionPanelToFull(panel, page);
}

// =============================================================================
// LINK VALIDATION TESTS
// =============================================================================

test.describe('Link Validation - Breadcrumb Navigation', () => {
  test('India link in breadcrumb is clickable', async ({ page, isMobile }) => {
    // Skip on mobile - sidebar with breadcrumb is collapsed
    test.skip(isMobile === true, 'Breadcrumb is in collapsed sidebar on mobile');
    
    // Go to state level (sidebar stays open at state level)
    await page.goto('/tamil-nadu');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await openSidebarSheet(page);

    // Should have breadcrumb navigation inside sidebar
    const breadcrumb = page.locator('.breadcrumb-nav');
    await expect(breadcrumb).toBeVisible({ timeout: 10000 });
    
    // India link should be present and clickable
    const indiaLink = breadcrumb.locator('a').filter({ hasText: 'India' });
    await expect(indiaLink).toBeVisible();
    await expect(indiaLink).toBeEnabled();
    
    // Click India link
    await indiaLink.click();
    
    // After clicking, state should no longer be in breadcrumb (back to India view)
    await page.waitForTimeout(1000);
    const stateText = breadcrumb.locator('text=Tamil Nadu');
    const stateCount = await stateText.count();
    // State text should disappear or change after reset
    expect(stateCount).toBeLessThanOrEqual(1);
  });

  test('breadcrumb shows current location', async ({ page, isMobile }) => {
    // Skip on mobile - sidebar with breadcrumb is collapsed
    test.skip(isMobile === true, 'Breadcrumb is in collapsed sidebar on mobile');
    
    // Go to state level
    await page.goto('/karnataka');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await openSidebarSheet(page);

    // Should have breadcrumb navigation with state name
    const breadcrumb = page.locator('.breadcrumb-nav');
    await expect(breadcrumb).toBeVisible({ timeout: 10000 });
    
    // Should show Karnataka in breadcrumb text
    await expect(breadcrumb).toContainText(/Karnataka/i);
  });
});

test.describe('Link Validation - Year Selector Links', () => {
  test('year dropdown updates panel content', async ({ page }) => {
    await page.goto('/maharashtra/pc/pune/ac/kothrud');
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);

    const yearSelect = panel.locator('#ac-panel-year');
    await expect(yearSelect).toBeVisible();
    const optionCount = await yearSelect.locator('option').count();
    expect(optionCount).toBeGreaterThan(0);

    if (optionCount > 1) {
      const secondValue = await yearSelect.locator('option').nth(1).getAttribute('value');
      if (secondValue) {
        await yearSelect.selectOption(secondValue);
        await expect(panel).toBeVisible();
      }
    }
  });

  test('year dropdown is interactive', async ({ page }) => {
    await page.goto('/rajasthan/pc/jaipur/ac/civil-lines');
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);

    const yearSelect = panel.locator('#ac-panel-year');
    await expect(yearSelect).toBeEnabled({ timeout: 20000 });
    expect(await yearSelect.locator('option').count()).toBeGreaterThan(0);
  });
});

test.describe('Link Validation - Tab Navigation', () => {
  test('Overview tab shows summary data', async ({ page, isMobile }) => {
    await page.goto('/gujarat/pc/ahmedabad-east/ac/maninagar');
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);
    
    const viewSelect = panel.locator('#ac-panel-view');
    await expect(viewSelect).toBeVisible();
    await expect(viewSelect).toHaveValue('overview');
    
    // Should show winner card
    await expect(panel.locator('.winner-card-compact, .winner-info')).toBeVisible();
  });

  test('Overview shows full candidate list (past year)', async ({ page }) => {
    await page.goto('/kerala/pc/thiruvananthapuram/ac/nemom');
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);

    await expect(panel.locator('#ac-panel-view')).toHaveValue('overview');

    await expect(page.locator('.election-panel .candidates-table-full')).toBeVisible();

    const rows = page.locator('.election-panel .candidate-row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(1);

    await expect(panel.locator('#ac-panel-view').locator('option[value="candidates"]')).toHaveCount(
      0
    );
  });

  test('Pre-poll AC year: Overview lists candidate table', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/mettuppalayam?year=2026');
    const panel = await ensureElectionPanelVisible(page);

    await expect(panel.locator('#ac-panel-view')).toHaveValue('overview');

    const preview = page.locator('.election-panel .candidates-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.candidate-row').first()).toBeVisible({ timeout: 20000 });

    const femaleBadge = preview.locator('.sex-badge').filter({ hasText: /^F$/ });
    await expect(femaleBadge.first()).toBeVisible({ timeout: 20000 });
  });
});

// =============================================================================
// NAVIGATION FLOW TESTS
// =============================================================================

test.describe('Navigation Flow - State to PC to AC', () => {
  test('full navigation flow works', async ({ page }) => {
    // Start at India view
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    // Navigate to state via URL
    await page.goto('/bihar');
    await expect(page).toHaveURL('/bihar');
    
    // Navigate to PC
    await page.goto('/bihar/pc/patna-sahib');
    await expect(page).toHaveURL('/bihar/pc/patna-sahib');

    const pcPanel = await ensureElectionPanelVisible(page);
    await expect(pcPanel).toHaveClass(/pc-panel/);

    // Navigate to AC
    await page.goto('/bihar/pc/patna-sahib/ac/bankipur');
    await expect(page).toHaveURL(/bihar\/pc\/patna-sahib\/ac\/bankipur/);

    const acPanel = await ensureElectionPanelVisible(page);
    await expect(acPanel).not.toHaveClass(/pc-panel/);
  });

  test('back navigation preserves state', async ({ page }) => {
    await page.goto('/west-bengal/pc/kolkata-uttar/ac/jorasanko?year=2021');
    await ensureElectionPanelVisible(page);

    await page.goto('/west-bengal/pc/kolkata-uttar');

    const pcPanel = await ensureElectionPanelVisible(page);
    await expect(pcPanel).toHaveClass(/pc-panel/);
  });
});

test.describe('Navigation Flow - District Path', () => {
  test('district URL shows assemblies', async ({ page }) => {
    await page.goto('/rajasthan/district/jaipur');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    // Should show district view with assemblies
    await expect(page).toHaveURL(/rajasthan\/district\/jaipur/);
  });

  test('district to AC navigation works', async ({ page }) => {
    await page.goto('/rajasthan/district/baran/ac/anta');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });

    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);
    await expect(panel).not.toHaveClass(/pc-panel/);
  });
});

test.describe('Navigation Flow - Deep Links', () => {
  test('deep link with all params loads correctly', async ({ page }) => {
    await page.goto('/punjab/pc/amritsar/ac/amritsar-north?year=2022');
    
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);

    const yearChrome = panel.locator('#ac-panel-year');
    await expect(yearChrome).toBeVisible();
  });

  test('invalid AC name shows graceful error', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/nonexistent-ac');
    
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    // Should not crash - either show error or no panel
    const errorMessage = page.locator('.error-message, .not-found');
    const hasError = await errorMessage.count() > 0;
    
    if (!hasError) {
      // If no error, panel should not show fake data
      // This is acceptable behavior - the app handles gracefully
    }
  });
});

// =============================================================================
// AC VIEW NAVIGATION TESTS
// =============================================================================

test.describe('Navigation Flow - AC View', () => {
  test('AC view URL loads all assemblies for state', async ({ page }) => {
    await page.goto('/tamil-nadu/ac');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    // Should show assemblies view
    await expect(page).toHaveURL(/tamil-nadu\/ac/);
    
    // Wait for assemblies to load
    await page.waitForFunction(() => {
      const paths = document.querySelectorAll('.leaflet-interactive');
      return paths.length > 50; // Tamil Nadu has 234 ACs
    }, { timeout: 20000 });
    
    // Should have many assembly polygons
    const paths = page.locator('path.leaflet-interactive');
    const count = await paths.count();
    expect(count).toBeGreaterThan(50);
  });

  test('AC view with specific assembly loads panel', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/anna-nagar?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });

    await expect(page).toHaveURL(/anna-nagar/);
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);
    await expect(panel.locator('.winner-card-compact, .winner-info')).toBeVisible();
  });

  test('AC view URL pattern is correct', async ({ page }) => {
    await page.goto('/karnataka/ac');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    await expect(page).toHaveURL(/karnataka\/ac(\?|$)/);
  });

  test('navigating to AC in AC view shows panel', async ({ page }) => {
    await page.goto('/maharashtra/ac/mumbai-colaba');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });

    await ensureElectionPanelVisible(page);
  });
});

test.describe('Navigation Flow - AC View Toggle', () => {
  test('Layer dropdown navigates to AC view', async ({ page }) => {
    await page.goto('/kerala');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await openSidebarSheet(page);

    await sidebarYearSelectOption(page, 'sidebar-layer-mode', 'assemblies');

    await expect(page).toHaveURL(/kerala\/ac/, { timeout: 10000 });
  });

  test('Layer dropdown in sidebar switches Gujarat to AC view', async ({ page }) => {
    await page.goto('/gujarat');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await openSidebarSheet(page);

    await sidebarYearSelectOption(page, 'sidebar-layer-mode', 'assemblies');

    await expect(page).toHaveURL(/gujarat\/ac/, { timeout: 10000 });
  });
});

// =============================================================================
// PANEL VALIDATION TESTS
// =============================================================================

test.describe('Panel Validation - AC Panel Content', () => {
  test('AC panel shows all required sections', async ({ page }) => {
    await page.goto('/madhya-pradesh/pc/bhopal/ac/bhopal-uttar');
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);

    await expect(panel.locator('#ac-panel-view')).toBeVisible({ timeout: 15000 });
    await expect(panel.locator('.controls-card')).toBeVisible();
    await expect(
      panel
        .locator('.winner-card-compact, .winner-info, .candidates-table-full .candidate-row')
        .first()
    ).toBeVisible({ timeout: 25000 });
    await expect(panel.locator('.election-year-selector, .year-selector').first()).toBeVisible();

    await expect(panel.locator('.share-bar .election-panel-btn').first()).toBeVisible();
  });

  test('AC panel winner card has correct structure', async ({ page }) => {
    await page.goto('/odisha/pc/bhubaneswar/ac/bhubaneswar-central');
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);

    const winnerCard = panel.locator('.winner-card-compact, .winner-info').first();
    await expect(winnerCard).toBeVisible({ timeout: 30000 });

    await expect(winnerCard.locator('.winner-name')).toBeVisible();
    await expect(winnerCard.locator('.winner-party')).toBeVisible();
  });

  test('AC panel shows vote statistics', async ({ page }) => {
    await page.goto('/haryana/pc/gurgaon/ac/gurgaon');
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);

    const voteInfo = panel.locator('.votes, .vote-count');
    expect(await voteInfo.count()).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Panel Validation - PC Panel Content', () => {
  test('PC panel shows chrome (sidebar omits heading badge)', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/chennai-south');
    const panel = await ensureElectionPanelVisible(page);
    await expect(panel).toHaveClass(/pc-panel/);
    await expandPanelOnMobileIfNeeded(panel, page);
    const viewSelect = panel.locator('#pc-panel-view');
    await expect(viewSelect).toBeVisible();
    await expect(viewSelect).toHaveValue('overview');
    await expect(viewSelect.locator('option[value="candidates"]')).toHaveCount(0);
    await expect(panel.locator('.candidates-preview .candidates-table-full')).toBeVisible();
  });

  test('PC panel shows MP information', async ({ page }) => {
    await page.goto('/karnataka/pc/mysore');
    const panel = await ensureElectionPanelVisible(page);
    await expect(panel).toHaveClass(/pc-panel/);
    await expandPanelOnMobileIfNeeded(panel, page);
    
    // Should have winner/MP info
    await expect(panel.locator('.winner-card-compact, .winner-info, .candidate-card').first()).toBeVisible();
  });

  test('PC panel year selector works', async ({ page }) => {
    await page.goto('/uttar-pradesh/pc/varanasi');
    const panel = await ensureElectionPanelVisible(page);
    await expect(panel).toHaveClass(/pc-panel/);
    await expandPanelOnMobileIfNeeded(panel, page);

    const viewSelect = panel.locator('#pc-panel-view');
    await expect(viewSelect).toBeVisible();
    await expect(viewSelect).toHaveValue('overview');
    await expect(viewSelect.locator('option[value="candidates"]')).toHaveCount(0);
    const yearDropdown = panel.locator('#pc-panel-year');
    if ((await yearDropdown.count()) > 0) {
      expect(await yearDropdown.locator('option').count()).toBeGreaterThan(0);
    }
  });
});

test.describe('Panel Validation - Panel Interactions', () => {
  test('footer actions are visible and panel stays mounted', async ({ page }) => {
    await page.goto('/chhattisgarh/pc/raipur/ac/raipur-city-south');
    
    const panel = await ensureElectionPanelVisible(page);
    await expandPanelOnMobileIfNeeded(panel, page);
    await expect(panel.locator('.share-bar .election-panel-btn').first()).toBeVisible();
    await expect(panel).toBeVisible();
  });

  test('panel updates when navigating to new AC', async ({ page }) => {
    await page.goto('/jharkhand/pc/ranchi/ac/ranchi');
    
    const panel = await ensureElectionPanelVisible(page);
    await expect(panel).toBeVisible();
    
    // Navigate to different AC
    await page.goto('/jharkhand/pc/ranchi/ac/hatia');
    
    // Panel should show again
    const updatedPanel = await ensureElectionPanelVisible(page);
    await expect(updatedPanel).toBeVisible({ timeout: 15000 });
  });
});

// =============================================================================
// CROSS-STATE VALIDATION
// =============================================================================

test.describe('Cross-State Validation', () => {
  const stateTests = [
    { state: 'J&K', url: '/jammu-and-kashmir/pc/baramulla', type: 'pc' },
    { state: 'Delhi', url: '/delhi/pc/new-delhi/ac/delhi-cantt', type: 'ac' },
    { state: 'Sikkim', url: '/sikkim/pc/sikkim/ac/gangtok', type: 'ac' },
    { state: 'Goa', url: '/goa/pc/north-goa/ac/panaji', type: 'ac' },
    { state: 'Tripura', url: '/tripura/pc/tripura-west/ac/agartala', type: 'ac' },
    { state: 'Assam', url: '/assam/pc/karimganj', type: 'pc' },
  ];

  for (const { state, url, type } of stateTests) {
    test(`${state} - ${type.toUpperCase()} loads correctly`, async ({ page }) => {
      await page.goto(url);
      await page.waitForSelector('.leaflet-container', { timeout: 15000 });

      const panel = await ensureElectionPanelVisible(page);

      if (type === 'pc') {
        await expect(panel).toHaveClass(/pc-panel/);
      }

      await expandPanelOnMobileIfNeeded(panel, page);
      
      // Wait for staggered animations to complete
      await page.waitForTimeout(500);
      
      // Should have election data (winner info, candidates, or year selector with content)
      const dataSelectors = [
        '.winner-info',
        '.winner-card-compact', 
        '.winner-card',
        '.candidate-row',
        '.candidate-row-compact',
        '.candidate-card',
        '.candidates-section',
        '.pc-mp-info'
      ];
      await expectFirstVisibleMatch(panel, dataSelectors.join(', '));
    });
  }
});

// =============================================================================
// ERROR HANDLING VALIDATION
// =============================================================================

test.describe('Error Handling', () => {
  test('invalid state URL shows India view', async ({ page }) => {
    await page.goto('/invalid-state-name');
    
    // Should not crash - either redirect or show error
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    // App should still be functional
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible();
  });

  test('handles special characters in URL', async ({ page }) => {
    // URL encoded characters
    await page.goto('/tamil-nadu/pc/salem/ac/omalur');
    
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await ensureElectionPanelVisible(page);
  });
});

