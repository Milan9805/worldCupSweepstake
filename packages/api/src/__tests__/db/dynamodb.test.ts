import {
  getGroup,
  putGroup,
  getAllTeams,
  putTeam,
  getAllMatches,
  putMatch,
  batchPutMatches,
  getTree,
  putTreeSlot,
  getConfig,
  putConfig,
  tables,
} from '../../db/dynamodb';

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
});
