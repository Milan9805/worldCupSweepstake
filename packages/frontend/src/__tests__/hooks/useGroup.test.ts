import { renderHook, act } from '@testing-library/react';
import { useGroupState } from '../../hooks/useGroup';
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

// Flush the auto-load the groupKey effect kicks off on mount, so its state
// updates land inside act() and don't bleed into the next test.
const settle = () => act(async () => {});

describe('useGroupState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    // Mount with no stored group key unless a test opts in (mockReturnValue is
    // sticky across tests, and a stored key now auto-loads on mount).
    mockLocalStorage.getItem.mockReturnValue(null);
    // The groupKey effect auto-loads whenever a key is present, so default
    // every fetch to a harmless resolve; tests override what they care about.
    mockedApi.getGroup.mockResolvedValue({ groupKey: 'test', groupName: 'Test', members: [] });
    mockedApi.getTeams.mockResolvedValue([]);
    mockedApi.getMatches.mockResolvedValue([]);
    mockedApi.refreshScores.mockResolvedValue({
      matches: [],
      teams: [],
      source: 'api',
      refreshedAt: '2026-06-11T00:00:00Z',
    } as never);
  });

  it('initializes with null group and empty teams and matches', () => {
    const { result } = renderHook(() => useGroupState());
    expect(result.current.group).toBeNull();
    expect(result.current.teams).toEqual([]);
    expect(result.current.matches).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reads groupKey from localStorage on mount', async () => {
    mockLocalStorage.getItem.mockReturnValue('saved-key');
    const { result } = renderHook(() => useGroupState());
    expect(result.current.groupKey).toBe('saved-key');
    await settle();
  });

  it('auto-loads group, teams and matches when a group key is present on mount', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const groupData = { groupKey: 'test', groupName: 'Test', members: [] };
    const teamsData = [{ teamCode: 'ENG', name: 'England' }];
    const matchesData = [{ matchId: 'm1', homeTeam: 'ENG', awayTeam: 'BRA' }];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);
    mockedApi.getMatches.mockResolvedValue(matchesData);

    const { result } = renderHook(() => useGroupState());
    // No manual loadData() — the groupKey-keyed effect fires it.
    await settle();

    expect(mockedApi.getGroup).toHaveBeenCalledWith('test');
    expect(result.current.group).toEqual(groupData);
    expect(result.current.teams).toEqual(teamsData);
    expect(result.current.matches).toEqual(matchesData);
  });

  it('does not fetch anything when no group key is stored', async () => {
    const { result } = renderHook(() => useGroupState());
    await settle();

    expect(result.current.groupKey).toBeNull();
    expect(mockedApi.getGroup).not.toHaveBeenCalled();
    expect(mockedApi.getTeams).not.toHaveBeenCalled();
    expect(mockedApi.getMatches).not.toHaveBeenCalled();
  });

  it('auto-load sets error on failure', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    mockedApi.getGroup.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useGroupState());
    await settle();

    expect(result.current.error).toBe('Network error');
  });

  it('login fetches group and saves to localStorage', async () => {
    const groupData = { groupKey: 'test', groupName: 'Test', members: [] };
    mockedApi.getGroup.mockResolvedValue(groupData);

    const { result } = renderHook(() => useGroupState());

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

    const { result } = renderHook(() => useGroupState());

    await act(async () => {
      await result.current.login('test', { personName: '  dan  ' });
    });

    // Stored as the canonical member name, not what was typed.
    expect(result.current.claimedPerson).toBe('Dan');
    expect(result.current.groupKey).toBe('test');
  });

  it('login rejects a name that is not a group member and does not register the group', async () => {
    const groupData = {
      groupKey: 'test',
      groupName: 'Test',
      members: [{ name: 'Dan', imageUrl: null, teams: ['ENG'] }],
    };
    mockedApi.getGroup.mockResolvedValue(groupData);

    const { result } = renderHook(() => useGroupState());

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

    const { result } = renderHook(() => useGroupState());

    await act(async () => {
      try {
        await result.current.login('bad-key');
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe('Invalid group key');
  });

  it('logout clears state and localStorage', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const { result } = renderHook(() => useGroupState());
    await settle();

    act(() => {
      result.current.logout();
    });

    expect(result.current.groupKey).toBeNull();
    expect(result.current.group).toBeNull();
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('sweepstake_group_key');
  });

  it('refreshScoresData re-fetches only teams and matches', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    mockedApi.getTeams.mockResolvedValue([{ teamCode: 'ENG' }]);
    mockedApi.getMatches.mockResolvedValue([{ matchId: 'm1' }]);

    const { result } = renderHook(() => useGroupState());
    await settle();
    // Only count the calls made by the explicit refresh below, not the
    // auto-load's (mockClear keeps the resolved values).
    jest.clearAllMocks();

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
    const { result } = renderHook(() => useGroupState());

    await act(async () => {
      await result.current.refreshScoresData();
    });

    expect(mockedApi.getTeams).not.toHaveBeenCalled();
    expect(mockedApi.getMatches).not.toHaveBeenCalled();
  });

  it('refreshScoresData logs and swallows fetch errors', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const { result } = renderHook(() => useGroupState());
    await settle();

    mockedApi.getTeams.mockRejectedValue(new Error('down'));
    mockedApi.getMatches.mockResolvedValue([]);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await result.current.refreshScoresData();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Score refresh failed:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('auto-load triggers a scrape (POST /refresh) when a loaded match is live, and applies its result', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    // GET returns a LIVE match but WITHOUT a minute (read-only feed lags).
    const matchesData = [{ matchId: 'm1', status: 'LIVE' }];
    mockedApi.getMatches.mockResolvedValue(matchesData);
    // The scrape returns the same match WITH the live minute filled in.
    const scraped = {
      matches: [{ matchId: 'm1', status: 'LIVE', minute: 57 }],
      teams: [{ teamCode: 'ENG' }],
      source: 'bbc',
      refreshedAt: '2026-06-11T00:00:00Z',
    };
    mockedApi.refreshScores.mockResolvedValue(scraped as never);

    const { result } = renderHook(() => useGroupState());
    await settle();

    expect(mockedApi.refreshScores).toHaveBeenCalled();
    // The fresher scraped matches/teams (with the minute) win over the GET.
    expect(result.current.matches).toEqual(scraped.matches);
    expect(result.current.teams).toEqual(scraped.teams);
  });

  it('auto-load does NOT scrape when no match is in an active window', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    // A finished match in the distant past — not live, not imminent.
    const matchesData = [
      { matchId: 'm1', status: 'FINISHED', datetime: '2020-01-01T00:00:00Z' },
    ];
    mockedApi.getMatches.mockResolvedValue(matchesData);

    const { result } = renderHook(() => useGroupState());
    await settle();

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

    const { result } = renderHook(() => useGroupState());
    await settle();
    // Only count the calls made by the explicit liveRefresh below.
    jest.clearAllMocks();

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
    const { result } = renderHook(() => useGroupState());

    await act(async () => {
      await result.current.liveRefresh();
    });

    expect(mockedApi.refreshScores).not.toHaveBeenCalled();
  });

  it('liveRefresh logs and swallows scrape errors (keeps last good data)', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const { result } = renderHook(() => useGroupState());
    await settle();

    mockedApi.refreshScores.mockRejectedValue(new Error('scrape down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await result.current.liveRefresh();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Live refresh failed:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('switchGroup activates another remembered group and auto-reloads its data', async () => {
    mockedApi.getGroup.mockImplementation(async (key: string) => ({
      groupKey: key,
      groupName: `Name ${key}`,
      members: [],
    }) as never);

    const { result } = renderHook(() => useGroupState());

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
    // The active group's data is cleared, then the groupKey effect refetches
    // the newly-active group — no re-login needed.
    expect(result.current.group).toBeNull();
    await settle();
    expect(result.current.group).toEqual({
      groupKey: 'group-a',
      groupName: 'Name group-a',
      members: [],
    });
  });

  it('switchGroup is a no-op for an unknown group key', async () => {
    mockedApi.getGroup.mockResolvedValue({ groupKey: 'group-a', groupName: 'A', members: [] });

    const { result } = renderHook(() => useGroupState());

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
    mockedApi.getGroup.mockResolvedValue({
      groupKey: 'group-a',
      groupName: 'A',
      members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }],
    });

    const { result } = renderHook(() => useGroupState());

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
    const { result } = renderHook(() => useGroupState());

    act(() => {
      result.current.claimPerson('Alice');
    });

    expect(result.current.claimedPerson).toBeNull();
  });

  it('applyRefresh updates matches and teams from a refresh response', () => {
    const { result } = renderHook(() => useGroupState());

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
