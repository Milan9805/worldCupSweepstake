import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import KnockoutTree from '../../components/KnockoutTree';
import { Match } from '@sweepstake/shared';

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  matchId: '1',
  homeTeam: 'ENG',
  awayTeam: 'BRA',
  homeScore: null,
  awayScore: null,
  status: 'SCHEDULED',
  stage: 'ROUND_OF_32',
  group: null,
  datetime: '2026-06-28T20:00:00Z',
  venue: 'Stadium',
  ...overrides,
});

describe('KnockoutTree', () => {
  it('renders a column for every round', () => {
    render(<KnockoutTree matches={[]} />);
    expect(screen.getByText('Round of 32')).toBeInTheDocument();
    expect(screen.getByText('Round of 16')).toBeInTheDocument();
    expect(screen.getByText('Quarter Finals')).toBeInTheDocument();
    expect(screen.getByText('Semi Finals')).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('fills unscheduled rounds with the right number of placeholder cards', () => {
    render(<KnockoutTree matches={[]} />);
    // Round of 16 has 8 ties → 8 placeholder cards, each with two TBD rows.
    const r16 = screen.getByTestId('round-column-ROUND_OF_16');
    expect(within(r16).getAllByText('TBD')).toHaveLength(16);
    // The Final has a single tie.
    const final = screen.getByTestId('round-column-FINAL');
    expect(within(final).getAllByText('TBD')).toHaveLength(2);
  });

  it('places matches in their round column, ordered by kick-off time', () => {
    const matches = [
      makeMatch({ matchId: 'late', homeTeam: 'GER', awayTeam: 'FRA', datetime: '2026-06-29T20:00:00Z' }),
      makeMatch({ matchId: 'early', homeTeam: 'ENG', awayTeam: 'BRA', datetime: '2026-06-28T20:00:00Z' }),
    ];
    render(<KnockoutTree matches={matches} />);
    const r32 = screen.getByTestId('round-column-ROUND_OF_32');
    const text = r32.textContent ?? '';
    expect(text.indexOf('ENG')).toBeLessThan(text.indexOf('GER'));
    // A real tie replaces the placeholders in that round.
    expect(within(r32).queryByText('TBD')).not.toBeInTheDocument();
  });

  it('shows flags, owners and the kick-off time on a tie', () => {
    const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
    render(
      <KnockoutTree
        matches={matches}
        teamOwners={{ ENG: { name: 'Alice', imageUrl: null }, BRA: { name: 'Bob', imageUrl: null } }}
        teamFlags={{ ENG: '🏴', BRA: '🇧🇷' }}
      />,
    );
    const r32 = screen.getByTestId('round-column-ROUND_OF_32');
    expect(within(r32).getByText('🏴')).toBeInTheDocument();
    expect(within(r32).getByText('(Alice)')).toBeInTheDocument();
    expect(within(r32).getByText('(Bob)')).toBeInTheDocument();
    expect(within(r32).getByText(/28 Jun/)).toBeInTheDocument();
  });

  it('shows the live badge linked to the feed for a live tie', () => {
    const matches = [makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: "23'" })];
    render(<KnockoutTree matches={matches} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText("23'")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /watch this live match/i })).toHaveAttribute('href', '/feed');
  });

  it('highlights the winner and shows FT on a finished tie', () => {
    const matches = [makeMatch({ status: 'FINISHED', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: 2, awayScore: 1 })];
    render(<KnockoutTree matches={matches} />);
    expect(screen.getByText('FT')).toBeInTheDocument();
    // The winning side's row carries the green highlight; the loser's does not.
    // Scoped to the Round of 32 column because the winner (ENG) now also appears
    // in the calculated Round of 16.
    const r32 = screen.getByTestId('round-column-ROUND_OF_32');
    expect(within(r32).getByText('ENG').closest('div')).toHaveClass('bg-green-900/40');
    expect(within(r32).getByText('BRA').closest('div')).not.toHaveClass('bg-green-900/40');
  });

  it('advances the winners of finished ties into the next round', () => {
    // RSA-CAN (CAN win) is the earlier R32 tie, BRA-JPN (BRA win) the later one,
    // so both winners feed the same Round of 16 tie.
    const matches = [
      makeMatch({ matchId: 'm1', homeTeam: 'RSA', awayTeam: 'CAN', homeScore: 0, awayScore: 1, status: 'FINISHED', datetime: '2026-06-28T19:00:00Z' }),
      makeMatch({ matchId: 'm2', homeTeam: 'BRA', awayTeam: 'JPN', homeScore: 2, awayScore: 1, status: 'FINISHED', datetime: '2026-06-29T18:00:00Z' }),
    ];
    render(<KnockoutTree matches={matches} />);
    const r16 = screen.getByTestId('round-column-ROUND_OF_16');
    expect(within(r16).getByText('CAN')).toBeInTheDocument();
    expect(within(r16).getByText('BRA')).toBeInTheDocument();
    // The eliminated sides do not advance.
    expect(within(r16).queryByText('JPN')).not.toBeInTheDocument();
    expect(within(r16).queryByText('RSA')).not.toBeInTheDocument();
  });

  describe('claimed-member highlight', () => {
    const owners = {
      ENG: { name: 'Alice', imageUrl: null },
      BRA: { name: 'Bob', imageUrl: null },
      GER: { name: 'Bob', imageUrl: null },
      FRA: { name: 'Bob', imageUrl: null },
    };

    it('flags a tie the claimed member owns a team in', () => {
      const matches = [
        makeMatch({ matchId: 'a', homeTeam: 'ENG', awayTeam: 'BRA', datetime: '2026-06-28T20:00:00Z' }),
        makeMatch({ matchId: 'b', homeTeam: 'GER', awayTeam: 'FRA', datetime: '2026-06-29T20:00:00Z' }),
      ];
      render(<KnockoutTree matches={matches} teamOwners={owners} claimedPerson="Alice" />);
      const r32 = screen.getByTestId('round-column-ROUND_OF_32');
      // Alice owns ENG → the ENG/BRA tie is flagged; the GER/FRA tie (all Bob) is not.
      expect(within(r32).getByText('ENG').closest('[data-involves-claimed]'))
        .toHaveAttribute('data-involves-claimed', 'true');
      expect(within(r32).getByText('GER').closest('[data-involves-claimed]'))
        .toHaveAttribute('data-involves-claimed', 'false');
    });

    it('flags nothing when no member is claimed', () => {
      const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
      render(<KnockoutTree matches={matches} teamOwners={owners} />);
      expect(screen.getByText('ENG').closest('[data-involves-claimed]'))
        .toHaveAttribute('data-involves-claimed', 'false');
    });

    it('flags a calculated next-round tie the claimed member advances into', () => {
      // Alice owns ENG; ENG wins its R32 tie, so the derived R16 tie is flagged too.
      const matches = [
        makeMatch({ matchId: 'a', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: 2, awayScore: 0, status: 'FINISHED', datetime: '2026-06-28T20:00:00Z' }),
      ];
      render(<KnockoutTree matches={matches} teamOwners={owners} claimedPerson="Alice" />);
      const r16 = screen.getByTestId('round-column-ROUND_OF_16');
      expect(within(r16).getByText('ENG').closest('[data-involves-claimed]'))
        .toHaveAttribute('data-involves-claimed', 'true');
    });
  });

  it('shows no score for a scheduled tie', () => {
    const matches = [makeMatch({ status: 'SCHEDULED', homeTeam: 'ENG', awayTeam: 'BRA' })];
    render(<KnockoutTree matches={matches} />);
    const r32 = screen.getByTestId('round-column-ROUND_OF_32');
    // No FT badge and no live badge on a scheduled tie.
    expect(within(r32).queryByText('FT')).not.toBeInTheDocument();
    expect(within(r32).queryByText('LIVE')).not.toBeInTheDocument();
  });
});
