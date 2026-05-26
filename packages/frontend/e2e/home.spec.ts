import { test, expect } from '@playwright/test';

test.describe('home page', () => {
  test('renders the sweepstake login form', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /sweepstake tracker/i })
    ).toBeVisible();

    await expect(page.getByLabel(/group key/i)).toBeVisible();

    const enter = page.getByRole('button', { name: /enter/i });
    await expect(enter).toBeVisible();
    await expect(enter).toBeDisabled();
  });

  test('enables submit once a group key is entered', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel(/group key/i).fill('test-passphrase');
    await expect(page.getByRole('button', { name: /enter/i })).toBeEnabled();
  });

  test('exposes an admin access link', async ({ page }) => {
    await page.goto('/');

    const adminLink = page.getByRole('link', { name: /admin access/i });
    await expect(adminLink).toHaveAttribute('href', '/admin');
  });
});
