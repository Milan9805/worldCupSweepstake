'use client';

import { useState, useCallback } from 'react';
import { RefreshResponse } from '@sweepstake/shared';
import { refreshScores } from '@/lib/api';

export type RefreshSource = 'api' | 'bbc' | 'cache';

/**
 * Triggers a scores/channels refresh. Pass `onRefreshed` to receive the fresh
 * matches and teams the API returns so the calling page can update its view
 * (scores, TV channels, etc.) without a manual reload.
 */
export function useRefresh(onRefreshed?: (result: RefreshResponse) => void) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [source, setSource] = useState<RefreshSource | null>(null);

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const result = await refreshScores();
      setLastRefresh(new Date());
      if (result?.source) setSource(result.source);
      if (result) onRefreshed?.(result);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, onRefreshed]);

  return { refresh, isRefreshing, lastRefresh, source };
}
