import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import TreePage from '../../app/tree/page';

jest.mock('../../components/NavBar', () => {
  return function MockNavBar() {
    return <div data-testid="navbar">NavBar</div>;
  };
});
jest.mock('../../components/KnockoutTree', () => {
  return function MockKnockoutTree({ matches }: { matches: unknown[] }) {
    return <div data-testid="knockout-tree">{matches.length} knockout matches</div>;
  };
});
jest.mock('../../components/MatchList', () => {
  return function MockMatchList({ matches, showStage, stagePlain, liveFeedHref, claimedPerson }: {
    matches: unknown[];
    showStage?: boolean;
    stagePlain?: boolean;
    liveFeedHref?: string;
    claimedPerson?: string | null;
  }) {
    return (
      <div
        data-testid="match-list"
        data-show-stage={String(!!showStage)}
        data-stage-plain={String(!!stagePlain)}
        data-live-feed-href={liveFeedHref ?? ''}
        data-claimed-person={claimedPerson ?? ''}
      >
        {matches.length} matches
      </div>
    );
  };
});

// The page reads group/teams/matches/loading from the shared GroupContext.
let mockGroup: Record<string, unknown> | null = null;
let mockTeams: unknown[] = [];
let mockMatches: unknown[] = [];
let mockLoading = false;
let mockClaimedPerson: string | null = null;

jest.mock('../../hooks/GroupContext', () => ({
  useGroup: () => ({
    group: mockGroup,
    teams: mockTeams,
    matches: mockMatches,
    claimedPerson: mockClaimedPerson,
    loading: mockLoading,
  }),
}));

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

const makeMatch = (over: Record<string, unknown> = {}) => ({
  matchId: '1',
  homeTeam: 'ENG',
  awayTeam: 'BRA',
  homeScore: null,
  awayScore: null,
  status: 'SCHEDULED',
  stage: 'ROUND_OF_32',
  group: null,
  datetime: '2026-07-05T18:00:00Z',
  venue: 'Stadium',
  ...over,
});

describe('TreePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('test-group');
    mockGroup = { groupKey: 'test', groupName: 'Test', members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }] };
    mockTeams = [{ teamCode: 'ENG', flag: '🏴' }, { teamCode: 'BRA', flag: '🇧🇷' }];
    mockMatches = [];
    mockLoading = false;
    mockClaimedPerson = 'Alice';
  });

  it('shows the loading state on a cold start', () => {
    mockLoading = true;
    mockTeams = [];
    render(<TreePage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('redirects to home if no group key', () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    render(<TreePage />);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('shows the empty state when there are no knockout matches', () => {
    mockMatches = [makeMatch({ stage: 'GROUP_STAGE', group: 'A' })];
    render(<TreePage />);
    expect(screen.getByText('Tree not yet available')).toBeInTheDocument();
    expect(screen.queryByTestId('knockout-tree')).not.toBeInTheDocument();
  });

  it('renders the match-driven tree from the shared knockout matches', () => {
    mockMatches = [
      makeMatch({ matchId: '1', stage: 'ROUND_OF_32' }),
      makeMatch({ matchId: '2', stage: 'GROUP_STAGE', group: 'A' }),
    ];
    render(<TreePage />);
    // Only the one knockout match is passed to the tree (group match excluded).
    expect(screen.getByTestId('knockout-tree')).toHaveTextContent('1 knockout matches');
  });

  it('renders the knockout fixtures list with flags, plain stage label and a live-feed link', () => {
    mockMatches = [makeMatch({ matchId: '1', stage: 'ROUND_OF_32' })];
    render(<TreePage />);
    const list = screen.getByTestId('match-list');
    expect(list).toHaveAttribute('data-show-stage', 'true');
    expect(list).toHaveAttribute('data-stage-plain', 'true');
    expect(list).toHaveAttribute('data-live-feed-href', '/feed');
    // Passes the claimed member through so the list highlights their ties blue.
    expect(list).toHaveAttribute('data-claimed-person', 'Alice');
  });
});
