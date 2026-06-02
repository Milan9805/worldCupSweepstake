import { teamStrength, calculateLeaderboard, STAGE_WEIGHTS } from '../probability';
import { Team, Person } from '../types';

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
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
});

describe('STAGE_WEIGHTS', () => {
  it('has increasing weights for later stages', () => {
    expect(STAGE_WEIGHTS['GROUP_STAGE']).toBe(1);
    expect(STAGE_WEIGHTS['ROUND_OF_32']).toBe(2);
    expect(STAGE_WEIGHTS['ROUND_OF_16']).toBe(3);
    expect(STAGE_WEIGHTS['QUARTER_FINAL']).toBe(5);
    expect(STAGE_WEIGHTS['SEMI_FINAL']).toBe(8);
    expect(STAGE_WEIGHTS['FINAL']).toBe(15);
  });
});

describe('teamStrength', () => {
  it('returns 0 for eliminated teams', () => {
    const team = makeTeam({ eliminated: true, eliminatedAt: 'GROUP_STAGE' });
    expect(teamStrength(team)).toBe(0);
  });

  it('returns higher strength for better-ranked teams', () => {
    const topTeam = makeTeam({ fifaRanking: 1 });
    const lowTeam = makeTeam({ fifaRanking: 100 });
    expect(teamStrength(topTeam)).toBeGreaterThan(teamStrength(lowTeam));
  });

  it('returns a value between 0 and 1 for active teams', () => {
    const team = makeTeam();
    const strength = teamStrength(team);
    expect(strength).toBeGreaterThan(0);
    expect(strength).toBeLessThanOrEqual(1);
  });

  it('accounts for performance stats in the score', () => {
    const goodPerformance = makeTeam({
      stats: {
        played: 3, wins: 3, draws: 0, losses: 0,
        goalsFor: 9, goalsAgainst: 0, goalDifference: 9,
        points: 9, yellowCards: 0, redCards: 0, possession: 70, xG: 8.0,
      },
    });
    const poorPerformance = makeTeam({
      stats: {
        played: 3, wins: 0, draws: 0, losses: 3,
        goalsFor: 0, goalsAgainst: 9, goalDifference: -9,
        points: 0, yellowCards: 5, redCards: 1, possession: 30, xG: 0.5,
      },
    });
    expect(teamStrength(goodPerformance)).toBeGreaterThan(teamStrength(poorPerformance));
  });

  it('handles the worst ranked active team', () => {
    const team = makeTeam({ fifaRanking: 211 });
    const strength = teamStrength(team);
    expect(strength).toBeGreaterThanOrEqual(0);
  });

  it('clamps negative performance to 0', () => {
    const team = makeTeam({
      fifaRanking: 200,
      stats: {
        played: 3, wins: 0, draws: 0, losses: 3,
        goalsFor: 0, goalsAgainst: 10, goalDifference: -10,
        points: 0, yellowCards: 5, redCards: 2, possession: 20, xG: 0.1,
      },
    });
    const strength = teamStrength(team);
    // Performance score is negative, but clamped via Math.max(0, ...)
    expect(strength).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateLeaderboard', () => {
  it('returns normalized probabilities summing to ~1', () => {
    const teams: Team[] = [
      makeTeam({ teamCode: 'ENG', fifaRanking: 4 }),
      makeTeam({ teamCode: 'BRA', fifaRanking: 1, name: 'Brazil' }),
      makeTeam({ teamCode: 'GER', fifaRanking: 15, name: 'Germany' }),
      makeTeam({ teamCode: 'JPN', fifaRanking: 20, name: 'Japan' }),
    ];

    const members: Person[] = [
      { name: 'Alice', imageUrl: null, teams: ['ENG', 'BRA'] },
      { name: 'Bob', imageUrl: null, teams: ['GER', 'JPN'] },
    ];

    const result = calculateLeaderboard(members, teams);
    const totalProb = result.reduce((sum, e) => sum + e.winProbability, 0);

    expect(totalProb).toBeCloseTo(1.0, 1);
    expect(result).toHaveLength(2);
    // Alice has better-ranked teams
    expect(result[0].winProbability).toBeGreaterThanOrEqual(result[1].winProbability);
  });

  it('ranks people with more alive teams higher', () => {
    const teams: Team[] = [
      makeTeam({ teamCode: 'ENG', fifaRanking: 4 }),
      makeTeam({ teamCode: 'BRA', fifaRanking: 1, eliminated: true, eliminatedAt: 'GROUP_STAGE' }),
      makeTeam({ teamCode: 'GER', fifaRanking: 15 }),
      makeTeam({ teamCode: 'JPN', fifaRanking: 20 }),
    ];

    const members: Person[] = [
      { name: 'Alice', imageUrl: null, teams: ['ENG', 'BRA'] },
      { name: 'Bob', imageUrl: null, teams: ['GER', 'JPN'] },
    ];

    const result = calculateLeaderboard(members, teams);
    // Bob has 2 alive teams, Alice has 1
    expect(result[0].name).toBe('Bob');
    expect(result[0].teamsAlive).toBe(2);
  });

  it('handles all teams eliminated (totalStrength = 0)', () => {
    const teams: Team[] = [
      makeTeam({ teamCode: 'ENG', eliminated: true, eliminatedAt: 'ROUND_OF_16' }),
      makeTeam({ teamCode: 'BRA', eliminated: true, eliminatedAt: 'GROUP_STAGE' }),
    ];

    const members: Person[] = [
      { name: 'Alice', imageUrl: null, teams: ['ENG'] },
      { name: 'Bob', imageUrl: null, teams: ['BRA'] },
    ];

    const result = calculateLeaderboard(members, teams);
    expect(result).toHaveLength(2);
    // All probabilities should be 0 since totalStrength is 0
    result.forEach((entry) => {
      expect(entry.winProbability).toBe(0);
    });
  });

  it('handles unknown team codes gracefully', () => {
    const teams: Team[] = [
      makeTeam({ teamCode: 'ENG', fifaRanking: 4 }),
    ];

    const members: Person[] = [
      { name: 'Alice', imageUrl: null, teams: ['ENG', 'UNKNOWN'] },
    ];

    const result = calculateLeaderboard(members, teams);
    expect(result).toHaveLength(1);
    expect(result[0].totalTeams).toBe(1); // only ENG found
  });

  it('returns bestStage as "Still Active" when teams are alive', () => {
    const teams: Team[] = [
      makeTeam({ teamCode: 'ENG', fifaRanking: 4 }),
    ];

    const members: Person[] = [
      { name: 'Alice', imageUrl: null, teams: ['ENG'] },
    ];

    const result = calculateLeaderboard(members, teams);
    expect(result[0].bestStage).toBe('Still Active');
  });

  it('returns formatted stage name when all teams eliminated', () => {
    const teams: Team[] = [
      makeTeam({ teamCode: 'ENG', eliminated: true, eliminatedAt: 'QUARTER_FINAL' }),
      makeTeam({ teamCode: 'BRA', eliminated: true, eliminatedAt: 'GROUP_STAGE' }),
    ];

    const members: Person[] = [
      { name: 'Alice', imageUrl: null, teams: ['ENG', 'BRA'] },
    ];

    const result = calculateLeaderboard(members, teams);
    expect(result[0].bestStage).toBe('QUARTER FINAL');
  });

  it('returns "Group Stage" when no stage matches', () => {
    const teams: Team[] = [
      makeTeam({ teamCode: 'ENG', eliminated: true, eliminatedAt: null }),
    ];

    const members: Person[] = [
      { name: 'Alice', imageUrl: null, teams: ['ENG'] },
    ];

    const result = calculateLeaderboard(members, teams);
    expect(result[0].bestStage).toBe('Group Stage');
  });

  it('handles empty members array', () => {
    const teams: Team[] = [makeTeam({ teamCode: 'ENG' })];
    const result = calculateLeaderboard([], teams);
    expect(result).toHaveLength(0);
  });

  it('includes imageUrl in result', () => {
    const teams: Team[] = [makeTeam({ teamCode: 'ENG' })];
    const members: Person[] = [
      { name: 'Alice', imageUrl: 'http://example.com/avatar.png', teams: ['ENG'] },
    ];

    const result = calculateLeaderboard(members, teams);
    expect(result[0].imageUrl).toBe('http://example.com/avatar.png');
  });

  it('sorts by teamsAlive first, then winProbability', () => {
    const teams: Team[] = [
      makeTeam({ teamCode: 'ENG', fifaRanking: 1 }),
      makeTeam({ teamCode: 'BRA', fifaRanking: 2 }),
      makeTeam({ teamCode: 'GER', fifaRanking: 50 }),
    ];

    const members: Person[] = [
      { name: 'Alice', imageUrl: null, teams: ['ENG'] },
      { name: 'Bob', imageUrl: null, teams: ['BRA', 'GER'] },
    ];

    const result = calculateLeaderboard(members, teams);
    // Bob has more teams alive, so ranks first
    expect(result[0].name).toBe('Bob');
    expect(result[0].teamsAlive).toBe(2);
    expect(result[1].name).toBe('Alice');
    expect(result[1].teamsAlive).toBe(1);
  });
});
