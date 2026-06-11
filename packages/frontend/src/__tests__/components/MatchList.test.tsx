import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import MatchList from '../../components/MatchList';
import { Match } from '@sweepstake/shared';

describe('MatchList', () => {
  const makeMatch = (overrides: Partial<Match> = {}): Match => ({
    matchId: '1',
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

  it('renders match teams', () => {
    const matches = [makeMatch()];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('ENG')).toBeInTheDocument();
    expect(screen.getByText('BRA')).toBeInTheDocument();
  });

  it('shows "vs" for scheduled matches', () => {
    const matches = [makeMatch({ status: 'SCHEDULED' })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('vs')).toBeInTheDocument();
  });

  it('shows score for finished matches', () => {
    const matches = [makeMatch({ status: 'FINISHED', homeScore: 2, awayScore: 1 })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
  });

  it('shows LIVE badge for live matches', () => {
    const matches = [makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0 })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('shows the live minute alongside the LIVE badge', () => {
    const matches = [makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: "19'" })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText("19'")).toBeInTheDocument();
  });

  it('does not show a stale minute on a finished match', () => {
    const matches = [makeMatch({ status: 'FINISHED', homeScore: 2, awayScore: 1, minute: "90'" })];
    render(<MatchList matches={matches} />);
    expect(screen.queryByText("90'")).not.toBeInTheDocument();
  });

  it('shows FT badge for finished matches', () => {
    const matches = [makeMatch({ status: 'FINISHED', homeScore: 3, awayScore: 2 })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('FT')).toBeInTheDocument();
  });

  it('renders multiple matches', () => {
    const matches = [
      makeMatch({ matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA' }),
      makeMatch({ matchId: '2', homeTeam: 'GER', awayTeam: 'FRA' }),
    ];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('ENG')).toBeInTheDocument();
    expect(screen.getByText('GER')).toBeInTheDocument();
  });

  it('renders empty list without crashing', () => {
    const { container } = render(<MatchList matches={[]} />);
    expect(container).toBeInTheDocument();
  });

  it('shows the team owner name in brackets when teamOwners provided', () => {
    const matches = [makeMatch({ homeTeam: 'ENG' })];
    const teamOwners = { ENG: { name: 'Alice', imageUrl: null } };
    render(<MatchList matches={matches} teamOwners={teamOwners} />);
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
  });

  it('shows team flags when teamFlags provided', () => {
    const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
    const teamFlags = { ENG: '🏴', BRA: '🇧🇷' };
    render(<MatchList matches={matches} teamFlags={teamFlags} />);
    expect(screen.getByText('🏴')).toBeInTheDocument();
    expect(screen.getByText('🇧🇷')).toBeInTheDocument();
  });

  it('shows both team owners under their team codes', () => {
    const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
    const teamOwners = {
      ENG: { name: 'Alice', imageUrl: null },
      BRA: { name: 'Bob', imageUrl: null },
    };
    render(<MatchList matches={matches} teamOwners={teamOwners} />);
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
    expect(screen.getByText('(Bob)')).toBeInTheDocument();
  });

  it('renders broadcast channel pills when channels are present', () => {
    const matches = [
      makeMatch({
        channels: [
          { name: 'ITV1', bg: '#127b60', fg: 'rgba(255, 255, 255, 1.0)' },
          { name: 'STV', bg: '#032baa', fg: '#fafafa' },
          { name: 'ITVX', bg: '#102c3e', fg: '#deeb52' },
        ],
      }),
    ];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('ITV1')).toBeInTheDocument();
    expect(screen.getByText('STV')).toBeInTheDocument();
    expect(screen.getByText('ITVX')).toBeInTheDocument();
  });

  it('applies each channel’s scraped brand colours', () => {
    const matches = [
      makeMatch({
        channels: [
          { name: 'ITV1', bg: '#127b60', fg: 'rgba(255, 255, 255, 1.0)' },
          { name: 'ITVX', bg: '#102c3e', fg: '#deeb52' },
        ],
      }),
    ];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('ITV1')).toHaveStyle({
      backgroundColor: '#127b60',
      color: 'rgba(255, 255, 255, 1.0)',
    });
    expect(screen.getByText('ITVX')).toHaveStyle({ backgroundColor: '#102c3e', color: '#deeb52' });
  });

  it('falls back to default colours when a channel has none', () => {
    const matches = [makeMatch({ channels: [{ name: 'Mystery TV', bg: '', fg: '' }] })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('Mystery TV')).toHaveStyle({
      backgroundColor: '#374151',
      color: '#ffffff',
    });
  });

  it('renders no channel pills when channels are absent or empty', () => {
    const { rerender } = render(<MatchList matches={[makeMatch()]} />);
    expect(screen.queryByText('ITV1')).not.toBeInTheDocument();
    rerender(<MatchList matches={[makeMatch({ channels: [] })]} />);
    expect(screen.queryByText('ITV1')).not.toBeInTheDocument();
  });
});
