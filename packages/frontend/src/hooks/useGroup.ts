'use client';

import { useState, useEffect, useCallback } from 'react';
import { getGroup, getTeams, getMatches } from '@/lib/api';
import { Group, Team, Match } from '@sweepstake/shared';

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

  const logout = useCallback(() => {
    localStorage.removeItem('sweepstake_group_key');
    setGroupKey(null);
    setGroup(null);
  }, []);

  return { groupKey, group, teams, matches, loading, error, login, loadData, logout };
}
