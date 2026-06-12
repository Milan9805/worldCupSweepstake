import {
  getTeamMatchInfo,
  getTournamentMatchInfo,
  compareTeamsByMatch,
  TeamMatchInfo,
} from '../../lib/teamMatches';
import { Match } from '@sweepstake/shared';

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  matchId: 'm1',
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

describe('getTournamentMatchInfo', () => {
  it('returns no live and no next when there are no matches', () => {
    expect(getTournamentMatchInfo([])).toEqual({ live: [], next: null });
  });

  it('collects every live match, earliest kickoff first', () => {
    const later = makeMatch({ matchId: 'l2', status: 'LIVE', datetime: '2026-06-14T20:00:00Z' });
    const earlier = makeMatch({ matchId: 'l1', status: 'LIVE', datetime: '2026-06-14T18:00:00Z' });
    const result = getTournamentMatchInfo([later, earlier]);
    expect(result.live.map((m) => m.matchId)).toEqual(['l1', 'l2']);
  });

  it('ignores scheduled and finished matches when collecting live', () => {
    const live = makeMatch({ matchId: 'live', status: 'LIVE' });
    const scheduled = makeMatch({ matchId: 's', status: 'SCHEDULED' });
    const finished = makeMatch({ matchId: 'f', status: 'FINISHED' });
    const result = getTournamentMatchInfo([scheduled, live, finished]);
    expect(result.live.map((m) => m.matchId)).toEqual(['live']);
  });

  it('picks the soonest upcoming fixture as next', () => {
    const later = makeMatch({ matchId: 'later', status: 'SCHEDULED', datetime: '2026-06-25T18:00:00Z' });
    const sooner = makeMatch({ matchId: 'sooner', status: 'SCHEDULED', datetime: '2026-06-18T18:00:00Z' });
    expect(getTournamentMatchInfo([later, sooner]).next?.matchId).toBe('sooner');
  });

  it('returns a null next when nothing is scheduled', () => {
    const finished = makeMatch({ status: 'FINISHED' });
    expect(getTournamentMatchInfo([finished]).next).toBeNull();
  });

  it('reports live matches and the next fixture independently', () => {
    const live = makeMatch({ matchId: 'live', status: 'LIVE' });
    const next = makeMatch({ matchId: 'next', status: 'SCHEDULED', datetime: '2026-06-20T18:00:00Z' });
    const result = getTournamentMatchInfo([live, next]);
    expect(result.live.map((m) => m.matchId)).toEqual(['live']);
    expect(result.next?.matchId).toBe('next');
  });
});

describe('getTeamMatchInfo', () => {
  it('returns all nulls when the team has no matches', () => {
    const matches = [makeMatch({ homeTeam: 'GER', awayTeam: 'FRA' })];
    expect(getTeamMatchInfo('ENG', matches)).toEqual({
      live: null,
      next: null,
      previous: null,
    });
  });

  it('matches the team whether it plays home or away', () => {
    const home = makeMatch({ matchId: 'h', homeTeam: 'ENG', status: 'FINISHED', homeScore: 1, awayScore: 0 });
    const away = makeMatch({ matchId: 'a', homeTeam: 'BRA', awayTeam: 'ENG', status: 'SCHEDULED', datetime: '2026-06-20T18:00:00Z' });
    const info = getTeamMatchInfo('ENG', [home, away]);
    expect(info.previous?.matchId).toBe('h');
    expect(info.next?.matchId).toBe('a');
  });

  it('returns the in-progress game as live', () => {
    const live = makeMatch({ matchId: 'live', status: 'LIVE', homeScore: 1, awayScore: 1 });
    const info = getTeamMatchInfo('ENG', [live]);
    expect(info.live?.matchId).toBe('live');
  });

  it('picks the earliest scheduled match as next', () => {
    const later = makeMatch({ matchId: 'later', status: 'SCHEDULED', datetime: '2026-06-25T18:00:00Z' });
    const sooner = makeMatch({ matchId: 'sooner', status: 'SCHEDULED', datetime: '2026-06-18T18:00:00Z' });
    const info = getTeamMatchInfo('ENG', [later, sooner]);
    expect(info.next?.matchId).toBe('sooner');
  });

  it('picks the most recent finished match as previous', () => {
    const old = makeMatch({ matchId: 'old', status: 'FINISHED', datetime: '2026-06-10T18:00:00Z', homeScore: 0, awayScore: 0 });
    const recent = makeMatch({ matchId: 'recent', status: 'FINISHED', datetime: '2026-06-14T18:00:00Z', homeScore: 2, awayScore: 1 });
    const info = getTeamMatchInfo('ENG', [old, recent]);
    expect(info.previous?.matchId).toBe('recent');
  });
});

describe('compareTeamsByMatch', () => {
  const live: TeamMatchInfo = { live: makeMatch({ status: 'LIVE' }), next: null, previous: null };
  const nextSoon: TeamMatchInfo = {
    live: null,
    next: makeMatch({ status: 'SCHEDULED', datetime: '2026-06-18T18:00:00Z' }),
    previous: null,
  };
  const nextLate: TeamMatchInfo = {
    live: null,
    next: makeMatch({ status: 'SCHEDULED', datetime: '2026-06-25T18:00:00Z' }),
    previous: null,
  };
  const finishedRecent: TeamMatchInfo = {
    live: null,
    next: null,
    previous: makeMatch({ status: 'FINISHED', datetime: '2026-06-14T18:00:00Z' }),
  };
  const finishedOld: TeamMatchInfo = {
    live: null,
    next: null,
    previous: makeMatch({ status: 'FINISHED', datetime: '2026-06-10T18:00:00Z' }),
  };
  const empty: TeamMatchInfo = { live: null, next: null, previous: null };

  const sorted = (infos: TeamMatchInfo[]) => [...infos].sort(compareTeamsByMatch);

  it('puts live matches first', () => {
    expect(sorted([nextSoon, live, finishedRecent])[0]).toBe(live);
  });

  it('orders upcoming matches soonest first', () => {
    expect(sorted([nextLate, nextSoon])).toEqual([nextSoon, nextLate]);
  });

  it('orders finished teams after upcoming ones, most recent past first', () => {
    expect(sorted([finishedOld, finishedRecent, nextSoon])).toEqual([
      nextSoon,
      finishedRecent,
      finishedOld,
    ]);
  });

  it('sinks teams with no matches to the bottom', () => {
    expect(sorted([empty, finishedRecent, live])).toEqual([live, finishedRecent, empty]);
  });
});
