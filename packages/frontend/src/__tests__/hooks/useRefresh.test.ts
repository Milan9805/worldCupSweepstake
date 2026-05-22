import { renderHook, act } from '@testing-library/react';
import { useRefresh } from '../../hooks/useRefresh';
import * as api from '../../lib/api';

jest.mock('../../lib/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('useRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with isRefreshing false and lastRefresh null', () => {
    const { result } = renderHook(() => useRefresh());
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.lastRefresh).toBeNull();
  });

  it('refresh calls API and updates lastRefresh', async () => {
    mockedApi.refreshScores.mockResolvedValue({ matches: [], teams: [] });

    const { result } = renderHook(() => useRefresh());

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockedApi.refreshScores).toHaveBeenCalled();
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.lastRefresh).toBeInstanceOf(Date);
  });

  it('handles refresh error gracefully', async () => {
    mockedApi.refreshScores.mockRejectedValue(new Error('API down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const { result } = renderHook(() => useRefresh());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.lastRefresh).toBeNull();
    consoleSpy.mockRestore();
  });

  it('prevents concurrent refresh calls', async () => {
    let resolveRefresh: () => void;
    mockedApi.refreshScores.mockImplementation(
      () =>
        new Promise<{ matches: unknown[]; teams: unknown[] }>((resolve) => {
          resolveRefresh = () => resolve({ matches: [], teams: [] });
        }),
    );

    const { result } = renderHook(() => useRefresh());

    // Start first refresh
    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    expect(result.current.isRefreshing).toBe(true);

    // Try second refresh while first is in progress
    await act(async () => {
      await result.current.refresh(); // should no-op
    });

    // Only one call should have been made
    expect(mockedApi.refreshScores).toHaveBeenCalledTimes(1);

    // Complete the first refresh
    await act(async () => {
      resolveRefresh!();
      await refreshPromise!;
    });
  });
});
