import {
  computeGroupStandings,
  determineQualifiedTeams,
  isGroupStageComplete,
  buildKnockoutTree,
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

  // RSA-CAN (CAN win) is the earlier R32 tie, BRA-JPN (BRA win) the later one,
  // so they pair into R16 slot 0 as home=CAN (slot 0 winner), away=BRA (slot 1).
  const finishedR32 = () => [
    makeMatch({ matchId: 'm1', homeTeam: 'RSA', awayTeam: 'CAN', homeScore: 0, awayScore: 1, status: 'FINISHED', datetime: '2026-06-28T19:00:00Z' }),
    makeMatch({ matchId: 'm2', homeTeam: 'BRA', awayTeam: 'JPN', homeScore: 2, awayScore: 1, status: 'FINISHED', datetime: '2026-06-29T18:00:00Z' }),
  ];

  it('always returns the full bracket shape (16/8/4/2/1), path to the final intact', () => {
    const rounds = buildKnockoutTree(finishedR32());
    expect(rounds.map((r) => r.round)).toEqual([
      'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL',
    ]);
    expect(rounds.find((r) => r.round === 'ROUND_OF_16')!.slots).toHaveLength(ROUND_SIZES.ROUND_OF_16);
    expect(rounds.find((r) => r.round === 'QUARTER_FINAL')!.slots).toHaveLength(ROUND_SIZES.QUARTER_FINAL);
    expect(rounds.find((r) => r.round === 'FINAL')!.slots).toHaveLength(1);
  });

  it('advances both R32 winners into the correct R16 slot, in feeder order', () => {
    const rounds = buildKnockoutTree(finishedR32());
    const r16Slot0 = rounds.find((r) => r.round === 'ROUND_OF_16')!.slots[0];
    expect(r16Slot0.homeTeam).toBe('CAN'); // winner of the earlier tie (slot 0)
    expect(r16Slot0.awayTeam).toBe('BRA'); // winner of the later tie (slot 1)
  });

  it('leaves a slot TBD (null) when a feeding tie is not yet finished', () => {
    const matches = [
      makeMatch({ matchId: 'm1', homeTeam: 'RSA', awayTeam: 'CAN', homeScore: 0, awayScore: 1, status: 'FINISHED' }),
      makeMatch({ matchId: 'm2', homeTeam: 'BRA', awayTeam: 'JPN', status: 'LIVE', homeScore: 1, awayScore: 1, minute: "60'", datetime: '2026-06-29T18:00:00Z' }),
    ];
    const r16Slot0 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots[0];
    expect(r16Slot0.homeTeam).toBe('CAN');
    expect(r16Slot0.awayTeam).toBeNull(); // BRA-JPN undecided → no winner yet
  });

  it('does not resolve a winner from a level (penalties) score', () => {
    const matches = [
      makeMatch({ matchId: 'm1', homeTeam: 'RSA', awayTeam: 'CAN', homeScore: 1, awayScore: 1, status: 'FINISHED' }),
    ];
    const r16Slot0 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots[0];
    expect(r16Slot0.homeTeam).toBeNull();
  });

  it('attaches a real later-round fixture so its score and status surface', () => {
    const matches = [
      ...finishedR32(),
      makeMatch({
        matchId: 'r16', stage: 'ROUND_OF_16', homeTeam: 'CAN', awayTeam: 'BRA',
        homeScore: 3, awayScore: 2, status: 'FINISHED', datetime: '2026-07-04T17:00:00Z',
      }),
    ];
    const r16Slot0 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots[0];
    expect(r16Slot0.slotId).toBe('r16');
    expect(r16Slot0.status).toBe('FINISHED');
    expect(r16Slot0.homeScore).toBe(3);
    expect(r16Slot0.awayScore).toBe(2);
  });

  it('borrows the kick-off from a half-drawn fixture (one team still null upstream)', () => {
    const matches = [
      ...finishedR32(),
      // The feed has placed CAN but not yet the opponent.
      makeMatch({
        matchId: 'r16', stage: 'ROUND_OF_16', homeTeam: 'CAN', awayTeam: '',
        status: 'SCHEDULED', datetime: '2026-07-04T17:00:00Z',
      }),
    ];
    const r16Slot0 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots[0];
    // Calculated matchup is shown in full, dated from the half-drawn fixture.
    expect(r16Slot0.homeTeam).toBe('CAN');
    expect(r16Slot0.awayTeam).toBe('BRA');
    expect(r16Slot0.datetime).toBe('2026-07-04T17:00:00Z');
  });

  it('falls back to TBD on both sides when no R32 ties are finished', () => {
    const matches = [
      makeMatch({ matchId: 'm1', homeTeam: 'RSA', awayTeam: 'CAN', status: 'SCHEDULED' }),
    ];
    const r16Slot0 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots[0];
    expect(r16Slot0.homeTeam).toBeNull();
    expect(r16Slot0.awayTeam).toBeNull();
  });
});
