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

  test('enables submit once a group key and name are entered', async ({ page }) => {
    await page.goto('/');

    const enter = page.getByRole('button', { name: /enter/i });

    // The group key alone is not enough — a name is also required.
    await page.getByLabel(/group key/i).fill('test-passphrase');
    await expect(enter).toBeDisabled();

    await page.getByLabel(/your name/i).fill('Dan');
    await expect(enter).toBeEnabled();
  });

  test('exposes an admin access link', async ({ page }) => {
    await page.goto('/');

    const adminLink = page.getByRole('link', { name: /admin access/i });
    await expect(adminLink).toHaveAttribute('href', '/admin');
  });
});
