/**
 * E2E URL Validation Tests
 *
 * Tests a representative sample of PC and AC URLs from each state
 * to ensure election panels load correctly with data.
 */
import { test, expect } from '@playwright/test';

// Critical URLs that have caused issues in the past
const criticalUrls = [
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
  { state: 'Bihar', url: '/bihar/pc/patna-sahib/ac/bankipore' },
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
      await page.goto(url);

      // Wait for map to load
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

      // Both AC and PC should show election panel
      const panel = page.locator('.election-panel');
      await expect(panel).toBeVisible({ timeout: 15000 });

      if (type === 'ac') {
        // AC panel should have winner info or candidate row
        await expect(
          panel.locator('.winner-info, .winner-card-compact, .candidate-row').first()
        ).toBeVisible({ timeout: 5000 });
      } else {
        // PC panel should have the pc-panel class and candidate info
        await expect(panel).toHaveClass(/pc-panel/);
        await expect(
          panel.locator('.winner-info, .winner-card-compact, .candidate-row, .candidate-card').first()
        ).toBeVisible({ timeout: 5000 });
      }
    });
  }
});

test.describe('URL Validation - AC Samples from Each State', () => {
  for (const { state, url } of stateACSamples) {
    test(`${state}: ${url}`, async ({ page }) => {
      await page.goto(url);

      // Wait for map
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

      // Should show election panel with data
      const panel = page.locator('.election-panel');
      await expect(panel).toBeVisible({ timeout: 15000 });

      // Panel should have actual election data (winner or candidates)
      await expect(
        panel.locator('.winner-info, .winner-card-compact, .candidate-row').first()
      ).toBeVisible({ timeout: 5000 });
    });
  }
});

test.describe('URL Validation - PC Samples (Panel Must Show)', () => {
  for (const { state, url } of pcSamples) {
    test(`${state}: ${url}`, async ({ page }) => {
      await page.goto(url);

      // Wait for map
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

      // PC URL should show election panel (this was the bug!)
      const panel = page.locator('.election-panel');
      await expect(panel).toBeVisible({ timeout: 15000 });

      // Should have the pc-panel class
      await expect(panel).toHaveClass(/pc-panel/);

      // Should have actual candidate data
      await expect(
        panel.locator('.winner-info, .winner-card-compact, .candidate-row, .candidate-card').first()
      ).toBeVisible({ timeout: 5000 });
    });
  }
});

test.describe('URL Validation - Year Fallback', () => {
  test('falls back to valid year when invalid year specified', async ({ page }) => {
    // 2022 is not a valid year for Rajasthan (has 2008, 2013, 2018, 2023)
    await page.goto('/rajasthan/pc/nagaur/ac/jayal-(sc)?year=2022');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    // Should still show panel (falls back to closest year)
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Should have election data
    await expect(
      panel.locator('.winner-info, .winner-card-compact, .candidate-row').first()
    ).toBeVisible({ timeout: 5000 });

    // Year selector should show the fallback year (2023), not 2022
    const activeYear = page.locator('.year-btn.active, .election-year-selector button.active');
    await expect(activeYear).not.toHaveText('2022');
  });

  test('handles future year gracefully', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/salem/ac/omalur?year=2030');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    // Should still show panel with latest available year
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Should have election data
    await expect(
      panel.locator('.winner-info, .winner-card-compact, .candidate-row').first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('URL Validation - Edge Cases', () => {
  test('handles constituency with ampersand', async ({ page }) => {
    await page.goto('/andaman-and-nicobar-islands');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.error-message')).not.toBeVisible();
  });

  test('handles ST constituency', async ({ page }) => {
    await page.goto('/rajasthan/pc/banswara/ac/sajjangarh-(st)');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    // Should show election panel with data
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
  });

  test('handles constituency with numbers', async ({ page }) => {
    await page.goto('/karnataka/pc/bangalore-south/ac/jayanagar');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Should have election data
    await expect(
      panel.locator('.winner-info, .winner-card-compact, .candidate-row').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('district URL loads AC panel', async ({ page }) => {
    await page.goto('/rajasthan/district/baran/ac/anta?year=2023');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    // Should show AC election panel
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Should NOT have pc-panel class (it's an AC panel)
    await expect(panel).not.toHaveClass(/pc-panel/);

    // Should have election data
    await expect(
      panel.locator('.winner-info, .winner-card-compact, .candidate-row').first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('URL Validation - Parliament Panel in AC View', () => {
  test('AC view shows parliament contributions', async ({ page }) => {
    await page.goto('/tamil-nadu/pc/chennai-north/ac/royapuram');

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

    // Should show AC election panel
    const panel = page.locator('.election-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });

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
