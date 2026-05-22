'use client';

import { useState, useCallback } from 'react';
import { refreshScores } from '@/lib/api';

export type RefreshSource = 'api' | 'bbc' | 'cache';

export function useRefresh() {
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
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  return { refresh, isRefreshing, lastRefresh, source };
}
