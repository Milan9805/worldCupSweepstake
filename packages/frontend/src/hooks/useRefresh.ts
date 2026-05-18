'use client';

import { useState, useCallback } from 'react';
import { refreshScores } from '@/lib/api';

export function useRefresh() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshScores();
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  return { refresh, isRefreshing, lastRefresh };
}
