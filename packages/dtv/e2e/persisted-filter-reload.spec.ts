import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

// A table opened with a persisted filter state fetches once, with that filter. It must not
// first request the rows of its default filter state and then abort that request once the
// persisted state is restored.
test('reloading with a persisted filter fetches once, with the filter, and aborts nothing', async ({ page }) => {
    const requestedConditions: string[] = [];
    const failedRequests: string[] = [];
    await page.route('**/v1/graphql', async route => {
        requestedConditions.push(JSON.stringify(route.request().postDataJSON()?.variables?.conditions));
        await mockPaginationGraphQL(route);
    });
    page.on('requestfailed', request => {
        if (request.url().includes('graphql')) failedRequests.push(request.failure()?.errorText ?? 'unknown');
    });

    await page.goto('/?test-view=simple-test-view');
    const table = page.getByRole('table');
    const emailButtons = table.locator('td button').filter({ hasText: '@' });
    const email = (await emailButtons.first().textContent())!;

    // Clicking an email applies it as a filter, which is persisted
    await emailButtons.first().click();
    await expect(emailButtons).toHaveCount(1);

    requestedConditions.length = 0;
    failedRequests.length = 0;
    await page.reload();
    await expect(table.locator('td button').filter({ hasText: email })).toHaveCount(1);
    // A second request would come after the first: count once nothing is in flight any more
    await page.waitForLoadState('networkidle');

    expect(requestedConditions).toHaveLength(1);
    expect(requestedConditions[0]).toContain(email);
    expect(failedRequests).toEqual([]);
});
