import { getTeamMatchInfo } from '../../lib/teamMatches';
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
