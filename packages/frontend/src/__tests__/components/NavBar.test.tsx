import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NavBar from '../../components/NavBar';
import { Group, Match, RefreshResponse, Team } from '@sweepstake/shared';

// Mock the useRefresh hook, capturing the callback NavBar wires into it so we
// can assert the manual refresh feeds the shared group state.
jest.mock('../../hooks/useRefresh', () => ({
  useRefresh: (onRefreshed?: (result: RefreshResponse) => void) => {
    mockOnRefreshed = onRefreshed;
    return {
      refresh: mockRefresh,
      isRefreshing: mockIsRefreshing,
      source: mockSource,
    };
  },
}));

// Mock the shared group context (group/teams/matches drive the banner;
// applyRefresh is what the refresh button writes back into).
jest.mock('../../hooks/GroupContext', () => ({
  useGroup: () => ({
    group: mockGroup,
    teams: mockTeams,
    matches: mockMatches,
    applyRefresh: mockApplyRefresh,
  }),
}));

// Mock the identity hook (groups + active group key drive the brand link).
jest.mock('../../hooks/useIdentity', () => ({
  useIdentity: () => ({ groups: mockGroups, activeGroupKey: mockActiveGroupKey }),
}));

// Stub the GroupSwitcher (it has its own hooks/tests).
jest.mock('../../components/GroupSwitcher', () => {
  return function MockGroupSwitcher() {
    return <div data-testid="group-switcher" />;
  };
});

// Mock next/link
jest.mock('next/link', () => {
  return ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  );
});

let mockRefresh: jest.Mock;
let mockIsRefreshing: boolean;
let mockSource: string | null;
let mockOnRefreshed: ((result: RefreshResponse) => void) | undefined;
let mockGroup: Group | null;
let mockTeams: Team[];
let mockMatches: Match[];
let mockApplyRefresh: jest.Mock;
let mockGroups: Array<{ groupKey: string; groupName: string; person: string | null }>;
let mockActiveGroupKey: string | null;

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  matchId: 'm1',
  homeTeam: 'GER',
  awayTeam: 'FRA',
  homeScore: null,
  awayScore: null,
  status: 'SCHEDULED',
  stage: 'GROUP_STAGE',
  group: 'E',
  datetime: new Date(Date.now() + 2 * 3_600_000).toISOString(),
  venue: 'Stadium',
  channels: [],
  minute: null,
  ...overrides,
});

describe('NavBar', () => {
  beforeEach(() => {
    mockRefresh = jest.fn();
    mockIsRefreshing = false;
    mockSource = null;
    mockOnRefreshed = undefined;
    mockGroup = null;
    mockTeams = [];
    mockMatches = [];
    mockApplyRefresh = jest.fn();
    mockGroups = [];
    mockActiveGroupKey = null;
  });

  it('renders the brand name', () => {
    render(<NavBar />);
    expect(screen.getByText(/WC2026/)).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<NavBar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Groups')).toBeInTheDocument();
    expect(screen.getByText('Tree')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('shows group name when provided', () => {
    render(<NavBar groupName="Test Group" />);
    expect(screen.getByText('Test Group')).toBeInTheDocument();
  });

  it('renders refresh button', () => {
    render(<NavBar />);
    // The " Scores" suffix is in a separate span that is hidden on mobile, so
    // match against the button's full accessible name rather than its text node.
    expect(screen.getByRole('button', { name: /Refresh Scores/i })).toBeInTheDocument();
  });

  it('calls refresh when button clicked', () => {
    render(<NavBar />);
    const button = screen.getByRole('button', { name: /Refresh Scores/i });
    fireEvent.click(button);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('wires the manual refresh into the shared group state', () => {
    render(<NavBar />);
    // useRefresh must receive the context's applyRefresh, so a manual
    // "Refresh Scores" updates every page through the provider.
    expect(mockOnRefreshed).toBe(mockApplyRefresh);
  });

  it('shows refreshing state', () => {
    mockIsRefreshing = true;
    render(<NavBar />);
    expect(screen.getByText('Refreshing...')).toBeInTheDocument();
  });

  it('links point to correct routes', () => {
    render(<NavBar />);
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    const groupsLink = screen.getByText('Groups').closest('a');
    expect(groupsLink).toHaveAttribute('href', '/groups');
  });

  it('logo links to / when no group is active', () => {
    render(<NavBar />);
    expect(screen.getByText(/WC2026/).closest('a')).toHaveAttribute('href', '/');
  });

  it('logo links to /dashboard when a group is active', () => {
    mockActiveGroupKey = 'lads-on-tour';
    mockGroups = [{ groupKey: 'lads-on-tour', groupName: 'Lads on Tour', person: 'Dan' }];
    render(<NavBar />);
    expect(screen.getByText(/WC2026/).closest('a')).toHaveAttribute('href', '/dashboard');
  });

  it('shows "via BBC" badge when source is bbc', () => {
    mockSource = 'bbc';
    render(<NavBar />);
    expect(screen.getByText('via BBC')).toBeInTheDocument();
  });

  it('toggles mobile menu open and closed', () => {
    render(<NavBar />);
    const toggle = screen.getByLabelText('Toggle navigation menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Mobile menu duplicates the nav links
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(1);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes mobile menu when a link is clicked', () => {
    render(<NavBar />);
    const toggle = screen.getByLabelText('Toggle navigation menu');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Click a link inside the mobile menu (second occurrence)
    const dashboardLinks = screen.getAllByText('Dashboard');
    fireEvent.click(dashboardLinks[dashboardLinks.length - 1]);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  describe('match banner', () => {
    it('renders no banner when there are no live or upcoming matches', () => {
      mockMatches = [makeMatch({ status: 'FINISHED', homeScore: 1, awayScore: 0 })];
      render(<NavBar />);
      expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
      expect(screen.queryByText(/Next up/i)).not.toBeInTheDocument();
    });

    it('shows the live banner when a match in the shared state is in play', () => {
      mockMatches = [
        makeMatch({
          status: 'LIVE',
          homeScore: 2,
          awayScore: 1,
          minute: "67'",
          datetime: new Date(Date.now() - 3_600_000).toISOString(),
        }),
      ];
      render(<NavBar />);
      expect(screen.getByText('LIVE')).toBeInTheDocument();
      expect(screen.getByText('2 - 1')).toBeInTheDocument();
    });

    it('shows the next-up banner for an upcoming fixture', () => {
      mockMatches = [makeMatch({ status: 'SCHEDULED' })];
      render(<NavBar />);
      expect(screen.getByText(/Next up/i)).toBeInTheDocument();
    });

    it('resolves team owners for the banner from the group members', () => {
      mockGroup = {
        groupKey: 'test',
        groupName: 'Test',
        members: [{ name: 'Milan', imageUrl: null, teams: ['GER'] }],
      };
      mockMatches = [
        makeMatch({
          status: 'LIVE',
          homeScore: 0,
          awayScore: 0,
          minute: "12'",
          datetime: new Date(Date.now() - 600_000).toISOString(),
        }),
      ];
      render(<NavBar />);
      expect(screen.getByText('Milan')).toBeInTheDocument();
    });
  });
});
