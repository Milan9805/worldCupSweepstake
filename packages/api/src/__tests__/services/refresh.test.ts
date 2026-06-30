import { refreshData } from '../../services/refresh';
import * as db from '../../db/dynamodb';
import * as footballData from '../../clients/footballData';
import * as bbcScraper from '../../clients/bbcScraper';
import * as bbcMatchPage from '../../clients/bbcMatchPage';
import * as tvScraper from '../../clients/footballTvScraper';

jest.mock('../../db/dynamodb');
jest.mock('../../clients/footballData');
jest.mock('../../clients/bbcScraper');
jest.mock('../../clients/bbcMatchPage');
jest.mock('../../clients/footballTvScraper');

const mockedDb = db as jest.Mocked<typeof db>;
const mockedFootballData = footballData as jest.Mocked<typeof footballData>;
const mockedBbc = bbcScraper as jest.Mocked<typeof bbcScraper>;
const mockedMatchPage = bbcMatchPage as jest.Mocked<typeof bbcMatchPage>;
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
    // runs at all when a match is in its active window.) refreshData fetches BBC
    // via fetchBbcData (one page fetch, both views); route its fixtures through
    // the existing fetchBbcFixtures mock so per-test setups keep working, and
    // default the knockout view + its patches to empty.
    mockedBbc.fetchBbcFixtures.mockResolvedValue([]);
    mockedBbc.fetchBbcData.mockImplementation(async () => ({
      fixtures: await mockedBbc.fetchBbcFixtures(),
      knockout: [],
    }));
    mockedBbc.buildBbcPatches.mockReturnValue([]);
    mockedBbc.buildBbcKnockoutPatches.mockReturnValue([]);
    // Default: the per-match card overlay finds no cards unless a test opts in.
    mockedMatchPage.fetchMatchCards.mockResolvedValue([]);
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

    it('does not let a stale poll wipe a known penalty shootout tally', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      // A finished knockout whose shootout result we already have.
      const stored = {
        matchId: 'm-ger-par',
        homeTeam: 'GER',
        awayTeam: 'PAR',
        homeScore: 1,
        awayScore: 1,
        penaltyHome: 3,
        penaltyAway: 4,
        status: 'FINISHED',
        stage: 'ROUND_OF_32',
        group: null,
        datetime: '2026-06-29T20:00:00Z',
        venue: 'Stadium',
      };
      // A later API poll reports the on-pitch result but omits the penalties.
      const stalePoll = { ...stored, penaltyHome: null, penaltyAway: null };
      mockedFootballData.fetchMatches.mockResolvedValue([stalePoll] as never);
      mockedDb.getAllMatches.mockResolvedValue([stored]);
      mockedDb.getAllTeams.mockResolvedValue([]);

      await refreshData();

      // Penalties are preserved, so nothing changed and the tally is never lost.
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
          minute: "19'",
          actions: [],
        },
      ]);
      mockedBbc.buildBbcPatches.mockReturnValue([
        { matchId: 'm-mex-rsa', homeScore: 1, awayScore: 0, status: 'LIVE', minute: "19'" },
      ]);

      const result = await refreshData();

      expect(mockedBbc.fetchBbcFixtures).toHaveBeenCalled();
      expect(mockedDb.batchPutMatches).toHaveBeenCalledWith([
        expect.objectContaining({
          matchId: 'm-mex-rsa',
          homeScore: 1,
          awayScore: 0,
          status: 'LIVE',
          minute: "19'",
        }),
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
          minute: null,
          actions: [],
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

  describe('team stats refresh', () => {
    const liveMatch = {
      matchId: 'm-mex-rsa',
      homeTeam: 'MEX',
      awayTeam: 'RSA',
      homeScore: 1,
      awayScore: 0,
      status: 'LIVE',
      stage: 'GROUP_STAGE',
      group: 'A',
      datetime: new Date(NOW).toISOString(),
      venue: 'Estadio Azteca',
    };
    const mexTeam = {
      teamCode: 'MEX',
      name: 'Mexico',
      flag: '🇲🇽',
      fifaRanking: 12,
      groupLetter: 'A',
      eliminated: false,
      eliminatedAt: null,
      stats: {
        played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        yellowCards: 0, redCards: 0, possession: null, xG: null,
      },
    };

    it('writes a card count from the live BBC overlay (no league change while in play)', async () => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockResolvedValue([liveMatch] as never);
      mockedDb.getAllMatches.mockResolvedValue([liveMatch]);
      mockedDb.getAllTeams.mockResolvedValue([mexTeam]);
      // The BBC overlay supplies a red card via the live patch.
      mockedBbc.fetchBbcFixtures.mockResolvedValue([
        { homeTeam: 'MEX', awayTeam: 'RSA', homeScore: 1, awayScore: 0, status: 'LIVE', datetime: liveMatch.datetime, minute: "49'", actions: [] },
      ]);
      mockedBbc.buildBbcPatches.mockReturnValue([
        {
          matchId: 'm-mex-rsa',
          homeScore: 1,
          awayScore: 0,
          status: 'LIVE',
          minute: "49'",
          actions: [{ team: 'MEX', player: 'C. Montes', type: 'RED_CARD', minute: "49'" }],
        },
      ]);

      await refreshData();

      // The booking became a RED_CARD feed event carrying the player + minute.
      expect(mockedDb.putEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'RED_CARD',
          teamCode: 'MEX',
          payload: expect.objectContaining({ player: 'C. Montes', minute: "49'" }),
        }),
      );
      // The card count is written even though a live game isn't in the table yet.
      expect(mockedDb.batchPutTeams).toHaveBeenCalledWith([
        expect.objectContaining({
          teamCode: 'MEX',
          stats: expect.objectContaining({ redCards: 1 }),
        }),
      ]);
    });

    it('derives the league table from match results — a 2-1 result is a win, not a draw', async () => {
      // The reported bug: KOR beat CZE 2-1, but the old (football-data standings)
      // source rendered it as a 1-1 draw. The table is now derived from the
      // stored match, so it can't disagree with the scoreline.
      const finishedMatch = {
        matchId: 'm-kor-cze',
        homeTeam: 'KOR',
        awayTeam: 'CZE',
        homeScore: 2,
        awayScore: 1,
        status: 'FINISHED',
        stage: 'GROUP_STAGE',
        group: 'A',
        datetime: new Date(NOW).toISOString(),
        venue: 'Stadium',
      };
      const korTeam = { ...mexTeam, teamCode: 'KOR', name: 'Korea Republic' };
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockResolvedValue([finishedMatch] as never);
      mockedDb.getAllMatches.mockResolvedValue([finishedMatch]);
      mockedDb.getAllTeams.mockResolvedValue([korTeam]);

      await refreshData();

      expect(mockedDb.batchPutTeams).toHaveBeenCalledWith([
        expect.objectContaining({
          teamCode: 'KOR',
          stats: expect.objectContaining({
            played: 1, wins: 1, draws: 0, losses: 0,
            goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 3,
          }),
        }),
      ]);
    });
  });

  describe('per-match card overlay (yellow cards)', () => {
    const liveMatch = {
      matchId: 'm-mex-rsa',
      homeTeam: 'MEX',
      awayTeam: 'RSA',
      homeScore: 1,
      awayScore: 0,
      status: 'LIVE',
      stage: 'GROUP_STAGE',
      group: 'A',
      datetime: new Date(NOW).toISOString(),
      venue: 'Estadio Azteca',
    };
    const mexTeam = {
      teamCode: 'MEX',
      name: 'Mexico',
      flag: '🇲🇽',
      fifaRanking: 12,
      groupLetter: 'A',
      eliminated: false,
      eliminatedAt: null,
      stats: {
        played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        yellowCards: 0, redCards: 0, possession: null, xG: null,
      },
    };
    const scrapedFixture = {
      homeTeam: 'MEX', awayTeam: 'RSA', homeScore: 1, awayScore: 0,
      status: 'LIVE' as const, datetime: liveMatch.datetime, minute: "23'",
      actions: [], tipoTopicId: 'c0myn4dwvzkt',
    };

    beforeEach(() => {
      mockedDb.getConfig.mockResolvedValue(undefined);
      mockedFootballData.fetchMatches.mockResolvedValue([liveMatch] as never);
      mockedDb.getAllMatches.mockResolvedValue([liveMatch]);
      mockedDb.getAllTeams.mockResolvedValue([mexTeam]);
      mockedBbc.fetchBbcFixtures.mockResolvedValue([scrapedFixture]);
    });

    it('fetches the match page for a live match and surfaces a yellow card on the feed + team stats', async () => {
      mockedMatchPage.fetchMatchCards.mockResolvedValue([
        { team: 'MEX', player: 'B. Gutiérrez', type: 'YELLOW_CARD', minute: "23'" },
      ]);

      await refreshData();

      expect(mockedMatchPage.fetchMatchCards).toHaveBeenCalledWith('c0myn4dwvzkt');
      // The yellow (absent from the fixtures feed) becomes a YELLOW_CARD event…
      expect(mockedDb.putEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'YELLOW_CARD',
          teamCode: 'MEX',
          payload: expect.objectContaining({ player: 'B. Gutiérrez', minute: "23'" }),
        }),
      );
      // …and bumps MEX's yellow-card count on the team row.
      expect(mockedDb.batchPutTeams).toHaveBeenCalledWith([
        expect.objectContaining({
          teamCode: 'MEX',
          stats: expect.objectContaining({ yellowCards: 1, redCards: 0 }),
        }),
      ]);
    });

    it('swallows a match-page fetch failure without breaking the refresh', async () => {
      mockedMatchPage.fetchMatchCards.mockRejectedValue(new Error('match page 503'));

      await expect(refreshData()).resolves.toBeDefined();

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('BBC match-page fetch failed'),
        expect.any(Error),
      );
      expect(mockedDb.putEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'YELLOW_CARD' }),
      );
    });

    it('dedupes a red card present in both the fixtures feed and the match page', async () => {
      // Fixtures overlay supplies the red (emitting one RED_CARD event)…
      mockedBbc.buildBbcPatches.mockReturnValue([
        {
          matchId: 'm-mex-rsa', homeScore: 1, awayScore: 0, status: 'LIVE', minute: "49'",
          actions: [{ team: 'RSA', player: 'Y. Sithole', type: 'RED_CARD', minute: "49'" }],
        },
      ]);
      // …and the match page reports the SAME red.
      mockedMatchPage.fetchMatchCards.mockResolvedValue([
        { team: 'RSA', player: 'Y. Sithole', type: 'RED_CARD', minute: "49'" },
      ]);

      await refreshData();

      const redEvents = mockedDb.putEvent.mock.calls.filter((c) => c[0].type === 'RED_CARD');
      expect(redEvents).toHaveLength(1);
    });

    it('does not fetch a match page when the fixture has no topic id', async () => {
      mockedBbc.fetchBbcFixtures.mockResolvedValue([{ ...scrapedFixture, tipoTopicId: undefined }]);

      await refreshData();

      expect(mockedMatchPage.fetchMatchCards).not.toHaveBeenCalled();
    });

    it('gives a just-finished match one final card sweep (a booking shown at the whistle)', async () => {
      // The match was LIVE last poll; on this poll BBC flips it to FINISHED.
      // Even though it is no longer LIVE, the finishing poll fetches its page
      // once more so a yellow shown only at full time is still captured.
      mockedBbc.buildBbcPatches.mockReturnValue([
        { matchId: 'm-mex-rsa', homeScore: 1, awayScore: 0, status: 'FINISHED', minute: "90'+4" },
      ]);
      mockedMatchPage.fetchMatchCards.mockResolvedValue([
        { team: 'MEX', player: 'B. Gutiérrez', type: 'YELLOW_CARD', minute: "90'+3" },
      ]);

      await refreshData();

      expect(mockedMatchPage.fetchMatchCards).toHaveBeenCalledWith('c0myn4dwvzkt');
      expect(mockedDb.putEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'YELLOW_CARD',
          teamCode: 'MEX',
          payload: expect.objectContaining({ player: 'B. Gutiérrez', minute: "90'+3" }),
        }),
      );
    });

    it('does not re-sweep a match that was already FINISHED before this poll', async () => {
      // MEX-RSA finished on an earlier poll (its final sweep already ran); a
      // separate live match keeps the window open. Only the live match's page is
      // fetched — we don't re-pull a long-finished game's page every poll.
      const finishedMatch = { ...liveMatch, status: 'FINISHED' };
      const liveOther = {
        matchId: 'm-ger-fra', homeTeam: 'GER', awayTeam: 'FRA',
        homeScore: 0, awayScore: 0, status: 'LIVE', stage: 'GROUP_STAGE', group: 'C',
        datetime: liveMatch.datetime, venue: 'Allianz Arena',
      };
      mockedDb.getAllMatches.mockResolvedValue([finishedMatch, liveOther]);
      mockedFootballData.fetchMatches.mockResolvedValue([finishedMatch, liveOther] as never);
      mockedBbc.fetchBbcFixtures.mockResolvedValue([
        scrapedFixture, // MEX-RSA, topic c0myn4dwvzkt — already finished, must be skipped
        {
          homeTeam: 'GER', awayTeam: 'FRA', homeScore: 0, awayScore: 0, status: 'LIVE' as const,
          datetime: liveMatch.datetime, minute: "10'", actions: [], tipoTopicId: 'topic-ger-fra',
        },
      ]);

      await refreshData();

      expect(mockedMatchPage.fetchMatchCards).toHaveBeenCalledWith('topic-ger-fra');
      expect(mockedMatchPage.fetchMatchCards).not.toHaveBeenCalledWith('c0myn4dwvzkt');
    });
  });
});
