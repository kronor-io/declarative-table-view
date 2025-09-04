import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

test.describe('Save Filter SplitButton', () => {
    test.beforeEach(async ({ page }) => {
        // Set up GraphQL mock
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the app
        await page.goto('/?test-view=simple-test-view');
    });

    test('should render SplitButton for save filter', async ({ page }) => {
        // Show filters
        await page.getByText('Show Filters').click();

        // Look for the Save Filter SplitButton
        const saveFilterButton = page.locator('.p-splitbutton').filter({ hasText: 'Save Filter' });
        await expect(saveFilterButton).toBeVisible();

        // Verify the main button text
        const mainButton = saveFilterButton.locator('.p-splitbutton-defaultbutton');
        await expect(mainButton).toContainText('Save Filter');

        // Verify the dropdown exists
        const dropdownButton = saveFilterButton.locator('.p-splitbutton-menubutton');
        await expect(dropdownButton).toBeVisible();
    });

    test('should open dropdown menu when arrow is clicked', async ({ page }) => {
        // Show filters
        await page.getByText('Show Filters').click();

        // Find the SplitButton
        const saveFilterButton = page.locator('.p-splitbutton').filter({ hasText: 'Save Filter' });
        await expect(saveFilterButton).toBeVisible();

        // Click the dropdown arrow
        const dropdownButton = saveFilterButton.locator('.p-splitbutton-menubutton');
        await dropdownButton.click();

        // Should see a menu appear (even if empty)
        const menu = page.locator('.p-menu', { hasText: /Update/ }).or(page.locator('.p-menu'));
        await expect(menu.first()).toBeVisible();
    });

    test('main button click should trigger save dialog', async ({ page }) => {
        // Show filters
        await page.getByText('Show Filters').click();

        // Set up dialog handler to verify it's triggered
        let dialogTriggered = false;
        page.on('dialog', async dialog => {
            expect(dialog.type()).toBe('prompt');
            expect(dialog.message()).toBe('Enter a name for this filter:');
            dialogTriggered = true;
            await dialog.dismiss(); // Just dismiss to avoid actually saving
        });

        // Click the main save button
        const saveFilterButton = page.locator('.p-splitbutton').filter({ hasText: 'Save Filter' });
        await saveFilterButton.locator('.p-splitbutton-defaultbutton').click();

        // Verify dialog was triggered
        await page.waitForTimeout(500);
        expect(dialogTriggered).toBe(true);
    });
});
