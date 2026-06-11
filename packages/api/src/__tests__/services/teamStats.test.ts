import {
  deriveCardCounts,
  indexStandings,
  computeTeamStatUpdates,
  LeagueStats,
  CardCounts,
} from '../../services/teamStats';
import { Match, Team, MatchAction, TeamStats } from '@sweepstake/shared';
import { FootballDataStanding } from '../../clients/footballData';

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

function standing(rows: Partial<FootballDataStanding['table'][number]>[]): FootballDataStanding {
  return {
    group: 'A',
    table: rows.map((r, i) => ({
      position: i + 1,
      team: { tla: 'ENG', name: 'England' },
      playedGames: 0,
      won: 0,
      draw: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      ...r,
    })),
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

describe('indexStandings', () => {
  it('indexes rows by team TLA', () => {
    const map = indexStandings([
      standing([
        { team: { tla: 'ENG', name: 'England' }, playedGames: 3, won: 2, draw: 1, lost: 0, goalsFor: 5, goalsAgainst: 1, goalDifference: 4, points: 7 },
        { team: { tla: 'BRA', name: 'Brazil' }, playedGames: 3, won: 1, draw: 1, lost: 1, goalsFor: 3, goalsAgainst: 3, goalDifference: 0, points: 4 },
      ]),
    ]);
    expect(map.get('ENG')).toEqual<LeagueStats>({
      played: 3, wins: 2, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 1, goalDifference: 4, points: 7,
    });
    expect(map.get('BRA')?.points).toBe(4);
  });

  it('tolerates undefined standings and rows without a TLA', () => {
    expect(indexStandings(undefined).size).toBe(0);
    const map = indexStandings([standing([{ team: { tla: '', name: '' }, points: 9 }])]);
    expect(map.size).toBe(0);
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
