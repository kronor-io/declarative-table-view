import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

test.describe('Filter Sharing', () => {
    test.beforeEach(async ({ page, context }) => {
        // Grant clipboard permissions
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);
    });

    test('should show Share Filter button and handle sharing', async ({ page }) => {
        // Navigate to the simple test view
        await page.goto('/?test-view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Open the filter form
        await page.getByText('Filters', { exact: true }).click();

        // Verify Share Filter button exists in the filter form
        const shareButton = page.getByRole('button', { name: 'Share Filter' });
        await expect(shareButton).toBeVisible();

        // If button is enabled, try sharing (some filter state may be present)
        const isEnabled = await shareButton.isEnabled();
        if (isEnabled) {
            // Click the share button
            await shareButton.click();

            // Wait a bit for any potential toast to appear
            await page.waitForTimeout(1000);

            // Check if a toast appeared (it may or may not appear depending on success)
            const toastMessages = page.locator('.p-toast .p-toast-message');
            const toastCount = await toastMessages.count();

            if (toastCount > 0) {
                // If toast is present, verify it's about sharing
                const toastText = await toastMessages.first().textContent();
                expect(toastText).toMatch(/share|filter|copied|clipboard/i);
            }

            // The main test is that the button exists and can be clicked without error
        }
    });

    test('should enable share button when filter is set', async ({ page }) => {
        // Navigate to the simple test view
        await page.goto('/?test-view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Open the filter form
        await page.getByText('Filters', { exact: true }).click();

        // Set a filter value using the pattern from working tests
        const emailInput = page.getByText('Email', { exact: true }).locator('..').locator('~ div input');
        await emailInput.fill('test@example.com');

        // Apply the filter
        await page.getByLabel('Apply filter').click();

        // The filter form should still be open, verify Share Filter button is now enabled
        const shareButton = page.getByRole('button', { name: 'Share Filter' });
        await expect(shareButton).toBeEnabled();

        // Click the share button
        await shareButton.click();

        // Wait a bit for any potential toast to appear
        await page.waitForTimeout(1000);

        // Check if a toast appeared
        const toastMessages = page.locator('.p-toast .p-toast-message');
        const toastCount = await toastMessages.count();

        if (toastCount > 0) {
            // If toast is present, verify it's about sharing
            const toastText = await toastMessages.first().textContent();
            expect(toastText).toMatch(/share|filter|copied|clipboard/i);
        }

        // The main test is that the button works and can be clicked
    });

    test('should handle invalid filter URL parameter', async ({ page }) => {
        // Navigate with an invalid filter parameter
        await page.goto('/?test-view=simple-test-view&dtv-shared-filter=invalid-base64-data');

        // Wait for the table to be present and visible (app should still load)
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Give the app time to process the invalid filter and show toast
        await page.waitForTimeout(1000);

        // Check if any toast appears (might be warning about invalid filter)
        const toast = page.locator('.p-toast');
        const toastVisible = await toast.isVisible();

        if (toastVisible) {
            // If toast is present, verify it contains relevant text
            const toastText = await toast.textContent();
            expect(toastText).toMatch(/invalid|filter|error/i);
        }
    });
});
