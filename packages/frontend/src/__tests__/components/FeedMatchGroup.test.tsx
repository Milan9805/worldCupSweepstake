import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Match, Team } from '@sweepstake/shared';
import FeedMatchGroup from '../../components/FeedMatchGroup';
import { groupEventsByMatch } from '../../lib/feedGroups';

const TEAMS = {
  ENG: { teamCode: 'ENG', name: 'England', flag: '🏴' },
  GER: { teamCode: 'GER', name: 'Germany', flag: '🇩🇪' },
} as unknown as Record<string, Team>;
const FLAGS = { ENG: '🏴', GER: '🇩🇪' };
const OWNERS = { ENG: { name: 'Alice', imageUrl: null } };

function makeMatch(over: Partial<Match>): Match {
  return {
    matchId: 'm1',
    homeTeam: 'ENG',
    awayTeam: 'GER',
    homeScore: 1,
    awayScore: 0,
    status: 'LIVE',
    stage: 'GROUP_STAGE',
    group: 'A',
    datetime: '2026-06-12T18:00:00Z',
    venue: 'Wembley',
    ...over,
  };
}

function renderGroup(match: Match) {
  const events = [
    { eventId: 'e1', ts: '2026-06-12T20:10:00Z', type: 'GOAL' as const, matchId: match.matchId, payload: { homeTeam: 'ENG', awayTeam: 'GER', homeScore: 1, awayScore: 0 } },
    { eventId: 'e2', ts: '2026-06-12T20:00:00Z', type: 'KICKOFF' as const, matchId: match.matchId, payload: { homeTeam: 'ENG', awayTeam: 'GER' } },
  ];
  const [group] = groupEventsByMatch(events, [match]);
  return render(
    <FeedMatchGroup
      group={group}
      teamsByCode={TEAMS}
      teamFlags={FLAGS}
      ownersByTeam={OWNERS}
      claimedPerson="Alice"
      now={Date.parse('2026-06-12T20:15:00Z')}
    />,
  );
}

describe('FeedMatchGroup', () => {
  it('shows a live match expanded with the LIVE badge, minute and its events', () => {
    renderGroup(makeMatch({ status: 'LIVE', minute: "57'" }));
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText("57'")).toBeInTheDocument();
    // Events are visible (group expanded by default) and newest-first.
    const rows = screen.getAllByTestId('feed-event');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Goal')).toBeInTheDocument();
  });

  it('shows a finished match collapsed with an FT badge, expanding on tap', () => {
    renderGroup(makeMatch({ status: 'FINISHED' }));
    expect(screen.getByText('FT')).toBeInTheDocument();
    // Collapsed: no event rows until the header is tapped.
    expect(screen.queryByTestId('feed-event')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('feed-group-header'));
    expect(screen.getAllByTestId('feed-event')).toHaveLength(2);
  });

  it('toggles aria-expanded on the header button', () => {
    renderGroup(makeMatch({ status: 'FINISHED' }));
    const header = screen.getByTestId('feed-group-header');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('highlights the card when the claimed person owns a team in the match', () => {
    // Alice owns ENG (the default ENG–GER match).
    renderGroup(makeMatch({ status: 'LIVE' }));
    expect(screen.getByTestId('feed-group')).toHaveAttribute('data-involves-claimed', 'true');
  });

  it('does not highlight the card when the claimed person owns no team in the match', () => {
    renderGroup(makeMatch({ homeTeam: 'FRA', awayTeam: 'ITA', status: 'LIVE' }));
    expect(screen.getByTestId('feed-group')).toHaveAttribute('data-involves-claimed', 'false');
  });

  it('renders the synthetic group with a neutral "Tournament" header', () => {
    const events = [
      { eventId: 'b1', ts: '2026-06-12T19:00:00Z', type: 'BRACKET_DRAWN' as const, payload: { slots: 16 } },
    ];
    const [group] = groupEventsByMatch(events, []);
    render(
      <FeedMatchGroup
        group={group}
        teamsByCode={TEAMS}
        teamFlags={FLAGS}
        ownersByTeam={OWNERS}
        claimedPerson="Alice"
        now={Date.parse('2026-06-12T20:15:00Z')}
      />,
    );
    expect(screen.getByText('Tournament')).toBeInTheDocument();
    // No match -> no live/FT badge, but the event is shown (expanded by default).
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    expect(screen.getByText('Bracket drawn')).toBeInTheDocument();
  });
});
