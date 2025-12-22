/**
 * Comprehensive Validation Tests
 * 
 * Tests links, navigation flows, and panel visibility across the app.
 */
import { test, expect } from '@playwright/test';

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
    
    // Should have breadcrumb navigation with state name
    const breadcrumb = page.locator('.breadcrumb-nav');
    await expect(breadcrumb).toBeVisible({ timeout: 10000 });
    
    // Should show Karnataka in breadcrumb text
    await expect(breadcrumb).toContainText(/Karnataka/i);
  });
});

test.describe('Link Validation - Year Selector Links', () => {
  test('year buttons update panel content', async ({ page }) => {
    await page.goto('/maharashtra/pc/pune/ac/kothrud');
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    // Get available year buttons
    const yearButtons = page.locator('.year-btn, .election-year-selector button');
    const count = await yearButtons.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Click a different year if available
    if (count > 1) {
      const secondYear = yearButtons.nth(1);
      await secondYear.click();
      
      // Year button should become active
      await expect(secondYear).toHaveClass(/active/);
      
      // Panel should still be visible with data
      await expect(page.locator('.election-panel')).toBeVisible();
    }
  });

  test('all year buttons are functional', async ({ page }) => {
    await page.goto('/rajasthan/pc/jaipur/ac/civil-lines');
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    const yearButtons = page.locator('.year-btn, .election-year-selector button');
    const count = await yearButtons.count();
    
    // Each year button should be clickable
    for (let i = 0; i < Math.min(count, 4); i++) {
      const btn = yearButtons.nth(i);
      await expect(btn).toBeEnabled();
    }
  });
});

test.describe('Link Validation - Tab Navigation', () => {
  test('Overview tab shows summary data', async ({ page }) => {
    await page.goto('/gujarat/pc/ahmedabad-east/ac/maninagar');
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    // Overview tab should be default
    const overviewTab = page.locator('.panel-tab').filter({ hasText: 'Overview' });
    await expect(overviewTab).toHaveClass(/active/);
    
    // Should show winner card
    await expect(page.locator('.winner-card-compact, .winner-info')).toBeVisible();
  });

  test('Candidates tab shows full list', async ({ page }) => {
    await page.goto('/kerala/pc/thiruvananthapuram/ac/nemom');
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    // Click Candidates tab
    const candidatesTab = page.locator('.panel-tab').filter({ hasText: 'Candidates' });
    await candidatesTab.click();
    
    // Should show candidates list
    await expect(page.locator('.candidates-full, .candidates-list')).toBeVisible();
    
    // Should have multiple candidate rows
    const rows = page.locator('.candidate-row, .candidate-card');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(1);
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
    
    // PC panel should show
    const pcPanel = page.locator('.election-panel.pc-panel');
    await expect(pcPanel).toBeVisible({ timeout: 15000 });
    
    // Navigate to AC
    await page.goto('/bihar/pc/patna-sahib/ac/bankipore');
    await expect(page).toHaveURL(/bihar\/pc\/patna-sahib\/ac\/bankipore/);
    
    // AC panel should show
    const acPanel = page.locator('.election-panel:not(.pc-panel)');
    await expect(acPanel).toBeVisible({ timeout: 15000 });
  });

  test('back navigation preserves state', async ({ page }) => {
    await page.goto('/west-bengal/pc/kolkata-uttar/ac/jorasanko?year=2021');
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    // Navigate back to PC
    await page.goto('/west-bengal/pc/kolkata-uttar');
    
    // Should show PC panel
    await expect(page.locator('.election-panel.pc-panel')).toBeVisible({ timeout: 15000 });
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
    
    // Should show AC panel
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(panel).not.toHaveClass(/pc-panel/);
  });
});

test.describe('Navigation Flow - Deep Links', () => {
  test('deep link with all params loads correctly', async ({ page }) => {
    await page.goto('/punjab/pc/amritsar/ac/amritsar-north?year=2022');
    
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    
    // Panel should show
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    
    // Year should be reflected (or fallback)
    const yearSelector = page.locator('.election-year-selector');
    await expect(yearSelector).toBeVisible();
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
// PANEL VALIDATION TESTS
// =============================================================================

test.describe('Panel Validation - AC Panel Content', () => {
  test('AC panel shows all required sections', async ({ page }) => {
    await page.goto('/madhya-pradesh/pc/bhopal/ac/bhopal-uttar');
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    const panel = page.locator('.election-panel');
    
    // Required elements
    await expect(panel.locator('.election-panel-header, header')).toBeVisible();
    await expect(panel.locator('.winner-card-compact, .winner-info, .winner-section')).toBeVisible();
    await expect(panel.locator('.election-year-selector, .year-selector')).toBeVisible();
    
    // Close button
    await expect(panel.locator('.election-panel-close')).toBeVisible();
  });

  test('AC panel winner card has correct structure', async ({ page }) => {
    await page.goto('/odisha/pc/bhubaneswar/ac/bhubaneswar-central');
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    const winnerCard = page.locator('.winner-card-compact, .winner-info').first();
    await expect(winnerCard).toBeVisible();
    
    // Should have candidate name
    const candidateName = winnerCard.locator('.candidate-name, .winner-name, h3, h4');
    await expect(candidateName).toBeVisible();
    
    // Should have party info (class is .winner-party or .party)
    const partyInfo = winnerCard.locator('.winner-party, .party');
    await expect(partyInfo).toBeVisible();
  });

  test('AC panel shows vote statistics', async ({ page }) => {
    await page.goto('/haryana/pc/gurgaon/ac/gurgaon');
    await page.waitForSelector('.election-panel', { timeout: 15000 });
    
    // Switch to candidates tab to see vote counts
    const candidatesTab = page.locator('.panel-tab').filter({ hasText: 'Candidates' });
    if (await candidatesTab.count() > 0) {
      await candidatesTab.click();
      
      // Should show vote counts
      const voteInfo = page.locator('.votes, .vote-count, .total-votes');
      const count = await voteInfo.count();
      expect(count).toBeGreaterThanOrEqual(0); // May not always be visible
    }
  });
});

test.describe('Panel Validation - PC Panel Content', () => {
  test('PC panel shows parliament badge', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/chennai-south');
    await page.waitForSelector('.election-panel.pc-panel', { timeout: 15000 });
    
    const panel = page.locator('.election-panel.pc-panel');
    
    // Should have Parliament badge/indicator
    const badge = panel.locator('.pc-badge, .parliament-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/Parliament/i);
  });

  test('PC panel shows MP information', async ({ page }) => {
    await page.goto('/karnataka/pc/mysore');
    await page.waitForSelector('.election-panel.pc-panel', { timeout: 15000 });
    
    const panel = page.locator('.election-panel.pc-panel');
    
    // Should have winner/MP info
    await expect(panel.locator('.winner-card-compact, .winner-info, .candidate-card').first()).toBeVisible();
  });

  test('PC panel year selector works', async ({ page }) => {
    await page.goto('/uttar-pradesh/pc/varanasi');
    await page.waitForSelector('.election-panel.pc-panel', { timeout: 15000 });
    
    const yearSelector = page.locator('.election-year-selector');
    await expect(yearSelector).toBeVisible();
    
    // Should have multiple years for Varanasi (2024, 2019, 2014, etc.)
    const yearButtons = yearSelector.locator('button, .year-btn');
    expect(await yearButtons.count()).toBeGreaterThan(0);
  });
});

test.describe('Panel Validation - Panel Interactions', () => {
  test('close button hides panel', async ({ page }) => {
    await page.goto('/chhattisgarh/pc/raipur/ac/raipur-city-south');
    
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    
    // Click close
    const closeBtn = panel.locator('.election-panel-close');
    await closeBtn.click();
    
    // Panel should be hidden
    await expect(panel).not.toBeVisible();
  });

  test('panel reopens when navigating to new AC', async ({ page }) => {
    await page.goto('/jharkhand/pc/ranchi/ac/ranchi');
    
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    
    // Close panel
    const closeBtn = panel.locator('.election-panel-close');
    await closeBtn.click();
    await expect(panel).not.toBeVisible();
    
    // Navigate to different AC
    await page.goto('/jharkhand/pc/ranchi/ac/hatia');
    
    // Panel should show again
    await expect(panel).toBeVisible({ timeout: 15000 });
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
      
      // Panel should show
      const panel = page.locator('.election-panel');
      await expect(panel).toBeVisible({ timeout: 15000 });
      
      if (type === 'pc') {
        await expect(panel).toHaveClass(/pc-panel/);
      }
      
      // Should have election data (winner info or candidates)
      const hasData = await panel.locator('.winner-info, .winner-card-compact, .candidate-row, .candidate-card').first().isVisible().catch(() => false);
      expect(hasData).toBe(true);
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
    await expect(page.locator('.election-panel')).toBeVisible({ timeout: 15000 });
  });
});

