import { test, expect, Page } from '@playwright/test';

// E2E coverage for the Honours Board, focused on the Deepest Run card: its
// secondary line shows how many of an owner's teams are still in vs the total
// ("1/2 remaining"), mirroring the Leaderboard — not the raw total of every team
// ever assigned. Other prizes still aggregate over all teams, so their line keeps
// the full total ("… • 2 teams").

const stats = (overrides: Record<string, number> = {}) => ({
  played: 3, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
  goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null,
  ...overrides,
});

const team = (
  teamCode: string, name: string, flag: string,
  extra: Record<string, unknown> = {},
) => ({ teamCode, name, flag, fifaRanking: 5, groupLetter: 'A', eliminated: false, eliminatedAt: null, stats: stats(), ...extra });

const TEAMS = [
  // Elliot: one team still alive, one knocked out → 1 of 2 still in.
  team('RSA', 'South Africa', '🇿🇦', { stats: stats({ goalsFor: 5, points: 9 }) }),
  team('CAN', 'Canada', '🇨🇦', { eliminated: true, eliminatedAt: 'Round of 16', stats: stats({ goalsFor: 3, points: 4 }) }),
  // Hugh: only team is out in the group stage → he can't win Deepest Run.
  team('BRA', 'Brazil', '🇧🇷', { eliminated: true, eliminatedAt: 'Group Stage', stats: stats({ goalsFor: 1, points: 3 }) }),
];

const GROUP = {
  groupKey: 'test-group',
  groupName: 'Test Group',
  members: [
    { name: 'Elliot', imageUrl: null, teams: ['RSA', 'CAN'] },
    { name: 'Hugh', imageUrl: null, teams: ['BRA'] },
  ],
};

async function seedRegistry(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sweepstake_groups',
      JSON.stringify({ active: 'test-group', groups: { 'test-group': { groupName: 'Test Group', person: 'Elliot' } } }),
    );
    localStorage.setItem('sweepstake_group_key', 'test-group');
  });
}

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const send = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (url.includes('/api/teams')) return send(TEAMS);
    if (url.includes('/api/matches')) return send([]);
    if (url.includes('/api/group/')) return send(GROUP);
    if (url.includes('/api/feed')) return send([]);
    if (url.includes('/api/refresh')) return send({ matches: [], teams: TEAMS });
    return send(null);
  });
}

// Locate a prize card by its `data-prize` id.
const card = (page: Page, id: string) =>
  page.locator(`[data-testid="prize-card"][data-prize="${id}"]`);

test.describe('Honours Board — Deepest Run', () => {
  test('shows still-in/total remaining, with the stage as the headline', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page);
    await page.goto('/honours');

    await expect(page.getByText('🏅 Honours Board')).toBeVisible();

    const winner = card(page, 'deepestRun').getByTestId('prize-winner');
    // Elliot has the only alive team → wins Deepest Run, "Still in" as the headline.
    await expect(winner.getByText('Elliot')).toBeVisible();
    await expect(winner.getByText('Still in')).toBeVisible();
    // The line reflects teams still in (1) out of total assigned (2), no points.
    await expect(winner.getByText('1/2 remaining')).toBeVisible();
    await expect(winner.getByText(/pts/)).toHaveCount(0);
  });

  test('other prizes still count all assigned teams (total, not still-in)', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page);
    await page.goto('/honours');

    // Most Goals aggregates over all of Elliot's teams (RSA + CAN = 8), and its
    // secondary line keeps the full team total — including the eliminated one.
    const winner = card(page, 'mostGoals').getByTestId('prize-winner');
    await expect(winner.getByText('Elliot')).toBeVisible();
    await expect(winner.getByText(/2 teams/)).toBeVisible();
  });
});
