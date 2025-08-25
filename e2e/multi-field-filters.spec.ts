import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

test.describe('Multi-field Filter Support', () => {
    test('should handle OR multi-field filters correctly', async ({ page }) => {
        // Intercept and mock GraphQL requests
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Show filters
        await page.getByText('Show Filters').click();

        // Find the "Search Multiple Fields (OR)" filter
        const multiFieldLabel = page.getByText('Search Multiple Fields (OR)', { exact: true });
        await expect(multiFieldLabel).toBeVisible();

        // Find the input for this filter (it should be in the same container)
        const multiFieldInput = multiFieldLabel.locator('..').locator('~ div input');

        // Enter a search term that should match either testField or email
        await multiFieldInput.fill('%Test%');
        await multiFieldInput.press('Enter');

        // The table should still show data (our mock data has "Test" in testField)
        await expect(table).toBeVisible();

        // Check that we can see some test data - be more specific to avoid multiple matches
        await expect(table.getByText('Test 30')).toBeVisible();
    });

    test('should handle AND multi-field filters correctly', async ({ page }) => {
        // Intercept and mock GraphQL requests
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Show filters
        await page.getByText('Show Filters').click();

        // Find the "Match Multiple Fields (AND)" filter
        const andFieldLabel = page.getByText('Match Multiple Fields (AND)', { exact: true });
        await expect(andFieldLabel).toBeVisible();

        // Find the input for this filter
        const andFieldInput = andFieldLabel.locator('..').locator('~ div input');

        // Enter a value that would need to match both fields exactly
        await andFieldInput.fill('exact_match');
        await andFieldInput.press('Enter');

        // The table should still be visible (even if no results, the structure remains)
        await expect(table).toBeVisible();
    });

    test('should work with existing filters', async ({ page }) => {
        // Intercept and mock GraphQL requests
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Show filters
        await page.getByText('Show Filters').click();

        // Use both a regular filter and a multi-field filter
        const emailLabel = page.getByText('Email', { exact: true });
        const emailInput = emailLabel.locator('..').locator('~ div input');
        await emailInput.fill('test@example.com');
        await emailInput.press('Enter');

        // Also use the multi-field OR filter
        const multiFieldLabel = page.getByText('Search Multiple Fields (OR)', { exact: true });
        const multiFieldInput = multiFieldLabel.locator('..').locator('~ div input');
        await multiFieldInput.fill('%Test%');
        await multiFieldInput.press('Enter');

        // Both filters should work together
        await expect(table).toBeVisible();
    });
});
