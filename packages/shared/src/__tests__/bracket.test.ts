import {
  computeGroupStandings,
  determineQualifiedTeams,
  generateBracketSlots,
  getNextSlot,
  isGroupStageComplete,
  KNOCKOUT_BRACKET,
} from '../bracket';
import { Team } from '../types';

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

describe('KNOCKOUT_BRACKET', () => {
  it('has exactly 16 matches for the Round of 32', () => {
    expect(KNOCKOUT_BRACKET).toHaveLength(16);
  });

  it('uses all 12 group winners exactly once', () => {
    const winners = KNOCKOUT_BRACKET
      .flatMap((m) => [m.team1, m.team2])
      .filter((s) => s.startsWith('1'));
    const uniqueWinners = [...new Set(winners)];
    expect(uniqueWinners).toHaveLength(12);
    expect(uniqueWinners.sort()).toEqual(
      ['1A', '1B', '1C', '1D', '1E', '1F', '1G', '1H', '1I', '1J', '1K', '1L']
    );
  });

  it('uses all 8 3rd-place slots exactly once', () => {
    const thirds = KNOCKOUT_BRACKET
      .flatMap((m) => [m.team1, m.team2])
      .filter((s) => s.startsWith('3rd_'));
    const uniqueThirds = [...new Set(thirds)];
    expect(uniqueThirds).toHaveLength(8);
  });

  it('uses 12 runners-up total', () => {
    const runners = KNOCKOUT_BRACKET
      .flatMap((m) => [m.team1, m.team2])
      .filter((s) => s.startsWith('2'));
    expect(runners).toHaveLength(12);
  });

  it('maps to exactly 32 team sources total', () => {
    const all = KNOCKOUT_BRACKET.flatMap((m) => [m.team1, m.team2]);
    expect(all).toHaveLength(32);
  });
});

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

describe('generateBracketSlots', () => {
  it('generates exactly 31 tree slots', () => {
    const teams = makeFullTournament();
    const { slots } = generateBracketSlots(teams);
    // 16 R32 + 8 R16 + 4 QF + 2 SF + 1 Final = 31
    expect(slots).toHaveLength(31);
  });

  it('generates 16 Round of 32 slots with teams populated', () => {
    const teams = makeFullTournament();
    const { slots } = generateBracketSlots(teams);

    const r32 = slots.filter((s) => s.round === 'ROUND_OF_32');
    expect(r32).toHaveLength(16);
    r32.forEach((slot) => {
      expect(slot.team1).not.toBeNull();
      expect(slot.team2).not.toBeNull();
    });
  });

  it('leaves R32 slots null when no teams are qualified', () => {
    // Empty input → no groupWinners / groupRunners / thirdPlace, so every
    // bracket source resolves to null rather than throwing.
    const { slots } = generateBracketSlots([]);
    const r32 = slots.filter((s) => s.round === 'ROUND_OF_32');
    expect(r32).toHaveLength(16);
    r32.forEach((slot) => {
      expect(slot.team1).toBeNull();
      expect(slot.team2).toBeNull();
    });
  });

  it('generates empty slots for rounds after R32', () => {
    const teams = makeFullTournament();
    const { slots } = generateBracketSlots(teams);

    const laterRounds = slots.filter((s) => s.round !== 'ROUND_OF_32');
    expect(laterRounds).toHaveLength(15);
    laterRounds.forEach((slot) => {
      expect(slot.team1).toBeNull();
      expect(slot.team2).toBeNull();
      expect(slot.winner).toBeNull();
    });
  });

  it('all R32 slots have null scores and no winner', () => {
    const teams = makeFullTournament();
    const { slots } = generateBracketSlots(teams);

    const r32 = slots.filter((s) => s.round === 'ROUND_OF_32');
    r32.forEach((slot) => {
      expect(slot.score1).toBeNull();
      expect(slot.score2).toBeNull();
      expect(slot.winner).toBeNull();
    });
  });

  it('positions are sequential within each round', () => {
    const teams = makeFullTournament();
    const { slots } = generateBracketSlots(teams);

    const r32 = slots.filter((s) => s.round === 'ROUND_OF_32');
    const positions = r32.map((s) => s.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('returns eliminated teams list', () => {
    const teams = makeFullTournament();
    const { eliminated } = generateBracketSlots(teams);

    expect(eliminated.length).toBe(16); // 12 last-place + 4 worst 3rd-place
  });

  it('no team appears twice in R32', () => {
    const teams = makeFullTournament();
    const { slots } = generateBracketSlots(teams);

    const r32 = slots.filter((s) => s.round === 'ROUND_OF_32');
    const allTeams = r32.flatMap((s) => [s.team1, s.team2]).filter(Boolean);
    const unique = new Set(allTeams);
    expect(unique.size).toBe(32);
  });
});

describe('getNextSlot', () => {
  it('R32 position 1 → R16 position 1, team1', () => {
    const next = getNextSlot('ROUND_OF_32', 1);
    expect(next).toEqual({ round: 'ROUND_OF_16', position: 1, isTeam1: true });
  });

  it('R32 position 2 → R16 position 1, team2', () => {
    const next = getNextSlot('ROUND_OF_32', 2);
    expect(next).toEqual({ round: 'ROUND_OF_16', position: 1, isTeam1: false });
  });

  it('R32 position 3 → R16 position 2, team1', () => {
    const next = getNextSlot('ROUND_OF_32', 3);
    expect(next).toEqual({ round: 'ROUND_OF_16', position: 2, isTeam1: true });
  });

  it('R32 position 4 → R16 position 2, team2', () => {
    const next = getNextSlot('ROUND_OF_32', 4);
    expect(next).toEqual({ round: 'ROUND_OF_16', position: 2, isTeam1: false });
  });

  it('R16 position 1 → QF position 1, team1', () => {
    const next = getNextSlot('ROUND_OF_16', 1);
    expect(next).toEqual({ round: 'QUARTER_FINAL', position: 1, isTeam1: true });
  });

  it('SF position 1 → Final position 1, team1', () => {
    const next = getNextSlot('SEMI_FINAL', 1);
    expect(next).toEqual({ round: 'FINAL', position: 1, isTeam1: true });
  });

  it('SF position 2 → Final position 1, team2', () => {
    const next = getNextSlot('SEMI_FINAL', 2);
    expect(next).toEqual({ round: 'FINAL', position: 1, isTeam1: false });
  });

  it('Final has no next slot', () => {
    const next = getNextSlot('FINAL', 1);
    expect(next).toBeNull();
  });

  it('unknown round returns null', () => {
    const next = getNextSlot('UNKNOWN_ROUND', 1);
    expect(next).toBeNull();
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
