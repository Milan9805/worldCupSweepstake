import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FixturesPage from '../../app/fixtures/page';
import { Team } from '@sweepstake/shared';

const mockPush = jest.fn();

// Mutable shared-context state — the page reads group/teams/matches/claimedPerson
// from the GroupContext, not the api directly.
let mockGroupKey: string | null = 'test-group';
let mockGroup: Record<string, unknown> | null = null;
let mockTeams: unknown[] = [];
let mockMatches: unknown[] = [];
let mockClaimedPerson: string | null = null;
let mockLoading = false;

jest.mock('../../hooks/GroupContext', () => ({
  useGroup: () => ({
    groupKey: mockGroupKey,
    group: mockGroup,
    teams: mockTeams,
    matches: mockMatches,
    claimedPerson: mockClaimedPerson,
    loading: mockLoading,
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../components/NavBar', () => {
  return function MockNavBar({ groupName }: { groupName?: string }) {
    return <div data-testid="navbar">{groupName}</div>;
  };
});

// The real TeamFilterDropdown is a click-driven popover; mock it to a plain
// <select> so the test can pick a team deterministically without fighting its
// outside-click/focus internals. We assert it's absent under "My fixtures".
jest.mock('../../components/TeamFilterDropdown', () => {
  return function MockTeamFilterDropdown({
    teams,
    selectedTeamCode,
    onChange,
  }: {
    teams: { teamCode: string; name: string }[];
    selectedTeamCode: string | null;
    onChange: (teamCode: string | null) => void;
  }) {
    return (
      <select
        data-testid="team-filter"
        value={selectedTeamCode ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">All teams</option>
        {teams.map((t) => (
          <option key={t.teamCode} value={t.teamCode}>
            {t.name}
          </option>
        ))}
      </select>
    );
  };
});

const mockLocalStorage = {
  getItem: jest.fn<string | null, [string]>(() => 'test-group'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

const makeTeam = (teamCode: string, name: string, groupLetter: string): Team => ({
  teamCode,
  name,
  flag: '🏳️',
  fifaRanking: 1,
  groupLetter,
  eliminated: false,
  eliminatedAt: null,
  stats: {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    yellowCards: 0,
    redCards: 0,
    possession: null,
    xG: null,
  },
});

const TEAMS: Team[] = [
  makeTeam('ENG', 'England', 'A'),
  makeTeam('GER', 'Germany', 'A'),
  makeTeam('BRA', 'Brazil', 'B'),
  makeTeam('FRA', 'France', 'B'),
  // A team with no fixtures — must be excluded from the dropdown options.
  makeTeam('ESP', 'Spain', 'C'),
];

const GROUP = {
  groupKey: 'test-group',
  groupName: 'Test Group',
  members: [
    { name: 'Alice', imageUrl: null, teams: ['ENG'] },
    { name: 'Bob', imageUrl: null, teams: ['BRA'] },
  ],
};

// Three matches, deliberately out of chronological order in the array, spanning
// multiple owners and stages. Sorted oldest -> newest they are: M1 (12 Jun),
// M2 (13 Jun), M3 (14 Jun).
const M_LATE = {
  matchId: 'm3',
  homeTeam: 'BRA',
  awayTeam: 'FRA',
  homeScore: null,
  awayScore: null,
  status: 'SCHEDULED',
  stage: 'ROUND_OF_16',
  group: null,
  datetime: '2026-06-14T18:00:00Z',
  venue: 'Wembley',
};
const M_EARLY = {
  matchId: 'm1',
  homeTeam: 'ENG',
  awayTeam: 'GER',
  homeScore: 2,
  awayScore: 1,
  status: 'FINISHED',
  stage: 'GROUP_STAGE',
  group: 'A',
  datetime: '2026-06-12T15:00:00Z',
  venue: 'Etihad',
};
const M_MID = {
  matchId: 'm2',
  homeTeam: 'GER',
  awayTeam: 'BRA',
  homeScore: null,
  awayScore: null,
  status: 'SCHEDULED',
  stage: 'GROUP_STAGE',
  group: 'A',
  datetime: '2026-06-13T12:00:00Z',
  venue: 'Anfield',
};
const MATCHES = [M_LATE, M_EARLY, M_MID];

// The date column text MatchList renders for each match (weekday + day month,
// comma stripped), used to assert render order.
const dateLabel = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/London',
    })
    .replace(',', '');

describe('FixturesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupKey = 'test-group';
    mockGroup = GROUP;
    mockTeams = TEAMS;
    mockMatches = MATCHES;
    mockClaimedPerson = 'Alice';
    mockLoading = false;
    mockLocalStorage.getItem.mockReturnValue('test-group');
  });

  it('renders the NavBar group name and the Fixtures heading', () => {
    render(<FixturesPage />);
    expect(screen.getByTestId('navbar')).toHaveTextContent('Test Group');
    expect(screen.getByRole('heading', { name: 'Fixtures' })).toBeInTheDocument();
  });

  it('shows the loading spinner and no list while loading', () => {
    mockLoading = true;
    render(<FixturesPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fixtures' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-filter')).not.toBeInTheDocument();
  });

  it('redirects home when there is no group key and none stored', () => {
    mockGroupKey = null;
    mockGroup = null;
    mockLocalStorage.getItem.mockReturnValue(null);
    render(<FixturesPage />);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('defaults to All and renders every match oldest -> newest', () => {
    render(<FixturesPage />);

    // All three matches are shown.
    const dates = screen.getAllByText(
      new RegExp(`${dateLabel(M_EARLY.datetime)}|${dateLabel(M_MID.datetime)}|${dateLabel(M_LATE.datetime)}`),
    );
    expect(dates).toHaveLength(3);

    // Rendered chronologically: M1 (12 Jun) -> M2 (13 Jun) -> M3 (14 Jun),
    // regardless of the non-chronological input order.
    expect(dates[0]).toHaveTextContent(dateLabel(M_EARLY.datetime));
    expect(dates[1]).toHaveTextContent(dateLabel(M_MID.datetime));
    expect(dates[2]).toHaveTextContent(dateLabel(M_LATE.datetime));
  });

  it('renders the team filter dropdown only in the All view, with only teams that have fixtures', () => {
    render(<FixturesPage />);
    const select = screen.getByTestId('team-filter');
    // ENG/GER/BRA/FRA appear in fixtures; ESP (Spain) does not -> excluded.
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['All teams', 'Brazil', 'England', 'France', 'Germany']);
  });

  it('My fixtures: shows only the claimed person\'s matches and hides the team dropdown', () => {
    render(<FixturesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'My fixtures' }));

    // Alice owns ENG (M1) and is in no other match; Bob owns BRA (M2, M3) but
    // isn't the claimed person. So only M1 remains.
    expect(screen.getByText(dateLabel(M_EARLY.datetime))).toBeInTheDocument();
    expect(screen.queryByText(dateLabel(M_MID.datetime))).not.toBeInTheDocument();
    expect(screen.queryByText(dateLabel(M_LATE.datetime))).not.toBeInTheDocument();

    // The team dropdown is not rendered under "My fixtures".
    expect(screen.queryByTestId('team-filter')).not.toBeInTheDocument();
  });

  it('All view team filter narrows the list to the selected team', () => {
    render(<FixturesPage />);

    // Filter to Germany: appears in M1 (ENG–GER) and M2 (GER–BRA), not M3.
    fireEvent.change(screen.getByTestId('team-filter'), { target: { value: 'GER' } });

    expect(screen.getByText(dateLabel(M_EARLY.datetime))).toBeInTheDocument();
    expect(screen.getByText(dateLabel(M_MID.datetime))).toBeInTheDocument();
    expect(screen.queryByText(dateLabel(M_LATE.datetime))).not.toBeInTheDocument();
  });

  it('clears the team filter when switching to My fixtures', () => {
    render(<FixturesPage />);

    fireEvent.change(screen.getByTestId('team-filter'), { target: { value: 'GER' } });
    fireEvent.click(screen.getByRole('button', { name: 'My fixtures' }));
    // Back to All — the dropdown should be reset to "All teams", not GER.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByTestId('team-filter')).toHaveValue('');
    // All three matches visible again.
    expect(screen.getByText(dateLabel(M_LATE.datetime))).toBeInTheDocument();
  });

  it('shows the "none of your teams" empty state under My fixtures with no owned fixtures', () => {
    mockClaimedPerson = 'Nobody';
    render(<FixturesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'My fixtures' }));
    expect(screen.getByText('None of your teams have any fixtures.')).toBeInTheDocument();
  });

  it('shows the "no fixtures available yet" empty state when there are no matches at all', () => {
    mockMatches = [];
    render(<FixturesPage />);
    expect(
      screen.getByText(/No fixtures available yet\. Check back once the schedule is published\./i),
    ).toBeInTheDocument();
  });
});
