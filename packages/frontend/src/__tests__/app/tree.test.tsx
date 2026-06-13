import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TreePage from '../../app/tree/page';
import * as api from '../../lib/api';

jest.mock('../../lib/api');
jest.mock('../../components/NavBar', () => {
  return function MockNavBar() {
    return <div data-testid="navbar">NavBar</div>;
  };
});
jest.mock('../../components/TreeView', () => {
  return function MockTreeView({ slots }: { slots: unknown[] }) {
    return <div data-testid="tree-view">{slots.length} slots</div>;
  };
});
jest.mock('../../components/MatchList', () => {
  return function MockMatchList({ matches }: { matches: unknown[] }) {
    return <div data-testid="match-list">{matches.length} matches</div>;
  };
});

// Mutable context state — the page reads group/matches from the shared
// GroupContext (which owns the score polling); only the slots come from the api.
let mockGroup: Record<string, unknown> | null = null;
let mockMatches: unknown[] = [];

jest.mock('../../hooks/GroupContext', () => ({
  useGroup: () => ({
    group: mockGroup,
    matches: mockMatches,
  }),
}));

const mockedApi = api as jest.Mocked<typeof api>;
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockLocalStorage = {
  getItem: jest.fn<string | null, [string]>(() => 'test-group'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

describe('TreePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('test-group');
    mockGroup = { groupKey: 'test', groupName: 'Test', members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }] };
    mockMatches = [];
    mockedApi.getTree.mockResolvedValue([]);
  });

  it('shows loading state initially', () => {
    mockedApi.getTree.mockReturnValue(new Promise(() => {}));
    render(<TreePage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('redirects to home if no group key', async () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    render(<TreePage />);
    expect(mockPush).toHaveBeenCalledWith('/');
    // Flush the in-flight getTree so its state updates land inside the test.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('renders tree view after loading', async () => {
    const slots = [{ round: 'FINAL', position: 1, team1: 'ENG', team2: 'BRA', score1: null, score2: null, winner: null, datetime: null }];
    mockedApi.getTree.mockResolvedValue(slots);
    mockMatches = [{ matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: null, awayScore: null, status: 'SCHEDULED', stage: 'FINAL', group: null, datetime: '2026-07-15T20:00:00Z', venue: 'Stadium' }];

    render(<TreePage />);

    await waitFor(() => {
      expect(screen.getByTestId('tree-view')).toBeInTheDocument();
    });
  });

  it('renders knockout fixtures from the shared matches', async () => {
    mockMatches = [
      { matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: null, awayScore: null, status: 'SCHEDULED', stage: 'QUARTER_FINAL', group: null, datetime: '2026-07-05T18:00:00Z', venue: 'Stadium' },
      { matchId: '2', homeTeam: 'GER', awayTeam: 'FRA', homeScore: null, awayScore: null, status: 'SCHEDULED', stage: 'GROUP_STAGE', group: 'A', datetime: '2026-06-14T18:00:00Z', venue: 'Stadium' },
    ];

    render(<TreePage />);

    await waitFor(() => {
      expect(screen.getByTestId('match-list')).toBeInTheDocument();
      expect(screen.getByText('1 matches')).toBeInTheDocument();
    });
  });

  it('refetches the bracket when the shared matches update (poll tick or refresh)', async () => {
    const liveMatch = { matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: 0, awayScore: 0, status: 'LIVE', stage: 'FINAL', group: null, datetime: '2026-07-15T20:00:00Z', venue: 'Stadium' };
    mockMatches = [liveMatch];

    const { rerender } = render(<TreePage />);
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(mockedApi.getTree).toHaveBeenCalledTimes(1);

    // The context replaces the matches array on every poll tick / refresh —
    // the page must refetch the server-recomputed slots in response.
    mockMatches = [{ ...liveMatch, homeScore: 1 }];
    rerender(<TreePage />);

    await waitFor(() => {
      expect(mockedApi.getTree).toHaveBeenCalledTimes(2);
    });
  });
});
