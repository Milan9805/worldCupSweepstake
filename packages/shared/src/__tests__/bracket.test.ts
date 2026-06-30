import {
  computeGroupStandings,
  determineQualifiedTeams,
  isGroupStageComplete,
  buildKnockoutTree,
  tieWinner,
  ROUND_SIZES,
} from '../bracket';
import { Team, Match } from '../types';

// ===== Helpers =====

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    teamCode: 'ENG',
    name: 'England',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    fifaRanking: 4,
    groupLetter: 'A',
    stats: {
      played: 3,
      wins: 2,
      draws: 1,
      losses: 0,
      goalsFor: 5,
      goalsAgainst: 1,
      goalDifference: 4,
      points: 7,
      yellowCards: 2,
      redCards: 0,
      possession: 62,
      xG: 4.5,
    },
    eliminated: false,
    eliminatedAt: null,
    ...overrides,
  };
}

function makeGroupOfFour(letter: string): Team[] {
  return [
    makeTeam({ teamCode: `${letter}1`, groupLetter: letter, stats: { ...makeTeam().stats, points: 9, goalDifference: 6, goalsFor: 8 } }),
    makeTeam({ teamCode: `${letter}2`, groupLetter: letter, stats: { ...makeTeam().stats, points: 6, goalDifference: 3, goalsFor: 5 } }),
    makeTeam({ teamCode: `${letter}3`, groupLetter: letter, stats: { ...makeTeam().stats, points: 3, goalDifference: -1, goalsFor: 3 } }),
    makeTeam({ teamCode: `${letter}4`, groupLetter: letter, stats: { ...makeTeam().stats, points: 0, goalDifference: -8, goalsFor: 1 } }),
  ];
}

function makeFullTournament(): Team[] {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  return letters.flatMap((letter) => makeGroupOfFour(letter));
}

// ===== Tests =====

describe('computeGroupStandings', () => {
  it('returns teams sorted by points descending', () => {
    const teams = makeGroupOfFour('A');
    const standings = computeGroupStandings(teams);
    const groupA = standings.get('A')!;

    expect(groupA).toHaveLength(4);
    expect(groupA[0].teamCode).toBe('A1');
    expect(groupA[1].teamCode).toBe('A2');
    expect(groupA[2].teamCode).toBe('A3');
    expect(groupA[3].teamCode).toBe('A4');
  });

  it('uses goal difference as tiebreaker', () => {
    const teams = [
      makeTeam({ teamCode: 'T1', groupLetter: 'A', stats: { ...makeTeam().stats, points: 6, goalDifference: 5, goalsFor: 7 } }),
      makeTeam({ teamCode: 'T2', groupLetter: 'A', stats: { ...makeTeam().stats, points: 6, goalDifference: 3, goalsFor: 5 } }),
      makeTeam({ teamCode: 'T3', groupLetter: 'A', stats: { ...makeTeam().stats, points: 3, goalDifference: 0, goalsFor: 3 } }),
      makeTeam({ teamCode: 'T4', groupLetter: 'A', stats: { ...makeTeam().stats, points: 0, goalDifference: -8, goalsFor: 1 } }),
    ];
    const standings = computeGroupStandings(teams);
    const groupA = standings.get('A')!;

    expect(groupA[0].teamCode).toBe('T1');
    expect(groupA[1].teamCode).toBe('T2');
  });

  it('uses goals for as second tiebreaker', () => {
    const teams = [
      makeTeam({ teamCode: 'T1', groupLetter: 'A', stats: { ...makeTeam().stats, points: 6, goalDifference: 3, goalsFor: 8 } }),
      makeTeam({ teamCode: 'T2', groupLetter: 'A', stats: { ...makeTeam().stats, points: 6, goalDifference: 3, goalsFor: 5 } }),
      makeTeam({ teamCode: 'T3', groupLetter: 'A', stats: { ...makeTeam().stats, points: 3, goalDifference: 0, goalsFor: 3 } }),
      makeTeam({ teamCode: 'T4', groupLetter: 'A', stats: { ...makeTeam().stats, points: 0, goalDifference: -6, goalsFor: 1 } }),
    ];
    const standings = computeGroupStandings(teams);
    const groupA = standings.get('A')!;

    expect(groupA[0].teamCode).toBe('T1');
    expect(groupA[1].teamCode).toBe('T2');
  });

  it('returns standings for all 12 groups', () => {
    const teams = makeFullTournament();
    const standings = computeGroupStandings(teams);
    expect(standings.size).toBe(12);
  });
});

describe('determineQualifiedTeams', () => {
  it('identifies 12 group winners', () => {
    const teams = makeFullTournament();
    const standings = computeGroupStandings(teams);
    const qualified = determineQualifiedTeams(standings);

    expect(qualified.groupWinners.size).toBe(12);
  });

  it('identifies 12 group runners-up', () => {
    const teams = makeFullTournament();
    const standings = computeGroupStandings(teams);
    const qualified = determineQualifiedTeams(standings);

    expect(qualified.groupRunners.size).toBe(12);
  });

  it('selects best 8 third-place teams', () => {
    const teams = makeFullTournament();
    const standings = computeGroupStandings(teams);
    const qualified = determineQualifiedTeams(standings);

    expect(qualified.thirdPlace).toHaveLength(8);
  });

  it('eliminates 4th-place teams and worst 4 third-place teams', () => {
    const teams = makeFullTournament();
    const standings = computeGroupStandings(teams);
    const qualified = determineQualifiedTeams(standings);

    // 12 groups × 1 fourth-place + 4 worst third-place = 16 eliminated
    expect(qualified.eliminated).toHaveLength(16);
  });

  it('total qualified teams = 32', () => {
    const teams = makeFullTournament();
    const standings = computeGroupStandings(teams);
    const qualified = determineQualifiedTeams(standings);

    const totalQualified =
      qualified.groupWinners.size +
      qualified.groupRunners.size +
      qualified.thirdPlace.length;
    expect(totalQualified).toBe(32);
  });

  it('ranks 3rd-place teams by points then goal difference', () => {
    const teams = makeFullTournament();
    // Give group A's 3rd place better stats than others
    const a3 = teams.find((t) => t.teamCode === 'A3')!;
    a3.stats.points = 6;
    a3.stats.goalDifference = 2;
    a3.stats.goalsFor = 5;

    const standings = computeGroupStandings(teams);
    const qualified = determineQualifiedTeams(standings);

    // A3 should be the best 3rd-place team
    expect(qualified.thirdPlace[0]).toBe('A3');
  });

  it('skips groups with fewer than 3 teams', () => {
    // A group with only 2 teams contributes nothing — no winner/runner/third
    // is recorded for it.
    const standings = new Map([
      ['A', [
        { teamCode: 'X1', points: 9, goalDifference: 5, goalsFor: 8, groupLetter: 'A' },
        { teamCode: 'X2', points: 3, goalDifference: 0, goalsFor: 3, groupLetter: 'A' },
      ]],
    ]);
    const qualified = determineQualifiedTeams(standings);
    expect(qualified.groupWinners.size).toBe(0);
    expect(qualified.groupRunners.size).toBe(0);
    expect(qualified.thirdPlace).toHaveLength(0);
  });
});

describe('isGroupStageComplete', () => {
  it('returns true when all teams have played 3 matches', () => {
    const teams = makeFullTournament();
    expect(isGroupStageComplete(teams)).toBe(true);
  });

  it('returns false when some teams have not played 3 matches', () => {
    const teams = makeFullTournament();
    teams[0].stats.played = 2;
    expect(isGroupStageComplete(teams)).toBe(false);
  });

  it('returns false for empty team list', () => {
    expect(isGroupStageComplete([])).toBe(false);
  });

  it('returns true when teams have played more than 3 matches', () => {
    const teams = makeFullTournament();
    teams[0].stats.played = 4; // shouldn't happen but should still pass
    expect(isGroupStageComplete(teams)).toBe(true);
  });
});

describe('buildKnockoutTree', () => {
  function makeMatch(overrides: Partial<Match> = {}): Match {
    return {
      matchId: 'm',
      homeTeam: 'AAA',
      awayTeam: 'BBB',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
      stage: 'ROUND_OF_32',
      group: null,
      datetime: '2026-06-28T19:00:00Z',
      venue: 'Stadium',
      ...overrides,
    };
  }

  it('always returns the full bracket shape (16/8/4/2/1), path to the final intact', () => {
    const rounds = buildKnockoutTree([]);
    expect(rounds.map((r) => r.round)).toEqual([
      'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL',
    ]);
    expect(rounds.find((r) => r.round === 'ROUND_OF_16')!.slots).toHaveLength(ROUND_SIZES.ROUND_OF_16);
    expect(rounds.find((r) => r.round === 'QUARTER_FINAL')!.slots).toHaveLength(ROUND_SIZES.QUARTER_FINAL);
    expect(rounds.find((r) => r.round === 'FINAL')!.slots).toHaveLength(1);
  });

  it('takes each round straight from the feed fixtures, in kick-off order', () => {
    const matches = [
      makeMatch({ matchId: 'late', stage: 'ROUND_OF_16', homeTeam: 'PAR', awayTeam: 'URU', datetime: '2026-07-04T21:00:00Z' }),
      makeMatch({ matchId: 'early', stage: 'ROUND_OF_16', homeTeam: 'CAN', awayTeam: 'MAR', datetime: '2026-07-04T17:00:00Z' }),
    ];
    const r16 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots;
    expect(r16[0].slotId).toBe('early'); // 17:00 before 21:00
    expect([r16[0].homeTeam, r16[0].awayTeam]).toEqual(['CAN', 'MAR']);
    expect([r16[1].homeTeam, r16[1].awayTeam]).toEqual(['PAR', 'URU']);
  });

  it('uses the feed matchup verbatim — never a positional pairing of R32 winners', () => {
    // Regression: GER-PAR and NED-MAR finish, but their winners are NOT bracket-
    // adjacent. The feed says CAN v MAR and PAR v <tbd>; the tree must show those,
    // not pair PAR with MAR by kick-off position.
    const matches = [
      makeMatch({ matchId: 'r32a', homeTeam: 'GER', awayTeam: 'PAR', homeScore: 1, awayScore: 1, penaltyHome: 3, penaltyAway: 4, status: 'FINISHED', datetime: '2026-06-29T20:30:00Z' }),
      makeMatch({ matchId: 'r32b', homeTeam: 'NED', awayTeam: 'MAR', homeScore: 1, awayScore: 1, penaltyHome: 2, penaltyAway: 3, status: 'FINISHED', datetime: '2026-06-30T01:00:00Z' }),
      makeMatch({ matchId: 'r16a', stage: 'ROUND_OF_16', homeTeam: 'CAN', awayTeam: 'MAR', status: 'SCHEDULED', datetime: '2026-07-04T17:00:00Z' }),
      makeMatch({ matchId: 'r16b', stage: 'ROUND_OF_16', homeTeam: 'PAR', awayTeam: '', awayFeeder: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 77 }, status: 'SCHEDULED', datetime: '2026-07-04T21:00:00Z' }),
    ];
    const r16 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots;
    expect([r16[0].homeTeam, r16[0].awayTeam]).toEqual(['CAN', 'MAR']);
    expect(r16[1].homeTeam).toBe('PAR');
    expect(r16[1].awayTeam).toBeNull(); // genuinely undecided — NOT "MAR"
  });

  it('carries a finished tie\'s score and shootout tally onto its slot', () => {
    const matches = [
      makeMatch({ matchId: 'r16', stage: 'ROUND_OF_16', homeTeam: 'GER', awayTeam: 'PAR', homeScore: 1, awayScore: 1, penaltyHome: 3, penaltyAway: 4, status: 'FINISHED', datetime: '2026-07-04T17:00:00Z' }),
    ];
    const slot = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots[0];
    expect(slot).toMatchObject({ slotId: 'r16', status: 'FINISHED', homeScore: 1, awayScore: 1, penaltyHome: 3, penaltyAway: 4 });
  });

  it('shows an unresolved side as null and carries its feeder label', () => {
    const matches = [
      makeMatch({ matchId: 'r16', stage: 'ROUND_OF_16', homeTeam: 'PAR', awayTeam: '', awayFeeder: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 77 }, status: 'SCHEDULED', datetime: '2026-07-04T21:00:00Z' }),
    ];
    const slot = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots[0];
    expect(slot.homeTeam).toBe('PAR');
    expect(slot.awayTeam).toBeNull();
    expect(slot.awayFeeder).toEqual({ outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 77 });
  });

  it('pads a round that has no fixtures yet with TBD placeholder slots', () => {
    const slots = buildKnockoutTree([]).find((r) => r.round === 'QUARTER_FINAL')!.slots;
    expect(slots).toHaveLength(ROUND_SIZES.QUARTER_FINAL);
    expect(slots.every((s) => s.homeTeam === null && s.awayTeam === null)).toBe(true);
  });
});

describe('tieWinner', () => {
  const slot = (over: Partial<import('../bracket').BracketSlot> = {}) => ({
    slotId: 's', homeTeam: 'CAN', awayTeam: 'BRA', homeScore: null, awayScore: null,
    status: 'FINISHED' as const, datetime: null, ...over,
  });

  it('returns the higher-scoring side', () => {
    expect(tieWinner(slot({ homeScore: 2, awayScore: 1 }))).toBe('CAN');
    expect(tieWinner(slot({ homeScore: 0, awayScore: 1 }))).toBe('BRA');
  });

  it('resolves a level score on the shootout tally', () => {
    expect(tieWinner(slot({ homeScore: 1, awayScore: 1, penaltyHome: 4, penaltyAway: 3 }))).toBe('CAN');
    expect(tieWinner(slot({ homeScore: 1, awayScore: 1, penaltyHome: 2, penaltyAway: 4 }))).toBe('BRA');
  });

  it('returns null when undecided (unfinished, or level with no shootout)', () => {
    expect(tieWinner(slot({ homeScore: 1, awayScore: 1 }))).toBeNull();
    expect(tieWinner(slot({ status: 'LIVE', homeScore: 2, awayScore: 1 }))).toBeNull();
    expect(tieWinner(slot({ homeScore: null, awayScore: null }))).toBeNull();
  });
});
