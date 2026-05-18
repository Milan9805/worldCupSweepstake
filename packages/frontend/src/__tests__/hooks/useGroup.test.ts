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
  });

  it('initializes with null group and empty teams', () => {
    const { result } = renderHook(() => useGroup());
    expect(result.current.group).toBeNull();
    expect(result.current.teams).toEqual([]);
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

  it('loadData fetches group and teams', async () => {
    mockLocalStorage.getItem.mockReturnValue('test');
    const groupData = { groupKey: 'test', groupName: 'Test', members: [] };
    const teamsData = [{ teamCode: 'ENG', name: 'England' }];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);

    const { result } = renderHook(() => useGroup());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.group).toEqual(groupData);
    expect(result.current.teams).toEqual(teamsData);
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
});
