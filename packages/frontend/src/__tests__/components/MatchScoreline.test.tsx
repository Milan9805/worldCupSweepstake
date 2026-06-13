import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Match } from '@sweepstake/shared';
import MatchScoreline from '../../components/MatchScoreline';

function makeMatch(over: Partial<Match>): Match {
  return {
    matchId: 'm1',
    homeTeam: 'ENG',
    awayTeam: 'GER',
    homeScore: null,
    awayScore: null,
    status: 'SCHEDULED',
    stage: 'GROUP_STAGE',
    group: 'A',
    datetime: '2026-06-12T18:00:00Z',
    venue: 'Wembley',
    ...over,
  };
}

const FLAGS = { ENG: '🏴', GER: '🇩🇪' };
const OWNERS = { ENG: { name: 'Alice', imageUrl: null }, GER: { name: 'Bob', imageUrl: null } };

describe('MatchScoreline', () => {
  it('shows both team codes and flags', () => {
    render(<MatchScoreline match={makeMatch({})} teamFlags={FLAGS} />);
    expect(screen.getByText('ENG')).toBeInTheDocument();
    expect(screen.getByText('GER')).toBeInTheDocument();
    expect(screen.getByText('🏴')).toBeInTheDocument();
  });

  it('shows "vs" before kick-off and the scoreline once underway', () => {
    const { rerender } = render(<MatchScoreline match={makeMatch({ status: 'SCHEDULED' })} />);
    expect(screen.getByText('vs')).toBeInTheDocument();

    rerender(
      <MatchScoreline match={makeMatch({ status: 'LIVE', homeScore: 2, awayScore: 1 })} />,
    );
    expect(screen.queryByText('vs')).not.toBeInTheDocument();
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
  });

  it('renders owner brackets when owners are supplied', () => {
    render(<MatchScoreline match={makeMatch({})} teamFlags={FLAGS} teamOwners={OWNERS} />);
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
    expect(screen.getByText('(Bob)')).toBeInTheDocument();
  });

  it('renders no owner brackets when owners are absent', () => {
    render(<MatchScoreline match={makeMatch({})} teamFlags={FLAGS} />);
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  });
});
