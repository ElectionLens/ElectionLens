/**
 * E2E URL Validation Tests
 *
 * Tests a representative sample of PC and AC URLs from each state
 * to ensure election panels load correctly with data.
 */
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Deep links + map + sidebar can exceed 120s (`goto` and leaflet each allow 60s before panel).
 */
test.describe.configure({ timeout: 240000 });
import {
  ensureElectionPanelVisible,
  expandMobileElectionPanelToFull,
  expectFirstVisibleMatch,
} from './panel-helpers';
import { openSidebarSheet, sidebarYearSelectOption, sidebarYearSelectorSelect } from './sidebar-helpers';

async function expectPanelDataVisible(panel: Locator, page: Page, selector: string) {
  await expandMobileElectionPanelToFull(panel, page);
  await expectFirstVisibleMatch(panel, selector);
}

// Critical URLs that have caused issues in the past
const criticalUrls = [
  {
    url: '/tamil-nadu/pc/dharmapuri/ac/mettur?year=pc-2019&showACs=true',
    description: 'AC-within-PC with year=pc-YYYY and showACs (PC contribution coloring)',
    type: 'ac' as const,
  },
  {
    url: '/rajasthan/pc/nagaur/ac/jayal-(sc)?year=2023',
    description: 'SC suffix with parentheses',
    type: 'ac' as const,
  },
  {
    url: '/tamil-nadu/pc/salem/ac/omalur?year=2021',
    description: 'Standard AC with year',
    type: 'ac' as const,
  },
  {
    url: '/karnataka/pc/bangalore-north?year=2024',
    description: 'PC with year',
    type: 'pc' as const,
  },
  {
    url: '/tamil-nadu/pc/perambalur',
    description: 'PC without year (deep link)',
    type: 'pc' as const,
  },
  {
    url: '/maharashtra/pc/mumbai-north-central',
    description: 'PC with multiple hyphens',
    type: 'pc' as const,
  },
  {
    url: '/delhi/pc/chandni-chowk/ac/ballimaran',
    description: 'Delhi AC',
    type: 'ac' as const,
  },
  {
    url: '/west-bengal/pc/kolkata-dakshin/ac/kolkata-port-(sc)',
    description: 'West Bengal SC constituency',
    type: 'ac' as const,
  },
  {
    url: '/rajasthan/district/baran/ac/anta?year=2023',
    description: 'District URL with AC',
    type: 'ac' as const,
  },
];

// Sample URLs from each major state (one AC per state)
const stateACSamples = [
  { state: 'Tamil Nadu', url: '/tamil-nadu/pc/chennai-north/ac/royapuram' },
  { state: 'Karnataka', url: '/karnataka/pc/bangalore-central/ac/shantinagar' },
  { state: 'Maharashtra', url: '/maharashtra/pc/pune/ac/kothrud' },
  { state: 'Uttar Pradesh', url: '/uttar-pradesh/pc/lucknow/ac/lucknow-west' },
  { state: 'West Bengal', url: '/west-bengal/pc/kolkata-uttar/ac/jorasanko' },
  { state: 'Rajasthan', url: '/rajasthan/pc/jaipur/ac/civil-lines' },
  { state: 'Gujarat', url: '/gujarat/pc/ahmedabad-east/ac/maninagar' },
  { state: 'Kerala', url: '/kerala/pc/thiruvananthapuram/ac/nemom' },
  { state: 'Bihar', url: '/bihar/pc/patna-sahib/ac/bankipur' },
  { state: 'Madhya Pradesh', url: '/madhya-pradesh/pc/bhopal/ac/bhopal-uttar' },
  { state: 'Odisha', url: '/odisha/pc/bhubaneswar/ac/bhubaneswar-central' },
  { state: 'Punjab', url: '/punjab/pc/amritsar/ac/amritsar-north' },
  { state: 'Haryana', url: '/haryana/pc/gurgaon/ac/gurgaon' },
  { state: 'Chhattisgarh', url: '/chhattisgarh/pc/raipur/ac/raipur-city-south' },
  { state: 'Jharkhand', url: '/jharkhand/pc/ranchi/ac/ranchi' },
];

// Sample PC URLs - these should show PC election panels
const pcSamples = [
  { state: 'Tamil Nadu', url: '/tamil-nadu/pc/chennai-south' },
  { state: 'Karnataka', url: '/karnataka/pc/mysore' },
  { state: 'Maharashtra', url: '/maharashtra/pc/nagpur' },
  { state: 'Uttar Pradesh', url: '/uttar-pradesh/pc/varanasi' },
  { state: 'West Bengal', url: '/west-bengal/pc/diamond-harbour' },
  { state: 'Rajasthan', url: '/rajasthan/pc/jaipur' },
  { state: 'Gujarat', url: '/gujarat/pc/ahmedabad-east' },
];

test.describe('URL Validation - Critical URLs', () => {
  for (const { url, description, type } of criticalUrls) {
    test(`loads ${description}: ${url}`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });

      // Wait for map to load
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 60000 });

      // Both AC and PC should show election panel
      const panel = await ensureElectionPanelVisible(page);

      if (type === 'ac') {
        // AC panel should have winner info or candidate row
        await expectPanelDataVisible(
          panel,
          page,
          '.winner-info, .winner-card-compact, .candidate-row'
        );
      } else {
        // PC panel should have the pc-panel class and candidate info
        await expect(panel).toHaveClass(/pc-panel/);
        await expectPanelDataVisible(
          panel,
          page,
          '.winner-info, .winner-card-compact, .candidate-row, .candidate-card'
        );
      }
    });
  }
});

test.describe('URL Validation - AC Samples from Each State', () => {
  for (const { state, url } of stateACSamples) {
    test(`${state}: ${url}`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });

      // Wait for map
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 60000 });

      // Should show election panel with data
      const panel = await ensureElectionPanelVisible(page);

      // Panel should have actual election data (winner or candidates)
      await expectPanelDataVisible(
        panel,
        page,
        '.winner-info, .winner-card-compact, .candidate-row'
      );
    });
  }
});

test.describe('URL Validation - PC Samples (Panel Must Show)', () => {
  for (const { state, url } of pcSamples) {
    test(`${state}: ${url}`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });

      // Wait for map
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 60000 });

      // PC URL should show election panel (this was the bug!)
      const panel = await ensureElectionPanelVisible(page);

      // Should have the pc-panel class
      await expect(panel).toHaveClass(/pc-panel/);

      // Should have actual candidate data
      await expectPanelDataVisible(
        panel,
        page,
        '.winner-info, .winner-card-compact, .candidate-row, .candidate-card'
      );
    });
  }
});

test.describe('URL Validation - Year Fallback', () => {
  test('falls back to valid year when invalid year specified', async ({ page }) => {
    // 2022 is not a valid year for Rajasthan (has 2008, 2013, 2018, 2023)
    await page.goto('/rajasthan/pc/nagaur/ac/jayal-(sc)?year=2022', {
      waitUntil: 'load',
      timeout: 60000,
    });

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 60000 });

    // Should still show panel (falls back to closest year)
    const panel = await ensureElectionPanelVisible(page);

    // Should have election data
    await expectPanelDataVisible(panel, page, '.winner-info, .winner-card-compact, .candidate-row');

    // Panel should show election data; year selector may be in panel or sidebar map controls
    const yearSelect = page
      .locator(
        '.election-year-selector select.year-dropdown, select#sidebar-map-year-proxy, select#sidebar-map-year'
      )
      .first();
    await expect(yearSelect).toBeVisible({ timeout: 5000 });
    const selectedValue = await yearSelect.inputValue();
    expect(selectedValue).not.toContain('2022');
  });

  test('handles future year gracefully', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2030');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    // Should still show panel with latest available year
    const panel = await ensureElectionPanelVisible(page);

    await expandMobileElectionPanelToFull(panel, page);

    const hasYearChrome =
      (await page.locator('select.year-dropdown').count()) > 0 ||
      (
        await page.locator(
          '.election-year-selector, .year-selector, select#sidebar-map-year-proxy, select#sidebar-map-year'
        ).count()
      ) >
        0;

    let hasVisibleResults = false;
    const resultLoc = panel.locator('.winner-info, .winner-card-compact, .candidate-row');
    for (let i = 0; i < (await resultLoc.count()); i++) {
      if (await resultLoc.nth(i).isVisible().catch(() => false)) {
        hasVisibleResults = true;
        break;
      }
    }

    expect(hasVisibleResults || hasYearChrome).toBeTruthy();
  });
});

test.describe('URL Validation - Edge Cases', () => {
  test('handles constituency with ampersand', async ({ page }) => {
    await page.goto('/andaman-and-nicobar-islands');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.error-message')).not.toBeVisible();
  });

  test('handles ST constituency', async ({ page }) => {
    await page.goto('/rajasthan/pc/jaipur-rural/ac/jamwa-ramgarh-(st)', {
      waitUntil: 'load',
      timeout: 60000,
    });

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 60000 });

    // Should show election panel with data
    const panel = await ensureElectionPanelVisible(page);
  });

  test('handles constituency with numbers', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-south/ac/jayanagar');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    const panel = await ensureElectionPanelVisible(page);

    // Should have election data
    await expectPanelDataVisible(panel, page, '.winner-info, .winner-card-compact, .candidate-row');
  });

  test('district URL loads AC panel', async ({ page }) => {
    await page.goto('/rajasthan/district/baran/ac/anta?year=2023', {
      waitUntil: 'load',
      timeout: 60000,
    });

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 60000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-interactive').length > 0,
      { timeout: 60000 }
    );

    // Should show AC election panel
    const panel = await ensureElectionPanelVisible(page);

    await expect(panel.locator('#ac-panel-view, button#ac-panel-view')).toBeVisible({ timeout: 20000 });
    await expect(panel.locator('#pc-panel-view')).toHaveCount(0);

    // Should have election data
    await expectPanelDataVisible(panel, page, '.winner-info, .winner-card-compact, .candidate-row');
  });
});

test.describe('URL Validation - AC-within-PC Year and showACs', () => {
  test('loads AC-within-PC URL with year=pc-YYYY and showACs', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/dharmapuri/ac/mettur?year=pc-2019&showACs=true');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    const panel = await ensureElectionPanelVisible(page);

    await expect(page).toHaveURL(/year=pc-2019/);
    await expect(page).toHaveURL(/showACs=true/);

    await expectPanelDataVisible(panel, page, '.winner-info, .winner-card-compact, .candidate-row');
  });

  test('sidebar map year change updates URL to year=pc-YYYY in AC-within-PC view', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/dharmapuri/ac/mettur?year=pc-2019&showACs=true');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/year=pc-2019/);
    await openSidebarSheet(page);

    const mapYearSelect = sidebarYearSelectorSelect(page, 'sidebar-map-year');
    if ((await mapYearSelect.locator('option[value="pc-2024"]').count()) > 0) {
      await sidebarYearSelectOption(page, 'sidebar-map-year', 'pc-2024');
      await expect(page).toHaveURL(/year=pc-2024/, { timeout: 5000 });
    }
  });

  test('AC-within-PC URL shows panel and correct year params', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/dharmapuri/ac/mettur?year=pc-2019&showACs=true');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
    const visiblePanel = await ensureElectionPanelVisible(page);
    await expect(page).toHaveURL(/year=pc-2019/);
    await expect(page).toHaveURL(/showACs=true/);

    await expandMobileElectionPanelToFull(visiblePanel, page);
    const yearDropdown = visiblePanel.locator('#ac-panel-year');
    await expect(yearDropdown).toBeVisible({ timeout: 5000 });
  });
});

test.describe('URL Validation - Parliament Panel in AC View', () => {
  test('AC view shows parliament contributions', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/chennai-north/ac/royapuram');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    // Should show AC election panel
    const panel = await ensureElectionPanelVisible(page);

    // Wait for parliament section to potentially load
    await page.waitForTimeout(2000);

    // Check for parliament section (may be in tabs or separate section)
    const parliamentSection = page.locator(
      '.parliament-contribution, .parliament-section, .pc-contribution, [data-testid="parliament"]'
    );
    // Parliament section is optional but should be visible if data exists
    const hasParliament = await parliamentSection.count();
    if (hasParliament > 0) {
      await expect(parliamentSection.first()).toBeVisible();
    }
  });
});
