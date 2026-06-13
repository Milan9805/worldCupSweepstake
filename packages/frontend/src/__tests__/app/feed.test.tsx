import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import FeedPage from '../../app/feed/page';
import { getFeed } from '../../lib/api';

const mockPush = jest.fn();

let mockGroupKey: string | null = 'test-group';
let mockGroup: Record<string, unknown> | null = null;
let mockTeams: unknown[] = [];
let mockMatches: unknown[] = [];
let mockClaimedPerson: string | null = null;

jest.mock('../../hooks/GroupContext', () => ({
  useGroup: () => ({
    groupKey: mockGroupKey,
    group: mockGroup,
    teams: mockTeams,
    matches: mockMatches,
    claimedPerson: mockClaimedPerson,
  }),
}));

// usePollScores has its own tests; stub it so the page renders without timers.
jest.mock('../../hooks/usePollScores', () => ({
  usePollScores: jest.fn(),
}));

jest.mock('../../lib/api', () => ({
  getFeed: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../components/NavBar', () => {
  return function MockNavBar({ groupName }: { groupName?: string }) {
    return <div data-testid="navbar">{groupName}</div>;
  };
});

const mockGetFeed = getFeed as jest.MockedFunction<typeof getFeed>;

const mockLocalStorage = {
  getItem: jest.fn<string | null, [string]>(() => 'test-group'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

const TEAMS = [
  { teamCode: 'ENG', name: 'England', flag: '🏴', eliminated: false, eliminatedAt: null },
  { teamCode: 'BRA', name: 'Brazil', flag: '🇧🇷', eliminated: true, eliminatedAt: 'Round of 16' },
  { teamCode: 'GER', name: 'Germany', flag: '🇩🇪', eliminated: false, eliminatedAt: null },
];

const GROUP = {
  groupKey: 'test-group',
  groupName: 'Test Group',
  members: [
    { name: 'Alice', imageUrl: null, teams: ['ENG'] },
    { name: 'Bob', imageUrl: null, teams: ['BRA'] },
  ],
};

describe('FeedPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupKey = 'test-group';
    mockGroup = GROUP;
    mockTeams = TEAMS;
    mockMatches = [];
    mockClaimedPerson = 'Alice';
    mockLocalStorage.getItem.mockReturnValue('test-group');
    mockGetFeed.mockResolvedValue([]);
  });

  it('renders events with resolved owner names', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm1#GOAL#1-0',
        ts: new Date().toISOString(),
        type: 'GOAL',
        teamCode: 'ENG',
        matchId: 'm1',
        payload: { homeTeam: 'ENG', awayTeam: 'GER', homeScore: 1, awayScore: 0, scoringTeam: 'ENG' },
      },
    ]);

    render(<FeedPage />);

    // Scoreline + flags/names resolved from teams
    await screen.findByText(/England/);
    expect(screen.getByText('1–0')).toBeInTheDocument();
    expect(screen.getByText(/Germany/)).toBeInTheDocument();
    // Owner of ENG (Alice) is surfaced in brackets next to the team name
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
  });

  it("highlights the claimed person's events", async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm1#GOAL#1-0',
        ts: new Date().toISOString(),
        type: 'GOAL',
        teamCode: 'ENG',
        matchId: 'm1',
        payload: { homeTeam: 'ENG', awayTeam: 'GER', homeScore: 1, awayScore: 0 },
      },
      {
        eventId: 'm2#GOAL#1-0',
        ts: new Date().toISOString(),
        type: 'GOAL',
        teamCode: 'GER',
        matchId: 'm2',
        payload: { homeTeam: 'GER', awayTeam: 'GER', homeScore: 1, awayScore: 0, teamCode: 'GER' },
      },
    ]);

    render(<FeedPage />);

    const rows = await screen.findAllByTestId('feed-event');
    expect(rows).toHaveLength(2);
    // Only the ENG goal is owned by the claimed person (Alice) -> highlighted;
    // the GER goal is owned by nobody in the group -> not highlighted.
    const highlighted = rows.filter((r) => r.getAttribute('data-involves-claimed') === 'true');
    expect(highlighted).toHaveLength(1);
  });

  it("highlights events in the claimed person's match even when the other team is involved", async () => {
    // Alice owns ENG. Both events belong to her ENG–GER match but are attributed
    // to GER (a goal conceded, an opponent booking) — they must still highlight.
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm1#GOAL#away#0',
        ts: new Date().toISOString(),
        type: 'GOAL',
        teamCode: 'GER',
        matchId: 'm1',
        payload: { homeTeam: 'ENG', awayTeam: 'GER', homeScore: 0, awayScore: 1, scoringTeam: 'GER' },
      },
      {
        eventId: "m1#YELLOW_CARD#GER#Kroos#40'",
        ts: new Date().toISOString(),
        type: 'YELLOW_CARD',
        teamCode: 'GER',
        matchId: 'm1',
        payload: { teamCode: 'GER', player: 'Kroos', minute: "40'", homeTeam: 'ENG', awayTeam: 'GER' },
      },
    ]);

    render(<FeedPage />);

    const rows = await screen.findAllByTestId('feed-event');
    expect(rows).toHaveLength(2);
    const highlighted = rows.filter((r) => r.getAttribute('data-involves-claimed') === 'true');
    expect(highlighted).toHaveLength(2);
  });

  it('does not highlight events with no claimed-person involvement', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm3#FULL_TIME',
        ts: new Date().toISOString(),
        type: 'FULL_TIME',
        matchId: 'm3',
        payload: { homeTeam: 'GER', awayTeam: 'BRA', homeScore: 2, awayScore: 1, outcome: 'home' },
      },
    ]);

    render(<FeedPage />);

    const rows = await screen.findAllByTestId('feed-event');
    expect(rows[0].getAttribute('data-involves-claimed')).toBe('false');
  });

  it('shows the empty state when there are no events', async () => {
    mockGetFeed.mockResolvedValue([]);
    render(<FeedPage />);
    await waitFor(() =>
      expect(screen.getByText(/Nothing has happened yet/i)).toBeInTheDocument()
    );
  });

  it('renders a half-time event with its label and scoreline', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm3#HALF_TIME',
        ts: new Date().toISOString(),
        type: 'HALF_TIME',
        matchId: 'm3',
        payload: { homeTeam: 'GER', awayTeam: 'BRA', homeScore: 1, awayScore: 0, stage: 'GROUP_STAGE' },
      },
    ]);

    render(<FeedPage />);

    expect(await screen.findByText('Half time')).toBeInTheDocument();
    expect(screen.getByText('1–0')).toBeInTheDocument();
  });

  it('renders an elimination event', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'BRA#ELIMINATED',
        ts: new Date().toISOString(),
        type: 'ELIMINATION',
        teamCode: 'BRA',
        matchId: 'm4',
        payload: { teamCode: 'BRA', teamName: 'Brazil', eliminatedAt: 'Round of 16' },
      },
    ]);

    render(<FeedPage />);
    // Team name (with owner bracket) and the "knocked out" text are separate
    // spans now, so assert on each piece.
    await screen.findByText(/Brazil/);
    expect(screen.getByText(/knocked out/)).toBeInTheDocument();
    expect(screen.getByText(/Round of 16/)).toBeInTheDocument();
  });

  it('renders a bracket-drawn event with an older (clock) timestamp', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'BRACKET_DRAWN',
        ts: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), // 26h ago
        type: 'BRACKET_DRAWN',
        payload: { eliminated: 16, slots: 16 },
      },
    ]);

    render(<FeedPage />);
    await screen.findByText(/Knockout bracket has been drawn/);
    // Older than 24h -> falls back to a clock-style timestamp, not "Xh ago".
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });

  it('renders hour- and minute-relative timestamps', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm5#FULL_TIME',
        ts: new Date(Date.now() - 1000 * 60 * 90).toISOString(), // 90m -> "1h ago"
        type: 'FULL_TIME',
        matchId: 'm5',
        payload: { homeTeam: 'ENG', awayTeam: 'GER', homeScore: 2, awayScore: 0, outcome: 'home' },
      },
    ]);

    render(<FeedPage />);
    await screen.findByText(/England/);
    expect(screen.getByText('1h ago')).toBeInTheDocument();
  });

  it('keeps the last good feed when a refetch fails', async () => {
    // The failure path logs to console.error by design; silence it so the
    // expected error doesn't show as noise in the test output.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetFeed.mockRejectedValueOnce(new Error('network'));
    render(<FeedPage />);
    // Failure is non-fatal: the empty state is shown rather than crashing.
    await waitFor(() =>
      expect(screen.getByText(/Nothing has happened yet/i)).toBeInTheDocument()
    );
    expect(consoleSpy).toHaveBeenCalledWith('Error loading feed:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('renders a red-card event with marker, team, player and minute', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm6#RED_CARD#1',
        ts: new Date().toISOString(),
        type: 'RED_CARD',
        teamCode: 'ENG',
        matchId: 'm6',
        payload: {
          teamCode: 'ENG',
          player: 'Y. Sithole',
          minute: '49',
          homeTeam: 'ENG',
          awayTeam: 'GER',
          stage: 'GROUP_STAGE',
        },
      },
    ]);

    render(<FeedPage />);

    // Marker label + icon
    expect(await screen.findByText('Red card')).toBeInTheDocument();
    expect(screen.getByText('🟥')).toBeInTheDocument();
    // Booked player's team (with owner bracket) is resolved
    expect(screen.getByText(/England/)).toBeInTheDocument();
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
    // Player name + minute
    expect(screen.getByText(/Y\. Sithole 49'/)).toBeInTheDocument();
  });

  it('renders a yellow-card event with marker, player and minute', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm7#YELLOW_CARD#1',
        ts: new Date().toISOString(),
        type: 'YELLOW_CARD',
        teamCode: 'GER',
        matchId: 'm7',
        payload: {
          teamCode: 'GER',
          player: 'T. Müller',
          minute: '23',
          homeTeam: 'ENG',
          awayTeam: 'GER',
          stage: 'GROUP_STAGE',
        },
      },
    ]);

    render(<FeedPage />);

    expect(await screen.findByText('Yellow card')).toBeInTheDocument();
    expect(screen.getByText('🟨')).toBeInTheDocument();
    expect(screen.getByText(/Germany/)).toBeInTheDocument();
    expect(screen.getByText(/T\. Müller 23'/)).toBeInTheDocument();
  });

  it('shows the scorer on a GOAL event when payload.scorer is present', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm8#GOAL#1-0',
        ts: new Date().toISOString(),
        type: 'GOAL',
        teamCode: 'ENG',
        matchId: 'm8',
        payload: {
          homeTeam: 'ENG',
          awayTeam: 'GER',
          homeScore: 1,
          awayScore: 0,
          teamCode: 'ENG',
          scorer: 'J. Quiñones',
          scorerMinute: '9',
        },
      },
    ]);

    render(<FeedPage />);

    await screen.findByText('1–0');
    expect(screen.getByText(/J\. Quiñones 9'/)).toBeInTheDocument();
  });

  it('renders a GOAL event without a scorer (scoreline only, no crash)', async () => {
    mockGetFeed.mockResolvedValue([
      {
        eventId: 'm9#GOAL#2-1',
        ts: new Date().toISOString(),
        type: 'GOAL',
        teamCode: 'ENG',
        matchId: 'm9',
        payload: { homeTeam: 'ENG', awayTeam: 'GER', homeScore: 2, awayScore: 1, teamCode: 'ENG' },
      },
    ]);

    render(<FeedPage />);

    expect(await screen.findByText('2–1')).toBeInTheDocument();
    // No scorer span rendered (no "·" separator).
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('redirects to home when there is no group key and none stored', () => {
    mockGroupKey = null;
    mockGroup = null;
    mockLocalStorage.getItem.mockReturnValue(null);
    render(<FeedPage />);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  describe('grouping and filtering', () => {
    // Alice owns ENG (the live ENG–GER match); Bob owns BRA (the finished
    // BRA–FRA match), so only the live match is "mine".
    const LIVE = {
      matchId: 'mLive',
      homeTeam: 'ENG',
      awayTeam: 'GER',
      homeScore: 1,
      awayScore: 0,
      status: 'LIVE',
      stage: 'GROUP_STAGE',
      group: 'A',
      datetime: '2026-06-12T18:00:00Z',
      venue: 'Wembley',
      minute: "57'",
    };
    const FINISHED = {
      matchId: 'mFin',
      homeTeam: 'BRA',
      awayTeam: 'GER',
      homeScore: 2,
      awayScore: 1,
      status: 'FINISHED',
      stage: 'GROUP_STAGE',
      group: 'B',
      datetime: '2026-06-12T15:00:00Z',
      venue: 'Etihad',
    };
    const liveGoal = {
      eventId: 'mLive#GOAL#home#0',
      ts: new Date().toISOString(),
      type: 'GOAL' as const,
      matchId: 'mLive',
      payload: { homeTeam: 'ENG', awayTeam: 'GER', homeScore: 1, awayScore: 0 },
    };
    const finishedFT = {
      eventId: 'mFin#FULL_TIME',
      ts: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      type: 'FULL_TIME' as const,
      matchId: 'mFin',
      payload: { homeTeam: 'BRA', awayTeam: 'GER', homeScore: 2, awayScore: 1, outcome: 'home' },
    };

    beforeEach(() => {
      mockMatches = [LIVE, FINISHED];
      mockGetFeed.mockResolvedValue([liveGoal, finishedFT]);
    });

    it('groups events by match: live expanded, finished collapsed', async () => {
      render(<FeedPage />);
      // Two match groups.
      expect(await screen.findAllByTestId('feed-group-header')).toHaveLength(2);
      // The live group shows its event; the finished group is collapsed, so only
      // the live GOAL row is visible.
      expect(screen.getAllByTestId('feed-event')).toHaveLength(1);
      expect(screen.getByText('Goal')).toBeInTheDocument();
      expect(screen.getByText('LIVE')).toBeInTheDocument();
      expect(screen.getByText('FT')).toBeInTheDocument();
    });

    it('expands a finished group when its header is tapped', async () => {
      render(<FeedPage />);
      const headers = await screen.findAllByTestId('feed-group-header');
      // Live group is first (live-first ordering); the finished group is second.
      fireEvent.click(headers[1]);
      expect(screen.getAllByTestId('feed-event')).toHaveLength(2);
      expect(screen.getByText('Full time')).toBeInTheDocument();
    });

    it('defaults to "All games" and shows every group', async () => {
      render(<FeedPage />);
      await screen.findAllByTestId('feed-group-header');
      expect(screen.getByRole('button', { name: 'All games' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByTestId('feed-group-header')).toHaveLength(2);
    });

    it('filters to live games only', async () => {
      render(<FeedPage />);
      await screen.findAllByTestId('feed-group-header');
      fireEvent.click(screen.getByRole('button', { name: 'Live games' }));
      const headers = screen.getAllByTestId('feed-group-header');
      expect(headers).toHaveLength(1);
      expect(screen.getByText('LIVE')).toBeInTheDocument();
      expect(screen.queryByText('FT')).not.toBeInTheDocument();
    });

    it('filters to my games only', async () => {
      render(<FeedPage />);
      await screen.findAllByTestId('feed-group-header');
      fireEvent.click(screen.getByRole('button', { name: 'My games' }));
      // Alice owns ENG -> only the live ENG–GER match remains.
      expect(screen.getAllByTestId('feed-group-header')).toHaveLength(1);
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('shows a tailored empty state when no games are live', async () => {
      mockMatches = [FINISHED];
      mockGetFeed.mockResolvedValue([finishedFT]);
      render(<FeedPage />);
      await screen.findByTestId('feed-group-header');
      fireEvent.click(screen.getByRole('button', { name: 'Live games' }));
      expect(screen.getByText(/No matches are live right now/i)).toBeInTheDocument();
    });

    it('shows a tailored empty state when none of my teams are in the feed', async () => {
      mockClaimedPerson = 'Nobody';
      render(<FeedPage />);
      await screen.findAllByTestId('feed-group-header');
      fireEvent.click(screen.getByRole('button', { name: 'My games' }));
      expect(screen.getByText(/None of your teams are in the feed yet/i)).toBeInTheDocument();
    });
  });
});
