import { test, expect } from '@playwright/test';
import { simpleTestViewColumnDefinitions } from '../src/views/simpleTestView'; // Adjusted import path
import { mockPaginationGraphQL } from './graphqlMock';

test.describe('Simple View Rendering', () => {

    test('should filter by phone using a custom filter component', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the page with the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Find the phone filter input (by placeholder or input type)
        const phoneInput = page.locator('input[placeholder="Phone number"]');

        const phoneNumber = '+46700000025';
        await phoneInput.fill(phoneNumber);

        // Submit the filter form (by aria-label)
        await page.getByLabel('Apply filter').click();

        // Wait for the table to update and check that results are filtered
        await expect(table.getByText(phoneNumber)).toBeVisible();
    });
    test('should render a view with a single column header and data', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the page with the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the table to be present and visible
        const table = page.getByRole('table');
        await expect(table).toBeVisible();

        // Get the expected header text from the imported column definitions
        const expectedHeaderText = simpleTestViewColumnDefinitions[0].name;

        // Locate the column header by its text content
        const columnHeader = table.getByText(expectedHeaderText, { exact: true });

        // Assert that the column header is visible
        await expect(columnHeader).toBeVisible();

        // Assert that all rows are visible before applying the filter
        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 29', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 28', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 27', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 25', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 24', { exact: true })).toBeVisible();
        await expect(table.getByText('300', { exact: true })).toBeVisible();
        await expect(table.getByText('290', { exact: true })).toBeVisible();
        await expect(table.getByText('280', { exact: true })).toBeVisible();
        await expect(table.getByText('270', { exact: true })).toBeVisible();
        await expect(table.getByText('250', { exact: true })).toBeVisible();
        await expect(table.getByText('240', { exact: true })).toBeVisible();

        // Use the filter to only show rows with amount >= 30
        // Find the Amount label, then its parent, then the sibling div, then the input inside
        const amountLabel = page.getByText('Amount', { exact: true });
        const amountInput = amountLabel.locator('..').locator('~ div input');
        await amountInput.fill('260');
        await amountInput.press('Enter');

        // Assert that only the filtered rows are visible
        await expect(table.getByText('Test 30', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 27', { exact: true })).toBeVisible();
        await expect(table.getByText('Test 25', { exact: true })).not.toBeVisible();
        await expect(table.getByText('Test 24', { exact: true })).not.toBeVisible();
    });

    test('should render filter group captions in the filter form', async ({ page }) => {
        // Intercept the GraphQL request and mock the response
        await page.route('**/v1/graphql', mockPaginationGraphQL);

        // Navigate to the page with the simple test view
        await page.goto('/?view=simple-test-view');

        // Wait for the filter form to be present
        const filterForm = page.locator('form');
        await expect(filterForm).toBeVisible();

        // Check for the presence of the new group label ("Extra Filters") as a Panel header
        const extraFiltersPanel = page.locator('.p-panel-header', { hasText: 'Extra Filters' });
        await expect(extraFiltersPanel).toBeVisible();

        // Check that the filter label is present under the new group
        await expect(page.getByText('Test Field', { exact: true })).toBeVisible();
    });
});
