import { expect, type Page } from '@playwright/test';

export async function ensurePanelExpanded(page: Page, panelName: string) {
    const toggleButton = page.getByRole('button', { name: panelName, exact: true });
    await expect(toggleButton).toBeVisible();

    const expanded = await toggleButton.getAttribute('aria-expanded');
    if (expanded !== 'true') {
        await toggleButton.click();
    }
}
