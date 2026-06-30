import {
  finalizeGroupStageIfReady,
  markKnockoutLosersEliminated,
  markCompletedGroupEliminations,
} from '../../services/knockout';
import * as db from '../../db/dynamodb';
import { Team } from '@sweepstake/shared';

jest.mock('../../db/dynamodb');

const mockedDb = db as jest.Mocked<typeof db>;

// ===== Helpers =====

function makeTeam(teamCode: string, groupLetter: string, points: number, gd: number, gf: number): Team {
  const wins = points === 9 ? 3 : points === 6 ? 2 : points === 3 ? 1 : 0;
  return {
    teamCode,
    name: teamCode,
    flag: '🏁',
    fifaRanking: 10,
    groupLetter,
    stats: {
      played: 3,
      wins,
      draws: 0,
      losses: 3 - wins,
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

describe('finalizeGroupStageIfReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips if the group stage was already finalised', async () => {
    mockedDb.getConfig.mockResolvedValue({ configKey: 'treeGenerated', value: 'true' });

    const result = await finalizeGroupStageIfReady();

    expect(result).toBe(false);
    expect(mockedDb.getAllTeams).not.toHaveBeenCalled();
  });

  it('skips if the group stage is not complete', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    const teams = makeFullTeamSet();
    teams[0].stats.played = 2; // group stage not done
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);

    const result = await finalizeGroupStageIfReady();

    expect(result).toBe(false);
    expect(mockedDb.putTeam).not.toHaveBeenCalled();
    expect(mockedDb.putEvent).not.toHaveBeenCalled();
  });

  it('marks the non-qualifying teams eliminated and emits BRACKET_DRAWN once', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    const teams = makeFullTeamSet();
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);
    mockedDb.putTeam.mockResolvedValue(undefined);
    mockedDb.putConfig.mockResolvedValue(undefined);
    mockedDb.putEvent.mockResolvedValue(undefined);

    const result = await finalizeGroupStageIfReady();

    expect(result).toBe(true);
    // 16 eliminated = 12 fourth-place + 4 worst third-place.
    expect(mockedDb.putTeam).toHaveBeenCalledTimes(16);
    mockedDb.putTeam.mock.calls.forEach((call) => {
      const team = call[0] as unknown as Team;
      expect(team.eliminated).toBe(true);
      expect(team.eliminatedAt).toBe('Group Stage');
    });
    expect(mockedDb.putConfig).toHaveBeenCalledWith('treeGenerated', 'true');
    expect(mockedDb.putEvent).toHaveBeenCalledTimes(1);
    expect(mockedDb.putEvent.mock.calls[0][0]).toMatchObject({
      eventId: 'BRACKET_DRAWN',
      type: 'BRACKET_DRAWN',
    });
  });

  it('does not re-write teams already flagged eliminated', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    const teams = makeFullTeamSet();
    // Pre-eliminate all of group A's already-out teams (4th + the 3rd, say).
    teams.forEach((t) => {
      if (t.teamCode === 'A4') {
        t.eliminated = true;
        t.eliminatedAt = 'Group Stage';
      }
    });
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);
    mockedDb.putTeam.mockResolvedValue(undefined);
    mockedDb.putConfig.mockResolvedValue(undefined);
    mockedDb.putEvent.mockResolvedValue(undefined);

    await finalizeGroupStageIfReady();

    const written = mockedDb.putTeam.mock.calls.map((c) => (c[0] as unknown as Team).teamCode);
    expect(written).not.toContain('A4');
  });
});

describe('markCompletedGroupEliminations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('eliminates the 4th-placed team in each completed group', async () => {
    const teams = makeFullTeamSet();
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);
    mockedDb.batchPutTeams.mockResolvedValue(undefined);

    await markCompletedGroupEliminations();

    expect(mockedDb.batchPutTeams).toHaveBeenCalledTimes(1);
    const written = mockedDb.batchPutTeams.mock.calls[0][0] as unknown as Team[];
    // One 4th-placed team per group → 12.
    expect(written).toHaveLength(12);
    expect(written.every((t) => t.eliminated && t.eliminatedAt === 'Group Stage')).toBe(true);
    expect(written.map((t) => t.teamCode).sort()).toEqual(
      ['A4', 'B4', 'C4', 'D4', 'E4', 'F4', 'G4', 'H4', 'I4', 'J4', 'K4', 'L4'],
    );
  });

  it('does nothing while a group is still in progress', async () => {
    const teams = makeFullTeamSet();
    teams.forEach((t) => { t.stats.played = 2; });
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);

    await markCompletedGroupEliminations();

    expect(mockedDb.batchPutTeams).not.toHaveBeenCalled();
  });
});

describe('markKnockoutLosersEliminated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const knockoutMatch = (over: Partial<Parameters<typeof markKnockoutLosersEliminated>[0][number]> = {}) => ({
    matchId: 'm1',
    stage: 'ROUND_OF_32',
    homeTeam: 'ENG',
    awayTeam: 'NGA',
    homeScore: 2,
    awayScore: 0,
    status: 'FINISHED',
    ...over,
  });

  it('eliminates the loser of a decided knockout match at that round', async () => {
    const teams = [makeTeam('ENG', 'A', 9, 6, 8), makeTeam('NGA', 'B', 6, 3, 5)];
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);
    mockedDb.batchPutTeams.mockResolvedValue(undefined);

    await markKnockoutLosersEliminated([knockoutMatch()]);

    expect(mockedDb.batchPutTeams).toHaveBeenCalledTimes(1);
    const written = mockedDb.batchPutTeams.mock.calls[0][0] as unknown as Team[];
    expect(written).toHaveLength(1);
    expect(written[0].teamCode).toBe('NGA');
    expect(written[0].eliminated).toBe(true);
    expect(written[0].eliminatedAt).toBe('Round of 32');
  });

  it('eliminates the home team when the away team wins', async () => {
    const teams = [makeTeam('ENG', 'A', 9, 6, 8), makeTeam('NGA', 'B', 6, 3, 5)];
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);
    mockedDb.batchPutTeams.mockResolvedValue(undefined);

    await markKnockoutLosersEliminated([knockoutMatch({ homeScore: 0, awayScore: 2 })]);

    const written = mockedDb.batchPutTeams.mock.calls[0][0] as unknown as Team[];
    expect(written.map((t) => t.teamCode)).toEqual(['ENG']);
  });

  it('eliminates the penalty shootout loser from a level score', async () => {
    const teams = [makeTeam('ENG', 'A', 9, 6, 8), makeTeam('NGA', 'B', 6, 3, 5)];
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);
    mockedDb.batchPutTeams.mockResolvedValue(undefined);

    // 1-1, ENG win 4-3 on pens → NGA is eliminated.
    await markKnockoutLosersEliminated([
      knockoutMatch({ homeScore: 1, awayScore: 1, penaltyHome: 4, penaltyAway: 3 }),
    ]);

    const written = mockedDb.batchPutTeams.mock.calls[0][0] as unknown as Team[];
    expect(written.map((t) => t.teamCode)).toEqual(['NGA']);
  });

  it('skips a level score with no shootout tally (not yet resolvable)', async () => {
    const teams = [makeTeam('ENG', 'A', 9, 6, 8), makeTeam('NGA', 'B', 6, 3, 5)];
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);

    await markKnockoutLosersEliminated([knockoutMatch({ homeScore: 1, awayScore: 1 })]);

    expect(mockedDb.batchPutTeams).not.toHaveBeenCalled();
  });

  it('ignores group-stage and unfinished matches', async () => {
    const teams = [makeTeam('ENG', 'A', 9, 6, 8), makeTeam('NGA', 'B', 6, 3, 5)];
    mockedDb.getAllTeams.mockResolvedValue(teams as unknown as Record<string, unknown>[]);

    await markKnockoutLosersEliminated([
      knockoutMatch({ stage: 'GROUP_STAGE' }),
      knockoutMatch({ status: 'LIVE' }),
    ]);

    expect(mockedDb.batchPutTeams).not.toHaveBeenCalled();
  });

  it('does not re-write a loser already eliminated', async () => {
    const eng = makeTeam('ENG', 'A', 9, 6, 8);
    const nga = makeTeam('NGA', 'B', 6, 3, 5);
    nga.eliminated = true;
    nga.eliminatedAt = 'Round of 32';
    mockedDb.getAllTeams.mockResolvedValue([eng, nga] as unknown as Record<string, unknown>[]);

    await markKnockoutLosersEliminated([knockoutMatch()]);

    expect(mockedDb.batchPutTeams).not.toHaveBeenCalled();
  });

  it('un-eliminates the penalty winner that was wrongly flagged out (self-heal)', async () => {
    // ENG won 4-3 on pens, so NGA is the only one out — but ENG was stranded as
    // "Out" by a transient finish before the shootout result landed.
    const eng = makeTeam('ENG', 'A', 9, 6, 8);
    eng.eliminated = true;
    eng.eliminatedAt = 'Round of 32';
    const nga = makeTeam('NGA', 'B', 6, 3, 5);
    mockedDb.getAllTeams.mockResolvedValue([eng, nga] as unknown as Record<string, unknown>[]);
    mockedDb.batchPutTeams.mockResolvedValue(undefined);

    await markKnockoutLosersEliminated([
      knockoutMatch({ homeScore: 1, awayScore: 1, penaltyHome: 4, penaltyAway: 3 }),
    ]);

    const written = mockedDb.batchPutTeams.mock.calls[0][0] as unknown as Team[];
    const byCode = new Map(written.map((t) => [t.teamCode, t]));
    expect(byCode.get('ENG')).toMatchObject({ eliminated: false, eliminatedAt: null });
    expect(byCode.get('NGA')).toMatchObject({ eliminated: true, eliminatedAt: 'Round of 32' });
  });

  it('does not clear a group-stage elimination during the knockouts', async () => {
    // A team out in the group stage is not a knockout loser, but its exit must
    // survive the reconcile (only knockout-round flags are revisable).
    const eng = makeTeam('ENG', 'A', 9, 6, 8);
    const nga = makeTeam('NGA', 'B', 6, 3, 5);
    const grp = makeTeam('GRP', 'C', 0, -8, 1);
    grp.eliminated = true;
    grp.eliminatedAt = 'Group Stage';
    mockedDb.getAllTeams.mockResolvedValue([eng, nga, grp] as unknown as Record<string, unknown>[]);
    mockedDb.batchPutTeams.mockResolvedValue(undefined);

    await markKnockoutLosersEliminated([knockoutMatch()]);

    const written = mockedDb.batchPutTeams.mock.calls[0][0] as unknown as Team[];
    expect(written.map((t) => t.teamCode)).toEqual(['NGA']);
  });

  it('keeps a real knockout loser eliminated (no spurious self-heal)', async () => {
    const eng = makeTeam('ENG', 'A', 9, 6, 8);
    const nga = makeTeam('NGA', 'B', 6, 3, 5);
    nga.eliminated = true;
    nga.eliminatedAt = 'Round of 32';
    mockedDb.getAllTeams.mockResolvedValue([eng, nga] as unknown as Record<string, unknown>[]);

    // The same decided tie that put NGA out is still in the feed — it stays out.
    await markKnockoutLosersEliminated([knockoutMatch()]);

    expect(mockedDb.batchPutTeams).not.toHaveBeenCalled();
  });
});
