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
        await page.click(nextButton); // to 2nd page
        await expect(page.locator(pageIndicator)).toHaveText('21-30');
        await expect(page.locator(tableRows)).toHaveCount(10);
        await expect(page.locator(nextButton)).toBeDisabled();
    });
});
