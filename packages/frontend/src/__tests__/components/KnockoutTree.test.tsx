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

  it('fills unscheduled rounds with structural placeholders', () => {
    render(<KnockoutTree matches={[]} />);
    // R32 ties are bracket leaves with no feeder → bare "TBD" (16 ties × 2 sides).
    const r32 = screen.getByTestId('round-column-ROUND_OF_32');
    expect(within(r32).getAllByText('TBD')).toHaveLength(32);
    // Later rounds label each side with the feeding tie. The only R16 "TBD"s are
    // the three sides fed by the already-decided early R32 ties (matches 73-75),
    // left unnumbered because those slots resolve by team in practice.
    const r16 = screen.getByTestId('round-column-ROUND_OF_16');
    expect(within(r16).getAllByText(/Winner Match/)).toHaveLength(13);
    expect(within(r16).getAllByText('TBD')).toHaveLength(3);
    const final = screen.getByTestId('round-column-FINAL');
    expect(within(final).getByText('Winner SF 1')).toBeInTheDocument();
    expect(within(final).getByText('Winner SF 2')).toBeInTheDocument();
  });

  it('places each tie at its fixed bracket slot', () => {
    const matches = [
      makeMatch({ matchId: 'ger', homeTeam: 'GER', awayTeam: 'FRA', datetime: '2026-06-29T20:00:00Z' }),
      makeMatch({ matchId: 'eng', homeTeam: 'ENG', awayTeam: 'BRA', datetime: '2026-06-28T20:00:00Z' }),
    ];
    render(<KnockoutTree matches={matches} />);
    const r32 = screen.getByTestId('round-column-ROUND_OF_32');
    const text = r32.textContent ?? '';
    // GER are R32 slot 0, ENG slot 11 — GER appears first by bracket position,
    // even though ENG kicked off earlier.
    expect(text.indexOf('GER')).toBeLessThan(text.indexOf('ENG'));
    expect(within(r32).getByText('GER')).toBeInTheDocument();
    expect(within(r32).getByText('ENG')).toBeInTheDocument();
  });

  it('orders the R32 column by fixed bracket slot, not kick-off time', () => {
    // RSA/CAN are slot 2, NED/MAR slot 3, BRA/JPN slot 8 in the fixed bracket — so
    // they read RSA, NED, BRA top-to-bottom, even though BRA/JPN kicked off before
    // NED/MAR. The position is structural, never the clock.
    const matches = [
      makeMatch({ matchId: 'rsa-can', homeTeam: 'RSA', awayTeam: 'CAN', homeScore: 0, awayScore: 1, status: 'FINISHED', datetime: '2026-06-28T20:00:00Z' }),
      makeMatch({ matchId: 'bra-jpn', homeTeam: 'BRA', awayTeam: 'JPN', homeScore: 2, awayScore: 1, status: 'FINISHED', datetime: '2026-06-29T18:00:00Z' }),
      makeMatch({ matchId: 'ned-mar', homeTeam: 'NED', awayTeam: 'MAR', homeScore: 0, awayScore: 1, status: 'FINISHED', datetime: '2026-06-30T02:00:00Z' }),
      makeMatch({ matchId: 'r16', stage: 'ROUND_OF_16', homeTeam: 'CAN', awayTeam: 'MAR', status: 'SCHEDULED', datetime: '2026-07-04T17:00:00Z' }),
    ];
    render(<KnockoutTree matches={matches} />);
    const text = screen.getByTestId('round-column-ROUND_OF_32').textContent ?? '';
    expect(text.indexOf('RSA')).toBeLessThan(text.indexOf('NED'));
    expect(text.indexOf('NED')).toBeLessThan(text.indexOf('BRA'));
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
    const r32 = screen.getByTestId('round-column-ROUND_OF_32');
    expect(within(r32).getByText('ENG').closest('div')).toHaveClass('bg-green-900/40');
    expect(within(r32).getByText('BRA').closest('div')).not.toHaveClass('bg-green-900/40');
  });

  it('shows each round\'s real fixtures from the feed', () => {
    // The R16 matchup comes straight from the feed's R16 fixture — not computed
    // from R32 winners (which could pair the wrong teams).
    const matches = [
      makeMatch({ matchId: 'm1', homeTeam: 'RSA', awayTeam: 'CAN', homeScore: 0, awayScore: 1, status: 'FINISHED', datetime: '2026-06-28T19:00:00Z' }),
      makeMatch({ matchId: 'r16', stage: 'ROUND_OF_16', homeTeam: 'CAN', awayTeam: 'MAR', status: 'SCHEDULED', datetime: '2026-07-04T17:00:00Z' }),
    ];
    render(<KnockoutTree matches={matches} />);
    const r16 = screen.getByTestId('round-column-ROUND_OF_16');
    expect(within(r16).getByText('CAN')).toBeInTheDocument();
    expect(within(r16).getByText('MAR')).toBeInTheDocument();
  });

  it('advances a finished tie\'s winner into its next-round slot even with no R16 fixture yet', () => {
    // CAN win their R32 tie. With no R16 fixture from the feed, the winner still
    // drops into its fixed next-round slot (CAN → R16 slot 1, home side) the moment
    // the tie is decided — not waiting on the API to re-list the matchup. The
    // opponent stays an unresolved feeder: we advance a winner onto its own bracket
    // position, never invent a full pairing.
    const matches = [
      makeMatch({ matchId: 'm1', homeTeam: 'RSA', awayTeam: 'CAN', homeScore: 0, awayScore: 1, status: 'FINISHED', datetime: '2026-06-28T19:00:00Z' }),
    ];
    render(<KnockoutTree matches={matches} />);
    const r16 = screen.getByTestId('round-column-ROUND_OF_16');
    expect(within(r16).getByText('CAN')).toBeInTheDocument();
  });

  it('labels an unresolved opponent from its feeder instead of blank', () => {
    const matches = [
      makeMatch({
        matchId: 'r16',
        stage: 'ROUND_OF_16',
        homeTeam: 'PAR',
        awayTeam: '',
        awayFeeder: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 77 },
        status: 'SCHEDULED',
        datetime: '2026-07-04T21:00:00Z',
      }),
    ];
    render(<KnockoutTree matches={matches} />);
    const r16 = screen.getByTestId('round-column-ROUND_OF_16');
    expect(within(r16).getByText('PAR')).toBeInTheDocument();
    expect(within(r16).getByText('Winner Match 77')).toBeInTheDocument();
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

    it('flags a later-round tie the claimed member is in', () => {
      // Alice owns ENG; the feed's R16 fixture has ENG, so it's flagged too.
      const matches = [
        makeMatch({ matchId: 'a', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: 2, awayScore: 0, status: 'FINISHED', datetime: '2026-06-28T20:00:00Z' }),
        makeMatch({ matchId: 'r16', stage: 'ROUND_OF_16', homeTeam: 'ENG', awayTeam: 'GER', status: 'SCHEDULED', datetime: '2026-07-04T20:00:00Z' }),
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
