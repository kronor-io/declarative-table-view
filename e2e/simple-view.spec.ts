import { test, expect } from '@playwright/test';
import { simpleTestViewColumnDefinitions } from '../src/views/simpleTestView'; // Adjusted import path

test.describe('Simple View Rendering', () => {
    test('should render a view with a single column header and data', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', async route => {
            const request = route.request();
            const postData = request.postDataJSON?.();
            let minAmount = undefined;
            // Check for Hasura-style filter in the request variables
            if (postData && postData.variables && postData.variables.conditions && postData.variables.conditions.amount && postData.variables.conditions.amount._gte !== undefined) {
                minAmount = postData.variables.conditions.amount._gte;
            }
            // Filter the mock data based on the amount filter if present
            const allRows = [
                { id: '1', testField: 'Row 1', amount: 10 },
                { id: '2', testField: 'Row 2', amount: 20 },
                { id: '3', testField: 'Row 3', amount: 30 },
                { id: '4', testField: 'Row 4', amount: 40 }
            ];
            const filteredRows = minAmount !== undefined ? allRows.filter(row => row.amount >= minAmount) : allRows;
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: {
                        simpleTestDataCollection: filteredRows
                    }
                })
            });
        });

        // Navigate to the page with the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Get the expected header text from the imported column definitions
        const expectedHeaderText = simpleTestViewColumnDefinitions[0].name;

        // Locate the column header by its text content
        const columnHeader = table.getByText(expectedHeaderText, { exact: true });

        // Assert that the column header is visible
        await expect(columnHeader).toBeVisible();

        // Assert that all rows are visible before applying the filter
        await expect(table.getByText('Row 1', { exact: true })).toBeVisible();
        await expect(table.getByText('Row 2', { exact: true })).toBeVisible();
        await expect(table.getByText('Row 3', { exact: true })).toBeVisible();
        await expect(table.getByText('Row 4', { exact: true })).toBeVisible();
        await expect(table.getByText('10', { exact: true })).toBeVisible();
        await expect(table.getByText('20', { exact: true })).toBeVisible();
        await expect(table.getByText('30', { exact: true })).toBeVisible();
        await expect(table.getByText('40', { exact: true })).toBeVisible();

        // Use the filter to only show rows with amount >= 30
        // Find the Amount label, then its parent, then the sibling div, then the input inside
        const amountLabel = page.getByText('Amount', { exact: true });
        const amountInput = amountLabel.locator('..').locator('~ div input');
        await amountInput.fill('30');
        await amountInput.press('Enter');

        // Assert that only the filtered rows are visible
        await expect(table.getByText('Row 3', { exact: true })).toBeVisible();
        await expect(table.getByText('Row 4', { exact: true })).toBeVisible();
        await expect(table.getByText('30', { exact: true })).toBeVisible();
        await expect(table.getByText('40', { exact: true })).toBeVisible();
        await expect(table.getByText('Row 1', { exact: true })).not.toBeVisible();
        await expect(table.getByText('Row 2', { exact: true })).not.toBeVisible();
        await expect(table.getByText('10', { exact: true })).not.toBeVisible();
        await expect(table.getByText('20', { exact: true })).not.toBeVisible();
    });
});
