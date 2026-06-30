import { test, expect, Page } from '@playwright/test';

// E2E coverage for the match-driven Tournament Tree: it's built from the real
// knockout fixtures, grouped into collapsible rounds, reusing the shared match
// card (flags, owners, channels, live score + feed link).

const stats = () => ({
  played: 3, wins: 2, draws: 0, losses: 1, goalsFor: 5, goalsAgainst: 3,
  goalDifference: 2, points: 6, yellowCards: 0, redCards: 0, possession: null, xG: null,
});
const team = (teamCode: string, name: string, flag: string, groupLetter: string) =>
  ({ teamCode, name, flag, fifaRanking: 5, groupLetter, stats: stats(), eliminated: false, eliminatedAt: null });

const TEAMS = [
  team('RSA', 'South Africa', '🇿🇦', 'A'),
  team('CAN', 'Canada', '🇨🇦', 'A'),
  team('BRA', 'Brazil', '🇧🇷', 'B'),
  team('JPN', 'Japan', '🇯🇵', 'B'),
];

const GROUP = {
  groupKey: 'test-group',
  groupName: 'Test Group',
  members: [
    { name: 'Elliot', imageUrl: null, teams: ['RSA', 'CAN'] },
    { name: 'Hugh', imageUrl: null, teams: ['BRA'] },
    { name: 'Lauren', imageUrl: null, teams: ['JPN'] },
  ],
};

const ITV = [
  { name: 'ITV1', bg: '#127b60', fg: '#ffffff' },
  { name: 'STV', bg: '#032baa', fg: '#fafafa' },
];

const match = (
  matchId: string, homeTeam: string, awayTeam: string, stage: string,
  status: string, datetime: string, extra: Record<string, unknown> = {},
) => ({
  matchId, homeTeam, awayTeam, homeScore: null, awayScore: null,
  status, stage, group: null, datetime, venue: 'Stadium', channels: ITV, ...extra,
});

const MATCHES = [
  // A live Round-of-32 tie + a scheduled one — so the R32 round stays expanded.
  match('m1', 'RSA', 'CAN', 'ROUND_OF_32', 'LIVE', '2099-06-28T19:00:00Z', {
    homeScore: 1, awayScore: 0, minute: "23'",
  }),
  match('m2', 'BRA', 'JPN', 'ROUND_OF_32', 'SCHEDULED', '2099-06-29T18:00:00Z'),
];

// R32 ties finished (CAN, BRA win) plus the feed's own Round-of-16 fixture:
// Brazil have advanced into it (R32 slot 8 → R16 slot 4), but their opponent
// isn't drawn yet, so BBC names the feeding tie ("Winner Match 78" — the real
// structural feeder of that slot). The tree shows the feed's matchups verbatim.
const FINISHED_MATCHES = [
  match('m1', 'RSA', 'CAN', 'ROUND_OF_32', 'FINISHED', '2099-06-28T19:00:00Z', {
    homeScore: 0, awayScore: 1,
  }),
  match('m2', 'BRA', 'JPN', 'ROUND_OF_32', 'FINISHED', '2099-06-29T18:00:00Z', {
    homeScore: 2, awayScore: 1,
  }),
  match('r16', 'BRA', '', 'ROUND_OF_16', 'SCHEDULED', '2099-07-05T17:00:00Z', {
    awayFeeder: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 78 },
  }),
];

async function seedRegistry(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sweepstake_groups',
      JSON.stringify({ active: 'test-group', groups: { 'test-group': { groupName: 'Test Group', person: 'Elliot' } } }),
    );
    localStorage.setItem('sweepstake_group_key', 'test-group');
  });
}

async function mockApi(page: Page, matches: unknown[] = MATCHES) {
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

test.describe('Tournament Tree — match-driven', () => {
  test('renders the bracket with flags, owners, a live feed link and TBD placeholders', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page);
    await page.goto('/tree');

    await expect(page.getByRole('heading', { name: 'Tournament Tree' })).toBeVisible();

    // Every round is a column header; later rounds show TBD placeholders.
    await expect(page.getByText('Round of 32').first()).toBeVisible();
    await expect(page.getByText('Quarter Finals')).toBeVisible();
    await expect(
      page.getByTestId('round-column-ROUND_OF_16').getByText('TBD').first(),
    ).toBeVisible();

    // The real R32 matchups are inside the Round of 32 column.
    const r32 = page.getByTestId('round-column-ROUND_OF_32');
    await expect(r32.getByText('🇿🇦').first()).toBeVisible();
    await expect(r32.getByText('RSA').first()).toBeVisible();
    await expect(r32.getByText('(Elliot)').first()).toBeVisible();

    // The live tie shows its minute and a link to the feed.
    await expect(r32.getByText('LIVE').first()).toBeVisible();
    await expect(r32.getByText("23'").first()).toBeVisible();
    const watch = r32.getByRole('link', { name: /watch this live match/i }).first();
    await expect(watch).toHaveAttribute('href', '/feed');

    // Channel pills now appear in the bracket card too, next to the time.
    await expect(r32.getByText('ITV1').first()).toBeVisible();

    // STV / STV Player are Scotland-only and hidden everywhere — including the
    // bracket and the fixtures list below it.
    await expect(page.getByText('STV', { exact: true })).toHaveCount(0);

    // The kept fixtures list below still carries the full detail.
    await expect(page.getByRole('heading', { name: 'Knockout Fixtures' })).toBeVisible();
    await expect(page.getByText('ITV1').first()).toBeVisible();
  });

  test('shows the next round from the feed fixtures, labelling an unresolved opponent', async ({ page }) => {
    await seedRegistry(page);
    await mockApi(page, FINISHED_MATCHES);
    await page.goto('/tree');

    // The Round-of-16 matchup comes straight from the feed fixture (BRA placed at
    // its fixed bracket slot), not computed from R32 winners.
    const r16 = page.getByTestId('round-column-ROUND_OF_16');
    await expect(r16.getByText('BRA')).toBeVisible();
    // The opponent the draw hasn't filled yet shows its feeder label — never a
    // blank or "null" — which is the bug this whole change fixes.
    await expect(r16.getByText('Winner Match 78')).toBeVisible();
    await expect(r16.getByText('null')).toHaveCount(0);
  });

  test('pins the round headings beneath the nav and banner while the tree scrolls', async ({ page }) => {
    // A short viewport guarantees the page scrolls past the headings' natural spot.
    await page.setViewportSize({ width: 1024, height: 600 });
    await seedRegistry(page);
    await mockApi(page);
    await page.goto('/tree');

    const headings = page.getByTestId('tree-round-headings');
    await expect(headings).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 450));

    // Still on screen (not scrolled away) and pinned flush below the sticky
    // NavBar + MatchBanner, so it's always clear which round is which.
    await expect(headings).toBeVisible();
    const bannerBox = await page.getByTestId('match-banner').boundingBox();
    const headBox = await headings.boundingBox();
    expect(bannerBox).not.toBeNull();
    expect(headBox).not.toBeNull();
    expect(headBox!.y).toBeGreaterThanOrEqual(bannerBox!.y + bannerBox!.height - 2);
    expect(headBox!.y).toBeLessThan(bannerBox!.y + bannerBox!.height + 14);
  });

  test("highlights the claimed member's ties in blue", async ({ page }) => {
    await seedRegistry(page); // claimed person = Elliot, who owns RSA + CAN
    await mockApi(page);
    await page.goto('/tree');

    const r32 = page.getByTestId('round-column-ROUND_OF_32');
    // Elliot owns RSA & CAN → that tie is flagged; BRA/JPN (Hugh/Lauren) is not.
    await expect(r32.locator('[data-cell-index]', { hasText: 'RSA' })).toHaveAttribute(
      'data-involves-claimed',
      'true',
    );
    await expect(r32.locator('[data-cell-index]', { hasText: 'BRA' })).toHaveAttribute(
      'data-involves-claimed',
      'false',
    );
  });

  test.describe('mobile layout', () => {
    test.use({ viewport: { width: 390, height: 740 } });

    test('keeps horizontal scroll inside the bracket, not the page body', async ({ page }) => {
      await seedRegistry(page);
      await mockApi(page);
      await page.goto('/tree');

      await expect(page.getByTestId('round-column-ROUND_OF_32')).toBeVisible();

      // The bracket scrolls sideways within its own container — the page body
      // itself must not overflow horizontally on a phone.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
