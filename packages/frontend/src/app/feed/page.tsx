'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import FeedFilterTabs from '@/components/FeedFilterTabs';
import FeedMatchGroup from '@/components/FeedMatchGroup';
import { useGroup } from '@/hooks/GroupContext';
import { usePollScores } from '@/hooks/usePollScores';
import { getFeed } from '@/lib/api';
import { buildOwnersByTeam, buildTeamsByCode } from '@/lib/owners';
import { FeedFilter, filterFeedGroups, groupEventsByMatch } from '@/lib/feedGroups';
import { FeedEvent } from '@sweepstake/shared';

export default function FeedPage() {
  const { groupKey, group, teams, matches, claimedPerson } = useGroup();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>('all');
  // A 1-minute ticker so relative timestamps ("just now" → "1m ago") keep
  // advancing while the page is open, independent of when the feed re-fetches
  // (the poll only runs while a match is live).
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Pull the feed (public, no group needed). Kept separate from the group/teams
  // load so the adaptive poll can re-fetch just the timeline cheaply.
  const loadFeed = useCallback(async () => {
    try {
      const data = await getFeed();
      setEvents(data);
    } catch (err) {
      // Polling/initial failures are non-fatal — keep the last good timeline.
      console.error('Error loading feed:', err);
    }
  }, []);

  useEffect(() => {
    if (!groupKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem('sweepstake_group_key');
      if (!stored) {
        router.push('/');
        return;
      }
    }
    // The group/teams/matches load is owned by the shared GroupProvider; only
    // the feed itself is fetched here.
    loadFeed().finally(() => setLoading(false));
  }, [groupKey, loadFeed, router]);

  // Reuse the adaptive poll: `matches` drives the cadence (30s while live, off
  // when idle, visibility-aware) and each tick re-fetches the feed.
  usePollScores(matches, loadFeed);

  if (loading && events.length === 0 && !group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-green-200">Loading...</div>
      </div>
    );
  }

  // Team code → team (flags/names for event rows) and a flat flag map for the
  // group-header matchup; owner-by-team comes from the shared builder.
  const teamsByCode = buildTeamsByCode(teams);
  const teamFlags: Record<string, string> = Object.fromEntries(
    teams.map((t) => [t.teamCode, t.flag]),
  );
  const ownersByTeam = buildOwnersByTeam(group?.members ?? []);

  // Bundle the flat feed into per-match groups (live first, newest-first within)
  // and apply the active filter.
  const groups = groupEventsByMatch(events, matches);
  const visible = filterFeedGroups(groups, filter, ownersByTeam, claimedPerson);

  return (
    <div className="min-h-screen">
      <NavBar groupName={group?.groupName} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">Live Feed</h1>

        <FeedFilterTabs value={filter} onChange={setFilter} />

        {visible.length === 0 ? (
          <div className="text-center text-green-200 py-12">{emptyMessage(filter, groups.length)}</div>
        ) : (
          <div className="space-y-3">
            {visible.map((g) => (
              <FeedMatchGroup
                key={g.key}
                group={g}
                teamsByCode={teamsByCode}
                teamFlags={teamFlags}
                ownersByTeam={ownersByTeam}
                claimedPerson={claimedPerson}
                now={now}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Empty-state copy tailored to why the list is empty: a filter that matched
// nothing vs a feed where genuinely nothing has happened yet.
function emptyMessage(filter: FeedFilter, totalGroups: number): string {
  if (totalGroups === 0) {
    return 'Nothing has happened yet. Events will appear here as matches kick off, goals go in, and teams are knocked out.';
  }
  if (filter === 'mine') return 'None of your teams are in the feed yet.';
  if (filter === 'live') return 'No matches are live right now.';
  return 'Nothing has happened yet.';
}
