import {
  computeHonours,
  cardScore,
  YELLOW_CARD_WEIGHT,
  RED_CARD_WEIGHT,
  STAGE_RANK,
  HonourPrizeId,
} from '../honours';
import { Team, Person, TeamStats } from '../types';

const makeStats = (overrides: Partial<TeamStats> = {}): TeamStats => ({
  played: 3,
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
});

const makeTeam = (teamCode: string, overrides: Partial<Team> = {}): Team => ({
  teamCode,
  name: teamCode,
  flag: '',
  fifaRanking: 10,
  groupLetter: 'A',
  eliminated: false,
  eliminatedAt: null,
  stats: makeStats(),
  ...overrides,
});

// Find a prize's ranked rows by id.
const prize = (
  result: ReturnType<typeof computeHonours>,
  id: HonourPrizeId,
) => result.prizes.find((p) => p.id === id)!;

describe('cardScore', () => {
  it('weights yellow=1 and red=3', () => {
    expect(YELLOW_CARD_WEIGHT).toBe(1);
    expect(RED_CARD_WEIGHT).toBe(3);
    expect(cardScore({ yellowCards: 2, redCards: 1 })).toBe(5);
    expect(cardScore({ yellowCards: 0, redCards: 0 })).toBe(0);
  });
});

describe('computeHonours', () => {
  // A known fixture: three owners with distinct, hand-computable totals.
  //
  //  Alice : BRA (gf6 ga1 pts9 y1 r0, won FINAL → Champion)
  //          ENG (gf2 ga2 pts3 y3 r1, eliminated Round of 16)
  //    → goalsFor 8, goalsAgainst 3, points 12, cards 1+3+3=... (y4 r1 = 4+3=7)
  //    → deepest = CHAMPION
  //  Bob   : GER (gf4 ga4 pts4 y2 r0, alive)
  //          FRA (gf1 ga0 pts3 y0 r0, eliminated Group Stage)
  //    → goalsFor 5, goalsAgainst 4, points 7, cards y2 r0 = 2
  //    → deepest = ALIVE (GER not eliminated)
  //  Cara  : JPN (gf0 ga9 pts0 y0 r2, eliminated Group Stage)
  //    → goalsFor 0, goalsAgainst 9, points 0, cards r2 = 6
  //    → deepest = GROUP_STAGE
  const teams: Team[] = [
    makeTeam('BRA', {
      eliminated: false,
      eliminatedAt: null,
      stats: makeStats({ goalsFor: 6, goalsAgainst: 1, points: 9, yellowCards: 1, redCards: 0 }),
    }),
    makeTeam('ENG', {
      eliminated: true,
      eliminatedAt: 'Round of 16',
      stats: makeStats({ goalsFor: 2, goalsAgainst: 2, points: 3, yellowCards: 3, redCards: 1 }),
    }),
    makeTeam('GER', {
      eliminated: false,
      eliminatedAt: null,
      stats: makeStats({ goalsFor: 4, goalsAgainst: 4, points: 4, yellowCards: 2, redCards: 0 }),
    }),
    makeTeam('FRA', {
      eliminated: true,
      eliminatedAt: 'Group Stage',
      stats: makeStats({ goalsFor: 1, goalsAgainst: 0, points: 3, yellowCards: 0, redCards: 0 }),
    }),
    makeTeam('JPN', {
      eliminated: true,
      eliminatedAt: 'Group Stage',
      stats: makeStats({ goalsFor: 0, goalsAgainst: 9, points: 0, yellowCards: 0, redCards: 2 }),
    }),
  ];

  const members: Person[] = [
    { name: 'Alice', imageUrl: null, teams: ['BRA', 'ENG'] },
    { name: 'Bob', imageUrl: null, teams: ['GER', 'FRA'] },
    { name: 'Cara', imageUrl: null, teams: ['JPN'] },
  ];

  it('returns one prize table per honour, each non-empty', () => {
    const result = computeHonours(teams, members);
    const ids = result.prizes.map((p) => p.id);
    expect(ids).toEqual([
      'mostGoals',
      'bestDefence',
      'cleanest',
      'dirtiest',
      'bestGroupRecord',
      'deepestRun',
    ]);
    result.prizes.forEach((p) => expect(p.rows).toHaveLength(3));
  });

  it('Most Goals: totals correct and ordered desc', () => {
    const rows = prize(computeHonours(teams, members), 'mostGoals').rows;
    expect(rows.map((r) => [r.person, r.value])).toEqual([
      ['Alice', 8],
      ['Bob', 5],
      ['Cara', 0],
    ]);
  });

  it('Best Defence: fewest conceded wins (asc)', () => {
    const rows = prize(computeHonours(teams, members), 'bestDefence').rows;
    expect(rows.map((r) => [r.person, r.value])).toEqual([
      ['Alice', 3],
      ['Bob', 4],
      ['Cara', 9],
    ]);
  });

  it('Cleanest: fewest card points wins, with red-card tiebreak', () => {
    const rows = prize(computeHonours(teams, members), 'cleanest').rows;
    // Bob 2, Cara 6 (r2), Alice 7 (y4 r1)
    expect(rows.map((r) => [r.person, r.value])).toEqual([
      ['Bob', 2],
      ['Cara', 6],
      ['Alice', 7],
    ]);
  });

  it('Dirtiest: most card points wins', () => {
    const rows = prize(computeHonours(teams, members), 'dirtiest').rows;
    expect(rows.map((r) => [r.person, r.value])).toEqual([
      ['Alice', 7],
      ['Cara', 6],
      ['Bob', 2],
    ]);
  });

  it('Best Group-Stage Record: most points wins', () => {
    const rows = prize(computeHonours(teams, members), 'bestGroupRecord').rows;
    expect(rows.map((r) => [r.person, r.value])).toEqual([
      ['Alice', 12],
      ['Bob', 7],
      ['Cara', 0],
    ]);
  });

  it('Deepest Run: ranks by best stage reached, alive beats eliminated', () => {
    const rows = prize(computeHonours(teams, members), 'deepestRun').rows;
    // Alice has an alive team (BRA) → ALIVE; Bob has an alive team (GER) → ALIVE;
    // Cara's only team is out in the Group Stage.
    expect(rows.map((r) => r.person)).toEqual(['Alice', 'Bob', 'Cara']);
    expect(rows[0].breakdown.bestStageRank).toBe(STAGE_RANK.ALIVE);
    expect(rows[2].breakdown.bestStageRank).toBe(STAGE_RANK.GROUP_STAGE);
    expect(rows[2].breakdown.bestStageLabel).toBe('Group Stage');
  });

  it('counts teamsAlive (still in) separately from teams (total assigned)', () => {
    const rows = prize(computeHonours(teams, members), 'deepestRun').rows;
    // Alice: BRA alive + ENG out → 1/2; Bob: GER alive + FRA out → 1/2;
    // Cara: JPN out → 0/1. `teams` stays the full total for every other prize.
    expect(rows.map((r) => [r.person, r.teamsAlive, r.teams])).toEqual([
      ['Alice', 1, 2],
      ['Bob', 1, 2],
      ['Cara', 0, 1],
    ]);
  });

  describe('tiebreaks', () => {
    it('Most Goals: equal goalsFor breaks on fewer goalsAgainst, then name', () => {
      const t = [
        makeTeam('AAA', { stats: makeStats({ goalsFor: 5, goalsAgainst: 4 }) }),
        makeTeam('BBB', { stats: makeStats({ goalsFor: 5, goalsAgainst: 2 }) }),
        makeTeam('CCC', { stats: makeStats({ goalsFor: 5, goalsAgainst: 2 }) }),
      ];
      const m: Person[] = [
        { name: 'Zoe', imageUrl: null, teams: ['CCC'] }, // gf5 ga2
        { name: 'Amy', imageUrl: null, teams: ['BBB'] }, // gf5 ga2 — ties Zoe, wins on name
        { name: 'Max', imageUrl: null, teams: ['AAA'] }, // gf5 ga4 — loses on ga
      ];
      const rows = prize(computeHonours(t, m), 'mostGoals').rows;
      expect(rows.map((r) => r.person)).toEqual(['Amy', 'Zoe', 'Max']);
    });

    it('Best Defence: equal conceded breaks on more goalsFor, then name', () => {
      const t = [
        makeTeam('AAA', { stats: makeStats({ goalsFor: 1, goalsAgainst: 2 }) }),
        makeTeam('BBB', { stats: makeStats({ goalsFor: 4, goalsAgainst: 2 }) }),
      ];
      const m: Person[] = [
        { name: 'Low', imageUrl: null, teams: ['AAA'] }, // ga2 gf1
        { name: 'Hi', imageUrl: null, teams: ['BBB'] }, // ga2 gf4 — wins on gf
      ];
      const rows = prize(computeHonours(t, m), 'bestDefence').rows;
      expect(rows.map((r) => r.person)).toEqual(['Hi', 'Low']);
    });

    it('Cleanest: equal card score breaks on fewer red cards', () => {
      const t = [
        makeTeam('AAA', { stats: makeStats({ yellowCards: 3, redCards: 0 }) }), // 3
        makeTeam('BBB', { stats: makeStats({ yellowCards: 0, redCards: 1 }) }), // 3 but a red
      ];
      const m: Person[] = [
        { name: 'Red', imageUrl: null, teams: ['BBB'] },
        { name: 'Yel', imageUrl: null, teams: ['AAA'] },
      ];
      const rows = prize(computeHonours(t, m), 'cleanest').rows;
      // Same card score (3) but Yel has 0 reds → cleaner.
      expect(rows.map((r) => r.person)).toEqual(['Yel', 'Red']);
    });

    it('Best Group-Stage Record: equal points breaks on more goalsFor', () => {
      const t = [
        makeTeam('AAA', { stats: makeStats({ points: 6, goalsFor: 2 }) }),
        makeTeam('BBB', { stats: makeStats({ points: 6, goalsFor: 5 }) }),
      ];
      const m: Person[] = [
        { name: 'Few', imageUrl: null, teams: ['AAA'] },
        { name: 'Many', imageUrl: null, teams: ['BBB'] },
      ];
      const rows = prize(computeHonours(t, m), 'bestGroupRecord').rows;
      expect(rows.map((r) => r.person)).toEqual(['Many', 'Few']);
    });

    it('Deepest Run: equal stage breaks on more points', () => {
      const t = [
        makeTeam('AAA', { eliminated: true, eliminatedAt: 'Quarter Final', stats: makeStats({ points: 9 }) }),
        makeTeam('BBB', { eliminated: true, eliminatedAt: 'Quarter Final', stats: makeStats({ points: 3 }) }),
      ];
      const m: Person[] = [
        { name: 'Low', imageUrl: null, teams: ['BBB'] },
        { name: 'Hi', imageUrl: null, teams: ['AAA'] },
      ];
      const rows = prize(computeHonours(t, m), 'deepestRun').rows;
      expect(rows.map((r) => r.person)).toEqual(['Hi', 'Low']);
      expect(rows[0].breakdown.bestStageRank).toBe(STAGE_RANK.QUARTER_FINAL);
    });

    it('falls back to alphabetical name on a complete tie', () => {
      const t = [makeTeam('AAA', { stats: makeStats({ goalsFor: 2, goalsAgainst: 2, points: 3 }) })];
      const m: Person[] = [
        { name: 'Bob', imageUrl: null, teams: ['AAA'] },
        { name: 'Amy', imageUrl: null, teams: ['AAA'] },
      ];
      const rows = prize(computeHonours(t, m), 'mostGoals').rows;
      expect(rows.map((r) => r.person)).toEqual(['Amy', 'Bob']);
    });
  });

  describe('edge cases', () => {
    it('defaults all values to 0 for an owner whose teams played 0 matches', () => {
      const t = [makeTeam('AAA', { stats: makeStats({ played: 0 }) })];
      const m: Person[] = [{ name: 'Solo', imageUrl: null, teams: ['AAA'] }];
      const result = computeHonours(t, m);
      const goals = prize(result, 'mostGoals').rows[0];
      expect(goals.value).toBe(0);
      expect(goals.teams).toBe(1);
      expect(goals.breakdown).toMatchObject({
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        cardScore: 0,
        yellowCards: 0,
        redCards: 0,
      });
    });

    it('treats an owner with no loaded teams as all-zero with teams=0', () => {
      const t = [makeTeam('AAA', { stats: makeStats({ goalsFor: 3, points: 9 }) })];
      const m: Person[] = [
        { name: 'Has', imageUrl: null, teams: ['AAA'] },
        { name: 'None', imageUrl: null, teams: ['MISSING'] },
      ];
      const rows = prize(computeHonours(t, m), 'mostGoals').rows;
      expect(rows.map((r) => [r.person, r.value, r.teams])).toEqual([
        ['Has', 3, 1],
        ['None', 0, 0],
      ]);
    });

    it('ignores unknown team codes when aggregating', () => {
      const t = [makeTeam('AAA', { stats: makeStats({ goalsFor: 4 }) })];
      const m: Person[] = [{ name: 'Mix', imageUrl: null, teams: ['AAA', 'GHOST'] }];
      const row = prize(computeHonours(t, m), 'mostGoals').rows[0];
      expect(row.value).toBe(4);
      expect(row.teams).toBe(1);
    });

    it('normalises both stage-name spellings (enum and friendly)', () => {
      const t = [
        makeTeam('AAA', { eliminated: true, eliminatedAt: 'ROUND_OF_16' }),
        makeTeam('BBB', { eliminated: true, eliminatedAt: 'Round of 16' }),
      ];
      const m: Person[] = [
        { name: 'Enum', imageUrl: null, teams: ['AAA'] },
        { name: 'Friendly', imageUrl: null, teams: ['BBB'] },
      ];
      const rows = prize(computeHonours(t, m), 'deepestRun').rows;
      rows.forEach((r) => expect(r.breakdown.bestStageRank).toBe(STAGE_RANK.ROUND_OF_16));
    });

    it('ranks a champion (won the final) above an alive team', () => {
      const t = [
        makeTeam('CHAMP', { eliminated: false }),
        makeTeam('ALIVE', { eliminated: false }),
      ];
      // Simulate a champion via the eliminatedAt label "Champion" being mapped.
      const champ = { ...t[0], eliminated: true, eliminatedAt: 'Champion' };
      const m: Person[] = [
        { name: 'Winner', imageUrl: null, teams: ['CHAMP'] },
        { name: 'Survivor', imageUrl: null, teams: ['ALIVE'] },
      ];
      const rows = prize(computeHonours([champ, t[1]], m), 'deepestRun').rows;
      expect(rows[0].person).toBe('Winner');
      expect(rows[0].breakdown.bestStageRank).toBe(STAGE_RANK.CHAMPION);
    });

    it('handles an empty members array', () => {
      const result = computeHonours(teams, []);
      result.prizes.forEach((p) => expect(p.rows).toHaveLength(0));
    });
  });
});
