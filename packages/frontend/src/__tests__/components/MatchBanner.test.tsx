import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import MatchBanner from '../../components/MatchBanner';
import { Match, Team } from '@sweepstake/shared';

const NOW = Date.parse('2026-06-12T10:00:00Z');
const H = 3_600_000;
const M = 60_000;
const D = 86_400_000;

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
  teamCode: 'GER',
  name: 'Germany',
  flag: '🇩🇪',
  fifaRanking: 10,
  groupLetter: 'E',
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
  eliminated: false,
  eliminatedAt: null,
  ...overrides,
});

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  matchId: 'm1',
  homeTeam: 'GER',
  awayTeam: 'FRA',
  homeScore: null,
  awayScore: null,
  status: 'SCHEDULED',
  stage: 'GROUP_STAGE',
  group: 'E',
  datetime: new Date(NOW + 2 * H + 15 * M).toISOString(),
  venue: 'Stadium',
  channels: [],
  minute: null,
  ...overrides,
});

const teamsByCode: Record<string, Team> = {
  GER: makeTeam({ teamCode: 'GER', name: 'Germany', flag: '🇩🇪' }),
  FRA: makeTeam({ teamCode: 'FRA', name: 'France', flag: '🇫🇷' }),
  BRA: makeTeam({ teamCode: 'BRA', name: 'Brazil', flag: '🇧🇷' }),
  ARG: makeTeam({ teamCode: 'ARG', name: 'Argentina', flag: '🇦🇷' }),
};

const owners = {
  GER: { name: 'Milan', imageUrl: null },
  FRA: { name: 'Dad', imageUrl: null },
  BRA: { name: 'Anokhi', imageUrl: null },
  ARG: { name: 'Vishal', imageUrl: null },
};

describe('MatchBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when there are no live or upcoming matches', () => {
    const finished = makeMatch({ status: 'FINISHED', homeScore: 1, awayScore: 0 });
    const { container } = render(
      <MatchBanner matches={[finished]} teamsByCode={teamsByCode} ownersByTeam={owners} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for an empty fixture list', () => {
    const { container } = render(
      <MatchBanner matches={[]} teamsByCode={teamsByCode} ownersByTeam={owners} />
    );
    expect(container.firstChild).toBeNull();
  });

  describe('next match (nothing live)', () => {
    const next = makeMatch({
      status: 'SCHEDULED',
      datetime: new Date(NOW + 2 * H + 15 * M).toISOString(),
      channels: [{ name: 'ITV1', bg: '#127b60', fg: '#ffffff' }],
    });

    it('labels the soonest upcoming fixture as "Next up"', () => {
      render(<MatchBanner matches={[next]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getByText(/Next up/i)).toBeInTheDocument();
    });

    it('shows both teams with flags', () => {
      render(<MatchBanner matches={[next]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getByText('🇩🇪 GER')).toBeInTheDocument();
      expect(screen.getByText('🇫🇷 FRA')).toBeInTheDocument();
    });

    it('shows a live countdown to kick-off', () => {
      render(<MatchBanner matches={[next]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getByText('in 2h 15m')).toBeInTheDocument();
    });

    it('ticks the countdown down as time passes', () => {
      render(<MatchBanner matches={[next]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getByText('in 2h 15m')).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(M);
      });
      expect(screen.getByText('in 2h 14m')).toBeInTheDocument();
    });

    it('shows the broadcast channel pills', () => {
      render(<MatchBanner matches={[next]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getByText('ITV1')).toBeInTheDocument();
    });

    it('shows the owners of both teams', () => {
      render(<MatchBanner matches={[next]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getByText('Milan')).toBeInTheDocument();
      expect(screen.getByText('Dad')).toBeInTheDocument();
    });

    it('omits an owner tag for an unowned team', () => {
      render(
        <MatchBanner matches={[next]} teamsByCode={teamsByCode} ownersByTeam={{ GER: owners.GER }} />
      );
      expect(screen.getByText('Milan')).toBeInTheDocument();
      expect(screen.queryByText('Dad')).not.toBeInTheDocument();
    });

    it('omits the owner tag when only the away team is owned', () => {
      render(
        <MatchBanner matches={[next]} teamsByCode={teamsByCode} ownersByTeam={{ FRA: owners.FRA }} />
      );
      expect(screen.getByText('Dad')).toBeInTheDocument();
      expect(screen.queryByText('Milan')).not.toBeInTheDocument();
    });

    it('falls back to the team code when the team is unknown', () => {
      const unknown = makeMatch({ homeTeam: 'GER', awayTeam: 'XYZ', status: 'SCHEDULED' });
      render(<MatchBanner matches={[unknown]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getByText('XYZ')).toBeInTheDocument();
    });

    it('picks the soonest of several upcoming fixtures', () => {
      const later = makeMatch({
        matchId: 'later',
        homeTeam: 'BRA',
        awayTeam: 'ARG',
        status: 'SCHEDULED',
        datetime: new Date(NOW + 2 * D).toISOString(),
      });
      render(<MatchBanner matches={[later, next]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      // `next` (GER v FRA, ~2h away) wins over `later` (BRA v ARG, 2 days away).
      expect(screen.getByText('🇩🇪 GER')).toBeInTheDocument();
      expect(screen.queryByText('🇧🇷 BRA')).not.toBeInTheDocument();
    });
  });

  describe('live matches', () => {
    const liveA = makeMatch({
      matchId: 'a',
      homeTeam: 'GER',
      awayTeam: 'FRA',
      status: 'LIVE',
      homeScore: 2,
      awayScore: 1,
      minute: "67'",
      datetime: new Date(NOW - H).toISOString(),
    });
    const liveB = makeMatch({
      matchId: 'b',
      homeTeam: 'BRA',
      awayTeam: 'ARG',
      status: 'LIVE',
      homeScore: 0,
      awayScore: 0,
      minute: 'HT',
      datetime: new Date(NOW - 30 * M).toISOString(),
    });

    it('shows a LIVE badge for every match in play', () => {
      render(<MatchBanner matches={[liveA, liveB]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getAllByText('LIVE')).toHaveLength(2);
    });

    it('shows the live minute for each match', () => {
      render(<MatchBanner matches={[liveA, liveB]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getByText("67'")).toBeInTheDocument();
      expect(screen.getByText('HT')).toBeInTheDocument();
    });

    it('shows the live scoreline for each match', () => {
      render(<MatchBanner matches={[liveA, liveB]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      expect(screen.getByText('2 - 1')).toBeInTheDocument();
      expect(screen.getByText('0 - 0')).toBeInTheDocument();
    });

    it('shows the owners of the teams in play', () => {
      render(<MatchBanner matches={[liveA, liveB]} teamsByCode={teamsByCode} ownersByTeam={owners} />);
      ['Milan', 'Dad', 'Anokhi', 'Vishal'].forEach((name) =>
        expect(screen.getByText(name)).toBeInTheDocument()
      );
    });

    it('shows 0 - 0 and no owner tag for a just-kicked-off, unowned live match', () => {
      const fresh = makeMatch({
        matchId: 'fresh',
        homeTeam: 'GER',
        awayTeam: 'FRA',
        status: 'LIVE',
        homeScore: null,
        awayScore: null,
        minute: "1'",
        datetime: new Date(NOW - M).toISOString(),
      });
      render(<MatchBanner matches={[fresh]} teamsByCode={teamsByCode} ownersByTeam={{}} />);
      expect(screen.getByText('0 - 0')).toBeInTheDocument();
      expect(screen.queryByText('Milan')).not.toBeInTheDocument();
    });

    it('shows live matches and hides the "Next up" fixture when something is in play', () => {
      const scheduled = makeMatch({
        matchId: 's',
        homeTeam: 'BRA',
        awayTeam: 'ARG',
        status: 'SCHEDULED',
        datetime: new Date(NOW + H).toISOString(),
      });
      render(
        <MatchBanner matches={[liveA, scheduled]} teamsByCode={teamsByCode} ownersByTeam={owners} />
      );
      expect(screen.getByText('LIVE')).toBeInTheDocument();
      expect(screen.queryByText(/Next up/i)).not.toBeInTheDocument();
    });
  });
});
