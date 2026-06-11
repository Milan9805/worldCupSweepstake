import { refreshData } from '../../services/refresh';
import * as db from '../../db/dynamodb';
import * as footballData from '../../clients/footballData';
import * as bbcScraper from '../../clients/bbcScraper';
import * as tvScraper from '../../clients/footballTvScraper';

jest.mock('../../db/dynamodb');
jest.mock('../../clients/footballData');
jest.mock('../../clients/bbcScraper');
jest.mock('../../clients/footballTvScraper');

const mockedDb = db as jest.Mocked<typeof db>;
const mockedFootballData = footballData as jest.Mocked<typeof footballData>;
const mockedBbc = bbcScraper as jest.Mocked<typeof bbcScraper>;
const mockedTv = tvScraper as jest.Mocked<typeof tvScraper>;

const NOW = 1700000000000;

describe('refreshData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Default: channel enrichment is a no-op unless a test opts in.
    mockedTv.fetchTvListings.mockResolvedValue([]);
    mockedTv.buildChannelPatches.mockReturnValue([]);
    // Default: the live BBC overlay is a no-op unless a test opts in. (It only
    // runs at all when a match is in its active window.)
    mockedBbc.fetchBbcFixtures.mockResolvedValue([]);
    mockedBbc.buildBbcPatches.mockReturnValue([]);
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
      expect(mockedDb.batchPutMatches).not.toHaveBeenCalled();
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
    it('writes new/changed matches in one batch and marks source=api', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      const freshMatches = [{ matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA' }];
      mockedFootballData.fetchMatches.mockResolvedValue(freshMatches as never);
      mockedDb.getAllMatches.mockResolvedValue([]); // empty DB → match is new
      mockedDb.getAllTeams.mockResolvedValue([]);

      const result = await refreshData();

      expect(mockedFootballData.fetchMatches).toHaveBeenCalled();
      expect(mockedDb.batchPutMatches).toHaveBeenCalledWith([
        { matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA' },
      ]);
      expect(mockedDb.putConfig).toHaveBeenCalledWith('lastRefreshTime', String(NOW));
      expect(result.source).toBe('api');
      expect(result.refreshedAt).toBe(new Date(NOW).toISOString());
      expect(result.matches).toEqual(freshMatches);
    });

    it('does not write when the fresh data is identical to what is stored', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      const stored = {
        matchId: '1',
        homeTeam: 'ENG',
        awayTeam: 'BRA',
        homeScore: 1,
        awayScore: 0,
        status: 'FINISHED',
        stage: 'GROUP_STAGE',
        group: 'A',
        datetime: '2026-06-14T18:00:00Z',
        venue: 'Stadium',
      };
      mockedFootballData.fetchMatches.mockResolvedValue([stored] as never);
      mockedDb.getAllMatches.mockResolvedValue([stored]);
      mockedDb.getAllTeams.mockResolvedValue([]);

      const result = await refreshData();

      expect(result.source).toBe('api');
      expect(mockedDb.batchPutMatches).not.toHaveBeenCalled();
    });

    it('uses preloaded matches instead of re-scanning the table', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockResolvedValue([]);
      mockedDb.getAllTeams.mockResolvedValue([]);
      const preloaded = [{ matchId: 'pre', homeTeam: 'ENG', awayTeam: 'BRA' }];

      const result = await refreshData(preloaded as never);

      // The initial load was supplied; getAllMatches must not be called for it.
      expect(mockedDb.getAllMatches).not.toHaveBeenCalled();
      expect(result.matches).toEqual(preloaded);
    });

    it('skips updates without a matchId', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      const freshMatches = [
        { matchId: '1', homeTeam: 'ENG' },
        { matchId: undefined, homeTeam: 'BRA' },
      ];
      mockedFootballData.fetchMatches.mockResolvedValue(freshMatches as never);
      mockedDb.getAllMatches.mockResolvedValue([]);
      mockedDb.getAllTeams.mockResolvedValue([]);

      await refreshData();

      expect(mockedDb.batchPutMatches).toHaveBeenCalledTimes(1);
      expect(mockedDb.batchPutMatches).toHaveBeenCalledWith([{ matchId: '1', homeTeam: 'ENG' }]);
    });

    it('preserves existing channels when applying a score update', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      const ITV1 = { name: 'ITV1', bg: '#127b60', fg: '#fff' };
      const stored = {
        matchId: '1',
        homeTeam: 'ENG',
        awayTeam: 'BRA',
        homeScore: null,
        awayScore: null,
        status: 'SCHEDULED',
        stage: 'GROUP_STAGE',
        group: 'A',
        datetime: '2026-06-14T18:00:00Z',
        venue: 'Stadium',
        channels: [ITV1],
      };
      const fresh = { ...stored, homeScore: 1, awayScore: 0, status: 'LIVE', channels: undefined };
      delete (fresh as { channels?: unknown }).channels; // API never carries channels
      mockedFootballData.fetchMatches.mockResolvedValue([fresh] as never);
      mockedDb.getAllMatches.mockResolvedValue([stored]);
      mockedDb.getAllTeams.mockResolvedValue([]);

      await refreshData();

      expect(mockedDb.batchPutMatches).toHaveBeenCalledWith([
        expect.objectContaining({ matchId: '1', homeScore: 1, status: 'LIVE', channels: [ITV1] }),
      ]);
    });
  });

  describe('live BBC overlay (API succeeds but carries no live data)', () => {
    // A match kicking off ~now, so it sits inside the active window. The API
    // returns it still SCHEDULED with null scores (the free-tier behaviour);
    // BBC supplies the live score + status.
    const liveMatch = {
      matchId: 'm-mex-rsa',
      homeTeam: 'MEX',
      awayTeam: 'RSA',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
      stage: 'GROUP_STAGE',
      group: 'A',
      datetime: new Date(NOW).toISOString(),
      venue: 'Estadio Azteca',
    };

    it('overlays BBC live score/status when a match is in its active window', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockResolvedValue([liveMatch] as never);
      mockedDb.getAllMatches.mockResolvedValue([liveMatch]);
      mockedDb.getAllTeams.mockResolvedValue([]);
      mockedBbc.fetchBbcFixtures.mockResolvedValue([
        {
          homeTeam: 'MEX',
          awayTeam: 'RSA',
          homeScore: 1,
          awayScore: 0,
          status: 'LIVE',
          datetime: liveMatch.datetime,
        },
      ]);
      mockedBbc.buildBbcPatches.mockReturnValue([
        { matchId: 'm-mex-rsa', homeScore: 1, awayScore: 0, status: 'LIVE' },
      ]);

      const result = await refreshData();

      expect(mockedBbc.fetchBbcFixtures).toHaveBeenCalled();
      expect(mockedDb.batchPutMatches).toHaveBeenCalledWith([
        expect.objectContaining({ matchId: 'm-mex-rsa', homeScore: 1, awayScore: 0, status: 'LIVE' }),
      ]);
      // KICKOFF (SCHEDULED→LIVE) and the goal are persisted as feed events.
      expect(mockedDb.putEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'KICKOFF' }));
      expect(mockedDb.putEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'GOAL' }));
      expect(result.source).toBe('bbc');
    });

    it('does not consult BBC when no match is in an active window', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      // Far-future fixture → outside the window.
      const future = { ...liveMatch, datetime: '2027-01-01T00:00:00Z' };
      mockedFootballData.fetchMatches.mockResolvedValue([future] as never);
      mockedDb.getAllMatches.mockResolvedValue([future]);
      mockedDb.getAllTeams.mockResolvedValue([]);

      await refreshData();

      expect(mockedBbc.fetchBbcFixtures).not.toHaveBeenCalled();
    });

    it('keeps the good API sync when the live BBC overlay throws', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockResolvedValue([liveMatch] as never);
      mockedDb.getAllMatches.mockResolvedValue([liveMatch]);
      mockedDb.getAllTeams.mockResolvedValue([]);
      mockedBbc.fetchBbcFixtures.mockRejectedValue(new Error('BBC down'));

      const result = await refreshData();

      expect(result.source).toBe('api');
      expect(mockedDb.putConfig).toHaveBeenCalledWith('lastRefreshTime', String(NOW));
      expect(console.warn).toHaveBeenCalledWith(
        'BBC live overlay failed (keeping API data):',
        expect.any(Error),
      );
    });

    it('does not let a stale SCHEDULED/null API poll regress a live match', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      // Already live in the DB (BBC set it last cycle)...
      const stored = { ...liveMatch, homeScore: 1, awayScore: 0, status: 'LIVE' };
      // ...but the free-tier API still reports it as pre-match.
      mockedFootballData.fetchMatches.mockResolvedValue([liveMatch] as never);
      mockedDb.getAllMatches.mockResolvedValue([stored]);
      mockedDb.getAllTeams.mockResolvedValue([]);

      await refreshData();

      // The stale poll must not write SCHEDULED/null over the live row.
      expect(mockedDb.batchPutMatches).not.toHaveBeenCalled();
    });
  });

  describe('BBC fallback', () => {
    it('falls back to BBC when API errors and writes only changed rows', async () => {
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
      expect(mockedDb.batchPutMatches).toHaveBeenCalledWith([
        { ...existing[0], homeScore: 2, awayScore: 1, status: 'FINISHED' },
      ]);
      expect(mockedDb.putConfig).toHaveBeenCalledWith('lastRefreshTime', String(NOW));
    });

    it('ignores a BBC patch for a match that does not exist locally', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockRejectedValue(new Error('429 rate limited'));
      mockedDb.getAllMatches.mockResolvedValue([{ matchId: 'real', homeTeam: 'ENG', awayTeam: 'USA' }]);
      mockedDb.getAllTeams.mockResolvedValue([]);
      mockedBbc.fetchBbcFixtures.mockResolvedValue([]);
      mockedBbc.buildBbcPatches.mockReturnValue([
        { matchId: 'ghost', homeScore: 1, awayScore: 0, status: 'FINISHED' },
      ]);

      await refreshData();

      expect(mockedDb.batchPutMatches).not.toHaveBeenCalled();
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
      expect(mockedDb.batchPutMatches).not.toHaveBeenCalled();
    });
  });

  describe('TV channel enrichment', () => {
    const ITV1 = { name: 'ITV1', bg: '#127b60', fg: '#fff' };
    const STV = { name: 'STV', bg: '#032baa', fg: '#fafafa' };
    const existing = [
      {
        matchId: 'm1',
        homeTeam: 'MEX',
        awayTeam: 'RSA',
        homeScore: null,
        awayScore: null,
        status: 'SCHEDULED',
        stage: 'GROUP_STAGE',
        group: 'A',
        datetime: '2026-06-11T19:00:00Z',
        venue: 'Estadio Azteca',
        channels: [ITV1],
      },
    ];

    beforeEach(() => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockResolvedValue([]);
      mockedDb.getAllMatches.mockResolvedValue(existing);
      mockedDb.getAllTeams.mockResolvedValue([]);
    });

    it('applies channel patches to matched matches', async () => {
      mockedTv.fetchTvListings.mockResolvedValue([
        { homeTeam: 'MEX', awayTeam: 'RSA', date: '2026-06-11', channels: [ITV1, STV] },
      ]);
      mockedTv.buildChannelPatches.mockReturnValue([{ matchId: 'm1', channels: [ITV1, STV] }]);

      await refreshData();

      expect(mockedDb.batchPutMatches).toHaveBeenCalledWith([
        { ...existing[0], channels: [ITV1, STV] },
      ]);
    });

    it('skips a redundant write when channels are unchanged', async () => {
      mockedTv.buildChannelPatches.mockReturnValue([{ matchId: 'm1', channels: [ITV1] }]);

      await refreshData();

      expect(mockedDb.batchPutMatches).not.toHaveBeenCalled();
    });

    it('writes when the match has no channels yet', async () => {
      const unenriched = [{ ...existing[0], channels: undefined }];
      mockedDb.getAllMatches.mockResolvedValue(unenriched);
      mockedTv.buildChannelPatches.mockReturnValue([{ matchId: 'm1', channels: [ITV1] }]);

      await refreshData();

      expect(mockedDb.batchPutMatches).toHaveBeenCalledWith([{ ...unenriched[0], channels: [ITV1] }]);
    });

    it('treats an undefined patch channel list as equal to no channels (no write)', async () => {
      const unenriched = [{ ...existing[0], channels: undefined }];
      mockedDb.getAllMatches.mockResolvedValue(unenriched);
      mockedTv.buildChannelPatches.mockReturnValue([{ matchId: 'm1', channels: undefined }]);

      await refreshData();

      expect(mockedDb.batchPutMatches).not.toHaveBeenCalled();
    });

    it('skips a patch whose matchId has no matching row', async () => {
      mockedTv.buildChannelPatches.mockReturnValue([
        { matchId: 'ghost', channels: [{ name: 'BBC One', bg: '#ea2823', fg: '#fff' }] },
      ]);

      await refreshData();

      expect(mockedDb.batchPutMatches).not.toHaveBeenCalled();
    });

    it('swallows a TV scrape failure without breaking the refresh', async () => {
      mockedTv.fetchTvListings.mockRejectedValue(new Error('TV site down'));

      const result = await refreshData();

      expect(result.source).toBe('api');
      expect(console.warn).toHaveBeenCalledWith(
        'Football-on-TV channel scrape failed:',
        expect.any(Error),
      );
    });
  });
});
