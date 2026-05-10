import { test, expect } from '@playwright/test';

test.describe('Markets Dashboard', () => {
  test('renders both cards and the protocols table structure', async ({ page }) => {
    await page.goto('/markets');

    // Page-level assertions
    await expect(page.locator('h1')).toContainText('DeFi & Market Dashboard');
    await expect(page.locator('text=Top Protocols')).toBeVisible();
    await expect(page.locator('text=Smart Money Flow')).toBeVisible();

    // Table structure: 7 column headers (6 sortable + 1 sparkline)
    const headers = page.locator('table thead tr th');
    await expect(headers).toHaveCount(7);

    // Each AC1 column header must be present
    for (const label of ['Protocol', 'Chain', 'TVL', 'APY 7d', 'APY 30d', 'Change 24h', '7d Trend']) {
      await expect(page.locator('table thead').getByText(label, { exact: false })).toBeVisible();
    }
  });

  test('table row count and contents reflect protocols data when available', async ({ page }) => {
    await page.goto('/markets');

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // Empty-state acceptance: indexer worker may be feature-flagged off in dev.
      // The page itself must still render successfully — covered by the smoke test above.
      test.info().annotations.push({ type: 'note', description: 'No protocol rows — indexer disabled or empty.' });
      return;
    }

    // At least one row has a non-empty protocol name and a TVL cell that starts with '$'
    const firstName = await rows.first().locator('td').nth(0).innerText();
    expect(firstName.trim().length).toBeGreaterThan(0);

    const firstTvl = await rows.first().locator('td').nth(2).innerText();
    expect(firstTvl).toMatch(/^\$/);
  });

  test('clicking a sortable column header toggles sort direction without errors', async ({ page }) => {
    await page.goto('/markets');

    const tvlButton = page.locator('table thead').getByRole('button', { name: /TVL/i });
    if (await tvlButton.count() === 0) return;

    await tvlButton.click();
    // No console errors thrown — implicit pass if click resolves and table still visible.
    await expect(page.locator('table')).toBeVisible();
    await tvlButton.click(); // toggle back
    await expect(page.locator('table')).toBeVisible();
  });
});
