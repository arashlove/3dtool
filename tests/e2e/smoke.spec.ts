import { expect, test } from '@playwright/test';

// Smoke tests cover navigation and manual editing only; they never call a model.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('3dtool:tour-seen:v1', '1');
    window.localStorage.setItem('3dtool:lab-tour-seen:v1', '1');
  });
});

test('root redirects to the studio', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole('tab', { name: 'Shape Studio' })).toHaveAttribute('aria-selected', 'true');
});

test('generating without a token asks for one and never calls Hugging Face', async ({ page }) => {
  const hfRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('huggingface.co')) hfRequests.push(r.url());
  });
  await page.goto('/studio');
  await page.getByRole('textbox', { name: 'Describe what to build or change' }).fill('Create a red chair');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByRole('dialog', { name: 'AI model settings' })).toBeVisible();
  expect(hfRequests).toEqual([]);
});

test('future lab asks for a token in the UI when none is set', async ({ page }) => {
  await page.goto('/studio');
  await page.getByRole('tab', { name: 'Future Lab' }).click();
  await expect(page).toHaveURL(/\/future$/);
  await page.getByRole('button', { name: 'Add HF token' }).click();
  await expect(page.getByRole('dialog', { name: 'Hugging Face token' })).toBeVisible();
});

test('future lab sends the visitor token with AI requests', async ({ page }) => {
  await page.addInitScript(() => window.sessionStorage.setItem('3dtool:hf-token', 'hf_e2eTestToken123456'));
  const tokens: Array<string | undefined> = [];
  await page.route('**/api/lab/plan', async (route) => {
    tokens.push(route.request().headers()['x-hf-token']);
    await route.abort();
  });
  await page.goto('/future');
  await expect(page.getByRole('button', { name: 'Hugging Face', exact: true })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Edit instruction' });
  await expect(input).toBeEnabled({ timeout: 20_000 });
  await input.fill('make it red');
  await input.press('Enter');
  await expect.poll(() => tokens).toEqual(['hf_e2eTestToken123456']);
});

test('manual add, measurements, undo and redo work without the AI model', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.locator('[data-testid="scene-canvas"] canvas')).toBeVisible();
  const rows = page.getByRole('list', { name: 'Scene objects' }).getByRole('button', { name: /^More actions for / });
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sofa', exact: true }).click();
  await expect(rows).toHaveCount(before + 1);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(/Sofa/);

  const labels = page.locator('[data-testid="scene-canvas"]').getByText(/^\d+(\.\d)? cm$/);
  await expect(labels).toHaveCount(3);
  await page.getByRole('button', { name: 'Toggle measurements' }).click();
  await expect(labels).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle measurements' }).click();
  await expect(labels).toHaveCount(3);

  await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await expect(rows).toHaveCount(before);
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)' }).click();
  await expect(rows).toHaveCount(before + 1);
});
