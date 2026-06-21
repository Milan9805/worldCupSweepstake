import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import TeamCard from '../../components/TeamCard';
import { Match, Team } from '@sweepstake/shared';
import { TeamMatchInfo } from '../../lib/teamMatches';

describe('TeamCard', () => {
  const makeTeam = (overrides: Partial<Team> = {}): Team => ({
    teamCode: 'ENG',
    name: 'England',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    fifaRanking: 4,
    groupLetter: 'A',
    stats: {
      played: 3,
      wins: 2,
      draws: 1,
      losses: 0,
      goalsFor: 5,
      goalsAgainst: 1,
      goalDifference: 4,
      points: 7,
      yellowCards: 2,
      redCards: 0,
      possession: 62,
      xG: 4.5,
    },
    eliminated: false,
    eliminatedAt: null,
    ...overrides,
  });

  it('renders team name and flag', () => {
    render(<TeamCard team={makeTeam()} />);
    expect(screen.getByText('England')).toBeInTheDocument();
    expect(screen.getByText('🏴󠁧󠁢󠁥󠁮󠁧󠁿')).toBeInTheDocument();
  });

  it('shows group letter as a link to /groups and shows ranking', () => {
    render(<TeamCard team={makeTeam()} />);
    const groupLink = screen.getByRole('link', { name: 'Group A' });
    expect(groupLink).toHaveAttribute('href', '/groups?group=A');
    expect(screen.getByText(/#4/)).toBeInTheDocument();
  });

  it('shows stats: points, W/D/L, GD', () => {
    render(<TeamCard team={makeTeam()} />);
    expect(screen.getByText('7')).toBeInTheDocument(); // points
    expect(screen.getByText('2/1/0')).toBeInTheDocument(); // W/D/L
    expect(screen.getByText('+4')).toBeInTheDocument(); // GD
  });

  it('shows where an eliminated team went out via the progress pill', () => {
    const team = makeTeam({ eliminated: true, eliminatedAt: 'ROUND_OF_16' });
    render(<TeamCard team={team} progress={{ label: 'Out · Round of 16', tone: 'OUT' }} />);
    expect(screen.getByText('Out · Round of 16')).toBeInTheDocument();
  });

  it('shows owner name initial when provided', () => {
    render(<TeamCard team={makeTeam()} ownerName="Alice" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows owner image when provided', () => {
    render(
      <TeamCard team={makeTeam()} ownerName="Alice" ownerImage="http://example.com/alice.png" />
    );
    const img = screen.getByAltText('Alice');
    expect(img).toHaveAttribute('src', 'http://example.com/alice.png');
  });

  it('shows negative goal difference without plus sign', () => {
    const team = makeTeam({
      stats: {
        played: 3, wins: 0, draws: 0, losses: 3,
        goalsFor: 1, goalsAgainst: 5, goalDifference: -4,
        points: 0, yellowCards: 3, redCards: 0,
        possession: 35, xG: 1.2,
      },
    });
    render(<TeamCard team={team} />);
    expect(screen.getByText('-4')).toBeInTheDocument();
  });

  it('shows the progress pill when provided', () => {
    render(<TeamCard team={makeTeam()} progress={{ label: '1st in group', tone: 'QUALIFY' }} />);
    expect(screen.getByText('1st in group')).toBeInTheDocument();
  });

  it('shows the current knockout round on the progress pill', () => {
    render(<TeamCard team={makeTeam()} progress={{ label: 'Round of 16', tone: 'ADVANCED' }} />);
    expect(screen.getByText('Round of 16')).toBeInTheDocument();
  });

  describe('match info footer', () => {
    const makeMatch = (overrides: Partial<Match> = {}): Match => ({
      matchId: 'm1',
      homeTeam: 'ENG',
      awayTeam: 'BRA',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
      stage: 'GROUP_STAGE',
      group: 'A',
      datetime: '2026-06-14T18:00:00Z',
      venue: 'MetLife Stadium',
      ...overrides,
    });

    const teamsByCode: Record<string, Team> = {
      BRA: makeTeam({ teamCode: 'BRA', name: 'Brazil', flag: '🇧🇷' }),
    };

    const emptyInfo: TeamMatchInfo = { live: null, next: null, previous: null };

    it('renders nothing when no matchInfo is provided', () => {
      render(<TeamCard team={makeTeam()} />);
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
      expect(screen.queryByText('Last')).not.toBeInTheDocument();
    });

    it('renders nothing when matchInfo has no matches', () => {
      render(<TeamCard team={makeTeam()} matchInfo={emptyInfo} />);
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
      expect(screen.queryByText('Last')).not.toBeInTheDocument();
    });

    it('shows the live game with score and LIVE badge', () => {
      const live = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0 });
      render(
        <TeamCard
          team={makeTeam()}
          matchInfo={{ live, next: null, previous: null }}
          teamsByCode={teamsByCode}
        />
      );
      expect(screen.getByText('LIVE')).toBeInTheDocument();
      expect(screen.getByText('ENG 1 - 0 BRA')).toBeInTheDocument();
    });

    it('shows the live match minute (shared LiveBadge, same as the fixtures list)', () => {
      const live = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: "45'+1" });
      render(
        <TeamCard
          team={makeTeam()}
          matchInfo={{ live, next: null, previous: null }}
          teamsByCode={teamsByCode}
        />
      );
      expect(screen.getByText('LIVE')).toBeInTheDocument();
      expect(screen.getByText("45'+1")).toBeInTheDocument();
    });

    it('prefers the live game over next and previous', () => {
      const live = makeMatch({ status: 'LIVE', homeScore: 2, awayScore: 2 });
      const next = makeMatch({ matchId: 'm2', awayTeam: 'GER', status: 'SCHEDULED' });
      const previous = makeMatch({
        matchId: 'm0',
        status: 'FINISHED',
        homeScore: 3,
        awayScore: 0,
      });
      render(
        <TeamCard
          team={makeTeam()}
          matchInfo={{ live, next, previous }}
          teamsByCode={teamsByCode}
        />
      );
      expect(screen.getByText('LIVE')).toBeInTheDocument();
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
      expect(screen.queryByText('Last')).not.toBeInTheDocument();
    });

    it('shows next fixture with opponent and previous result when no live game', () => {
      const next = makeMatch({ awayTeam: 'BRA', status: 'SCHEDULED' });
      const previous = makeMatch({
        matchId: 'm0',
        awayTeam: 'BRA',
        status: 'FINISHED',
        homeScore: 2,
        awayScore: 1,
      });
      render(
        <TeamCard
          team={makeTeam()}
          matchInfo={{ live: null, next, previous }}
          teamsByCode={teamsByCode}
        />
      );
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText(/vs 🇧🇷 BRA/)).toBeInTheDocument();
      expect(screen.getByText('Last')).toBeInTheDocument();
      expect(screen.getByText(/ENG 2 - 1 BRA/)).toBeInTheDocument();
    });

    it('shows a W tag when the team won the previous game', () => {
      const previous = makeMatch({ status: 'FINISHED', homeScore: 2, awayScore: 1 });
      render(
        <TeamCard team={makeTeam()} matchInfo={{ live: null, next: null, previous }} />
      );
      expect(screen.getByText('W')).toBeInTheDocument();
    });

    it('shows an L tag when the team lost away from home', () => {
      const previous = makeMatch({
        homeTeam: 'BRA',
        awayTeam: 'ENG',
        status: 'FINISHED',
        homeScore: 3,
        awayScore: 0,
      });
      render(
        <TeamCard team={makeTeam()} matchInfo={{ live: null, next: null, previous }} />
      );
      expect(screen.getByText('L')).toBeInTheDocument();
    });

    it('shows the opponent owner on the next fixture when owned', () => {
      const next = makeMatch({ awayTeam: 'BRA', status: 'SCHEDULED' });
      render(
        <TeamCard
          team={makeTeam()}
          matchInfo={{ live: null, next, previous: null }}
          teamsByCode={teamsByCode}
          ownersByTeam={{ BRA: { name: 'Dave', imageUrl: null } }}
        />
      );
      expect(screen.getByText('Dave')).toBeInTheDocument();
    });

    it('shows the opponent owner on the live game', () => {
      const live = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0 });
      render(
        <TeamCard
          team={makeTeam()}
          matchInfo={{ live, next: null, previous: null }}
          teamsByCode={teamsByCode}
          ownersByTeam={{ BRA: { name: 'Dave', imageUrl: null } }}
        />
      );
      expect(screen.getByText('Dave')).toBeInTheDocument();
    });

    it('shows the opponent owner on the last result', () => {
      const previous = makeMatch({ status: 'FINISHED', homeScore: 2, awayScore: 1 });
      render(
        <TeamCard
          team={makeTeam()}
          matchInfo={{ live: null, next: null, previous }}
          teamsByCode={teamsByCode}
          ownersByTeam={{ BRA: { name: 'Dave', imageUrl: null } }}
        />
      );
      expect(screen.getByText('Dave')).toBeInTheDocument();
    });

    it('shows no owner when the opponent is unowned', () => {
      const next = makeMatch({ awayTeam: 'BRA', status: 'SCHEDULED' });
      render(
        <TeamCard
          team={makeTeam()}
          matchInfo={{ live: null, next, previous: null }}
          teamsByCode={teamsByCode}
          ownersByTeam={{}}
        />
      );
      expect(screen.queryByText('Dave')).not.toBeInTheDocument();
    });

    it('renders broadcast channel pills for the next fixture', () => {
      const next = makeMatch({
        status: 'SCHEDULED',
        channels: [{ name: 'ITV1', bg: '#127b60', fg: '#ffffff' }],
      });
      render(
        <TeamCard
          team={makeTeam()}
          matchInfo={{ live: null, next, previous: null }}
          teamsByCode={teamsByCode}
        />
      );
      expect(screen.getByText('ITV1')).toHaveStyle({ backgroundColor: '#127b60' });
    });

    it('shows the group label as a link to /groups?group=A on a live group-stage match', () => {
      const live = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, stage: 'GROUP_STAGE', group: 'A' });
      render(
        <TeamCard team={makeTeam()} matchInfo={{ live, next: null, previous: null }} />
      );
      // Two "Group A" links exist: the header and the footer. The footer link points to the same
      // href; assert at least one footer link has the correct destination.
      const links = screen.getAllByRole('link', { name: 'Group A' });
      expect(links.some((l) => l.getAttribute('href') === '/groups?group=A')).toBe(true);
    });

    it('shows the round label on a live knockout match', () => {
      const live = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, stage: 'QUARTER_FINAL', group: null });
      render(
        <TeamCard team={makeTeam()} matchInfo={{ live, next: null, previous: null }} />
      );
      expect(screen.getByText('Quarter Final')).toBeInTheDocument();
    });

    it('shows the round label on the next fixture for a knockout match', () => {
      const next = makeMatch({ status: 'SCHEDULED', stage: 'SEMI_FINAL', group: null });
      render(
        <TeamCard team={makeTeam()} matchInfo={{ live: null, next, previous: null }} />
      );
      expect(screen.getByText('Semi Final')).toBeInTheDocument();
    });

    it('shows the stage label as a link on the previous result', () => {
      const previous = makeMatch({ status: 'FINISHED', homeScore: 2, awayScore: 1, stage: 'GROUP_STAGE', group: 'A' });
      render(
        <TeamCard team={makeTeam()} matchInfo={{ live: null, next: null, previous }} />
      );
      const links = screen.getAllByRole('link', { name: 'Group A' });
      expect(links.some((l) => l.getAttribute('href') === '/groups?group=A')).toBe(true);
    });
  });
});
