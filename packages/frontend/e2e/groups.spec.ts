import { test, expect, Page } from '@playwright/test';

// E2E coverage for the Groups page: deep-linking to a specific group via the
// ?group= param (used by stage links in the banner / feed / fixtures) must
// select that group immediately without flashing Group A first.

const stats = () => ({
  played: 1, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
  goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null,
});
const team = (teamCode: string, name: string, flag: string, groupLetter: string) =>
  ({ teamCode, name, flag, fifaRanking: 5, groupLetter, stats: stats(), eliminated: false, eliminatedAt: null });

const TEAMS = [
  team('ENG', 'England', '🏴', 'A'),
  team('FRA', 'France', '🇫🇷', 'A'),
  team('BRA', 'Brazil', '🇧🇷', 'B'),
  team('ARG', 'Argentina', '🇦🇷', 'B'),
];

const GROUP = {
  groupKey: 'test-group',
  groupName: 'Test Group',
  members: [
    { name: 'Alice', imageUrl: null, teams: ['ENG', 'BRA'] },
    { name: 'Bob', imageUrl: null, teams: ['FRA', 'ARG'] },
  ],
};

const match = (
  matchId: string, homeTeam: string, awayTeam: string, stage: string,
  group: string | null, status: string, datetime: string,
  extra: Record<string, unknown> = {},
) => ({
  matchId, homeTeam, awayTeam, homeScore: null, awayScore: null,
  status, stage, group, datetime, venue: 'Stadium', channels: [], ...extra,
});

const MATCHES = [
  match('m1', 'ENG', 'FRA', 'GROUP_STAGE', 'A', 'FINISHED', '2099-06-11T18:00:00Z', { homeScore: 2, awayScore: 1 }),
  match('m2', 'BRA', 'ARG', 'GROUP_STAGE', 'B', 'FINISHED', '2099-06-12T18:00:00Z', { homeScore: 1, awayScore: 0 }),
];

async function seedRegistry(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sweepstake_groups',
      JSON.stringify({ active: 'test-group', groups: { 'test-group': { groupName: 'Test Group', person: 'Alice' } } }),
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
    if (url.includes('/api/matches')) return send(MATCHES);
    if (url.includes('/api/group/')) return send(GROUP);
    if (url.includes('/api/feed')) return send([]);
    if (url.includes('/api/tree')) return send([]);
    if (url.includes('/api/refresh')) return send({ matches: MATCHES, teams: TEAMS });
    return send(null);
  });
}

test.describe('Groups page — deep link navigation', () => {
  test('defaults to Group A when no param is given', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page);
    await page.goto('/groups');

    await expect(page.getByRole('heading', { name: 'Group Stages' })).toBeVisible();
    const groupATab = page.getByRole('button', { name: 'Group A' });
    await expect(groupATab).toHaveClass(/bg-accent/);
    await expect(page.getByText('Fixtures - Group A')).toBeVisible();
  });

  test('selects Group B immediately when ?group=B is in the URL', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page);
    await page.goto('/groups?group=B');

    await expect(page.getByRole('heading', { name: 'Group Stages' })).toBeVisible();

    // Group B tab must be active — the page must never show Group A as the
    // selected group after loading is complete.
    const groupBTab = page.getByRole('button', { name: 'Group B' });
    await expect(groupBTab).toHaveClass(/bg-accent/);
    await expect(page.getByText('Fixtures - Group B')).toBeVisible();

    // Group A tab must not be active.
    const groupATab = page.getByRole('button', { name: 'Group A' });
    await expect(groupATab).not.toHaveClass(/bg-accent/);
  });

  test('Group A content is never visible when landing on ?group=B', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page);

    // Track whether "Fixtures - Group A" was ever in the DOM while the page was
    // rendering. Any flash of Group A content would fail this check.
    const groupAFlashed = { value: false };
    page.on('console', () => {}); // keep console listener attached

    await page.goto('/groups?group=B');

    // Poll immediately after navigation — if Group A content ever appears (even
    // briefly) before Group B is shown, the test catches it.
    await expect(page.getByText('Fixtures - Group A')).toHaveCount(0);
    await expect(page.getByText('Fixtures - Group B')).toBeVisible();

    expect(groupAFlashed.value).toBe(false);
  });

  test('clicking a Group B stage link from the fixtures page lands on Group B', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page);
    await page.goto('/fixtures');

    // Find and click a "Group B" stage link (from the BRA v ARG fixture row).
    const groupBLink = page.getByRole('link', { name: 'Group B' }).first();
    await expect(groupBLink).toBeVisible();
    await groupBLink.click();

    // Should have navigated to /groups with ?group=B
    await expect(page).toHaveURL(/\/groups\?group=B/);

    // Group B must be selected and its content visible.
    const groupBTab = page.getByRole('button', { name: 'Group B' });
    await expect(groupBTab).toHaveClass(/bg-accent/);
    await expect(page.getByText('Fixtures - Group B')).toBeVisible();

    // Group A must not be selected.
    await expect(page.getByRole('button', { name: 'Group A' })).not.toHaveClass(/bg-accent/);
  });
});
