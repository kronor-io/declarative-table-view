import { test, expect, type Page } from '@playwright/test';
import { mockAggregatesGraphQL } from './graphqlMock';

// 30 rows with amounts 10, 20, … 300, paged 20 at a time, newest first. The view's
// aggregates: `totals` (count and sum of amount) and `large` (count of amounts over 200).
const APP_URL = '/?test-view=aggregates-test-view';
const tableRows = 'table tbody tr';

/** Counts the aggregates requests the page sends. */
function countAggregateRequests(page: Page) {
    const counter = { count: 0 };
    page.on('request', request => {
        if (request.url().includes('graphql') && (request.postData() ?? '').includes('simpleTestDataCollection_aggregate')) {
            counter.count += 1;
        }
    });
    return counter;
}

test.describe('Aggregates', () => {
    test('shows aggregates of all the rows the filters match, and keeps them while paging', async ({ page }) => {
        await page.route('**/graphql', mockAggregatesGraphQL);
        const aggregateRequests = countAggregateRequests(page);
        await page.goto(APP_URL);
        await page.waitForSelector(tableRows);

        const table = page.locator('table');
        await expect(page.getByTestId('footer-amount-total')).toHaveText('Total: $4650');
        await expect(page.getByTestId('footer-large-count')).toHaveText('Over $200: 10');
        await expect(page.getByTestId('pagination-page')).toHaveText('1-20 of 30');
        await expect(table.getByText('$300 (6.5%)', { exact: true })).toBeVisible();
        expect(aggregateRequests.count).toBe(1);

        await page.click('[data-testid="pagination-next"]');
        await expect(page.getByTestId('pagination-page')).toHaveText('21-30 of 30');
        await expect(page.getByTestId('footer-amount-total')).toHaveText('Total: $4650');
        expect(aggregateRequests.count).toBe(1);

        // Other filters: the aggregates are asked for again, over the rows they match
        await page.getByText('Filters', { exact: true }).click();
        const amountInput = page.getByText('Amount', { exact: true }).locator('..').locator('~ div input');
        await amountInput.fill('250');
        await amountInput.press('Enter');

        await expect(page.getByTestId('footer-amount-total')).toHaveText('Total: $1650');
        await expect(page.getByTestId('footer-large-count')).toHaveText('Over $200: 6');
        await expect(page.getByTestId('pagination-page')).toHaveText('1-6 of 6');
        expect(aggregateRequests.count).toBe(2);
    });

    test('shows the rows when the aggregates fail', async ({ page }) => {
        await page.route('**/graphql', async route => {
            if ((route.request().postData() ?? '').includes('simpleTestDataCollection_aggregate')) {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'field not found' }] }) });
                return;
            }
            await mockAggregatesGraphQL(route);
        });
        await page.goto(APP_URL);
        await page.waitForSelector(tableRows);

        await expect(page.getByTestId('footer-amount-total')).toHaveText('Total unavailable');
        await expect(page.getByTestId('pagination-page')).toHaveText('1-20');
        await expect(page.locator(tableRows)).toHaveCount(20);
    });
});
