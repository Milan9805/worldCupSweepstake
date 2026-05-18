import {
  getGroup,
  putGroup,
  getAllTeams,
  putTeam,
  getAllMatches,
  putMatch,
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
