import { expect, test } from '@playwright/test';

test('first visit shows the 3-step tour once, and Tour replays it', async ({ page }) => {
  await page.goto('/studio');
  const tour = page.getByRole('dialog', { name: 'Describe it, the AI builds it' });
  await expect(tour).toBeVisible();
  await expect(tour.getByText('Step 1 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('dialog', { name: 'Your objects' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('dialog', { name: 'Play around in 3D' })).toBeVisible();
  await page.getByRole('button', { name: 'Start building' }).click();
  await expect(page.locator('[data-tour-open]')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('list', { name: 'Scene objects' })).toBeVisible();
  await expect(page.locator('[data-tour-open]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tour' }).click();
  await expect(page.getByRole('dialog', { name: 'Describe it, the AI builds it' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page.locator('[data-tour-open]')).toHaveCount(0);
});
