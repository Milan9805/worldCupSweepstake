import { test, expect, Page, Locator } from '@playwright/test';

// E2E coverage for the Fixtures page + the stage-aware, line-stacked match
// banner. The views need data, so we mock the API and seed the group registry
// in localStorage (no DynamoDB). The playwright config's webServer runs
// `next dev`, so these drive a real browser against a real build.

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
  team('ESP', 'Spain', '🇪🇸', 'C'),
  team('GER', 'Germany', '🇩🇪', 'C'),
];

const GROUP = {
  groupKey: 'test-group',
  groupName: 'Test Group',
  members: [
    { name: 'Alice', imageUrl: null, teams: ['ENG', 'BRA'] },
    { name: 'Bob', imageUrl: null, teams: ['FRA', 'ARG'] },
  ],
};

const CHANNELS = [
  { name: 'ITV1', bg: '#127b60', fg: '#ffffff' },
  { name: 'STV', bg: '#032baa', fg: '#fafafa' },
];

const match = (
  matchId: string, homeTeam: string, awayTeam: string, stage: string,
  group: string | null, status: string, datetime: string,
  extra: Record<string, unknown> = {},
) => ({
  matchId, homeTeam, awayTeam, homeScore: null, awayScore: null,
  status, stage, group, datetime, venue: 'Stadium', channels: [], ...extra,
});

// Far-future dates so the soonest SCHEDULED match is always "Next up" with a
// real countdown, regardless of the machine clock.
const mFinished = match('mA', 'ENG', 'FRA', 'GROUP_STAGE', 'A', 'FINISHED', '2099-06-11T18:00:00Z', { homeScore: 2, awayScore: 1, channels: CHANNELS });
const mNext = match('mB', 'BRA', 'ARG', 'GROUP_STAGE', 'B', 'SCHEDULED', '2099-06-20T18:00:00Z', { channels: CHANNELS });
const mKnockout = match('mC', 'ESP', 'GER', 'ROUND_OF_16', null, 'SCHEDULED', '2099-07-01T18:00:00Z');
const SCHEDULED_SET = [mKnockout, mFinished, mNext]; // out of order on purpose

const mLive = match('mB', 'BRA', 'ARG', 'GROUP_STAGE', 'B', 'LIVE', '2099-06-20T18:00:00Z', { homeScore: 2, awayScore: 1, minute: "67'" });
const LIVE_SET = [mKnockout, mFinished, mLive];

async function seedRegistry(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sweepstake_groups',
      JSON.stringify({ active: 'test-group', groups: { 'test-group': { groupName: 'Test Group', person: 'Alice' } } }),
    );
    localStorage.setItem('sweepstake_group_key', 'test-group');
  });
}

async function mockApi(page: Page, matches: unknown[]) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const send = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    if (url.includes('/api/teams')) return send(TEAMS);
    if (url.includes('/api/matches')) return send(matches);
    if (url.includes('/api/group/')) return send(GROUP);
    if (url.includes('/api/feed')) return send([]);
    if (url.includes('/api/refresh')) return send({ matches, teams: TEAMS });
    return send(null);
  });
}

const topOf = async (loc: Locator): Promise<number> => {
  const box = await loc.boundingBox();
  if (!box) throw new Error('element has no bounding box');
  return box.y;
};

test.describe('Fixtures page', () => {
  test('lists every fixture with its stage under the date', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page, SCHEDULED_SET);
    await page.goto('/fixtures');

    await expect(page.getByRole('heading', { name: 'Fixtures' })).toBeVisible();
    // Stage labels under the date: group stage + a knockout round.
    await expect(page.getByText('Group A')).toBeVisible(); // mFinished row (banner shows Group B, not A)
    await expect(page.getByText('Round of 16')).toBeVisible(); // mKnockout row
  });
});

test.describe('Match banner — mobile line stack', () => {
  test.use({ viewport: { width: 390, height: 740 } });

  test('next-up banner reads as ordered, compact lines', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page, SCHEDULED_SET);
    await page.goto('/fixtures');

    const banner = page.getByTestId('match-banner');
    await expect(banner).toBeVisible();

    const label = page.getByText(/Next up \(Group B\)/i);
    const home = page.getByText('🇧🇷 BRA'); // teamLabel concatenates flag+code (banner only)
    const away = page.getByText('🇦🇷 ARG');
    const channel = page.getByText('ITV1').first(); // banner pill (also in the list below)
    const seeAll = page.getByRole('link', { name: /see all fixtures/i });

    await expect(label).toBeVisible();
    await expect(seeAll).toHaveAttribute('href', '/fixtures');
    // No live game in this set, so the feed link is hidden.
    await expect(page.getByRole('link', { name: /see live feed/i })).toHaveCount(0);

    const [labelY, homeY, awayY, channelY, seeAllY] = await Promise.all(
      [label, home, away, channel, seeAll].map(topOf),
    );

    // Clean vertical order: label ABOVE the matchup (the old bug was the label
    // sharing the matchup's line and pushing a team onto the next row), matchup
    // above the channels, channels above the link.
    expect(labelY).toBeLessThan(homeY);
    expect(homeY).toBeLessThan(channelY);
    expect(channelY).toBeLessThanOrEqual(seeAllY);
    // Both teams sit on the SAME line — the matchup no longer wraps mid-way.
    expect(Math.abs(homeY - awayY)).toBeLessThan(8);

    // The team line and the countdown line are horizontally centred (matching the
    // channel pills); the label and the link deliberately stay left-aligned.
    const bannerBox = await banner.boundingBox();
    const bannerCx = bannerBox!.x + bannerBox!.width / 2;
    const centerX = async (loc: Locator) => {
      const b = await loc.boundingBox();
      return b!.x + b!.width / 2;
    };
    expect(Math.abs((await centerX(home.locator('..'))) - bannerCx)).toBeLessThan(16); // team line
    expect(Math.abs((await centerX(banner.locator('.text-gold').first().locator('..'))) - bannerCx)).toBeLessThan(16); // times line
    const labelBox = await label.boundingBox();
    expect(labelBox!.x).toBeLessThan(bannerBox!.x + 28); // label stays left
    const seeAllBox = await seeAll.boundingBox();
    expect(seeAllBox!.x).toBeLessThan(bannerBox!.x + 28); // link stays left

    // Tight spacing keeps the whole strip compact (not a tall column).
    const box = await banner.boundingBox();
    expect(box!.height).toBeLessThan(240);
  });

  test('live banner shows a tidy block and stays pinned on scroll', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page, LIVE_SET);
    await page.goto('/fixtures');

    const banner = page.getByTestId('match-banner');
    await expect(banner.getByText('LIVE', { exact: true })).toBeVisible();
    await expect(banner.getByText('(Group B)')).toBeVisible();
    await expect(banner.getByText('2 - 1')).toBeVisible();
    // A live game is on, so the feed link is offered.
    await expect(banner.getByRole('link', { name: /see live feed/i })).toHaveAttribute('href', '/feed');

    const before = await topOf(banner);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(250);
    const after = await topOf(banner);
    expect(after).toBeLessThan(120); // still pinned just below the ~64px nav
    expect(Math.abs(after - before)).toBeLessThan(8);
  });
});

test.describe('Match banner — desktop layout preserved', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('label sits inline with the matchup on desktop', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page, SCHEDULED_SET);
    await page.goto('/fixtures');

    const label = page.getByText(/Next up \(Group B\)/i);
    const home = page.getByText('🇧🇷 BRA');
    await expect(label).toBeVisible();
    await expect(page.getByText('ITV1').first()).toBeVisible(); // channels still present

    const [labelY, homeY] = await Promise.all([label, home].map(topOf));
    expect(Math.abs(labelY - homeY)).toBeLessThan(8); // same line → desktop unchanged
  });
});
