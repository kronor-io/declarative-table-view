import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

test.describe('Virtual Column Index Alignment', () => {

    test('renders correct values when virtual columns exist', async ({ page }) => {
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        await page.goto('/?test-view=simple-test-view');
        await page.waitForResponse('**/v1/graphql');

        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Wait for at least one data row.
        const firstRow = table.locator('tbody tr').first();
        await expect(firstRow).toBeVisible();

        const firstCell = firstRow.locator('td').nth(0);
        const secondCell = firstRow.locator('td').nth(1);

        // If virtual columns are included in rowData but filtered out from rendered columns,
        // Table's index-based access will shift and these will be empty/wrong.
        await expect(firstCell).toHaveText(/Test\s+\d+/);
        await expect(secondCell).toHaveText(/\$\d+/);

        // Extra safety: ensure the numbers match within the same row.
        const testText = (await firstCell.textContent())?.trim() ?? '';
        const emailText = (await secondCell.textContent())?.trim() ?? '';

        const testNum = Number(testText.replace(/^Test\s+/, ''));
        const amountMatch = emailText.match(/\$([0-9]+)/);
        const amountNum = amountMatch ? Number(amountMatch[1]) : NaN;

        expect(Number.isFinite(testNum)).toBeTruthy();
        expect(Number.isFinite(amountNum)).toBeTruthy();
        expect(amountNum).toBe(testNum * 10);
    });
});
