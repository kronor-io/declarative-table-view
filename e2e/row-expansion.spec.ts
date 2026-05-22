import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

test.describe('Row expansion', () => {
    test('fetches expansion-only data and enforces single expansion mode', async ({ page }) => {
        let lastQuery = '';

        await page.route('**/v1/graphql', async route => {
            const postData = route.request().postDataJSON?.();
            lastQuery = typeof postData?.query === 'string' ? postData.query : '';
            await mockPaginationGraphQL(route);
        });

        await page.goto('/?test-view=row-expansion-test-view');

        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        await expect.poll(() => lastQuery).toContain('details');
        await expect.poll(() => lastQuery).toContain('note');

        const row30 = table.getByRole('row', { name: /Test 30/ });
        await row30.getByRole('button').first().click();

        await expect(page.getByText('Details for Test 30', { exact: true })).toBeVisible();
        await expect(page.getByText('Detail note 30', { exact: true })).toBeVisible();

        const row28 = table.getByRole('row', { name: /Test 28/ });
        await row28.getByRole('button').first().click();

        await expect(page.getByText('Details for Test 28', { exact: true })).toBeVisible();
        await expect(page.getByText('Details for Test 30', { exact: true })).not.toBeVisible();
    });

    test('collapses expanded rows through the exposed DTV api', async ({ page }) => {
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        await page.goto('/?test-view=row-expansion-test-view');

        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        const row30 = table.getByRole('row', { name: /Test 30/ });
        await row30.getByRole('button').first().click();
        await expect(page.getByText('Details for Test 30', { exact: true })).toBeVisible();

        await page.waitForFunction(() => Boolean((window as any).__dtvApiRef?.current?.rowExpansion));
        await page.evaluate(() => {
            (window as any).__dtvApiRef.current.rowExpansion.reset();
        });

        await expect(page.getByText('Details for Test 30', { exact: true })).not.toBeVisible();
    });
});
