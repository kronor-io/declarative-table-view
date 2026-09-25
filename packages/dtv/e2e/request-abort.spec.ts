import { test, expect, type Route } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

// A table request superseded by a newer one is cancelled in the browser, not merely
// ignored when it lands: the HTTP request is aborted, the abort is neither logged nor
// left as an unhandled rejection, and the loading overlay stays up until the newer
// request answers.

const APP_URL = 'http://localhost:5173/?test-view=simple-test-view';
const nextButton = '[data-testid="pagination-next"]';
const pageIndicator = '[data-testid="pagination-page"]';
const tableRows = 'table tbody tr';

test('a superseded data request is aborted and the newer one shows', async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    // Once holding, requests stay pending until the test answers them
    let holding = false;
    const held: Route[] = [];
    await page.route('**/graphql', async route => {
        if (holding) {
            held.push(route);
            return;
        }
        await mockPaginationGraphQL(route);
    });

    await page.goto(APP_URL);
    await expect(page.locator(pageIndicator)).toHaveText('1-20');
    holding = true;

    // The next page's request stays in flight...
    await page.click(nextButton);
    await expect.poll(() => held.length).toBe(1);
    const nextPageRequest = held[0].request();
    const nextPageAborted = page.waitForEvent('requestfailed', request => request === nextPageRequest);

    // ...when a refetch of the current page supersedes it. The loading overlay covers
    // the table, so the refetch goes through the API a host would use after a mutation.
    await page.evaluate(() => (window as any).__dtvApiRef.current.fetchData());

    expect((await nextPageAborted).failure()?.errorText).toBe('net::ERR_ABORTED');
    await expect.poll(() => held.length).toBe(2);

    // The aborted request must not end loading while the newer one is still pending
    await expect(page.getByText('Loading data…')).toBeVisible();

    await mockPaginationGraphQL(held[1]);
    await expect(page.getByText('Loading data…')).toBeHidden();
    await expect(page.locator(pageIndicator)).toHaveText('1-20');
    await expect(page.locator(tableRows)).toHaveCount(20);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter(text => text.includes('Error fetching data'))).toEqual([]);
});
