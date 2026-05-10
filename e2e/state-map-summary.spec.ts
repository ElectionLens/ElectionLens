import { test, expect } from '@playwright/test';
import { expandMobileElectionPanelToFull } from './panel-helpers';
import { openSidebarSheet, sidebarYearSelectOption } from './sidebar-helpers';

test.describe('State map summary panel', () => {
  async function expandSummaryIfMobile(page: import('@playwright/test').Page) {
    const summary = page.locator('.sidebar-summary');
    await expandMobileElectionPanelToFull(summary, page);
  }

  test('assembly state map shows seats won and vote share in separate tabs', async ({ page }) => {
    await page.goto('/tamil-nadu/ac?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-interactive').length > 10,
      { timeout: 25000 }
    );
    await openSidebarSheet(page);

    const seatsPane = page.locator('.sidebar-summary[data-summary-pane="seats"]');
    await expect(seatsPane).toBeVisible({ timeout: 30000 });
    await expandSummaryIfMobile(page);

    await expect
      .poll(
        async () => {
          const text = await seatsPane.innerText();
          return /\d+\s+ACs counted/.test(text);
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);

    await sidebarYearSelectOption(page, 'sidebar-panel-view', 'votes');

    const votesPane = page.locator('.sidebar-summary[data-summary-pane="votes"]');
    await expect(votesPane).toBeVisible();

    await expect
      .poll(
        async () => {
          const text = await votesPane.innerText();
          return (
            text.includes('%') ||
            text.includes('Loading or no result file matched to the map.')
          );
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);
  });

  test('parliament state map shows seats won and vote share in separate tabs', async ({ page }) => {
    await page.goto('/tamil-nadu/pc?year=2024');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-interactive').length > 3,
      { timeout: 25000 }
    );
    await openSidebarSheet(page);

    const seatsPane = page.locator('.sidebar-summary[data-summary-pane="seats"]');
    await expect(seatsPane).toBeVisible({ timeout: 30000 });
    await expandSummaryIfMobile(page);

    await expect
      .poll(
        async () => {
          const text = await seatsPane.innerText();
          return /\d+\s+PCs counted/.test(text);
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);

    await sidebarYearSelectOption(page, 'sidebar-panel-view', 'votes');

    const votesPane = page.locator('.sidebar-summary[data-summary-pane="votes"]');
    await expect(votesPane).toBeVisible();

    await expect
      .poll(
        async () => {
          const text = await votesPane.innerText();
          return /\d+\s+PCs counted/.test(text) && text.includes('%');
        },
        { timeout: 45000, intervals: [200, 400, 800] }
      )
      .toBe(true);
  });

  test('clicking a summary party opens candidate drill-down and dims other polygons', async ({
    page,
  }) => {
    await page.goto('/tamil-nadu/ac?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-interactive').length > 10, {
      timeout: 25000,
    });
    await openSidebarSheet(page);

    const summary = page.locator('.sidebar-summary[data-summary-pane="seats"]');
    await expect(summary).toBeVisible({ timeout: 30000 });
    await expandSummaryIfMobile(page);

    const partyBtn = summary.locator('.state-map-summary-row').first();
    await expect(partyBtn).toBeVisible();

    const countDimmed = async () =>
      page.evaluate(() => {
        const paths = Array.from(document.querySelectorAll<SVGPathElement>('.leaflet-interactive'));
        return paths.filter((p) => {
          const opRaw = p.getAttribute('fill-opacity');
          const op = opRaw == null ? NaN : Number(opRaw);
          return Number.isFinite(op) && op <= 0.21;
        }).length;
      });

    const baselineDimmed = await countDimmed();

    const partyLabel = await partyBtn.innerText();
    await partyBtn.click();

    await expect
      .poll(async () => countDimmed(), { timeout: 15000, intervals: [150, 300, 500] })
      .toBeGreaterThan(baselineDimmed);
    const candidatesPane = page.locator('.sidebar-summary[data-summary-pane="party-candidates"]');
    await expect(candidatesPane).toBeVisible({ timeout: 15000 });
    await expect(candidatesPane).toContainText(/candidates/i);
    await expect(candidatesPane).toContainText(partyLabel.trim().slice(0, 3));
    await expect
      .poll(() => new URL(page.url()).searchParams.get('pane'))
      .toBe('party');

    await page.goBack();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('pane') ?? '')
      .toMatch(/^(|summary|region)$/);

    await page.goForward();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('pane') ?? '')
      .toMatch(/^(|party|summary|region)$/);
  });

  test('party candidate row click navigates to constituency panel', async ({ page }) => {
    await page.goto('/tamil-nadu/ac?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-interactive').length > 10, {
      timeout: 25000,
    });
    await openSidebarSheet(page);

    const summary = page.locator('.sidebar-summary[data-summary-pane="seats"]');
    await expect(summary).toBeVisible({ timeout: 30000 });
    await summary.locator('.state-map-summary-row').first().click();

    const candidateRow = page.locator('.party-candidate-row').first();
    await expect(candidateRow).toBeVisible({ timeout: 15000 });
    await expect(candidateRow.locator('.party-candidate-main-top')).toBeVisible();
    await candidateRow.click();

    await expect(page.locator('.sidebar .election-panel, .sidebar .pc-panel').first()).toBeVisible({
      timeout: 25000,
    });
    const paneAfterClick = new URL(page.url()).searchParams.get('pane');
    expect(['ac', 'pc']).toContain(paneAfterClick);

    await page.goBack();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('pane') ?? '')
      .toMatch(/^(|party|summary|region|ac|pc)$/);
  });

  test('party drill-down syncs paneParty in URL', async ({ page }) => {
    await page.goto('/tamil-nadu/ac?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-interactive').length > 10, {
      timeout: 25000,
    });
    await openSidebarSheet(page);
    const summary = page.locator('.sidebar-summary[data-summary-pane="seats"]');
    await expect(summary).toBeVisible({ timeout: 30000 });
    await expandSummaryIfMobile(page);
    await summary.locator('.state-map-summary-row').first().click();
    await expect
      .poll(() => Boolean(new URL(page.url()).searchParams.get('paneParty')))
      .toBe(true);
    await expect
      .poll(() => new URL(page.url()).searchParams.get('pane'))
      .toBe('party');
  });

  test('deep link restores summary pane and pane back button', async ({ page }) => {
    await page.goto('/tamil-nadu/ac?year=2021&pane=summary&paneView=votes');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await openSidebarSheet(page);
    await expect(page.locator('.sidebar-summary[data-summary-pane="votes"]')).toBeVisible({
      timeout: 30000,
    });
    const backBtn = page.locator('.pane-stack-header button').first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('pane'))
      .toBe('region');
  });

  test('hides state map summary when an assembly is selected', async ({ page }) => {
    await page.goto('/tamil-nadu/ac/anna-nagar?year=2021');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await openSidebarSheet(page);
    await page.waitForSelector('.sidebar .election-panel', { timeout: 25000 });

    await expect(page.locator('.sidebar-summary')).toHaveCount(0);
  });

  test('hides state map summary when a PC is selected (PC boundary mode)', async ({
    page,
  }) => {
    // With showACs=false, map level is constituencies — summary hides when currentPC is set.
    await page.goto('/tamil-nadu/pc/salem?showACs=false');
    await page.waitForSelector('.leaflet-container', { timeout: 20000 });
    await openSidebarSheet(page);
    await expect(page.locator('.pc-panel')).toBeVisible({ timeout: 20000 });

    await expect(page.locator('.sidebar-summary')).toHaveCount(0);
  });
});
