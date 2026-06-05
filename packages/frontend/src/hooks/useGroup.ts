'use client';

import { useState, useEffect, useCallback } from 'react';
import { getGroup, getTeams, getMatches } from '@/lib/api';
import { Group, Team, Match, RefreshResponse } from '@sweepstake/shared';
import { usePollScores } from '@/hooks/usePollScores';

export function useGroup() {
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sweepstake_group_key');
      if (stored) setGroupKey(stored);
    }
  }, []);

  const login = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGroup(key) as Group;
      setGroup(data);
      setGroupKey(key);
      localStorage.setItem('sweepstake_group_key', key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid group key');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!groupKey) return;
    setLoading(true);
    try {
      const [groupData, teamsData, matchesData] = await Promise.all([
        getGroup(groupKey),
        getTeams(),
        getMatches(),
      ]);
      setGroup(groupData as Group);
      setTeams(teamsData as Team[]);
      setMatches(matchesData as Match[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [groupKey]);

  // Lightweight background refresh: only the things that change during play
  // (scores + team stats), without the heavier group fetch or a loading flash.
  const refreshScoresData = useCallback(async () => {
    if (!groupKey) return;
    try {
      const [teamsData, matchesData] = await Promise.all([getTeams(), getMatches()]);
      setTeams(teamsData as Team[]);
      setMatches(matchesData as Match[]);
    } catch (err) {
      // Polling failures are non-fatal — keep showing the last good data.
      console.error('Score refresh failed:', err);
    }
  }, [groupKey]);

  // Apply the result of a manual "Refresh Scores" so the view updates without a
  // reload (the POST /refresh response already carries fresh matches + teams).
  const applyRefresh = useCallback((result: RefreshResponse) => {
    setMatches(result.matches);
    setTeams(result.teams);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('sweepstake_group_key');
    setGroupKey(null);
    setGroup(null);
  }, []);

  // Auto-update scores in the background while a match is live (no manual refresh).
  usePollScores(matches, refreshScoresData);

  return {
    groupKey,
    group,
    teams,
    matches,
    loading,
    error,
    login,
    loadData,
    logout,
    refreshScoresData,
    applyRefresh,
  };
}
