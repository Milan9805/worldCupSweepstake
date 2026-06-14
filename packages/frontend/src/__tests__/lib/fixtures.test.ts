import { Match } from '@sweepstake/shared';
import {
  isMatchMine,
  filterFixtures,
  fixturesEmptyMessage,
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
