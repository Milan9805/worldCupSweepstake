import { renderHook, act } from '@testing-library/react';
import { useGroup } from '../../hooks/useGroup';
import * as api from '../../lib/api';

jest.mock('../../lib/api');

const mockedApi = api as jest.Mocked<typeof api>;

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

describe('useGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    // loadData now also kicks off a real scrape (POST /refresh) whenever the
    // loaded matches are in an active window. Default it to a harmless resolve
    // so existing tests that don't care about it stay green.
    mockedApi.refreshScores.mockResolvedValue({
      matches: [],
      teams: [],
      source: 'api',
      refreshedAt: '2026-06-11T00:00:00Z',
    } as never);
  });

  it('initializes with null group and empty teams and matches', () => {
    const { result } = renderHook(() => useGroup());
    expect(result.current.group).toBeNull();
    expect(result.current.teams).toEqual([]);
    expect(result.current.matches).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reads groupKey from localStorage on mount', () => {
    mockLocalStorage.getItem.mockReturnValue('saved-key');
    const { result } = renderHook(() => useGroup());
    expect(result.current.groupKey).toBe('saved-key');
  });

  it('login fetches group and saves to localStorage', async () => {
    const groupData = { groupKey: 'test', groupName: 'Test', members: [] };
    mockedApi.getGroup.mockResolvedValue(groupData);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.login('test');
    });

    expect(result.current.group).toEqual(groupData);
    expect(result.current.groupKey).toBe('test');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('sweepstake_group_key', 'test');
  });

  it('login resolves a typed name (any case) to the canonical member and claims it', async () => {
    const groupData = {
      groupKey: 'test',
      groupName: 'Test',
      members: [
        { name: 'Dan', imageUrl: null, teams: ['ENG'] },
        { name: 'Ben', imageUrl: null, teams: ['CRO'] },
      ],
    };
    mockedApi.getGroup.mockResolvedValue(groupData);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.login('test', { personName: '  dan  ' });
    });

    // Stored as the canonical member name, not what was typed.
    expect(result.current.claimedPerson).toBe('Dan');
    expect(result.current.groupKey).toBe('test');
  });

  it('login rejects a name that is not a group member and does not register the group', async () => {
    // Mount clean: no legacy key to migrate (a prior test leaves a sticky
    // getItem return value that clearAllMocks doesn't reset).
    mockLocalStorage.getItem.mockReturnValue(null);
    const groupData = {
      groupKey: 'test',
      groupName: 'Test',
      members: [{ name: 'Dan', imageUrl: null, teams: ['ENG'] }],
    };
    mockedApi.getGroup.mockResolvedValue(groupData);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await expect(
        result.current.login('test', { personName: 'Zzz' })
      ).rejects.toThrow(/isn't a member of this group/i);
    });

    // The error does NOT leak the group's members, and the group was NOT
    // registered/activated.
    expect(result.current.error).toMatch(/isn't a member of this group/i);
    expect(result.current.error).not.toMatch(/Dan/);
    expect(result.current.activeGroupKey).toBeNull();
    expect(result.current.claimedPerson).toBeNull();
  });

  it('login sets error on failure', async () => {
    mockedApi.getGroup.mockRejectedValue(new Error('Invalid group key'));

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      try {
        await result.current.login('bad-key');
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe('Invalid group key');
  });

  it('logout clears state and localStorage', () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const { result } = renderHook(() => useGroup());

    act(() => {
      result.current.logout();
    });

    expect(result.current.groupKey).toBeNull();
    expect(result.current.group).toBeNull();
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('sweepstake_group_key');
  });

  it('loadData fetches group, teams and matches', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const groupData = { groupKey: 'test', groupName: 'Test', members: [] };
    const teamsData = [{ teamCode: 'ENG', name: 'England' }];
    const matchesData = [{ matchId: 'm1', homeTeam: 'ENG', awayTeam: 'BRA' }];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);
    mockedApi.getMatches.mockResolvedValue(matchesData);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.group).toEqual(groupData);
    expect(result.current.teams).toEqual(teamsData);
    expect(result.current.matches).toEqual(matchesData);
  });

  it('loadData sets error on failure', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    mockedApi.getGroup.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('refreshScoresData re-fetches only teams and matches', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    mockedApi.getTeams.mockResolvedValue([{ teamCode: 'ENG' }]);
    mockedApi.getMatches.mockResolvedValue([{ matchId: 'm1' }]);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.refreshScoresData();
    });

    expect(mockedApi.getTeams).toHaveBeenCalled();
    expect(mockedApi.getMatches).toHaveBeenCalled();
    expect(mockedApi.getGroup).not.toHaveBeenCalled();
    expect(result.current.teams).toEqual([{ teamCode: 'ENG' }]);
    expect(result.current.matches).toEqual([{ matchId: 'm1' }]);
  });

  it('refreshScoresData does nothing when there is no group key', async () => {
    mockLocalStorage.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.refreshScoresData();
    });

    expect(mockedApi.getTeams).not.toHaveBeenCalled();
    expect(mockedApi.getMatches).not.toHaveBeenCalled();
  });

  it('refreshScoresData logs and swallows fetch errors', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    mockedApi.getTeams.mockRejectedValue(new Error('down'));
    mockedApi.getMatches.mockResolvedValue([]);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.refreshScoresData();
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('loadData triggers a scrape (POST /refresh) when a loaded match is live, and applies its result', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const groupData = { groupKey: 'test', groupName: 'Test', members: [] };
    // GET returns a LIVE match but WITHOUT a minute (read-only feed lags).
    const matchesData = [{ matchId: 'm1', status: 'LIVE' }];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue([]);
    mockedApi.getMatches.mockResolvedValue(matchesData);
    // The scrape returns the same match WITH the live minute filled in.
    const scraped = {
      matches: [{ matchId: 'm1', status: 'LIVE', minute: 57 }],
      teams: [{ teamCode: 'ENG' }],
      source: 'bbc',
      refreshedAt: '2026-06-11T00:00:00Z',
    };
    mockedApi.refreshScores.mockResolvedValue(scraped as never);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.loadData();
    });

    expect(mockedApi.refreshScores).toHaveBeenCalled();
    // The fresher scraped matches/teams (with the minute) win over the GET.
    expect(result.current.matches).toEqual(scraped.matches);
    expect(result.current.teams).toEqual(scraped.teams);
  });

  it('loadData does NOT scrape when no match is in an active window', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const groupData = { groupKey: 'test', groupName: 'Test', members: [] };
    // A finished match in the distant past — not live, not imminent.
    const matchesData = [
      { matchId: 'm1', status: 'FINISHED', datetime: '2020-01-01T00:00:00Z' },
    ];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue([]);
    mockedApi.getMatches.mockResolvedValue(matchesData);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.loadData();
    });

    expect(mockedApi.refreshScores).not.toHaveBeenCalled();
    expect(result.current.matches).toEqual(matchesData);
  });

  it('liveRefresh scrapes via POST /refresh and applies the returned matches and teams', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const scraped = {
      matches: [{ matchId: 'm1', status: 'LIVE', minute: 12 }],
      teams: [{ teamCode: 'GER' }],
      source: 'bbc',
      refreshedAt: '2026-06-11T00:00:00Z',
    };
    mockedApi.refreshScores.mockResolvedValue(scraped as never);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.liveRefresh();
    });

    expect(mockedApi.refreshScores).toHaveBeenCalled();
    // It must NOT go through the read-only GET path.
    expect(mockedApi.getMatches).not.toHaveBeenCalled();
    expect(result.current.matches).toEqual(scraped.matches);
    expect(result.current.teams).toEqual(scraped.teams);
  });

  it('liveRefresh does nothing when there is no group key', async () => {
    mockLocalStorage.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.liveRefresh();
    });

    expect(mockedApi.refreshScores).not.toHaveBeenCalled();
  });

  it('liveRefresh logs and swallows scrape errors (keeps last good data)', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    mockedApi.refreshScores.mockRejectedValue(new Error('scrape down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.liveRefresh();
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('switchGroup activates another remembered group without re-login', async () => {
    // Clean mount (no sticky legacy key) so the registry starts empty.
    mockLocalStorage.getItem.mockReturnValue(null);
    mockedApi.getGroup.mockImplementation(async (key: string) => ({
      groupKey: key,
      groupName: `Name ${key}`,
      members: [],
    }) as never);

    const { result } = renderHook(() => useGroup());

    // Remember two groups; the most recent login is active.
    await act(async () => {
      await result.current.login('group-a');
    });
    await act(async () => {
      await result.current.login('group-b');
    });
    expect(result.current.activeGroupKey).toBe('group-b');
    expect(result.current.knownGroups).toHaveLength(2);

    act(() => {
      result.current.switchGroup('group-a');
    });

    expect(result.current.groupKey).toBe('group-a');
    expect(result.current.activeGroupKey).toBe('group-a');
    // The active group's data is cleared so consumers refetch.
    expect(result.current.group).toBeNull();
  });

  it('switchGroup is a no-op for an unknown group key', async () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    mockedApi.getGroup.mockResolvedValue({ groupKey: 'group-a', groupName: 'A', members: [] });

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.login('group-a');
    });

    act(() => {
      result.current.switchGroup('not-a-group');
    });

    // Active group unchanged.
    expect(result.current.activeGroupKey).toBe('group-a');
    expect(result.current.groupKey).toBe('group-a');
  });

  it('claimPerson records the device owner in the active group', async () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    mockedApi.getGroup.mockResolvedValue({
      groupKey: 'group-a',
      groupName: 'A',
      members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }],
    });

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.login('group-a');
    });
    expect(result.current.claimedPerson).toBeNull();

    act(() => {
      result.current.claimPerson('Alice');
    });

    expect(result.current.claimedPerson).toBe('Alice');
  });

  it('claimPerson is a no-op when there is no active group key', () => {
    mockLocalStorage.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useGroup());

    act(() => {
      result.current.claimPerson('Alice');
    });

    expect(result.current.claimedPerson).toBeNull();
  });

  it('applyRefresh updates matches and teams from a refresh response', () => {
    mockLocalStorage.getItem.mockReturnValue('test');

    const { result } = renderHook(() => useGroup());

    act(() => {
      result.current.applyRefresh({
        matches: [{ matchId: 'x' }],
        teams: [{ teamCode: 'GER' }],
        source: 'api',
        refreshedAt: '2026-06-14T18:00:00Z',
      } as never);
    });

    expect(result.current.matches).toEqual([{ matchId: 'x' }]);
    expect(result.current.teams).toEqual([{ teamCode: 'GER' }]);
  });
});
