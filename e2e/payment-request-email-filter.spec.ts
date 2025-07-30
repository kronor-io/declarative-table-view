import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

test.describe('Simple View Email Filter', () => {
    test('should set email filter when clicking on email', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Verify that the table headers are rendered correctly
        await expect(table.getByText('Test Column Header')).toBeVisible();
        await expect(table.getByText('Email')).toBeVisible();

        // Find the first email button in the Email column
        const firstEmailButton = table.locator('td button').filter({ hasText: '@' }).first();
        await expect(firstEmailButton).toBeVisible();

        // Verify the button has the expected styling classes
        await expect(firstEmailButton).toHaveClass(/text-blue-500/);
        await expect(firstEmailButton).toHaveClass(/underline/);

        // Get the email text before clicking
        const emailText = await firstEmailButton.textContent();
        expect(emailText).toMatch(/@/);
        expect(emailText).toBeTruthy(); // Ensure it's not null

        // Click the email button
        await firstEmailButton.click();

        // Verify that the Email filter is now populated with the clicked email
        const emailFilterInput = page.getByText('Email', { exact: true }).locator('..').locator('~ div input');
        await expect(emailFilterInput).toHaveValue(emailText!);

        // Verify that the table now shows only rows with that email (should be just 1 row)
        const emailButtons = table.locator('td button').filter({ hasText: emailText! });
        await expect(emailButtons).toHaveCount(1);
    });

    test('should show tooltip on email hover', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Find the first email button
        const emailButton = table.locator('td button').filter({ hasText: '@' }).first();
        await expect(emailButton).toBeVisible();

        // Check for title attribute (tooltip)
        const title = await emailButton.getAttribute('title');
        expect(title).toMatch(/Filter by email:/);
    });
});
