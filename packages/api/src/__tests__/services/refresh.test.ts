import { refreshData } from '../../services/refresh';
import * as db from '../../db/dynamodb';
import * as footballData from '../../clients/footballData';

jest.mock('../../db/dynamodb');
jest.mock('../../clients/footballData');

const mockedDb = db as jest.Mocked<typeof db>;
const mockedFootballData = footballData as jest.Mocked<typeof footballData>;

describe('refreshData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns cached data when within cooldown period', async () => {
    mockedDb.getConfig.mockResolvedValue({
      configKey: 'lastRefreshTime',
      value: String(1700000000000 - 30000), // 30 seconds ago
    });
    const cachedMatches = [{ matchId: '1' }];
    const cachedTeams = [{ teamCode: 'ENG' }];
    mockedDb.getAllMatches.mockResolvedValue(cachedMatches);
    mockedDb.getAllTeams.mockResolvedValue(cachedTeams);

    const result = await refreshData();

    expect(result.matches).toEqual(cachedMatches);
    expect(result.teams).toEqual(cachedTeams);
    expect(mockedFootballData.fetchMatches).not.toHaveBeenCalled();
  });

  it('fetches fresh data when cooldown has elapsed', async () => {
    mockedDb.getConfig.mockResolvedValue({
      configKey: 'lastRefreshTime',
      value: String(1700000000000 - 120000), // 2 minutes ago
    });
    const freshMatches = [{ matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA' }];
    mockedFootballData.fetchMatches.mockResolvedValue(freshMatches as never);
    mockedDb.putMatch.mockResolvedValue(undefined);
    mockedDb.putConfig.mockResolvedValue(undefined);
    mockedDb.getAllMatches.mockResolvedValue(freshMatches);
    mockedDb.getAllTeams.mockResolvedValue([]);

    const result = await refreshData();

    expect(mockedFootballData.fetchMatches).toHaveBeenCalled();
    expect(mockedDb.putMatch).toHaveBeenCalledWith(freshMatches[0]);
    expect(mockedDb.putConfig).toHaveBeenCalledWith('lastRefreshTime', '1700000000000');
    expect(result.matches).toEqual(freshMatches);
  });

  it('fetches fresh data when no lastRefreshTime exists', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    mockedFootballData.fetchMatches.mockResolvedValue([]);
    mockedDb.putConfig.mockResolvedValue(undefined);
    mockedDb.getAllMatches.mockResolvedValue([]);
    mockedDb.getAllTeams.mockResolvedValue([]);

    const result = await refreshData();

    expect(mockedFootballData.fetchMatches).toHaveBeenCalled();
    expect(result).toEqual({ matches: [], teams: [] });
  });

  it('returns cached data on external API error', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    mockedFootballData.fetchMatches.mockRejectedValue(new Error('API timeout'));
    const cachedMatches = [{ matchId: '1' }];
    mockedDb.getAllMatches.mockResolvedValue(cachedMatches);
    mockedDb.getAllTeams.mockResolvedValue([]);

    const result = await refreshData();

    expect(result.matches).toEqual(cachedMatches);
  });

  it('skips matches without matchId', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    const freshMatches = [
      { matchId: '1', homeTeam: 'ENG' },
      { matchId: undefined, homeTeam: 'BRA' },
    ];
    mockedFootballData.fetchMatches.mockResolvedValue(freshMatches as never);
    mockedDb.putMatch.mockResolvedValue(undefined);
    mockedDb.putConfig.mockResolvedValue(undefined);
    mockedDb.getAllMatches.mockResolvedValue([]);
    mockedDb.getAllTeams.mockResolvedValue([]);

    await refreshData();

    expect(mockedDb.putMatch).toHaveBeenCalledTimes(1);
    expect(mockedDb.putMatch).toHaveBeenCalledWith(freshMatches[0]);
  });
});
