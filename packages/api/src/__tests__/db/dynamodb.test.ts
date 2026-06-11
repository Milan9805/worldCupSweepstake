import {
  getGroup,
  putGroup,
  getAllTeams,
  putTeam,
  getAllMatches,
  putMatch,
  batchPutMatches,
  batchPutTeams,
  getTree,
  putTreeSlot,
  getConfig,
  putConfig,
  putEvent,
  getRecentEvents,
  dedupeByEventId,
  tables,
} from '../../db/dynamodb';
import { FeedEvent } from '@sweepstake/shared';

// Mock the AWS SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockImplementation(() => ({ send: mockSend })),
  },
  GetCommand: jest.fn().mockImplementation((input) => ({ input, type: 'Get' })),
  PutCommand: jest.fn().mockImplementation((input) => ({ input, type: 'Put' })),
  ScanCommand: jest.fn().mockImplementation((input) => ({ input, type: 'Scan' })),
  QueryCommand: jest.fn().mockImplementation((input) => ({ input, type: 'Query' })),
  BatchWriteCommand: jest.fn().mockImplementation((input) => ({ input, type: 'BatchWrite' })),
}));

describe('dynamodb module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tables', () => {
    it('has correct table names with prefix', () => {
      expect(tables.groups).toContain('Groups');
      expect(tables.matches).toContain('Matches');
      expect(tables.teams).toContain('Teams');
      expect(tables.tree).toContain('TournamentTree');
      expect(tables.config).toContain('Config');
      expect(tables.events).toContain('Events');
    });
  });

  describe('getGroup', () => {
    it('returns the item from DynamoDB', async () => {
      const item = { groupKey: 'test', groupName: 'Test Group', members: [] };
      mockSend.mockResolvedValue({ Item: item });

      const result = await getGroup('test');
      expect(result).toEqual(item);
    });

    it('returns undefined when item not found', async () => {
      mockSend.mockResolvedValue({ Item: undefined });

      const result = await getGroup('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('putGroup', () => {
    it('sends put command', async () => {
      mockSend.mockResolvedValue({});
      const group = { groupKey: 'test', members: [] };

      await putGroup(group);
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('getAllTeams', () => {
    it('returns items from scan', async () => {
      const teams = [{ teamCode: 'ENG' }, { teamCode: 'BRA' }];
      mockSend.mockResolvedValue({ Items: teams });

      const result = await getAllTeams();
      expect(result).toEqual(teams);
    });

    it('returns empty array when no items', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await getAllTeams();
      expect(result).toEqual([]);
    });
  });

  describe('putTeam', () => {
    it('sends put command', async () => {
      mockSend.mockResolvedValue({});
      await putTeam({ teamCode: 'ENG', name: 'England' });
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('getAllMatches', () => {
    it('returns items from scan', async () => {
      const matches = [{ matchId: '1' }];
      mockSend.mockResolvedValue({ Items: matches });

      const result = await getAllMatches();
      expect(result).toEqual(matches);
    });

    it('returns empty array when no items', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await getAllMatches();
      expect(result).toEqual([]);
    });
  });

  describe('putMatch', () => {
    it('sends put command', async () => {
      mockSend.mockResolvedValue({});
      await putMatch({ matchId: '1' });
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('batchPutMatches', () => {
    it('does nothing (no requests) for an empty list', async () => {
      await batchPutMatches([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('writes a single batch for up to 25 matches', async () => {
      mockSend.mockResolvedValue({});
      const matches = Array.from({ length: 10 }, (_, i) => ({ matchId: String(i) }));

      await batchPutMatches(matches);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.type).toBe('BatchWrite');
      expect(command.input.RequestItems[tables.matches]).toHaveLength(10);
      expect(command.input.RequestItems[tables.matches][0]).toEqual({
        PutRequest: { Item: { matchId: '0' } },
      });
    });

    it('splits more than 25 matches into multiple batch requests', async () => {
      mockSend.mockResolvedValue({});
      const matches = Array.from({ length: 60 }, (_, i) => ({ matchId: String(i) }));

      await batchPutMatches(matches);

      // 60 items => chunks of 25, 25, 10 => 3 requests
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('retries items DynamoDB returns as unprocessed', async () => {
      const unprocessed = {
        [tables.matches]: [{ PutRequest: { Item: { matchId: '0' } } }],
      };
      mockSend
        .mockResolvedValueOnce({ UnprocessedItems: unprocessed })
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      await batchPutMatches([{ matchId: '0' }]);

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend.mock.calls[1][0].input.RequestItems).toEqual(unprocessed);
    });

    it('logs an error (without throwing) when items stay unprocessed after all retries', async () => {
      const unprocessed = {
        [tables.matches]: [{ PutRequest: { Item: { matchId: '0' } } }],
      };
      mockSend.mockResolvedValue({ UnprocessedItems: unprocessed });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(batchPutMatches([{ matchId: '0' }])).resolves.toBeUndefined();

      expect(mockSend).toHaveBeenCalledTimes(3); // BATCH_WRITE_RETRIES
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('still unprocessed'));
      errorSpy.mockRestore();
    });
  });

  describe('batchPutTeams', () => {
    it('does nothing (no requests) for an empty list', async () => {
      await batchPutTeams([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('writes a single batch to the teams table', async () => {
      mockSend.mockResolvedValue({});
      const teams = Array.from({ length: 5 }, (_, i) => ({ teamCode: `T${i}` }));

      await batchPutTeams(teams);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.type).toBe('BatchWrite');
      expect(command.input.RequestItems[tables.teams]).toHaveLength(5);
      expect(command.input.RequestItems[tables.teams][0]).toEqual({
        PutRequest: { Item: { teamCode: 'T0' } },
      });
    });

    it('splits more than 25 teams into multiple batch requests', async () => {
      mockSend.mockResolvedValue({});
      const teams = Array.from({ length: 30 }, (_, i) => ({ teamCode: `T${i}` }));

      await batchPutTeams(teams);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('retries items DynamoDB returns as unprocessed', async () => {
      const unprocessed = {
        [tables.teams]: [{ PutRequest: { Item: { teamCode: 'ENG' } } }],
      };
      mockSend
        .mockResolvedValueOnce({ UnprocessedItems: unprocessed })
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      await batchPutTeams([{ teamCode: 'ENG' }]);

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend.mock.calls[1][0].input.RequestItems).toEqual(unprocessed);
    });

    it('logs an error (without throwing) when items stay unprocessed after all retries', async () => {
      const unprocessed = {
        [tables.teams]: [{ PutRequest: { Item: { teamCode: 'ENG' } } }],
      };
      mockSend.mockResolvedValue({ UnprocessedItems: unprocessed });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(batchPutTeams([{ teamCode: 'ENG' }])).resolves.toBeUndefined();

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('still unprocessed'));
      errorSpy.mockRestore();
    });
  });

  describe('getTree', () => {
    it('returns items from scan', async () => {
      const tree = [{ round: 'FINAL', position: 1 }];
      mockSend.mockResolvedValue({ Items: tree });

      const result = await getTree();
      expect(result).toEqual(tree);
    });

    it('returns empty array when no items', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await getTree();
      expect(result).toEqual([]);
    });
  });

  describe('putTreeSlot', () => {
    it('sends put command', async () => {
      mockSend.mockResolvedValue({});
      await putTreeSlot({ round: 'FINAL', position: 1 });
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('getConfig', () => {
    it('returns config item', async () => {
      const item = { configKey: 'adminSecret', value: 'hashed' };
      mockSend.mockResolvedValue({ Item: item });

      const result = await getConfig('adminSecret');
      expect(result).toEqual(item);
    });

    it('returns undefined when not found', async () => {
      mockSend.mockResolvedValue({ Item: undefined });

      const result = await getConfig('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('putConfig', () => {
    it('sends put command with configKey and value', async () => {
      mockSend.mockResolvedValue({});
      await putConfig('testKey', 'testValue');
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('putEvent', () => {
    it('stores the event under the FEED partition with a ts#matchId#type#teamCode#eventId sort key', async () => {
      mockSend.mockResolvedValue({});
      const event: FeedEvent = {
        eventId: 'm1#FULL_TIME',
        ts: '2026-06-14T20:00:00.000Z',
        type: 'FULL_TIME',
        matchId: 'm1',
        payload: { outcome: 'home' },
      };

      await putEvent(event);

      const command = mockSend.mock.calls[0][0];
      expect(command.type).toBe('Put');
      expect(command.input.TableName).toBe(tables.events);
      expect(command.input.Item).toMatchObject({
        feedId: 'FEED',
        // No teamCode, so that segment is empty; the eventId is appended last.
        sk: '2026-06-14T20:00:00.000Z#m1#FULL_TIME##m1#FULL_TIME',
        eventId: 'm1#FULL_TIME',
        type: 'FULL_TIME',
      });
    });

    it('includes teamCode in the sort key so simultaneous goals do not collide', async () => {
      mockSend.mockResolvedValue({});
      const homeGoal: FeedEvent = {
        eventId: 'm1#GOAL#2-2',
        ts: '2026-06-14T20:30:00.000Z',
        type: 'GOAL',
        teamCode: 'ENG',
        matchId: 'm1',
        payload: { side: 'home', homeScore: 2, awayScore: 2 },
      };
      const awayGoal: FeedEvent = {
        eventId: 'm1#GOAL#2-2',
        ts: '2026-06-14T20:30:00.000Z',
        type: 'GOAL',
        teamCode: 'BRA',
        matchId: 'm1',
        payload: { side: 'away', homeScore: 2, awayScore: 2 },
      };

      await putEvent(homeGoal);
      await putEvent(awayGoal);

      const homeSk = mockSend.mock.calls[0][0].input.Item.sk;
      const awaySk = mockSend.mock.calls[1][0].input.Item.sk;
      expect(homeSk).toBe('2026-06-14T20:30:00.000Z#m1#GOAL#ENG#m1#GOAL#2-2');
      expect(awaySk).toBe('2026-06-14T20:30:00.000Z#m1#GOAL#BRA#m1#GOAL#2-2');
      // Distinct sort keys mean the second PutItem cannot overwrite the first.
      expect(homeSk).not.toBe(awaySk);
    });

    it('tolerates a matchId-less event (e.g. BRACKET_DRAWN) in the sort key', async () => {
      mockSend.mockResolvedValue({});
      const event: FeedEvent = {
        eventId: 'BRACKET_DRAWN',
        ts: '2026-06-20T12:00:00.000Z',
        type: 'BRACKET_DRAWN',
        payload: {},
      };

      await putEvent(event);

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Item.sk).toBe('2026-06-20T12:00:00.000Z##BRACKET_DRAWN##BRACKET_DRAWN');
    });

    it('appends the eventId so two same-team bookings in one poll get distinct keys', async () => {
      mockSend.mockResolvedValue({});
      const ts = '2026-06-14T21:00:00.000Z';
      const firstYellow: FeedEvent = {
        eventId: 'm1#YELLOW_CARD#ENG#Stones#34\'',
        ts,
        type: 'YELLOW_CARD',
        teamCode: 'ENG',
        matchId: 'm1',
        payload: { player: 'Stones', minute: "34'" },
      };
      const secondYellow: FeedEvent = {
        eventId: 'm1#YELLOW_CARD#ENG#Rice#36\'',
        ts,
        type: 'YELLOW_CARD',
        teamCode: 'ENG',
        matchId: 'm1',
        payload: { player: 'Rice', minute: "36'" },
      };

      await putEvent(firstYellow);
      await putEvent(secondYellow);

      const skA = mockSend.mock.calls[0][0].input.Item.sk;
      const skB = mockSend.mock.calls[1][0].input.Item.sk;
      // Same ts/matchId/type/teamCode — only the appended eventId keeps them apart.
      expect(skA).not.toBe(skB);
    });
  });

  describe('getRecentEvents', () => {
    it('queries the FEED partition newest-first, over-fetching to absorb dupes', async () => {
      const events = [{ eventId: 'm1#FULL_TIME', type: 'FULL_TIME' }];
      mockSend.mockResolvedValue({ Items: events });

      const result = await getRecentEvents(50);

      const command = mockSend.mock.calls[0][0];
      expect(command.type).toBe('Query');
      expect(command.input.TableName).toBe(tables.events);
      expect(command.input.KeyConditionExpression).toBe('feedId = :feedId');
      expect(command.input.ExpressionAttributeValues).toEqual({ ':feedId': 'FEED' });
      expect(command.input.ScanIndexForward).toBe(false);
      // Over-fetches (limit * 3, capped at 600) so deduping can't starve the
      // caller of `limit` real events.
      expect(command.input.Limit).toBe(150);
      expect(result).toEqual(events);
    });

    it('collapses rows sharing an eventId, keeping the newest, and honours limit', async () => {
      // Newest-first, with the KICKOFF and GOAL each re-detected at a later ts.
      mockSend.mockResolvedValue({
        Items: [
          { eventId: 'm1#KICKOFF', type: 'KICKOFF', ts: '2026-06-11T19:34:16Z' },
          { eventId: 'm1#GOAL#1-0', type: 'GOAL', ts: '2026-06-11T19:34:16Z' },
          { eventId: 'm1#KICKOFF', type: 'KICKOFF', ts: '2026-06-11T19:28:14Z' },
          { eventId: 'm1#GOAL#1-0', type: 'GOAL', ts: '2026-06-11T19:28:14Z' },
        ],
      });

      const result = await getRecentEvents(1);

      // Deduped to two unique events (newest ts kept), then sliced to limit=1.
      expect(result).toEqual([
        { eventId: 'm1#KICKOFF', type: 'KICKOFF', ts: '2026-06-11T19:34:16Z' },
      ]);
    });

    it('returns an empty array when there are no events', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await getRecentEvents(10);
      expect(result).toEqual([]);
    });
  });

  describe('dedupeByEventId', () => {
    it('keeps the first occurrence of each eventId and passes through id-less rows', () => {
      const events = [
        { eventId: 'a', ts: '3' },
        { eventId: 'b', ts: '2' },
        { eventId: 'a', ts: '1' },
        { ts: '0' },
      ] as unknown as FeedEvent[];
      expect(dedupeByEventId(events)).toEqual([
        { eventId: 'a', ts: '3' },
        { eventId: 'b', ts: '2' },
        { ts: '0' },
      ]);
    });
  });
});
