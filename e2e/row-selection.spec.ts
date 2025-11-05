import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

// Helper to get selection array from window
async function getLastSelection(page: any) {
    return await page.evaluate(() => (window as any).__lastSelection || []);
}

async function resetSelection(page: any) {
    await page.evaluate(() => (window as any).__rowSelection?.resetRowSelection?.());
}

// We rely on the dev harness allowing rowSelectionType via URL param.
// When rowSelectionType is omitted, selection should be disabled (none).

test.describe('Row Selection API', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/v1/graphql', mockPaginationGraphQL);
    });

    test('does not render selection column when rowSelectionType=none', async ({ page }) => {
        await page.goto('/?test-view=simple-test-view&rowSelectionType=none');
        const table = page.getByRole('table');
        await expect(table).toBeVisible();
        // Wait for at least one data row to appear
        await table.locator('tbody tr').first().waitFor();
        // Selection column cells should be absent
        const selectionCells = table.locator('tbody td.p-selection-column');
        expect(await selectionCells.count()).toBe(0);
    });

    test('renders selection column and triggers callbacks when rowSelectionType=multiple', async ({ page }) => {
        await page.goto('/?test-view=simple-test-view&rowSelectionType=multiple');
        const table = page.getByRole('table');
        await expect(table).toBeVisible();
        // Wait for at least one data row to appear
        await table.locator('tbody tr').first().waitFor();

        const selectionCells = table.locator('tbody td.p-selection-column');
        const cellCount = await selectionCells.count();
        expect(cellCount).toBeGreaterThan(0);

        // Click first row's checkbox input (force due to overlay structure)
        const firstCheckboxInput = selectionCells.first().locator('input[type="checkbox"]');
        await firstCheckboxInput.check({ force: true });

        // Wait for selection callback to register
        await expect.poll(async () => (await getLastSelection(page)).length).toBe(1);

        // Reset selection (callback does not fire again, so rely on visual state/aria attributes)
        await resetSelection(page);
        // Wait for checkbox aria-checked to flip back to false
        const firstCheckboxInputAfter = selectionCells.first().locator('input[type="checkbox"]');
        await expect(firstCheckboxInputAfter).toHaveAttribute('aria-checked', 'false');
    });
});
