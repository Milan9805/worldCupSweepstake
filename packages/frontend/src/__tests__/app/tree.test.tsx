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
  });

  it('shows loading state initially', () => {
    mockedApi.getTree.mockReturnValue(new Promise(() => {}));
    mockedApi.getGroup.mockReturnValue(new Promise(() => {}));
    mockedApi.getMatches.mockReturnValue(new Promise(() => {}));
    render(<TreePage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to home if no group key', () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    render(<TreePage />);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('renders tree view after loading', async () => {
    const slots = [{ round: 'FINAL', position: 1, team1: 'ENG', team2: 'BRA', score1: null, score2: null, winner: null, datetime: null }];
    const group = { groupKey: 'test', groupName: 'Test', members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }] };
    const matches = [{ matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: null, awayScore: null, status: 'SCHEDULED', stage: 'FINAL', group: null, datetime: '2026-07-15T20:00:00Z', venue: 'Stadium' }];

    mockedApi.getTree.mockResolvedValue(slots);
    mockedApi.getGroup.mockResolvedValue(group);
    mockedApi.getMatches.mockResolvedValue(matches);

    render(<TreePage />);

    await waitFor(() => {
      expect(screen.getByTestId('tree-view')).toBeInTheDocument();
    });
  });

  it('renders knockout fixtures from matches endpoint', async () => {
    const slots = [];
    const group = { groupKey: 'test', groupName: 'Test', members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }] };
    const matches = [
      { matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: null, awayScore: null, status: 'SCHEDULED', stage: 'QUARTER_FINAL', group: null, datetime: '2026-07-05T18:00:00Z', venue: 'Stadium' },
      { matchId: '2', homeTeam: 'GER', awayTeam: 'FRA', homeScore: null, awayScore: null, status: 'SCHEDULED', stage: 'GROUP_STAGE', group: 'A', datetime: '2026-06-14T18:00:00Z', venue: 'Stadium' },
    ];

    mockedApi.getTree.mockResolvedValue(slots);
    mockedApi.getGroup.mockResolvedValue(group);
    mockedApi.getMatches.mockResolvedValue(matches);

    render(<TreePage />);

    await waitFor(() => {
      expect(screen.getByTestId('match-list')).toBeInTheDocument();
      expect(screen.getByText('1 matches')).toBeInTheDocument();
    });
  });
});
