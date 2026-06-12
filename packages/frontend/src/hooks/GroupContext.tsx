'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useGroupState } from '@/hooks/useGroup';

// One shared instance of the group/teams/matches state (and its score-poll
// loop) for the whole app. GroupProvider is mounted once in the root layout;
// every consumer — pages, NavBar, the match banner — reads the same data, so a
// poll tick or a manual "Refresh Scores" updates all of them atomically and we
// never run duplicate poll loops.
type GroupContextValue = ReturnType<typeof useGroupState>;

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: ReactNode }) {
  const value = useGroupState();
  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

// Drop-in replacement for the old per-call useGroup(): same return shape, but
// backed by the single provider instance. Call sites only change their import.
export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup must be used within a GroupProvider');
  return ctx;
}
