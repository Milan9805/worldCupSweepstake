import { fetchMatches, fetchStandings } from '../../clients/footballData';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Monotonically increasing time so the rate limiter always clears between tests
let testTime = 2_000_000_000_000;

describe('footballData client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    testTime += 120_000; // advance 2 minutes between tests
    jest.setSystemTime(testTime);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('fetchMatches', () => {
    it('returns mapped matches from API', async () => {
      const apiResponse = {
        matches: [
          {
            id: 12345,
            utcDate: '2026-06-14T18:00:00Z',
            status: 'FINISHED',
            stage: 'GROUP_STAGE',
            group: 'GROUP_A',
            homeTeam: { tla: 'ENG', name: 'England' },
            awayTeam: { tla: 'BRA', name: 'Brazil' },
            score: { fullTime: { home: 2, away: 1 } },
            venue: 'MetLife Stadium',
          },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchMatches();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        matchId: '12345',
        homeTeam: 'ENG',
        awayTeam: 'BRA',
        homeScore: 2,
        awayScore: 1,
        status: 'FINISHED',
        stage: 'GROUP_STAGE',
        group: 'A',
        datetime: '2026-06-14T18:00:00Z',
        venue: 'MetLife Stadium',
      });
    });

    it('maps IN_PLAY status to LIVE', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          matches: [{
            id: 1, utcDate: '2026-06-14T18:00:00Z', status: 'IN_PLAY',
            stage: 'GROUP_STAGE', group: null,
            homeTeam: { tla: 'ENG', name: 'England' },
            awayTeam: { tla: 'BRA', name: 'Brazil' },
            score: { fullTime: { home: null, away: null } },
            venue: null,
          }],
        }),
      });

      const result = await fetchMatches();
      expect(result[0].status).toBe('LIVE');
    });

    it('maps PAUSED status to LIVE', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          matches: [{
            id: 1, utcDate: '2026-06-14T18:00:00Z', status: 'PAUSED',
            stage: 'GROUP_STAGE', group: null,
            homeTeam: { tla: 'ENG', name: 'England' },
            awayTeam: { tla: 'BRA', name: 'Brazil' },
            score: { fullTime: { home: null, away: null } },
            venue: null,
          }],
        }),
      });

      const result = await fetchMatches();
      expect(result[0].status).toBe('LIVE');
    });

    it('maps HALFTIME status to LIVE', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          matches: [{
            id: 1, utcDate: '2026-06-14T18:00:00Z', status: 'HALFTIME',
            stage: 'GROUP_STAGE', group: null,
            homeTeam: { tla: 'ENG', name: 'England' },
            awayTeam: { tla: 'BRA', name: 'Brazil' },
            score: { fullTime: { home: null, away: null } },
            venue: null,
          }],
        }),
      });

      const result = await fetchMatches();
      expect(result[0].status).toBe('LIVE');
    });

    it('maps TIMED status to SCHEDULED', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          matches: [{
            id: 1, utcDate: '2026-06-14T18:00:00Z', status: 'TIMED',
            stage: 'GROUP_STAGE', group: null,
            homeTeam: { tla: 'ENG', name: 'England' },
            awayTeam: { tla: 'BRA', name: 'Brazil' },
            score: { fullTime: { home: null, away: null } },
            venue: null,
          }],
        }),
      });

      const result = await fetchMatches();
      expect(result[0].status).toBe('SCHEDULED');
    });

    it('maps stage names correctly', async () => {
      const stages = [
        { input: 'LAST_32', expected: 'ROUND_OF_32' },
        { input: 'LAST_16', expected: 'ROUND_OF_16' },
        { input: 'QUARTER_FINALS', expected: 'QUARTER_FINAL' },
        { input: 'SEMI_FINALS', expected: 'SEMI_FINAL' },
        { input: 'FINAL', expected: 'FINAL' },
        { input: 'THIRD_PLACE', expected: 'THIRD_PLACE' },
        { input: 'UNKNOWN_STAGE', expected: 'UNKNOWN_STAGE' },
      ];

      for (const { input, expected } of stages) {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            matches: [{
              id: 1, utcDate: '2026-06-14T18:00:00Z', status: 'SCHEDULED',
              stage: input, group: null,
              homeTeam: { tla: 'ENG', name: 'England' },
              awayTeam: { tla: 'BRA', name: 'Brazil' },
              score: { fullTime: { home: null, away: null } },
              venue: 'TBC',
            }],
          }),
        });

        const result = await fetchMatches();
        expect(result[0].stage).toBe(expected);
      }
    });

    it('handles null group', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          matches: [{
            id: 1, utcDate: '2026-06-14T18:00:00Z', status: 'SCHEDULED',
            stage: 'FINAL', group: null,
            homeTeam: { tla: 'ENG', name: 'England' },
            awayTeam: { tla: 'BRA', name: 'Brazil' },
            score: { fullTime: { home: null, away: null } },
            venue: 'TBC',
          }],
        }),
      });

      const result = await fetchMatches();
      expect(result[0].group).toBeNull();
    });

    it('defaults venue to TBC when null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          matches: [{
            id: 1, utcDate: '2026-06-14T18:00:00Z', status: 'SCHEDULED',
            stage: 'GROUP_STAGE', group: null,
            homeTeam: { tla: 'ENG', name: 'England' },
            awayTeam: { tla: 'BRA', name: 'Brazil' },
            score: { fullTime: { home: null, away: null } },
            venue: null,
          }],
        }),
      });

      const result = await fetchMatches();
      expect(result[0].venue).toBe('TBC');
    });

    it('throws on API error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(fetchMatches()).rejects.toThrow('Football Data API rate limit exceeded (429)');
    });

    it('handles empty matches array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ matches: [] }),
      });

      const result = await fetchMatches();
      expect(result).toEqual([]);
    });
  });

  describe('fetchStandings', () => {
    it('returns standings from API', async () => {
      const standings = [{ group: 'GROUP_A', table: [] }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ standings }),
      });

      const result = await fetchStandings();
      expect(result).toEqual(standings);
    });

    it('returns empty array when no standings', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await fetchStandings();
      expect(result).toEqual([]);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchStandings()).rejects.toThrow('Football Data API error');
    });
  });
});
