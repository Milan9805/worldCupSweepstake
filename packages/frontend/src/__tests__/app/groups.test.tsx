import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import GroupsPage from '../../app/groups/page';

const mockPush = jest.fn();

// Mutable context state — the page reads group/teams/matches from the shared
// GroupContext (which also owns the score polling), not from the api directly.
let mockGroup: Record<string, unknown> | null = null;
let mockTeams: unknown[] = [];
let mockMatches: unknown[] = [];
let mockLoading = false;

jest.mock('../../hooks/GroupContext', () => ({
  useGroup: () => ({
    group: mockGroup,
    teams: mockTeams,
    matches: mockMatches,
    loading: mockLoading,
  }),
}));

jest.mock('../../components/NavBar', () => {
  return function MockNavBar({ groupName }: { groupName?: string }) {
    return <div data-testid="navbar">{groupName}</div>;
  };
});
jest.mock('../../components/MatchList', () => {
  return function MockMatchList({ matches }: { matches: unknown[] }) {
    return <div data-testid="match-list">{matches.length} matches</div>;
  };
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockLocalStorage = {
  getItem: jest.fn<string | null, [string]>(() => 'test-group'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

const seedTeams = [
  { teamCode: 'ENG', name: 'England', groupLetter: 'A', fifaRanking: 4, flag: '🏴', eliminated: false, eliminatedAt: null, stats: { played: 3, wins: 2, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 1, goalDifference: 4, points: 7, yellowCards: 0, redCards: 0, possession: 60, xG: 4 } },
  { teamCode: 'GER', name: 'Germany', groupLetter: 'A', fifaRanking: 15, flag: '🇩🇪', eliminated: false, eliminatedAt: null, stats: { played: 3, wins: 1, draws: 1, losses: 1, goalsFor: 3, goalsAgainst: 3, goalDifference: 0, points: 4, yellowCards: 2, redCards: 0, possession: 55, xG: 3 } },
];
const seedMatches = [
  { matchId: '1', homeTeam: 'ENG', awayTeam: 'GER', homeScore: 2, awayScore: 1, status: 'FINISHED', stage: 'GROUP_STAGE', group: 'A', datetime: '2026-06-14T18:00:00Z', venue: 'MetLife' },
];
const seedGroup = { groupKey: 'test', groupName: 'Test', members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }] };

describe('GroupsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('test-group');
    mockGroup = null;
    mockTeams = [];
    mockMatches = [];
    mockLoading = false;
  });

  it('shows loading state while the context loads with no teams yet', () => {
    mockLoading = true;
    render(<GroupsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not flash the loading screen when teams are already populated', () => {
    mockLoading = true;
    mockTeams = seedTeams;
    mockGroup = seedGroup;
    render(<GroupsPage />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Group Stages')).toBeInTheDocument();
  });

  it('redirects to home if no group key', () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    render(<GroupsPage />);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('renders group standings with owners and fixtures from the shared context', () => {
    mockTeams = seedTeams;
    mockMatches = seedMatches;
    mockGroup = seedGroup;

    render(<GroupsPage />);

    expect(screen.getByText('Group Stages')).toBeInTheDocument();
    expect(screen.getByText('England')).toBeInTheDocument();
    expect(screen.getByText('(Alice)')).toBeInTheDocument(); // owner next to their team
    expect(screen.getByText('1 matches')).toBeInTheDocument(); // group A fixture
  });

  it('reflects shared matches updates (poll tick or manual refresh)', () => {
    mockTeams = seedTeams;
    mockGroup = seedGroup;

    const { rerender } = render(<GroupsPage />);
    expect(screen.getByText('0 matches')).toBeInTheDocument();

    // The context replaces the matches array on every poll tick / refresh.
    mockMatches = seedMatches;
    rerender(<GroupsPage />);
    expect(screen.getByText('1 matches')).toBeInTheDocument();
  });
});
