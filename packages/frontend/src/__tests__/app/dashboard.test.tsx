import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import DashboardPage from '../../app/dashboard/page';

const mockPush = jest.fn();
const mockLoadData = jest.fn();

let mockGroupKey: string | null = 'test-group';
let mockGroup: Record<string, unknown> | null = null;
let mockTeams: unknown[] = [];
const mockMatches: unknown[] = [];
let mockLoading = false;

jest.mock('../../hooks/useGroup', () => ({
  useGroup: () => ({
    groupKey: mockGroupKey,
    group: mockGroup,
    teams: mockTeams,
    matches: mockMatches,
    loading: mockLoading,
    loadData: mockLoadData,
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

jest.mock('../../components/TeamCard', () => {
  return function MockTeamCard({ team }: { team: { teamCode: string } }) {
    return <div data-testid="team-card">{team.teamCode}</div>;
  };
});

jest.mock('../../components/Leaderboard', () => {
  return function MockLeaderboard() {
    return <div data-testid="leaderboard">Leaderboard</div>;
  };
});

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn<string | null, [string]>(() => 'test-group'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupKey = 'test-group';
    mockGroup = {
      groupKey: 'test-group',
      groupName: 'Test Group',
      members: [
        { name: 'Alice', imageUrl: null, teams: ['ENG', 'BRA'] },
        { name: 'Bob', imageUrl: null, teams: ['GER'] },
      ],
    };
    mockTeams = [
      { teamCode: 'ENG', name: 'England', fifaRanking: 4, groupLetter: 'A', flag: '🏴', eliminated: false, eliminatedAt: null, stats: { played: 3, wins: 2, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 1, goalDifference: 4, points: 7, yellowCards: 0, redCards: 0, possession: 60, xG: 4 } },
      { teamCode: 'BRA', name: 'Brazil', fifaRanking: 1, groupLetter: 'B', flag: '🇧🇷', eliminated: false, eliminatedAt: null, stats: { played: 3, wins: 3, draws: 0, losses: 0, goalsFor: 7, goalsAgainst: 2, goalDifference: 5, points: 9, yellowCards: 1, redCards: 0, possession: 65, xG: 6 } },
      { teamCode: 'GER', name: 'Germany', fifaRanking: 15, groupLetter: 'A', flag: '🇩🇪', eliminated: false, eliminatedAt: null, stats: { played: 3, wins: 1, draws: 1, losses: 1, goalsFor: 3, goalsAgainst: 3, goalDifference: 0, points: 4, yellowCards: 2, redCards: 0, possession: 55, xG: 3 } },
    ];
    mockLoading = false;
  });

  it('renders dashboard with group data', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('leaderboard')).toBeInTheDocument();
  });

  it('shows member selector buttons', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockLoading = true;
    mockGroup = null;
    render(<DashboardPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to home if no groupKey and no stored key', () => {
    mockGroupKey = null;
    mockGroup = null;
    mockLocalStorage.getItem.mockReturnValue(null);
    render(<DashboardPage />);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('calls loadData on mount', () => {
    render(<DashboardPage />);
    expect(mockLoadData).toHaveBeenCalled();
  });

  it('shows team cards for selected person', () => {
    render(<DashboardPage />);
    // Alice is selected by default (first member)
    expect(screen.getByText('ENG')).toBeInTheDocument();
    expect(screen.getByText('BRA')).toBeInTheDocument();
  });

  it('returns null when no group and not loading', () => {
    mockGroup = null;
    mockLoading = false;
    const { container } = render(<DashboardPage />);
    expect(container.innerHTML).toBe('');
  });
});
