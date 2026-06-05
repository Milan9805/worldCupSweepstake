import { handler } from '../../handlers/scheduledRefresh';
import * as db from '../../db/dynamodb';
import * as refresh from '../../services/refresh';

jest.mock('../../db/dynamodb');
jest.mock('../../services/refresh');

const mockedDb = db as jest.Mocked<typeof db>;
const mockedRefresh = refresh as jest.Mocked<typeof refresh>;

const liveMatch = {
  matchId: '1',
  homeTeam: 'ENG',
  awayTeam: 'BRA',
  homeScore: 0,
  awayScore: 0,
  status: 'LIVE',
  stage: 'GROUP_STAGE',
  group: 'A',
  datetime: '2026-06-14T18:00:00Z',
  venue: 'Stadium',
};

const finishedMatch = { ...liveMatch, status: 'FINISHED' };

describe('scheduledRefresh handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips the external fetch when no match is active', async () => {
    mockedDb.getAllMatches.mockResolvedValue([finishedMatch]);

    const result = await handler();

    expect(result).toEqual({ refreshed: false });
    expect(mockedRefresh.refreshData).not.toHaveBeenCalled();
  });

  it('runs refreshData when a match is live', async () => {
    mockedDb.getAllMatches.mockResolvedValue([finishedMatch, liveMatch]);
    mockedRefresh.refreshData.mockResolvedValue({
      matches: [],
      teams: [],
      source: 'api',
      refreshedAt: '2026-06-14T18:00:00Z',
    });

    const result = await handler();

    expect(mockedRefresh.refreshData).toHaveBeenCalledTimes(1);
    // The already-scanned matches must be forwarded so refreshData doesn't re-scan.
    expect(mockedRefresh.refreshData).toHaveBeenCalledWith([finishedMatch, liveMatch]);
    expect(result).toEqual({ refreshed: true, source: 'api' });
  });
});
