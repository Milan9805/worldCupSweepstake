'use client';

import { useState, useEffect, useCallback } from 'react';
import { getGroup, getTeams, getMatches, refreshScores } from '@/lib/api';
import { Group, Team, Match, RefreshResponse, hasActiveMatchWindow } from '@sweepstake/shared';
import { usePollScores } from '@/hooks/usePollScores';
import {
  GroupRegistry,
  readRegistry,
  writeRegistry,
  addGroupToRegistry,
  setActiveGroup,
  setClaimedPerson,
  removeGroupFromRegistry,
  ACTIVE_GROUP_KEY,
} from '@/lib/groupRegistry';

// The single source of group/teams/matches state. Call this ONCE — via
// GroupProvider in the root layout — and consume it everywhere else through
// useGroup() from '@/hooks/GroupContext'. Calling it per-page would create
// independent state copies and duplicate score-poll loops.
export function useGroupState() {
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [registry, setRegistry] = useState<GroupRegistry>({ active: null, groups: {} });
  const [group, setGroup] = useState<Group | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, load the known-groups registry, migrating a legacy single
  // `sweepstake_group_key` user into it on first run. The active group's key is
  // mirrored back to `sweepstake_group_key` so pages that still read that key
  // directly (groups/tree/bracket) keep working without changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const loaded = readRegistry();
    setRegistry(loaded);
    if (loaded.active) setGroupKey(loaded.active);
  }, []);

  // Persist the registry and keep the legacy key mirrored to the active group.
  const persistRegistry = useCallback((next: GroupRegistry) => {
    setRegistry(next);
    writeRegistry(next);
  }, []);

  const login = useCallback(
    async (key: string, opts?: { personName?: string; groupName?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const data = (await getGroup(key)) as Group;

        // If a name was supplied at login it must match a group member
        // (case-insensitive). Resolve it to the canonical member name and reject
        // BEFORE registering, so a typo never half-joins the group.
        let canonicalPerson: string | null = null;
        const typed = opts?.personName?.trim();
        if (typed) {
          const member = data.members.find(
            (m) => m.name.trim().toLowerCase() === typed.toLowerCase()
          );
          if (!member) {
            // Don't reveal the group's members to whoever typed the name —
            // just say it didn't match.
            throw new Error(
              `"${typed}" isn't a member of this group. Check the spelling of your name.`
            );
          }
          canonicalPerson = member.name;
        }

        setGroup(data);
        setGroupKey(key);
        // Register (or refresh) the group, mark it active, and (if a name was
        // resolved) claim it — all in one atomic registry write. Prefer the name
        // returned by the API over any caller-supplied label.
        setRegistry((prev) => {
          const added = addGroupToRegistry(prev, key, data.groupName ?? opts?.groupName ?? key);
          let next = setActiveGroup(added, key);
          if (canonicalPerson) next = setClaimedPerson(next, key, canonicalPerson);
          writeRegistry(next);
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid group key');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Add a group on a successful login (alias of login, named to match the
  // multi-group registry vocabulary used by the landing page / useIdentity).
  const addGroup = login;

  // Switch the active group: persist the change and let the groupKey-driven
  // effect in consumers refetch. No re-login needed — each key is remembered.
  const switchGroup = useCallback(
    (key: string) => {
      if (!registry.groups[key]) return;
      setGroupKey(key);
      setGroup(null);
      persistRegistry(setActiveGroup(registry, key));
    },
    [registry, persistRegistry]
  );

  // Record which member the device's owner is in the active group.
  const claimPerson = useCallback(
    (name: string) => {
      if (!groupKey) return;
      persistRegistry(setClaimedPerson(registry, groupKey, name));
    },
    [registry, groupKey, persistRegistry]
  );

  // Trigger a real server-side scrape (POST /refresh) and apply the fresh
  // matches+teams it returns. Unlike the read-only refreshScoresData, this is
  // what causes the live `minute` to be (re)computed server-side, so the client
  // can show "57'" without waiting for a manual refresh. The server has a 20s
  // cooldown that returns cache, so calling this on load and each poll is safe.
  const liveRefresh = useCallback(async () => {
    if (!groupKey) return;
    try {
      const result = await refreshScores();
      setMatches(result.matches);
      setTeams(result.teams);
    } catch (err) {
      // Scrape failures are non-fatal — keep showing the last good data.
      console.error('Live refresh failed:', err);
    }
  }, [groupKey]);

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
      // Keep the stored group name fresh in case it changed server-side.
      setRegistry((prev) => {
        const name = (groupData as Group).groupName;
        if (!prev.groups[groupKey] || prev.groups[groupKey].groupName === name) return prev;
        const next = addGroupToRegistry(prev, groupKey, name);
        writeRegistry(next);
        return next;
      });
      // If a match is live/imminent, the read-only GET above won't carry a fresh
      // `minute` — that's only written when a scrape runs. Kick one off so the
      // very first paint shows the live minute instead of needing a manual reload.
      if (hasActiveMatchWindow(matchesData as Match[], Date.now())) {
        await liveRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [groupKey, liveRefresh]);

  // Auto-load whenever the active group key becomes known or changes (mount,
  // login, group switch). With one shared provider instance this is THE place
  // data gets loaded — pages no longer call loadData() on mount. loadData's
  // identity only changes with groupKey, so this runs once per key.
  useEffect(() => {
    if (groupKey) loadData();
  }, [groupKey, loadData]);

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

  // Log out of the active group: forget it (and clear identity), then fall back
  // to another remembered group if there is one.
  const logout = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ACTIVE_GROUP_KEY);
    }
    setRegistry((prev) => {
      if (!prev.active) return prev;
      const next = removeGroupFromRegistry(prev, prev.active);
      writeRegistry(next);
      setGroupKey(next.active);
      return next;
    });
    setGroup(null);
  }, []);

  // Auto-update scores in the background while a match is live (no manual
  // refresh). While a match is LIVE we scrape (POST) so the `minute` keeps
  // ticking; otherwise the cheap read-only GET is enough. usePollScores keeps
  // the refetch in a ref each render, so a per-render value is fine here.
  usePollScores(
    matches,
    matches.some((m) => m.status === 'LIVE') ? liveRefresh : refreshScoresData
  );

  const knownGroups = Object.entries(registry.groups).map(([key, value]) => ({
    groupKey: key,
    groupName: value.groupName,
    person: value.person ?? null,
  }));

  const activeGroupKey = registry.active;
  const claimedPerson = (activeGroupKey && registry.groups[activeGroupKey]?.person) || null;

  return {
    groupKey,
    group,
    teams,
    matches,
    loading,
    error,
    login,
    addGroup,
    switchGroup,
    claimPerson,
    loadData,
    logout,
    refreshScoresData,
    liveRefresh,
    applyRefresh,
    // Multi-group registry surface.
    knownGroups,
    activeGroupKey,
    claimedPerson,
    active: { groupKey: activeGroupKey, personName: claimedPerson },
  };
}
