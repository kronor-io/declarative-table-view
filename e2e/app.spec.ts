import { test, expect } from '@playwright/test';

test('basic test', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible(); // Replace with a more specific selector for your app
});
