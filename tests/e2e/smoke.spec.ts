import { expect, test } from '@playwright/test';

// Smoke tests cover navigation and manual editing only; they never download a model.

test('root redirects to the studio and the page is cross-origin isolated', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole('tab', { name: 'Shape Studio' })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
});

test('future lab is a placeholder with no functionality', async ({ page }) => {
  await page.goto('/studio');
  await page.getByRole('tab', { name: 'Future Lab' }).click();
  await expect(page).toHaveURL(/\/future$/);
  await expect(page.getByRole('heading', { name: 'Coming soon — Module 2' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('manual add, select, undo and redo work without the AI model', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.locator('[data-testid="scene-canvas"] canvas')).toBeVisible();
  const rows = page.getByRole('list', { name: 'Scene objects' }).getByRole('button', { name: /^More actions for / });
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sofa' }).click();
  await expect(rows).toHaveCount(before + 1);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(/Sofa/);

  await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await expect(rows).toHaveCount(before);
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)' }).click();
  await expect(rows).toHaveCount(before + 1);
});
