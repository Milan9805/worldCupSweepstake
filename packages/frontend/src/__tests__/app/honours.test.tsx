import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import HonoursPage from '../../app/honours/page';

const mockPush = jest.fn();

let mockGroupKey: string | null = 'test-group';
let mockGroup: Record<string, unknown> | null = null;
let mockTeams: unknown[] = [];
let mockLoading = false;
let mockClaimedPerson: string | null = null;

jest.mock('../../hooks/GroupContext', () => ({
  useGroup: () => ({
    groupKey: mockGroupKey,
    group: mockGroup,
    teams: mockTeams,
    loading: mockLoading,
    claimedPerson: mockClaimedPerson,
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

const mockLocalStorage = {
  getItem: jest.fn<string | null, [string]>(() => 'test-group'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

const makeStats = (overrides: Record<string, number> = {}) => ({
  played: 3,
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
  ...overrides,
});

const TEAMS = [
  { teamCode: 'BRA', name: 'Brazil', fifaRanking: 1, groupLetter: 'A', flag: '🇧🇷', eliminated: false, eliminatedAt: null, stats: makeStats({ goalsFor: 6, goalsAgainst: 1, points: 9, yellowCards: 1 }) },
  { teamCode: 'ENG', name: 'England', fifaRanking: 4, groupLetter: 'B', flag: '🏴', eliminated: true, eliminatedAt: 'Round of 16', stats: makeStats({ goalsFor: 2, goalsAgainst: 2, points: 3, yellowCards: 3, redCards: 1 }) },
  { teamCode: 'JPN', name: 'Japan', fifaRanking: 20, groupLetter: 'C', flag: '🇯🇵', eliminated: true, eliminatedAt: 'Group Stage', stats: makeStats({ goalsFor: 0, goalsAgainst: 9, points: 0, redCards: 2 }) },
];

const GROUP = {
  groupKey: 'test-group',
  groupName: 'Test Group',
  members: [
    { name: 'Alice', imageUrl: null, teams: ['BRA', 'ENG'] },
    { name: 'Bob', imageUrl: null, teams: ['JPN'] },
  ],
};

// Locate a rendered prize card by its `data-prize` id.
const cardFor = (id: string): HTMLElement =>
  screen.getAllByTestId('prize-card').find((c) => c.getAttribute('data-prize') === id)!;

describe('HonoursPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupKey = 'test-group';
    mockGroup = GROUP;
    mockTeams = TEAMS;
    mockLoading = false;
    mockClaimedPerson = null;
    mockLocalStorage.getItem.mockReturnValue('test-group');
  });

  it('renders the page title and one card per prize', () => {
    render(<HonoursPage />);
    expect(screen.getByText('🏅 Honours Board')).toBeInTheDocument();
    // 6 prizes: most goals, best defence, cleanest, dirtiest, best group, deepest run.
    expect(screen.getAllByTestId('prize-card')).toHaveLength(6);
  });

  it('renders each prize title', () => {
    render(<HonoursPage />);
    // Titles are prefixed with an emoji text node, so match on substring.
    expect(screen.getByText(/Most Goals/)).toBeInTheDocument();
    expect(screen.getByText(/Best Defence/)).toBeInTheDocument();
    expect(screen.getByText(/Cleanest/)).toBeInTheDocument();
    expect(screen.getByText(/Dirtiest/)).toBeInTheDocument();
    expect(screen.getByText(/Best Group-Stage Record/)).toBeInTheDocument();
    expect(screen.getByText(/Deepest Run/)).toBeInTheDocument();
  });

  it('shows Alice as the Most Goals winner (8 goals)', () => {
    render(<HonoursPage />);
    const card = cardFor('mostGoals');
    const winner = within(card).getByTestId('prize-winner');
    expect(within(winner).getByText('Alice')).toBeInTheDocument();
    expect(within(winner).getByText('8')).toBeInTheDocument();
  });

  it("highlights the claimed person's row when they win a prize", () => {
    mockClaimedPerson = 'Alice';
    render(<HonoursPage />);
    // Alice wins Most Goals → her winner row is flagged as claimed.
    const card = cardFor('mostGoals');
    const winner = within(card).getByTestId('prize-winner');
    expect(winner.getAttribute('data-claimed')).toBe('true');
  });

  it("highlights the claimed person as a runner-up", () => {
    mockClaimedPerson = 'Bob';
    render(<HonoursPage />);
    // Bob is not the Most Goals winner; he should appear as a highlighted runner-up.
    const card = cardFor('mostGoals');
    const runnerUp = within(card).getByTestId('prize-runner-up');
    expect(runnerUp.getAttribute('data-claimed')).toBe('true');
    expect(within(runnerUp).getByText('Bob')).toBeInTheDocument();
  });

  it('shows a stage label for the Deepest Run prize', () => {
    render(<HonoursPage />);
    const card = cardFor('deepestRun');
    const winner = within(card).getByTestId('prize-winner');
    // Alice owns BRA (alive) → "Still in".
    expect(within(winner).getByText('Still in')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockLoading = true;
    mockGroup = null;
    render(<HonoursPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('returns null when no group and not loading', () => {
    mockGroup = null;
    mockLoading = false;
    const { container } = render(<HonoursPage />);
    expect(container.innerHTML).toBe('');
  });

  it('redirects to home when there is no group key and none stored', () => {
    mockGroupKey = null;
    mockGroup = null;
    mockLoading = false;
    mockLocalStorage.getItem.mockReturnValue(null);
    render(<HonoursPage />);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('shows an empty state when the group has no members', () => {
    mockGroup = { groupKey: 'test-group', groupName: 'Empty', members: [] };
    render(<HonoursPage />);
    expect(screen.getByText(/No members in this group yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('prize-card')).not.toBeInTheDocument();
  });
});
