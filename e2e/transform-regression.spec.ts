import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

test.describe('Transform Regression Tests', () => {

    test('should preserve display value after applying transform', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the page with the simple test view
        await page.goto('/?test-view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Show filters first
        await page.getByText('Filters', { exact: true }).click();

        // Find the amount filter input
        const amountLabel = page.getByText('Amount', { exact: true });
        const amountInput = amountLabel.locator('..').locator('~ div input');

        // Enter 255 in the input field
        // With transform: toQuery adds 5, so 255 becomes 260 in the query
        // Display should remain 255 (the user's input)
        await amountInput.fill('255');

        // Apply the filter
        await page.getByRole('button', { name: 'Apply filter' }).click();

        // Wait for the filter to be applied
        await page.waitForTimeout(100);

        // Check that the input still shows the original value (255) after applying the transform
        // This is the regression test - it should show the original user input
        await expect(amountInput).toHaveValue('255');
    });

    test('should correctly apply toQuery transforms', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the page with the simple test view
        await page.goto('/?test-view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Show filters first
        await page.getByText('Filters', { exact: true }).click();

        // Find the amount filter input
        const amountLabel = page.getByText('Amount', { exact: true });
        const amountInput = amountLabel.locator('..').locator('~ div input');

        // Test multiple values to ensure the transform roundtrip works correctly
        const testValues = ['100', '255', '300'];

        for (const testValue of testValues) {
            // Clear and enter the test value
            await amountInput.fill('');
            await amountInput.fill(testValue);

            // Apply the filter
            await page.getByRole('button', { name: 'Apply filter' }).click();

            // Wait for the filter to be applied
            await page.waitForTimeout(100);

            // Verify the input still shows the original value
            await expect(amountInput).toHaveValue(testValue);
        }
    });

    test('should handle empty values correctly with transforms', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the page with the simple test view
        await page.goto('/?test-view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Show filters first
        await page.getByText('Filters', { exact: true }).click();

        // Find the amount filter input
        const amountLabel = page.getByText('Amount', { exact: true });
        const amountInput = amountLabel.locator('..').locator('~ div input');

        // Enter a value, then clear it
        await amountInput.fill('255');
        await page.getByRole('button', { name: 'Apply filter' }).click();
        await page.waitForTimeout(100);

        // Clear the input
        await amountInput.fill('');
        await page.getByRole('button', { name: 'Apply filter' }).click();
        await page.waitForTimeout(100);

        // Verify the input remains empty
        await expect(amountInput).toHaveValue('');
    });
});
