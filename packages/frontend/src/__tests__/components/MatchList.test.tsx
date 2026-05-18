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

  it('shows team owner initials when teamOwners provided', () => {
    const matches = [makeMatch({ homeTeam: 'ENG' })];
    const teamOwners = { ENG: { name: 'Alice', imageUrl: null } };
    render(<MatchList matches={matches} teamOwners={teamOwners} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows full team owner name next to team code', () => {
    const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
    const teamOwners = {
      ENG: { name: 'Alice', imageUrl: null },
      BRA: { name: 'Bob', imageUrl: null },
    };
    render(<MatchList matches={matches} teamOwners={teamOwners} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});
