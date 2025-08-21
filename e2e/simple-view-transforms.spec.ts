import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

test.describe('Simple View Transform Functionality', () => {

    test('should apply transform functions when filtering by amount', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the page with the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Verify all rows are initially visible
        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 29', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 28', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 27', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 26', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 25', { exact: true })).toBeVisible();
        await expect(table.getByText('300', { exact: true })).toBeVisible(); // amount for Test 30
        await expect(table.getByText('290', { exact: true })).toBeVisible(); // amount for Test 29
        await expect(table.getByText('280', { exact: true })).toBeVisible(); // amount for Test 28
        await expect(table.getByText('270', { exact: true })).toBeVisible(); // amount for Test 27
        await expect(table.getByText('260', { exact: true })).toBeVisible(); // amount for Test 26
        await expect(table.getByText('250', { exact: true })).toBeVisible(); // amount for Test 25

        // Show filters first
        await page.getByText('Show Filters').click();

        // Find the amount filter input
        const amountLabel = page.getByText('Amount', { exact: true });
        const amountInput = amountLabel.locator('..').locator('~ div input');

        // Enter 255 in the input field
        // With transform: toQuery adds 5, so 255 becomes 260 in the query
        // This should show only rows with amount >= 260 (Test 26, 27, 28, 29, 30)
        await amountInput.fill('255');
        await amountInput.press('Enter');

        // Wait for filtering to complete and verify results
        // These should still be visible (amount >= 260)
        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 29', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 28', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 27', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 26', { exact: true })).toBeVisible();
        await expect(table.getByText('300', { exact: true })).toBeVisible();
        await expect(table.getByText('290', { exact: true })).toBeVisible();
        await expect(table.getByText('280', { exact: true })).toBeVisible();
        await expect(table.getByText('270', { exact: true })).toBeVisible();
        await expect(table.getByText('260', { exact: true })).toBeVisible();

        // These should not be visible (amount < 260)
        await expect(table.getByText('Test 25', { exact: true })).not.toBeVisible();
        await expect(table.getByText('Test 24', { exact: true })).not.toBeVisible();
        await expect(table.getByText('Test 23', { exact: true })).not.toBeVisible();
        await expect(table.getByText('250', { exact: true })).not.toBeVisible();
        await expect(table.getByText('240', { exact: true })).not.toBeVisible();
        await expect(table.getByText('230', { exact: true })).not.toBeVisible();
    });

    test('should handle multiple filter value changes with transforms', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the page with the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Show filters first
        await page.getByText('Show Filters').click();

        // Find the amount filter input
        const amountLabel = page.getByText('Amount', { exact: true });
        const amountInput = amountLabel.locator('..').locator('~ div input');

        // Test 1: Enter 245 (transforms to 250), should show Test 25 and up
        await amountInput.fill('245');
        await amountInput.press('Enter');

        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 25', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 24', { exact: true })).not.toBeVisible();

        // Test 2: Change to 265 (transforms to 270), should show Test 27 and up
        await amountInput.clear();
        await amountInput.fill('265');
        await amountInput.press('Enter');

        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 27', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 26', { exact: true })).not.toBeVisible();
        await expect(table.getByText('Test 25', { exact: true })).not.toBeVisible();

        // Test 3: Clear filter should show all items again
        await amountInput.clear();
        await amountInput.press('Enter');

        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 25', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 24', { exact: true })).toBeVisible();
    });

    test('should handle key-value transform objects', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the page with the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Verify all rows are initially visible
        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 29', { exact: true })).toBeVisible();

        // Show filters first
        await page.getByText('Show Filters').click();

        // Find the extra filters panel
        const extraFiltersPanel = page.locator('.p-panel-header', { hasText: 'Extra Filters' });
        await expect(extraFiltersPanel).toBeVisible();

        // Expand the extra filters panel if needed
        if (await extraFiltersPanel.getAttribute('aria-expanded') !== 'true') {
            await extraFiltersPanel.click();
        }

        // Find the key-value transform filter input
        const keyValueLabel = page.getByText('Test Field (Key-Value Transform)', { exact: true });
        await expect(keyValueLabel).toBeVisible();

        const keyValueInput = keyValueLabel.locator('..').locator('~ div input');
        await expect(keyValueInput).toBeVisible();

        // Test 1: Enter a value that should be transformed
        // The transform should add "prefix_" to the input and change the field to "transformedField"
        await keyValueInput.fill('30');
        await keyValueInput.press('Enter');

        // Wait a bit for the filter to apply
        await page.waitForTimeout(2000);

        // Verify the correct row is shown (Test 30 should be visible since it matches the transformed query)
        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        // Verify other rows are hidden
        await expect(table.getByText('Test 29', { exact: true })).not.toBeVisible();

        // Test 2: Clear the filter to verify all rows show again
        await keyValueInput.clear();
        await keyValueInput.press('Enter');

        // Wait for the filter to clear
        await page.waitForTimeout(1000);

        // All rows should be visible again
        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 29', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 28', { exact: true })).toBeVisible();
    });

});
