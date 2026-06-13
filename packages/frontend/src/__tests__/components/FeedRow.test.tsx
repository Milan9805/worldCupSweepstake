import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { FeedEvent, Team } from '@sweepstake/shared';
import { FeedRow } from '../../components/FeedRow';

const TEAMS = {
  ENG: { teamCode: 'ENG', name: 'England', flag: '🏴' },
  GER: { teamCode: 'GER', name: 'Germany', flag: '🇩🇪' },
} as unknown as Record<string, Team>;

const OWNERS = { ENG: { name: 'Alice', imageUrl: null } };

function renderRow(event: FeedEvent, claimedPerson: string | null = 'Alice') {
  return render(
    <ul>
      <FeedRow
        event={event}
        teamsByCode={TEAMS}
        ownersByTeam={OWNERS}
        claimedPerson={claimedPerson}
        now={Date.parse('2026-06-12T20:00:00Z')}
      />
    </ul>,
  );
}

const ev = (over: Partial<FeedEvent>): FeedEvent => ({
  eventId: 'e1',
  ts: '2026-06-12T20:00:00Z',
  type: 'GOAL',
  payload: {},
  ...over,
});

describe('FeedRow', () => {
  it('renders a goal with scoreline, team names and the owner bracket', () => {
    renderRow(ev({ type: 'GOAL', payload: { homeTeam: 'ENG', awayTeam: 'GER', homeScore: 1, awayScore: 0 } }));
    expect(screen.getByText(/England/)).toBeInTheDocument();
    expect(screen.getByText('1–0')).toBeInTheDocument();
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
  });

  it('highlights when the claimed person owns a team in the event', () => {
    renderRow(ev({ type: 'GOAL', payload: { homeTeam: 'ENG', awayTeam: 'GER' } }));
    expect(screen.getByTestId('feed-event')).toHaveAttribute('data-involves-claimed', 'true');
  });

  it('does not highlight when the claimed person owns nobody in the event', () => {
    renderRow(ev({ type: 'GOAL', payload: { homeTeam: 'GER', awayTeam: 'ENG' } }), 'Nobody');
    expect(screen.getByTestId('feed-event')).toHaveAttribute('data-involves-claimed', 'false');
  });

  it('renders a card with player and minute', () => {
    renderRow(ev({ type: 'YELLOW_CARD', teamCode: 'GER', payload: { teamCode: 'GER', player: 'T. Müller', minute: '23', homeTeam: 'ENG', awayTeam: 'GER' } }));
    expect(screen.getByText('Yellow card')).toBeInTheDocument();
    expect(screen.getByText(/T\. Müller 23'/)).toBeInTheDocument();
  });

  it('renders an elimination headline', () => {
    renderRow(ev({ type: 'ELIMINATION', teamCode: 'GER', payload: { teamCode: 'GER', eliminatedAt: 'Round of 16' } }));
    expect(screen.getByText(/knocked out/)).toBeInTheDocument();
    expect(screen.getByText(/Round of 16/)).toBeInTheDocument();
  });

  it('shows a relative timestamp', () => {
    renderRow(ev({ ts: new Date(Date.parse('2026-06-12T20:00:00Z') - 5 * 60_000).toISOString(), payload: { homeTeam: 'ENG', awayTeam: 'GER' } }));
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });
});
