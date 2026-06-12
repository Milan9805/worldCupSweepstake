import {
  deriveCardCounts,
  computeLeagueStats,
  computeTeamStatUpdates,
  LeagueStats,
  CardCounts,
} from '../../services/teamStats';
import { Match, Team, MatchAction, TeamStats } from '@sweepstake/shared';

function makeMatch(actions: MatchAction[] | undefined, overrides: Partial<Match> = {}): Match {
  return {
    matchId: 'm1',
    homeTeam: 'ENG',
    awayTeam: 'BRA',
    homeScore: null,
    awayScore: null,
    status: 'LIVE',
    stage: 'GROUP_STAGE',
    group: 'A',
    datetime: '2026-06-14T18:00:00Z',
    venue: 'Stadium',
    actions,
    ...overrides,
  };
}

function makeStats(overrides: Partial<TeamStats> = {}): TeamStats {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    yellowCards: 0,
    redCards: 0,
    possession: null,
    xG: null,
    ...overrides,
  };
}

function makeTeam(teamCode: string, stats: TeamStats = makeStats(), overrides: Partial<Team> = {}): Team {
  return {
    teamCode,
    name: teamCode,
    flag: '🏁',
    fifaRanking: 10,
    groupLetter: 'A',
    stats,
    eliminated: false,
    eliminatedAt: null,
    ...overrides,
  };
}

const card = (team: string, type: MatchAction['type'], minute = "10'"): MatchAction => ({
  team,
  player: `${team} player`,
  type,
  minute,
});

describe('deriveCardCounts', () => {
  it('tallies yellow and red cards per team across matches', () => {
    const matches = [
      makeMatch([card('ENG', 'YELLOW_CARD'), card('BRA', 'RED_CARD'), card('ENG', 'YELLOW_CARD')]),
      makeMatch([card('ENG', 'RED_CARD')], { matchId: 'm2' }),
    ];
    const counts = deriveCardCounts(matches);
    expect(counts.get('ENG')).toEqual({ yellowCards: 2, redCards: 1 });
    expect(counts.get('BRA')).toEqual({ yellowCards: 0, redCards: 1 });
  });

  it('ignores GOAL actions and matches without actions', () => {
    const counts = deriveCardCounts([
      makeMatch([card('ENG', 'GOAL'), card('ENG', 'YELLOW_CARD')]),
      makeMatch(undefined, { matchId: 'm2' }),
    ]);
    expect(counts.get('ENG')).toEqual({ yellowCards: 1, redCards: 0 });
    expect(counts.size).toBe(1);
  });

  it('returns an empty map when there are no card actions anywhere', () => {
    expect(deriveCardCounts([makeMatch([card('ENG', 'GOAL')])]).size).toBe(0);
  });
});

describe('computeLeagueStats', () => {
  const finished = (
    home: string,
    away: string,
    hs: number,
    as_: number,
    overrides: Partial<Match> = {},
  ): Match =>
    makeMatch([], {
      homeTeam: home,
      awayTeam: away,
      homeScore: hs,
      awayScore: as_,
      status: 'FINISHED',
      stage: 'GROUP_STAGE',
      ...overrides,
    });

  it('scores a 2-1 result as a win and a loss — never a draw (the reported bug)', () => {
    const table = computeLeagueStats([finished('KOR', 'CZE', 2, 1)]);
    expect(table.get('KOR')).toEqual<LeagueStats>({
      played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 3,
    });
    expect(table.get('CZE')).toEqual<LeagueStats>({
      played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 1, goalsAgainst: 2, goalDifference: -1, points: 0,
    });
  });

  it('scores a draw as a point each and accumulates across matches', () => {
    const table = computeLeagueStats([
      finished('ENG', 'USA', 1, 1),
      finished('ENG', 'IRN', 2, 0, { matchId: 'm2' }),
    ]);
    expect(table.get('ENG')).toMatchObject({
      played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2, points: 4,
    });
    expect(table.get('USA')).toMatchObject({ draws: 1, points: 1 });
  });

  it('ignores live, knockout, and null-score matches', () => {
    const table = computeLeagueStats([
      finished('KOR', 'CZE', 2, 1, { status: 'LIVE' }),
      finished('KOR', 'CZE', 2, 1, { stage: 'ROUND_OF_16', matchId: 'm3' }),
      finished('KOR', 'CZE', 2, 1, { homeScore: null, matchId: 'm4' }),
    ]);
    expect(table.size).toBe(0);
  });
});

describe('computeTeamStatUpdates', () => {
  const cards = (y: number, r: number): CardCounts => ({ yellowCards: y, redCards: r });

  it('overlays league stats and card counts, returning only changed teams', () => {
    const teams = [makeTeam('ENG'), makeTeam('BRA')];
    const standings = new Map<string, LeagueStats>([
      ['ENG', { played: 2, wins: 2, draws: 0, losses: 0, goalsFor: 4, goalsAgainst: 0, goalDifference: 4, points: 6 }],
    ]);
    const cardMap = new Map<string, CardCounts>([['ENG', cards(1, 1)]]);

    const changed = computeTeamStatUpdates(teams, standings, cardMap);

    expect(changed).toHaveLength(1);
    expect(changed[0].teamCode).toBe('ENG');
    expect(changed[0].stats).toMatchObject({ points: 6, wins: 2, yellowCards: 1, redCards: 1 });
  });

  it('returns nothing when stats are unchanged', () => {
    const teams = [makeTeam('ENG', makeStats({ points: 6, wins: 2, yellowCards: 1 }))];
    const standings = new Map<string, LeagueStats>([
      ['ENG', { played: 0, wins: 2, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 6 }],
    ]);
    const cardMap = new Map<string, CardCounts>([['ENG', cards(1, 0)]]);
    expect(computeTeamStatUpdates(teams, standings, cardMap)).toEqual([]);
  });

  it('keeps existing league stats for a team absent from standings, but still updates cards', () => {
    const teams = [makeTeam('ENG', makeStats({ points: 9, possession: 55, xG: 2.1 }))];
    const cardMap = new Map<string, CardCounts>([['ENG', cards(3, 0)]]);

    const changed = computeTeamStatUpdates(teams, new Map(), cardMap);

    expect(changed).toHaveLength(1);
    // League record (points) and possession/xG preserved; only cards moved.
    expect(changed[0].stats).toMatchObject({ points: 9, possession: 55, xG: 2.1, yellowCards: 3, redCards: 0 });
  });

  it('defaults a team with no card entry to zero cards', () => {
    const teams = [makeTeam('ENG', makeStats({ yellowCards: 2, redCards: 1 }))];
    const changed = computeTeamStatUpdates(teams, new Map(), new Map());
    expect(changed[0].stats).toMatchObject({ yellowCards: 0, redCards: 0 });
  });

  it('skips malformed rows with no stats object', () => {
    const broken = { teamCode: 'XXX' } as unknown as Team;
    expect(computeTeamStatUpdates([broken], new Map(), new Map())).toEqual([]);
  });
});
