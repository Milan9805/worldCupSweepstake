import { FeedEvent, FeedEventType, Match, MatchStatus } from '@sweepstake/shared';
import {
  OTHER_GROUP_KEY,
  eventTeamCodes,
  groupEventsByMatch,
  isGroupMine,
  filterFeedGroups,
  isGroupExpandedByDefault,
} from '../../lib/feedGroups';
import { TeamOwner } from '../../lib/owners';

function makeMatch(over: Partial<Match> & Pick<Match, 'matchId'>): Match {
  return {
    matchId: over.matchId,
    homeTeam: over.homeTeam ?? 'ENG',
    awayTeam: over.awayTeam ?? 'GER',
    homeScore: over.homeScore ?? null,
    awayScore: over.awayScore ?? null,
    status: over.status ?? 'SCHEDULED',
    stage: over.stage ?? 'GROUP_STAGE',
    group: over.group ?? 'A',
    datetime: over.datetime ?? '2026-06-12T18:00:00Z',
    venue: over.venue ?? 'Wembley',
    channels: over.channels,
    minute: over.minute,
    actions: over.actions,
  };
}

let evCount = 0;
function makeEvent(
  type: FeedEventType,
  matchId: string | undefined,
  payload: Record<string, unknown>,
  ts: string,
): FeedEvent {
  return { eventId: `e${evCount++}`, ts, type, matchId, payload };
}

const T = (min: number) => new Date(Date.parse('2026-06-12T20:00:00Z') + min * 60_000).toISOString();

const OWNERS: Record<string, TeamOwner> = {
  ENG: { name: 'Alice', imageUrl: null },
  BRA: { name: 'Bob', imageUrl: null },
};

describe('eventTeamCodes', () => {
  it('returns both sides for a match-scoped event', () => {
    const e = makeEvent('GOAL', 'm1', { homeTeam: 'ENG', awayTeam: 'GER' }, T(0));
    expect(eventTeamCodes(e)).toEqual(['ENG', 'GER']);
  });

  it('returns the single team for an elimination', () => {
    const e = makeEvent('ELIMINATION', 'm1', { teamCode: 'BRA' }, T(0));
    expect(eventTeamCodes(e)).toEqual(['BRA']);
  });

  it('returns nothing for a bracket-drawn event', () => {
    const e = makeEvent('BRACKET_DRAWN', undefined, { slots: 16 }, T(0));
    expect(eventTeamCodes(e)).toEqual([]);
  });
});

describe('groupEventsByMatch', () => {
  it('buckets events by their match and sorts each group newest-first', () => {
    const matches = [makeMatch({ matchId: 'm1', status: 'LIVE' })];
    const kickoff = makeEvent('KICKOFF', 'm1', { homeTeam: 'ENG', awayTeam: 'GER' }, T(0));
    const goal = makeEvent('GOAL', 'm1', { homeTeam: 'ENG', awayTeam: 'GER' }, T(10));

    const groups = groupEventsByMatch([kickoff, goal], matches);
    expect(groups).toHaveLength(1);
    expect(groups[0].matchId).toBe('m1');
    expect(groups[0].events.map((e) => e.type)).toEqual(['GOAL', 'KICKOFF']);
    expect(groups[0].teamCodes).toEqual(['ENG', 'GER']);
    expect(groups[0].status).toBe('LIVE');
  });

  it('orders groups live-first, then by most-recent activity', () => {
    const matches = [
      makeMatch({ matchId: 'live', status: 'LIVE' }),
      makeMatch({ matchId: 'oldFin', status: 'FINISHED' }),
      makeMatch({ matchId: 'newFin', status: 'FINISHED' }),
    ];
    const events = [
      makeEvent('KICKOFF', 'live', { homeTeam: 'ENG', awayTeam: 'GER' }, T(0)), // oldest, but live
      makeEvent('FULL_TIME', 'oldFin', { homeTeam: 'ENG', awayTeam: 'GER' }, T(5)),
      makeEvent('FULL_TIME', 'newFin', { homeTeam: 'ENG', awayTeam: 'GER' }, T(30)),
    ];
    const groups = groupEventsByMatch(events, matches);
    expect(groups.map((g) => g.matchId)).toEqual(['live', 'newFin', 'oldFin']);
  });

  it('orders goals by payload.occurredAt (match clock), not detection ts', () => {
    const matches = [makeMatch({ matchId: 'm1', status: 'FINISHED' })];
    // A catch-up batch: both detected at ~the same instant, but they happened at
    // different match minutes. goalB happened later in the match than goalA, even
    // though its detection ts is older — occurredAt must win.
    const goalA = makeEvent('GOAL', 'm1', { homeTeam: 'ENG', awayTeam: 'GER', occurredAt: T(0) }, T(10));
    const goalB = makeEvent('GOAL', 'm1', { homeTeam: 'ENG', awayTeam: 'GER', occurredAt: T(10) }, T(0));

    const groups = groupEventsByMatch([goalA, goalB], matches);
    expect(groups[0].events.map((e) => e.eventId)).toEqual([goalB.eventId, goalA.eventId]);
    // latestTs reflects the match-clock time of the newest event, not its ts.
    expect(groups[0].latestTs).toBe(Date.parse(T(10)));
  });

  it('collapses events with no matchId, or an unknown match, into one "other" group sorted last', () => {
    const matches = [makeMatch({ matchId: 'm1', status: 'LIVE' })];
    const bracket = makeEvent('BRACKET_DRAWN', undefined, { slots: 16 }, T(100));
    const orphan = makeEvent('GOAL', 'ghost', { homeTeam: 'ENG', awayTeam: 'GER' }, T(50));
    const live = makeEvent('KICKOFF', 'm1', { homeTeam: 'ENG', awayTeam: 'GER' }, T(0));

    const groups = groupEventsByMatch([bracket, orphan, live], matches);
    expect(groups).toHaveLength(2);
    // Live group first; the synthetic group ranks among non-live and sorts last.
    expect(groups[0].matchId).toBe('m1');
    const other = groups[1];
    expect(other.key).toBe(OTHER_GROUP_KEY);
    expect(other.match).toBeNull();
    expect(other.events).toHaveLength(2);
  });
});

describe('isGroupMine / filterFeedGroups', () => {
  const matches = [
    makeMatch({ matchId: 'mine', homeTeam: 'ENG', awayTeam: 'GER', status: 'FINISHED' }),
    makeMatch({ matchId: 'live', homeTeam: 'FRA', awayTeam: 'ITA', status: 'LIVE' }),
  ];
  const events = [
    makeEvent('FULL_TIME', 'mine', { homeTeam: 'ENG', awayTeam: 'GER' }, T(0)),
    makeEvent('KICKOFF', 'live', { homeTeam: 'FRA', awayTeam: 'ITA' }, T(5)),
  ];
  const groups = groupEventsByMatch(events, matches);

  it('flags a group as mine when the claimed person owns either side', () => {
    const mine = groups.find((g) => g.matchId === 'mine')!;
    const live = groups.find((g) => g.matchId === 'live')!;
    expect(isGroupMine(mine, OWNERS, 'Alice')).toBe(true);
    expect(isGroupMine(live, OWNERS, 'Alice')).toBe(false);
    expect(isGroupMine(mine, OWNERS, null)).toBe(false);
  });

  it('"all" keeps every group', () => {
    expect(filterFeedGroups(groups, 'all', OWNERS, 'Alice')).toHaveLength(2);
  });

  it('"live" keeps only in-progress matches', () => {
    const live = filterFeedGroups(groups, 'live', OWNERS, 'Alice');
    expect(live.map((g) => g.matchId)).toEqual(['live']);
  });

  it('"mine" keeps only the claimed person\'s matches', () => {
    const mine = filterFeedGroups(groups, 'mine', OWNERS, 'Alice');
    expect(mine.map((g) => g.matchId)).toEqual(['mine']);
  });
});

describe('isGroupExpandedByDefault', () => {
  const groupWith = (status: MatchStatus | null) => ({
    key: 'k',
    matchId: 'm',
    match: null,
    status,
    teamCodes: [],
    events: [],
    latestTs: 0,
  });

  it('expands live, scheduled and unknown groups', () => {
    expect(isGroupExpandedByDefault(groupWith('LIVE'))).toBe(true);
    expect(isGroupExpandedByDefault(groupWith('SCHEDULED'))).toBe(true);
    expect(isGroupExpandedByDefault(groupWith(null))).toBe(true);
  });

  it('collapses finished groups', () => {
    expect(isGroupExpandedByDefault(groupWith('FINISHED'))).toBe(false);
  });
});
