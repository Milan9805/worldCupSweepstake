import { refreshData } from '../../services/refresh';
import * as db from '../../db/dynamodb';
import * as footballData from '../../clients/footballData';
import * as bbcScraper from '../../clients/bbcScraper';

jest.mock('../../db/dynamodb');
jest.mock('../../clients/footballData');
jest.mock('../../clients/bbcScraper');

const mockedDb = db as jest.Mocked<typeof db>;
const mockedFootballData = footballData as jest.Mocked<typeof footballData>;
const mockedBbc = bbcScraper as jest.Mocked<typeof bbcScraper>;

const NOW = 1700000000000;

describe('refreshData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cooldown', () => {
    it('returns cached data when within the 20s cooldown', async () => {
      mockedDb.getConfig.mockResolvedValue({
        configKey: 'lastRefreshTime',
        value: String(NOW - 10_000), // 10 seconds ago (< 20s cooldown)
      });
      const cachedMatches = [{ matchId: '1' }];
      mockedDb.getAllMatches.mockResolvedValue(cachedMatches);
      mockedDb.getAllTeams.mockResolvedValue([{ teamCode: 'ENG' }]);

      const result = await refreshData();

      expect(result.source).toBe('cache');
      expect(result.matches).toEqual(cachedMatches);
      expect(mockedFootballData.fetchMatches).not.toHaveBeenCalled();
      expect(mockedBbc.fetchBbcFixtures).not.toHaveBeenCalled();
    });

    it('refetches once cooldown has elapsed (>20s)', async () => {
      mockedDb.getConfig.mockResolvedValue({
        configKey: 'lastRefreshTime',
        value: String(NOW - 25_000), // 25 seconds ago
      });
      mockedFootballData.fetchMatches.mockResolvedValue([]);
      mockedDb.getAllMatches.mockResolvedValue([]);
      mockedDb.getAllTeams.mockResolvedValue([]);

      const result = await refreshData();

      expect(result.source).toBe('api');
      expect(mockedFootballData.fetchMatches).toHaveBeenCalled();
    });
  });

  describe('happy path (API)', () => {
    it('writes fresh matches and marks source=api', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      const freshMatches = [{ matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA' }];
      mockedFootballData.fetchMatches.mockResolvedValue(freshMatches as never);
      mockedDb.getAllMatches.mockResolvedValue(freshMatches);
      mockedDb.getAllTeams.mockResolvedValue([]);

      const result = await refreshData();

      expect(mockedFootballData.fetchMatches).toHaveBeenCalled();
      expect(mockedDb.putMatch).toHaveBeenCalledWith(freshMatches[0]);
      expect(mockedDb.putConfig).toHaveBeenCalledWith('lastRefreshTime', String(NOW));
      expect(result.source).toBe('api');
      expect(result.refreshedAt).toBe(new Date(NOW).toISOString());
      expect(result.matches).toEqual(freshMatches);
    });

    it('skips matches without matchId', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      const freshMatches = [
        { matchId: '1', homeTeam: 'ENG' },
        { matchId: undefined, homeTeam: 'BRA' },
      ];
      mockedFootballData.fetchMatches.mockResolvedValue(freshMatches as never);
      mockedDb.getAllMatches.mockResolvedValue([]);
      mockedDb.getAllTeams.mockResolvedValue([]);

      await refreshData();

      expect(mockedDb.putMatch).toHaveBeenCalledTimes(1);
      expect(mockedDb.putMatch).toHaveBeenCalledWith(freshMatches[0]);
    });
  });

  describe('BBC fallback', () => {
    it('falls back to BBC when API errors and applies score/status patches', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockRejectedValue(new Error('429 rate limited'));

      const existing = [
        {
          matchId: 'm1',
          homeTeam: 'ENG',
          awayTeam: 'USA',
          homeScore: null,
          awayScore: null,
          status: 'SCHEDULED',
          stage: 'GROUP_STAGE',
          group: 'D',
          datetime: '2026-06-15T19:00:00Z',
          venue: 'MetLife',
        },
      ];
      mockedDb.getAllMatches.mockResolvedValue(existing);
      mockedDb.getAllTeams.mockResolvedValue([]);

      mockedBbc.fetchBbcFixtures.mockResolvedValue([
        {
          homeTeam: 'ENG',
          awayTeam: 'USA',
          homeScore: 2,
          awayScore: 1,
          status: 'FINISHED',
          datetime: '2026-06-15T19:00:00Z',
        },
      ]);
      mockedBbc.buildBbcPatches.mockReturnValue([
        { matchId: 'm1', homeScore: 2, awayScore: 1, status: 'FINISHED' },
      ]);

      const result = await refreshData();

      expect(result.source).toBe('bbc');
      expect(mockedDb.putMatch).toHaveBeenCalledWith({
        ...existing[0],
        homeScore: 2,
        awayScore: 1,
        status: 'FINISHED',
      });
      expect(mockedDb.putConfig).toHaveBeenCalledWith('lastRefreshTime', String(NOW));
    });

    it('falls through to cache when both API and BBC fail', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockRejectedValue(new Error('API down'));
      mockedBbc.fetchBbcFixtures.mockRejectedValue(new Error('BBC down'));

      const cached = [{ matchId: '1' }];
      mockedDb.getAllMatches.mockResolvedValue(cached);
      mockedDb.getAllTeams.mockResolvedValue([]);

      const result = await refreshData();

      expect(result.source).toBe('cache');
      expect(result.matches).toEqual(cached);
      expect(mockedDb.putConfig).not.toHaveBeenCalled();
    });
  });
});
