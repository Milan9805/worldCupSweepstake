import * as api from '../../lib/api';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('api lib', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSuccessResponse = (data: unknown) => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data }),
    });
  };

  const mockErrorResponse = (error: string) => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: false, error }),
    });
  };

  describe('getGroup', () => {
    it('fetches group data', async () => {
      const groupData = { groupKey: 'test', members: [] };
      mockSuccessResponse(groupData);

      const result = await api.getGroup('test-key');
      expect(result).toEqual(groupData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/group/test-key'),
        expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
      );
    });

    it('encodes the group key', async () => {
      mockSuccessResponse({});
      await api.getGroup('key with spaces');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/group/key%20with%20spaces'),
        expect.anything()
      );
    });

    it('throws on error response', async () => {
      mockErrorResponse('Group not found');
      await expect(api.getGroup('bad')).rejects.toThrow('Group not found');
    });
  });

  describe('getMatches', () => {
    it('fetches matches', async () => {
      const matches = [{ matchId: '1' }];
      mockSuccessResponse(matches);

      const result = await api.getMatches();
      expect(result).toEqual(matches);
    });

    it('throws on error', async () => {
      mockErrorResponse('Server error');
      await expect(api.getMatches()).rejects.toThrow('Server error');
    });
  });

  describe('getTeams', () => {
    it('fetches teams', async () => {
      const teams = [{ teamCode: 'ENG' }];
      mockSuccessResponse(teams);

      const result = await api.getTeams();
      expect(result).toEqual(teams);
    });
  });

  describe('getFeed', () => {
    it('fetches feed events', async () => {
      const events = [{ eventId: 'm1#GOAL#1-0', type: 'GOAL', ts: '2026-06-05T12:00:00Z', payload: {} }];
      mockSuccessResponse(events);

      const result = await api.getFeed();
      expect(result).toEqual(events);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/feed'),
        expect.anything()
      );
    });

    it('throws on error', async () => {
      mockErrorResponse('Server error');
      await expect(api.getFeed()).rejects.toThrow('Server error');
    });
  });

  describe('refreshScores', () => {
    it('posts to refresh endpoint', async () => {
      mockSuccessResponse({ matches: [], teams: [] });

      await api.refreshScores();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/refresh'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('adminLogin', () => {
    it('posts secret and returns token', async () => {
      mockSuccessResponse({ token: 'jwt-token' });

      const result = await api.adminLogin('my-secret');
      expect(result).toEqual({ token: 'jwt-token' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ secret: 'my-secret' }),
        })
      );
    });

    it('throws on invalid secret', async () => {
      mockErrorResponse('Invalid secret');
      await expect(api.adminLogin('bad')).rejects.toThrow('Invalid secret');
    });
  });

  describe('adminUpdateMembers', () => {
    it('posts members with auth header', async () => {
      mockSuccessResponse({ groupKey: 'g1', members: [] });

      const members = [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }];
      await api.adminUpdateMembers('token123', 'g1', members);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/members'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
          body: JSON.stringify({ groupKey: 'g1', members }),
        })
      );
    });
  });

  describe('adminAssignTeams', () => {
    it('posts assignments with auth header', async () => {
      mockSuccessResponse({ groupKey: 'g1', members: [] });

      const assignments = [{ personName: 'Alice', teams: ['ENG'] }];
      await api.adminAssignTeams('token123', 'g1', assignments);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/assign'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
        })
      );
    });
  });

  describe('adminGetUploadUrl', () => {
    it('posts upload request with auth header', async () => {
      mockSuccessResponse({ uploadUrl: 'https://signed.url', imageUrl: 'https://img.url' });

      const result = await api.adminGetUploadUrl('token123', 'g1', 'Alice', 'image/png');
      expect(result).toEqual({ uploadUrl: 'https://signed.url', imageUrl: 'https://img.url' });
    });
  });

  describe('error handling', () => {
    it('throws generic error when no error message', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: false }),
      });
      await expect(api.getMatches()).rejects.toThrow('API request failed');
    });
  });
});
