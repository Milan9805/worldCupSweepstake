import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import GroupsPage from '../../app/groups/page';
import * as api from '../../lib/api';

jest.mock('../../lib/api');
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

describe('GroupsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('test-group');
  });

  it('shows loading state initially', () => {
    mockedApi.getMatches.mockReturnValue(new Promise(() => {}));
    mockedApi.getTeams.mockReturnValue(new Promise(() => {}));
    mockedApi.getGroup.mockReturnValue(new Promise(() => {}));

    render(<GroupsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to home if no group key', () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    render(<GroupsPage />);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('renders group standings after loading', async () => {
    const teams = [
      { teamCode: 'ENG', name: 'England', groupLetter: 'A', fifaRanking: 4, flag: '🏴', eliminated: false, eliminatedAt: null, stats: { played: 3, wins: 2, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 1, goalDifference: 4, points: 7, yellowCards: 0, redCards: 0, possession: 60, xG: 4 } },
      { teamCode: 'GER', name: 'Germany', groupLetter: 'A', fifaRanking: 15, flag: '🇩🇪', eliminated: false, eliminatedAt: null, stats: { played: 3, wins: 1, draws: 1, losses: 1, goalsFor: 3, goalsAgainst: 3, goalDifference: 0, points: 4, yellowCards: 2, redCards: 0, possession: 55, xG: 3 } },
    ];
    const matches = [
      { matchId: '1', homeTeam: 'ENG', awayTeam: 'GER', homeScore: 2, awayScore: 1, status: 'FINISHED', stage: 'GROUP_STAGE', group: 'A', datetime: '2026-06-14T18:00:00Z', venue: 'MetLife' },
    ];
    const group = { groupKey: 'test', groupName: 'Test', members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }] };

    mockedApi.getMatches.mockResolvedValue(matches);
    mockedApi.getTeams.mockResolvedValue(teams);
    mockedApi.getGroup.mockResolvedValue(group);

    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Group Stages')).toBeInTheDocument();
    });
  });
});
