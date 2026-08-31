import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

const APP_URL = 'http://localhost:5173/?test-view=simple-test-view';
const nextButton = '[data-testid="pagination-next"]';
const prevButton = '[data-testid="pagination-prev"]';
const pageIndicator = '[data-testid="pagination-page"]';
const tableRows = 'table tbody tr';

test.describe('Simple View Pagination', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/graphql', mockPaginationGraphQL);
        await page.goto(APP_URL);
        await page.waitForSelector(tableRows);
    });

    test('shows first page and disables previous button', async ({ page }) => {
        await expect(page.locator(pageIndicator)).toHaveText('1-20');
        await expect(page.locator(prevButton)).toBeDisabled();
        const rowCount = await page.locator(tableRows).count();
        expect(rowCount).toBe(20);
    });

    test('can go to next and previous page', async ({ page }) => {
        await page.click(nextButton);
        await expect(page.locator(pageIndicator)).toHaveText('21-30');
        await expect(page.locator(prevButton)).toBeEnabled();
        await page.click(prevButton);
        await expect(page.locator(pageIndicator)).toHaveText('1-20');
    });

    test('next button disables on last page', async ({ page }) => {
        await page.click(nextButton); // to second (last) page (21-30)
        await expect(page.locator(pageIndicator)).toHaveText('21-30');
        await expect(page.locator(tableRows)).toHaveCount(10);
        await expect(page.locator(nextButton)).toBeDisabled();
    });

    test('changing rows per page to larger option fetches all rows and disables next', async ({ page }) => {
        // Open dropdown and select 50
        await page.getByTestId('rows-per-page-dropdown').click();
        await page.getByRole('option', { name: '50' }).click();
        // Expect full dataset loaded on first page
        await expect(page.locator(pageIndicator)).toHaveText('1-30');
        await expect(page.locator(tableRows)).toHaveCount(30);
        await expect(page.locator(prevButton)).toBeDisabled();
        await expect(page.locator(nextButton)).toBeDisabled();
    });

    test('changing rows per page after navigating resets to first page', async ({ page }) => {
        // Go to second page first
        await page.click(nextButton);
        await expect(page.locator(pageIndicator)).toHaveText('21-30');
        // Change page size to 50
        await page.getByTestId('rows-per-page-dropdown').click();
        await page.getByRole('option', { name: '50' }).click();
        // Should reset to first page with all rows
        await expect(page.locator(pageIndicator)).toHaveText('1-30');
        await expect(page.locator(tableRows)).toHaveCount(30);
        await expect(page.locator(prevButton)).toBeDisabled();
        await expect(page.locator(nextButton)).toBeDisabled();
    });

    test('rows per page control renders dropdown for multiple options', async ({ page }) => {
        const dropdown = page.getByTestId('rows-per-page-dropdown');
        await expect(dropdown).toBeVisible();
        await expect(page.locator('[data-testid="rows-per-page-static"]')).toHaveCount(0);
    });
});
