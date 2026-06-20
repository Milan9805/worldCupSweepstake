import { Match } from '@sweepstake/shared';
import {
  isMatchMine,
  filterFixtures,
  fixturesEmptyMessage,
  londonDayKey,
  nextMyMatch,
  todayDividerIndex,
} from '../../lib/fixtures';
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

const OWNERS: Record<string, TeamOwner> = {
  ENG: { name: 'Alice', imageUrl: null },
  BRA: { name: 'Bob', imageUrl: null },
};

describe('isMatchMine', () => {
  it('is mine when the claimed person owns the home side', () => {
    const m = makeMatch({ matchId: 'm1', homeTeam: 'ENG', awayTeam: 'FRA' });
    expect(isMatchMine(m, OWNERS, 'Alice')).toBe(true);
  });

  it('is mine when the claimed person owns the away side', () => {
    const m = makeMatch({ matchId: 'm1', homeTeam: 'FRA', awayTeam: 'ENG' });
    expect(isMatchMine(m, OWNERS, 'Alice')).toBe(true);
  });

  it('is not mine when the claimed person owns neither side', () => {
    const m = makeMatch({ matchId: 'm1', homeTeam: 'FRA', awayTeam: 'ITA' });
    expect(isMatchMine(m, OWNERS, 'Alice')).toBe(false);
  });

  it('is not mine when there is no claimed person', () => {
    const m = makeMatch({ matchId: 'm1', homeTeam: 'ENG', awayTeam: 'FRA' });
    expect(isMatchMine(m, OWNERS, null)).toBe(false);
  });
});

describe('filterFixtures', () => {
  it('returns matches oldest -> newest regardless of input order', () => {
    const matches = [
      makeMatch({ matchId: 'late', datetime: '2026-06-14T18:00:00Z' }),
      makeMatch({ matchId: 'early', datetime: '2026-06-10T18:00:00Z' }),
      makeMatch({ matchId: 'mid', datetime: '2026-06-12T18:00:00Z' }),
    ];
    const out = filterFixtures(matches, { filter: 'all', teamCode: null }, OWNERS, 'Alice');
    expect(out.map((m) => m.matchId)).toEqual(['early', 'mid', 'late']);
  });

  it('does not throw on an unparseable datetime and keeps the bad row', () => {
    const matches = [
      makeMatch({ matchId: 'good', datetime: '2026-06-12T18:00:00Z' }),
      makeMatch({ matchId: 'bad', datetime: 'not-a-date' }),
    ];
    const out = filterFixtures(matches, { filter: 'all', teamCode: null }, OWNERS, 'Alice');
    // NaN datetime sorts as 0 (oldest), so it leads — and nothing is dropped.
    expect(out.map((m) => m.matchId)).toEqual(['bad', 'good']);
  });

  it('"mine" keeps only the claimed person\'s matches', () => {
    const matches = [
      makeMatch({ matchId: 'mine', homeTeam: 'ENG', awayTeam: 'FRA' }),
      makeMatch({ matchId: 'theirs', homeTeam: 'FRA', awayTeam: 'ITA' }),
    ];
    const out = filterFixtures(matches, { filter: 'mine', teamCode: null }, OWNERS, 'Alice');
    expect(out.map((m) => m.matchId)).toEqual(['mine']);
  });

  it('"all" + teamCode narrows to fixtures involving that team', () => {
    const matches = [
      makeMatch({ matchId: 'fraHome', homeTeam: 'FRA', awayTeam: 'ITA' }),
      makeMatch({ matchId: 'fraAway', homeTeam: 'ENG', awayTeam: 'FRA' }),
      makeMatch({ matchId: 'other', homeTeam: 'ENG', awayTeam: 'GER' }),
    ];
    const out = filterFixtures(matches, { filter: 'all', teamCode: 'FRA' }, OWNERS, 'Alice');
    expect(out.map((m) => m.matchId).sort()).toEqual(['fraAway', 'fraHome']);
  });

  it('"mine" + teamCode ignores the teamCode and still returns all of mine', () => {
    const matches = [
      makeMatch({ matchId: 'mineEng', homeTeam: 'ENG', awayTeam: 'ITA' }),
      makeMatch({ matchId: 'mineBra', homeTeam: 'FRA', awayTeam: 'BRA' }),
      makeMatch({ matchId: 'theirs', homeTeam: 'FRA', awayTeam: 'ITA' }),
    ];
    // Owned via either OWNERS entry (Alice/ENG); teamCode 'GER' would match none.
    const out = filterFixtures(matches, { filter: 'mine', teamCode: 'GER' }, OWNERS, 'Alice');
    expect(out.map((m) => m.matchId)).toEqual(['mineEng']);
  });

  it('does not mutate the input array', () => {
    const matches = [
      makeMatch({ matchId: 'late', datetime: '2026-06-14T18:00:00Z' }),
      makeMatch({ matchId: 'early', datetime: '2026-06-10T18:00:00Z' }),
    ];
    const before = matches.map((m) => m.matchId);
    filterFixtures(matches, { filter: 'all', teamCode: null }, OWNERS, 'Alice');
    expect(matches.map((m) => m.matchId)).toEqual(before);
  });
});

describe('londonDayKey', () => {
  it('renders the Europe/London day as a sortable YYYY-MM-DD string', () => {
    expect(londonDayKey('2026-06-15T12:00:00Z')).toBe('2026-06-15');
  });

  it('buckets a late BST kick-off on its UK day, not the UTC next day', () => {
    // 23:30 BST on 15 Jun is 22:30Z the same day — must stay 15 Jun.
    expect(londonDayKey('2026-06-15T22:30:00Z')).toBe('2026-06-15');
  });
});

describe('todayDividerIndex', () => {
  // Sorted oldest -> newest, spanning before/on/after "today" (15 Jun).
  const sorted = [
    makeMatch({ matchId: 'past', datetime: '2026-06-13T18:00:00Z' }),
    makeMatch({ matchId: 'today', datetime: '2026-06-15T20:00:00Z' }),
    makeMatch({ matchId: 'future', datetime: '2026-06-17T18:00:00Z' }),
  ];
  const NOW = new Date('2026-06-15T09:00:00Z').getTime();

  it('points at the first fixture kicking off today', () => {
    expect(todayDividerIndex(sorted, NOW)).toBe(1);
  });

  it('falls back to the next upcoming fixture on a rest day', () => {
    const restDay = [
      makeMatch({ matchId: 'past', datetime: '2026-06-13T18:00:00Z' }),
      makeMatch({ matchId: 'future', datetime: '2026-06-17T18:00:00Z' }),
    ];
    // Today is 15 Jun with nothing scheduled — the marker leads the 17 Jun match.
    expect(todayDividerIndex(restDay, NOW)).toBe(1);
  });

  it('returns 0 when every fixture is still upcoming', () => {
    const allFuture = [
      makeMatch({ matchId: 'a', datetime: '2026-06-16T18:00:00Z' }),
      makeMatch({ matchId: 'b', datetime: '2026-06-18T18:00:00Z' }),
    ];
    expect(todayDividerIndex(allFuture, NOW)).toBe(0);
  });

  it('returns null once every fixture is in the past', () => {
    const allPast = [
      makeMatch({ matchId: 'a', datetime: '2026-06-10T18:00:00Z' }),
      makeMatch({ matchId: 'b', datetime: '2026-06-12T18:00:00Z' }),
    ];
    expect(todayDividerIndex(allPast, NOW)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(todayDividerIndex([], NOW)).toBeNull();
  });
});

describe('nextMyMatch', () => {
  it('returns null when there is no claimed person', () => {
    const matches = [makeMatch({ matchId: 'm1', homeTeam: 'ENG', awayTeam: 'FRA', status: 'SCHEDULED' })];
    expect(nextMyMatch(matches, OWNERS, null)).toBeNull();
  });

  it('returns null for an empty match list', () => {
    expect(nextMyMatch([], OWNERS, 'Alice')).toBeNull();
  });

  it('returns null when all of the claimed person\'s matches are finished', () => {
    const matches = [
      makeMatch({ matchId: 'm1', homeTeam: 'ENG', awayTeam: 'FRA', status: 'FINISHED' }),
      makeMatch({ matchId: 'm2', homeTeam: 'FRA', awayTeam: 'ENG', status: 'FINISHED' }),
    ];
    expect(nextMyMatch(matches, OWNERS, 'Alice')).toBeNull();
  });

  it('returns null when all of the claimed person\'s matches are live', () => {
    const matches = [
      makeMatch({ matchId: 'm1', homeTeam: 'ENG', awayTeam: 'FRA', status: 'LIVE' }),
    ];
    expect(nextMyMatch(matches, OWNERS, 'Alice')).toBeNull();
  });

  it('returns the earliest SCHEDULED match belonging to the claimed person', () => {
    const matches = [
      makeMatch({ matchId: 'late', homeTeam: 'ENG', awayTeam: 'FRA', datetime: '2026-06-20T18:00:00Z', status: 'SCHEDULED' }),
      makeMatch({ matchId: 'early', homeTeam: 'ENG', awayTeam: 'GER', datetime: '2026-06-14T18:00:00Z', status: 'SCHEDULED' }),
    ];
    const result = nextMyMatch(matches, OWNERS, 'Alice');
    expect(result?.matchId).toBe('early');
  });

  it('ignores SCHEDULED matches that the claimed person does not own a team in', () => {
    const matches = [
      makeMatch({ matchId: 'mine', homeTeam: 'ENG', awayTeam: 'FRA', status: 'SCHEDULED' }),
      makeMatch({ matchId: 'theirs', homeTeam: 'FRA', awayTeam: 'ITA', status: 'SCHEDULED' }),
    ];
    const result = nextMyMatch(matches, OWNERS, 'Alice');
    expect(result?.matchId).toBe('mine');
  });

  it('returns null when the only SCHEDULED matches belong to someone else', () => {
    const matches = [
      makeMatch({ matchId: 'm1', homeTeam: 'FRA', awayTeam: 'ITA', status: 'SCHEDULED' }),
    ];
    expect(nextMyMatch(matches, OWNERS, 'Alice')).toBeNull();
  });
});

describe('fixturesEmptyMessage', () => {
  it('total 0 wins even with a teamCode set', () => {
    expect(fixturesEmptyMessage(0, 'all', 'FRA')).toBe(
      'No fixtures available yet. Check back once the schedule is published.',
    );
  });

  it('teamCode beats the mine view when there are fixtures', () => {
    expect(fixturesEmptyMessage(5, 'mine', 'FRA')).toBe('No fixtures for the selected team.');
  });

  it('"mine" with no teamCode reports no owned fixtures', () => {
    expect(fixturesEmptyMessage(5, 'mine', null)).toBe('None of your teams have any fixtures.');
  });

  it('falls back to a generic message for the all view', () => {
    expect(fixturesEmptyMessage(5, 'all', null)).toBe('No fixtures match the current filters.');
  });
});
