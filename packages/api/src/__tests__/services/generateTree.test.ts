import { generateTreeIfReady, progressKnockoutWinner, processKnockoutResults } from '../../services/generateTree';
import * as db from '../../db/dynamodb';
import { Team, TreeSlot } from '@sweepstake/shared';

jest.mock('../../db/dynamodb');

const mockedDb = db as jest.Mocked<typeof db>;

// ===== Helpers =====

function makeTeam(teamCode: string, groupLetter: string, points: number, gd: number, gf: number): Team {
  return {
    teamCode,
    name: teamCode,
    flag: '🏁',
    fifaRanking: 10,
    groupLetter,
    stats: {
      played: 3,
      wins: points === 9 ? 3 : points === 6 ? 2 : points === 3 ? 1 : 0,
      draws: 0,
      losses: 3 - (points === 9 ? 3 : points === 6 ? 2 : points === 3 ? 1 : 0),
      goalsFor: gf,
      goalsAgainst: gf - gd,
      goalDifference: gd,
      points,
      yellowCards: 0,
      redCards: 0,
      possession: null,
      xG: null,
    },
    eliminated: false,
    eliminatedAt: null,
  };
}

function makeFullTeamSet(): Team[] {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const teams: Team[] = [];
  for (const letter of letters) {
    teams.push(makeTeam(`${letter}1`, letter, 9, 6, 8));
    teams.push(makeTeam(`${letter}2`, letter, 6, 3, 5));
    teams.push(makeTeam(`${letter}3`, letter, 3, -1, 3));
    teams.push(makeTeam(`${letter}4`, letter, 0, -8, 1));
  }
  return teams;
}

// ===== Tests =====

describe('generateTreeIfReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips if tree was already generated', async () => {
    mockedDb.getConfig.mockResolvedValue({ configKey: 'treeGenerated', value: 'true' });

    const result = await generateTreeIfReady();

    expect(result).toBe(false);
    expect(mockedDb.getAllTeams).not.toHaveBeenCalled();
  });

  it('skips if group stage is not complete', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    const teams = makeFullTeamSet();
    teams[0].stats.played = 2; // group stage not done
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);

    const result = await generateTreeIfReady();

    expect(result).toBe(false);
    expect(mockedDb.putTreeSlot).not.toHaveBeenCalled();
  });

  it('generates tree when group stage is complete', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    const teams = makeFullTeamSet();
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);
    mockedDb.putTreeSlot.mockResolvedValue(undefined);
    mockedDb.putTeam.mockResolvedValue(undefined);
    mockedDb.putConfig.mockResolvedValue(undefined);

    const result = await generateTreeIfReady();

    expect(result).toBe(true);
    // 31 tree slots should be written
    expect(mockedDb.putTreeSlot).toHaveBeenCalledTimes(31);
    // Config should be updated
    expect(mockedDb.putConfig).toHaveBeenCalledWith('treeGenerated', 'true');
  });

  it('marks eliminated teams', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    const teams = makeFullTeamSet();
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);
    mockedDb.putTreeSlot.mockResolvedValue(undefined);
    mockedDb.putTeam.mockResolvedValue(undefined);
    mockedDb.putConfig.mockResolvedValue(undefined);

    await generateTreeIfReady();

    // 16 teams eliminated (12 fourth + 4 worst third)
    expect(mockedDb.putTeam).toHaveBeenCalledTimes(16);

    // Each eliminated team should have eliminated=true and eliminatedAt set
    const putTeamCalls = mockedDb.putTeam.mock.calls;
    putTeamCalls.forEach((call) => {
      const team = call[0] as unknown as Team;
      expect(team.eliminated).toBe(true);
      expect(team.eliminatedAt).toBe('Group Stage');
    });
  });

  it('writes R32 slots with correct structure', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    const teams = makeFullTeamSet();
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);
    mockedDb.putTreeSlot.mockResolvedValue(undefined);
    mockedDb.putTeam.mockResolvedValue(undefined);
    mockedDb.putConfig.mockResolvedValue(undefined);

    await generateTreeIfReady();

    // First R32 slot should have group A winner (A1) vs 3rd place team
    const firstSlot = mockedDb.putTreeSlot.mock.calls[0][0] as unknown as TreeSlot;
    expect(firstSlot.round).toBe('ROUND_OF_32');
    expect(firstSlot.position).toBe(1);
    expect(firstSlot.team1).toBe('A1');
    expect(firstSlot.team2).not.toBeNull();
    expect(firstSlot.score1).toBeNull();
    expect(firstSlot.score2).toBeNull();
    expect(firstSlot.winner).toBeNull();
  });
});

describe('progressKnockoutWinner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates current slot with score and winner', async () => {
    const existingSlots: TreeSlot[] = [
      { round: 'ROUND_OF_32', position: 1, team1: 'ENG', team2: 'NGA', score1: null, score2: null, winner: null, datetime: '2026-07-01T18:00:00Z' },
      { round: 'ROUND_OF_16', position: 1, team1: null, team2: null, score1: null, score2: null, winner: null, datetime: null },
    ];
    mockedDb.getTree.mockResolvedValue(existingSlots as unknown as Record<string, unknown>[]);
    mockedDb.putTreeSlot.mockResolvedValue(undefined);
    mockedDb.getAllTeams.mockResolvedValue([
      makeTeam('NGA', 'A', 3, -1, 3) as unknown as Record<string, unknown>,
    ]);
    mockedDb.putTeam.mockResolvedValue(undefined);

    await progressKnockoutWinner('ROUND_OF_32', 1, 'ENG', 2, 0, 'NGA');

    // Should write updated current slot
    const currentSlotCall = mockedDb.putTreeSlot.mock.calls[0][0] as unknown as TreeSlot;
    expect(currentSlotCall.round).toBe('ROUND_OF_32');
    expect(currentSlotCall.position).toBe(1);
    expect(currentSlotCall.winner).toBe('ENG');
    expect(currentSlotCall.score1).toBe(2);
    expect(currentSlotCall.score2).toBe(0);
    expect(currentSlotCall.team1).toBe('ENG');
    expect(currentSlotCall.team2).toBe('NGA');
  });

  it('progresses winner to next round as team1 for odd positions', async () => {
    const existingSlots: TreeSlot[] = [
      { round: 'ROUND_OF_32', position: 1, team1: 'ENG', team2: 'NGA', score1: null, score2: null, winner: null, datetime: null },
      { round: 'ROUND_OF_16', position: 1, team1: null, team2: null, score1: null, score2: null, winner: null, datetime: null },
    ];
    mockedDb.getTree.mockResolvedValue(existingSlots as unknown as Record<string, unknown>[]);
    mockedDb.putTreeSlot.mockResolvedValue(undefined);
    mockedDb.getAllTeams.mockResolvedValue([
      makeTeam('NGA', 'A', 3, -1, 3) as unknown as Record<string, unknown>,
    ]);
    mockedDb.putTeam.mockResolvedValue(undefined);

    await progressKnockoutWinner('ROUND_OF_32', 1, 'ENG', 2, 0, 'NGA');

    // Second putTreeSlot call is the next round
    const nextSlotCall = mockedDb.putTreeSlot.mock.calls[1][0] as unknown as TreeSlot;
    expect(nextSlotCall.round).toBe('ROUND_OF_16');
    expect(nextSlotCall.position).toBe(1);
    expect(nextSlotCall.team1).toBe('ENG');
    expect(nextSlotCall.team2).toBeNull();
  });

  it('progresses winner to next round as team2 for even positions', async () => {
    const existingSlots: TreeSlot[] = [
      { round: 'ROUND_OF_32', position: 2, team1: 'BRA', team2: 'FRA', score1: null, score2: null, winner: null, datetime: null },
      { round: 'ROUND_OF_16', position: 1, team1: 'ENG', team2: null, score1: null, score2: null, winner: null, datetime: null },
    ];
    mockedDb.getTree.mockResolvedValue(existingSlots as unknown as Record<string, unknown>[]);
    mockedDb.putTreeSlot.mockResolvedValue(undefined);
    mockedDb.getAllTeams.mockResolvedValue([
      makeTeam('FRA', 'B', 6, 3, 5) as unknown as Record<string, unknown>,
    ]);
    mockedDb.putTeam.mockResolvedValue(undefined);

    await progressKnockoutWinner('ROUND_OF_32', 2, 'BRA', 3, 1, 'FRA');

    const nextSlotCall = mockedDb.putTreeSlot.mock.calls[1][0] as unknown as TreeSlot;
    expect(nextSlotCall.round).toBe('ROUND_OF_16');
    expect(nextSlotCall.position).toBe(1);
    expect(nextSlotCall.team1).toBe('ENG'); // preserved
    expect(nextSlotCall.team2).toBe('BRA');
  });

  it('marks the loser as eliminated', async () => {
    const loserTeam = makeTeam('NGA', 'A', 3, -1, 3);
    mockedDb.getTree.mockResolvedValue([
      { round: 'ROUND_OF_32', position: 1, team1: 'ENG', team2: 'NGA', score1: null, score2: null, winner: null, datetime: null },
    ] as unknown as Record<string, unknown>[]);
    mockedDb.putTreeSlot.mockResolvedValue(undefined);
    mockedDb.getAllTeams.mockResolvedValue([loserTeam as unknown as Record<string, unknown>]);
    mockedDb.putTeam.mockResolvedValue(undefined);

    await progressKnockoutWinner('ROUND_OF_32', 1, 'ENG', 2, 0, 'NGA');

    expect(mockedDb.putTeam).toHaveBeenCalled();
    const updatedTeam = mockedDb.putTeam.mock.calls[0][0] as unknown as Team;
    expect(updatedTeam.teamCode).toBe('NGA');
    expect(updatedTeam.eliminated).toBe(true);
    expect(updatedTeam.eliminatedAt).toBe('Round of 32');
  });

  it('does not progress from the Final', async () => {
    mockedDb.getTree.mockResolvedValue([
      { round: 'FINAL', position: 1, team1: 'ENG', team2: 'BRA', score1: null, score2: null, winner: null, datetime: null },
    ] as unknown as Record<string, unknown>[]);
    mockedDb.putTreeSlot.mockResolvedValue(undefined);
    mockedDb.getAllTeams.mockResolvedValue([
      makeTeam('BRA', 'A', 9, 6, 8) as unknown as Record<string, unknown>,
    ]);
    mockedDb.putTeam.mockResolvedValue(undefined);

    await progressKnockoutWinner('FINAL', 1, 'ENG', 2, 1, 'BRA');

    // Only 1 putTreeSlot call (updating current slot), no next round
    expect(mockedDb.putTreeSlot).toHaveBeenCalledTimes(1);
  });
});

describe('processKnockoutResults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignores group stage matches', async () => {
    mockedDb.getTree.mockResolvedValue([]);

    await processKnockoutResults([
      { matchId: '1', stage: 'GROUP_STAGE', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: 2, awayScore: 1, status: 'FINISHED' },
    ]);

    expect(mockedDb.putTreeSlot).not.toHaveBeenCalled();
  });

  it('ignores scheduled knockout matches', async () => {
    mockedDb.getTree.mockResolvedValue([]);

    await processKnockoutResults([
      { matchId: '1', stage: 'ROUND_OF_32', homeTeam: 'ENG', awayTeam: 'BRA', homeScore: null, awayScore: null, status: 'SCHEDULED' },
    ]);

    expect(mockedDb.putTreeSlot).not.toHaveBeenCalled();
  });

  it('progresses finished knockout matches that have no winner yet', async () => {
    const existingSlots = [
      { round: 'ROUND_OF_32', position: 1, team1: 'ENG', team2: 'NGA', score1: null, score2: null, winner: null, datetime: null },
      { round: 'ROUND_OF_16', position: 1, team1: null, team2: null, score1: null, score2: null, winner: null, datetime: null },
    ];
    mockedDb.getTree.mockResolvedValue(existingSlots as unknown as Record<string, unknown>[]);
    mockedDb.putTreeSlot.mockResolvedValue(undefined);
    mockedDb.getAllTeams.mockResolvedValue([
      makeTeam('NGA', 'A', 3, -1, 3) as unknown as Record<string, unknown>,
    ]);
    mockedDb.putTeam.mockResolvedValue(undefined);

    await processKnockoutResults([
      { matchId: '100', stage: 'ROUND_OF_32', homeTeam: 'ENG', awayTeam: 'NGA', homeScore: 2, awayScore: 0, status: 'FINISHED' },
    ]);

    expect(mockedDb.putTreeSlot).toHaveBeenCalled();
  });

  it('skips matches that already have a winner in the tree', async () => {
    const existingSlots = [
      { round: 'ROUND_OF_32', position: 1, team1: 'ENG', team2: 'NGA', score1: 2, score2: 0, winner: 'ENG', datetime: null },
    ];
    mockedDb.getTree.mockResolvedValue(existingSlots as unknown as Record<string, unknown>[]);

    await processKnockoutResults([
      { matchId: '100', stage: 'ROUND_OF_32', homeTeam: 'ENG', awayTeam: 'NGA', homeScore: 2, awayScore: 0, status: 'FINISHED' },
    ]);

    expect(mockedDb.putTreeSlot).not.toHaveBeenCalled();
  });
});
