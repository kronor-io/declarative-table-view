import { test, expect } from '@playwright/test';
import { mockPaginationGraphQL } from './graphqlMock';

function getParam(url: string, key: string) { return new URL(url).searchParams.get(key); }

// Base64 URL-safe pattern (rough)
const b64urlRe = /^[A-Za-z0-9_-]+$/;

test.describe('Filter state URL persistence flag', () => {
    test('disabled: applying filter does not set dtv-filter-state', async ({ page }) => {
        await page.route('**/v1/graphql', mockPaginationGraphQL);
        await page.goto('/?test-view=simple-test-view');
        await page.getByText('Filters', { exact: true }).click();
        const amountLabel = page.getByText('Amount', { exact: true });
        const amountInput = amountLabel.locator('..').locator('~ div input');
        await amountInput.fill('260');
        await amountInput.press('Enter');
        expect(getParam(page.url(), 'dtv-filter-state')).toBeNull();
    });

    test('enabled: applying filter sets and persists dtv-filter-state', async ({ page }) => {
        await page.route('**/v1/graphql', mockPaginationGraphQL);
        await page.goto('/?test-view=simple-test-view&sync-filter-state-to-url=true');
        await page.getByText('Filters', { exact: true }).click();
        const amountLabel = page.getByText('Amount', { exact: true });
        const amountInput = amountLabel.locator('..').locator('~ div input');
        await amountInput.fill('260');
        await amountInput.press('Enter');
        const encoded = getParam(page.url(), 'dtv-filter-state');
        expect(encoded).not.toBeNull();
        expect(encoded).toMatch(b64urlRe);
        await page.reload();
        await expect(page.getByRole('table')).toBeVisible();
        expect(getParam(page.url(), 'dtv-filter-state')).not.toBeNull();
    });
});
