'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Spinner from '@/components/Spinner';
import FilterTabs from '@/components/FilterTabs';
import TeamFilterDropdown from '@/components/TeamFilterDropdown';
import MatchList from '@/components/MatchList';
import { useGroup } from '@/hooks/GroupContext';
import { useNow } from '@/hooks/useNow';
import { buildOwnersByTeam } from '@/lib/owners';
import {
  FixturesFilter,
  filterFixtures,
  fixturesEmptyMessage,
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

  // Only offer the teams that actually appear in a fixture, alphabetised, so the
  // dropdown can't filter to a team with nothing to show.
  const dropdownTeams = useMemo(() => {
    const playing = new Set<string>();
    matches.forEach((m) => {
      playing.add(m.homeTeam);
      playing.add(m.awayTeam);
    });
    return teams
      .filter((t) => playing.has(t.teamCode))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, matches]);

  // The display list: sorted oldest -> newest, with the active view and (in the
  // "All" view only) the team search applied.
  const visible = useMemo(
    () => filterFixtures(matches, { filter, teamCode: selectedTeamCode }, ownersByTeam, claimedPerson),
    [matches, filter, selectedTeamCode, ownersByTeam, claimedPerson],
  );

  // The "Today" marker is an All-view affordance only — under "My fixtures" the
  // list is already short and self-evidently yours, so we leave it off there.
  const todayIndex = useMemo(
    () => (filter === 'all' ? todayDividerIndex(visible, now) : null),
    [filter, visible, now],
  );

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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">Fixtures</h1>

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
          <div className="mb-6">
            <TeamFilterDropdown
              teams={dropdownTeams}
              selectedTeamCode={selectedTeamCode}
              onChange={setSelectedTeamCode}
            />
          </div>
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
