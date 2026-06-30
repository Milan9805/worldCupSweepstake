'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Spinner from '@/components/Spinner';
import FilterTabs from '@/components/FilterTabs';
import TeamFilterDropdown from '@/components/TeamFilterDropdown';
import MatchList from '@/components/MatchList';
import LiveBadge from '@/components/LiveBadge';
import { useGroup } from '@/hooks/GroupContext';
import { useNow } from '@/hooks/useNow';
import { buildOwnersByTeam } from '@/lib/owners';
import {
  FixturesFilter,
  filterFixtures,
  fixturesEmptyMessage,
  isMatchMine,
  todayDividerIndex,
} from '@/lib/fixtures';

export default function FixturesPage() {
  const { groupKey, group, teams, matches, claimedPerson, loading } = useGroup();
  // Drives the "Today" divider's position. It only moves at midnight, so a
  // once-a-minute tick is ample (and cheap) — no need for the 1s default.
  const now = useNow(60_000);
  const [filter, setFilter] = useState<FixturesFilter>('all');
  const [selectedTeamCode, setSelectedTeamCode] = useState<string | null>(null);
  const router = useRouter();

  // CSS top for the sticky filter bar: NavBar height (64px) + MatchBanner height.
  // Measured after loading so the banner is in the DOM. Falls back to 64 (NavBar
  // only) when no banner is rendered (tournament over).
  const [filterTabsTop, setFilterTabsTop] = useState(64);
  const stickyRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // Data loading is owned by the shared GroupProvider; this guard only bounces
  // visitors with no group at all back to the login page.
  useEffect(() => {
    if (!groupKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem('sweepstake_group_key');
      if (!stored) {
        router.push('/');
      }
    }
  }, [groupKey, router]);

  // Switching to the "mine" view drops any team search — team filtering is an
  // "All" view feature only, so clearing it keeps the UI honest (and the
  // dropdown isn't rendered under "mine" anyway). Done in the handler rather
  // than a render-time effect so it's a direct consequence of the user action.
  const handleFilterChange = (value: FixturesFilter) => {
    setFilter(value);
    if (value === 'mine') setSelectedTeamCode(null);
  };

  // Team code -> flag, so fixtures can show flags alongside the codes.
  const teamFlags = useMemo<Record<string, string>>(
    () => Object.fromEntries(teams.map((t) => [t.teamCode, t.flag])),
    [teams],
  );

  // Team code -> owning member, for the matchup owner brackets. Memoised so its
  // identity is stable for the `visible` memo below (which depends on it).
  const ownersByTeam = useMemo(() => buildOwnersByTeam(group?.members ?? []), [group?.members]);

  // useGroup already resolves each knockout tie's matchup — filling an unresolved
  // side with the winner that has advanced into it (see resolveKnockoutMatchups),
  // derived from the same bracket the tree renders — so the list shows the live
  // matchup without waiting on the once-a-day API, and can't disagree with the tree.
  const resolvedMatches = matches;

  // Only offer the teams that actually appear in a fixture, alphabetised, so the
  // dropdown can't filter to a team with nothing to show.
  const dropdownTeams = useMemo(() => {
    const playing = new Set<string>();
    resolvedMatches.forEach((m) => {
      playing.add(m.homeTeam);
      playing.add(m.awayTeam);
    });
    return teams
      .filter((t) => playing.has(t.teamCode))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, resolvedMatches]);

  // The display list: sorted oldest -> newest, with the active view and (in the
  // "All" view only) the team search applied.
  const visible = useMemo(
    () => filterFixtures(resolvedMatches, { filter, teamCode: selectedTeamCode }, ownersByTeam, claimedPerson),
    [resolvedMatches, filter, selectedTeamCode, ownersByTeam, claimedPerson],
  );

  // The "Today" marker orients the user in both the All and My fixtures views —
  // it sits before the first match kicking off today or later, so on a rest day
  // it naturally points at the next upcoming game. Suppressed only when a team
  // search is active (the sparse, jumping list reads confusingly with a "today"
  // line in that context).
  const todayIndex = useMemo(
    () => (!selectedTeamCode ? todayDividerIndex(visible, now) : null),
    [selectedTeamCode, visible, now],
  );

  // Any currently LIVE match belonging to the claimed person, for the
  // "Live now" alert on the My fixtures tab.
  const liveMatch = useMemo(
    () =>
      filter === 'mine'
        ? (resolvedMatches.find((m) => m.status === 'LIVE' && isMatchMine(m, ownersByTeam, claimedPerson)) ?? null)
        : null,
    [filter, resolvedMatches, ownersByTeam, claimedPerson],
  );

  // Measure the MatchBanner's bottom edge so the sticky filter bar pins flush
  // beneath it. useLayoutEffect runs before the browser paints, avoiding a
  // one-frame flicker. When there is no banner (tournament over) falls back to
  // 64 (NavBar height only).
  useLayoutEffect(() => {
    const banner = document.querySelector<HTMLElement>('[data-testid="match-banner"]');
    const top = banner ? Math.round(banner.getBoundingClientRect().bottom) : 64;
    setFilterTabsTop(top);
  }, [loading]);

  // Scroll the Today divider into view, accounting for the sticky filter bar.
  // Reading stickyRef at call time captures the bar's current height — which
  // differs between the All view (tabs + dropdown) and My fixtures (tabs only).
  function scrollToTodayDivider() {
    const el = document.getElementById('today-divider');
    if (!el) return;
    const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? filterTabsTop;
    const y = el.getBoundingClientRect().top + window.scrollY - stickyBottom - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  // When the page is opened via the "See all fixtures" banner link (?scroll=today),
  // scroll to the Today divider after the list has loaded. If the tournament is
  // over and the divider never renders, we do nothing — the user lands at the top.
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('scroll') !== 'today') return;
    requestAnimationFrame(scrollToTodayDivider);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to the Today divider on every tab switch (both directions), but not
  // on the initial mount — at that point the ?scroll=today effect handles it if
  // needed. isFirstRender guards the first fire so the page doesn't jump on load.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    requestAnimationFrame(scrollToTodayDivider);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (!group) return null;

  return (
    <div className="min-h-screen">
      <NavBar groupName={group.groupName} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-3">
        <h1 className="text-2xl font-bold">Fixtures</h1>
      </div>

      {/* Sticky filter bar — full-width so it reads as part of the page chrome
          rather than a floating box. Solid background prevents fixture cards
          from bleeding through as they scroll beneath it. Top is set dynamically
          to pin flush below the MatchBanner. */}
      <div
        ref={stickyRef}
        data-testid="sticky-filter-bar"
        style={{ top: filterTabsTop }}
        className="sticky z-30 bg-[#0f2e1c] border-b border-white/15"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-3">
          <FilterTabs
            tabs={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'My fixtures' },
            ]}
            value={filter}
            onChange={handleFilterChange}
            ariaLabel="Filter fixtures"
          />
          {filter === 'all' && (
            <div className="mt-2">
              <TeamFilterDropdown
                teams={dropdownTeams}
                selectedTeamCode={selectedTeamCode}
                onChange={setSelectedTeamCode}
              />
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8">
        {filter === 'mine' && liveMatch && (
          <Link
            href="/feed"
            data-testid="live-match-banner"
            className="mb-2 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm hover:bg-red-950/50 transition-colors"
          >
            <LiveBadge minute={liveMatch.minute} layout="inline" />
            <span className="font-semibold text-white">
              {teamFlags[liveMatch.homeTeam]} {liveMatch.homeTeam} vs {teamFlags[liveMatch.awayTeam]} {liveMatch.awayTeam}
            </span>
            <span className="ml-auto text-xs text-white/60 shrink-0">See live feed →</span>
          </Link>
        )}

        {visible.length === 0 ? (
          <div className="text-center text-green-200 py-12">
            {fixturesEmptyMessage(matches.length, filter, selectedTeamCode)}
          </div>
        ) : (
          <MatchList
            matches={visible}
            teamOwners={ownersByTeam}
            teamFlags={teamFlags}
            claimedPerson={claimedPerson}
            todayDividerIndex={todayIndex}
            showStage
          />
        )}
      </div>
    </div>
  );
}
