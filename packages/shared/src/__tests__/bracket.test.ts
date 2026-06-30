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

  it('places each tie at its fixed bracket slot, regardless of kick-off order', () => {
    // PAR sits in R32 slot 0 → its R16 tie is slot 0; CAN sits in R32 slot 2 → its
    // R16 tie is slot 1. So the later kick-off (PAR, 21:00) comes FIRST — the
    // bracket position, not the clock, fixes the order.
    const matches = [
      makeMatch({ matchId: 'par', stage: 'ROUND_OF_16', homeTeam: 'PAR', awayTeam: 'URU', datetime: '2026-07-04T21:00:00Z' }),
      makeMatch({ matchId: 'canmar', stage: 'ROUND_OF_16', homeTeam: 'CAN', awayTeam: 'MAR', datetime: '2026-07-04T17:00:00Z' }),
    ];
    const r16 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots;
    expect(r16[0].slotId).toBe('par');
    expect([r16[0].homeTeam, r16[0].awayTeam]).toEqual(['PAR', 'URU']);
    expect(r16[1].slotId).toBe('canmar');
    expect([r16[1].homeTeam, r16[1].awayTeam]).toEqual(['CAN', 'MAR']);
  });

  it('uses the feed matchup verbatim — never invents an opponent', () => {
    // Regression: GER-PAR and NED-MAR finish, but the feed says CAN v MAR and
    // PAR v <tbd>. The tree shows those exact matchups at their fixed slots —
    // never pairing PAR with MAR (their R32 ties aren't bracket-adjacent).
    const matches = [
      makeMatch({ matchId: 'r32a', homeTeam: 'GER', awayTeam: 'PAR', homeScore: 1, awayScore: 1, penaltyHome: 3, penaltyAway: 4, status: 'FINISHED', datetime: '2026-06-29T20:30:00Z' }),
      makeMatch({ matchId: 'r32b', homeTeam: 'NED', awayTeam: 'MAR', homeScore: 1, awayScore: 1, penaltyHome: 2, penaltyAway: 3, status: 'FINISHED', datetime: '2026-06-30T01:00:00Z' }),
      makeMatch({ matchId: 'r16-canmar', stage: 'ROUND_OF_16', homeTeam: 'CAN', awayTeam: 'MAR', status: 'SCHEDULED', datetime: '2026-07-04T17:00:00Z' }),
      makeMatch({ matchId: 'r16-par', stage: 'ROUND_OF_16', homeTeam: 'PAR', awayTeam: '', awayFeeder: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 77 }, status: 'SCHEDULED', datetime: '2026-07-04T21:00:00Z' }),
    ];
    const r16 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots;
    // PAR (R32 slot 0) → R16 slot 0; its opponent is genuinely undecided.
    expect(r16[0].slotId).toBe('r16-par');
    expect(r16[0].homeTeam).toBe('PAR');
    expect(r16[0].awayTeam).toBeNull(); // NOT "MAR"
    // CAN (R32 slot 2) → R16 slot 1.
    expect(r16[1].slotId).toBe('r16-canmar');
    expect([r16[1].homeTeam, r16[1].awayTeam]).toEqual(['CAN', 'MAR']);
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

  it('anchors a tie by its team to the fixed R32 slot (kick-off order is irrelevant)', () => {
    // Four finished R32 ties given in scrambled order; each lands at its true
    // bracket slot from the snapshot: RSA/CAN→2, NED/MAR→3, GER/PAR→0, BRA/JPN→8.
    const matches = [
      makeMatch({ matchId: 'ned-mar', homeTeam: 'NED', awayTeam: 'MAR', homeScore: 1, awayScore: 0, status: 'FINISHED', datetime: '2026-06-30T02:00:00Z' }),
      makeMatch({ matchId: 'bra-jpn', homeTeam: 'BRA', awayTeam: 'JPN', homeScore: 2, awayScore: 1, status: 'FINISHED', datetime: '2026-06-29T18:00:00Z' }),
      makeMatch({ matchId: 'rsa-can', homeTeam: 'RSA', awayTeam: 'CAN', homeScore: 0, awayScore: 1, status: 'FINISHED', datetime: '2026-06-28T20:00:00Z' }),
      makeMatch({ matchId: 'ger-par', homeTeam: 'GER', awayTeam: 'PAR', homeScore: 1, awayScore: 1, penaltyHome: 3, penaltyAway: 4, status: 'FINISHED', datetime: '2026-06-29T21:30:00Z' }),
    ];
    const r32 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_32')!.slots;
    expect(r32[0].slotId).toBe('ger-par');
    expect(r32[2].slotId).toBe('rsa-can');
    expect(r32[3].slotId).toBe('ned-mar');
    expect(r32[8].slotId).toBe('bra-jpn');
  });

  it('folds later rounds out of the R32 order — a tie sits at (R32 slot >> round)', () => {
    // Brazil are R32 slot 8, so their quarter-final is slot 8 >> 2 = 2.
    const matches = [
      makeMatch({ matchId: 'qf', stage: 'QUARTER_FINAL', homeTeam: 'BRA', awayTeam: 'CIV', status: 'SCHEDULED', datetime: '2026-07-10T19:00:00Z' }),
    ];
    const qf = buildKnockoutTree(matches).find((r) => r.round === 'QUARTER_FINAL')!.slots;
    expect(qf[2].slotId).toBe('qf');
    expect(qf[0].homeTeam).toBeNull(); // the other slots stay structural placeholders
  });

  it('labels each unfilled slot from the bracket structure (feeders, not bare TBD)', () => {
    const rounds = buildKnockoutTree([]);
    const r16 = rounds.find((r) => r.round === 'ROUND_OF_16')!.slots;
    // R16 slot 5 is fed by R32 matches 79 and 80 (MEX/ECU and ENG/COD).
    expect(r16[5].homeFeeder).toEqual({ outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 79 });
    expect(r16[5].awayFeeder).toEqual({ outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 80 });
    const qf = rounds.find((r) => r.round === 'QUARTER_FINAL')!.slots;
    // QF slot 0 is fed by R16 matches 89 and 90.
    expect(qf[0].homeFeeder).toEqual({ outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 89 });
    const sf = rounds.find((r) => r.round === 'SEMI_FINAL')!.slots;
    expect(sf[0].homeFeeder).toEqual({ outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: 1 });
    expect(sf[1].awayFeeder).toEqual({ outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: 4 });
    const final = rounds.find((r) => r.round === 'FINAL')!.slots;
    expect(final[0].homeFeeder).toEqual({ outcome: 'WINNER', feederRound: 'SEMI_FINAL', feederNumber: 1 });
    expect(final[0].awayFeeder).toEqual({ outcome: 'WINNER', feederRound: 'SEMI_FINAL', feederNumber: 2 });
  });

  it('keeps a fixture whose teams are off the bracket map rather than dropping it', () => {
    const matches = [
      makeMatch({ matchId: 'odd', homeTeam: 'XXX', awayTeam: 'YYY', homeScore: 1, awayScore: 0, status: 'FINISHED', datetime: '2026-06-28T20:00:00Z' }),
    ];
    const r32 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_32')!.slots;
    // Unknown teams can't be placed by the bracket, but the tie still appears
    // (in the first free slot) instead of vanishing.
    expect(r32.some((s) => s.slotId === 'odd')).toBe(true);
  });

  it('keeps a second fixture that collides on a slot rather than dropping it', () => {
    // GER and PAR both anchor to R32 slot 0 (they're the same real tie). Given as
    // two separate fixtures, the first takes the slot and the second is kept in the
    // next free slot rather than overwriting or vanishing.
    const matches = [
      makeMatch({ matchId: 'first', homeTeam: 'GER', awayTeam: 'XXX', homeScore: 1, awayScore: 0, status: 'FINISHED', datetime: '2026-06-28T20:00:00Z' }),
      makeMatch({ matchId: 'second', homeTeam: 'PAR', awayTeam: 'YYY', homeScore: 1, awayScore: 0, status: 'FINISHED', datetime: '2026-06-28T21:00:00Z' }),
    ];
    const r32 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_32')!.slots;
    expect(r32[0].slotId).toBe('first');
    expect(r32.some((s) => s.slotId === 'second')).toBe(true);
  });

  it('does not place an all-placeholder tie (the skeleton already shows it)', () => {
    const matches = [
      makeMatch({
        matchId: 'ph',
        stage: 'ROUND_OF_16',
        homeTeam: '',
        awayTeam: '',
        homeFeeder: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 79 },
        awayFeeder: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 80 },
        status: 'SCHEDULED',
        datetime: '2026-07-05T20:00:00Z',
      }),
    ];
    const r16 = buildKnockoutTree(matches).find((r) => r.round === 'ROUND_OF_16')!.slots;
    // No resolved team to anchor on → not placed; the slot stays a structural
    // placeholder (the feed adds nothing the skeleton doesn't already show).
    expect(r16.some((s) => s.slotId === 'ph')).toBe(false);
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
