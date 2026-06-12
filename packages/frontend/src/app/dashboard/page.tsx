'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import MatchBanner from '@/components/MatchBanner';
import TeamCard from '@/components/TeamCard';
import Leaderboard from '@/components/Leaderboard';
import PersonClaim from '@/components/PersonClaim';
import { useGroup } from '@/hooks/useGroup';
import { getTeamMatchInfo, compareTeamsByMatch } from '@/lib/teamMatches';
import { calculateLeaderboard, teamProgress, Team } from '@sweepstake/shared';

export default function DashboardPage() {
  const { groupKey, group, teams, matches, loading, loadData, applyRefresh, claimedPerson } =
    useGroup();
  // Which member the dashboard is viewing. Defaults to the claimed identity (who
  // you logged in as) but can be switched freely to browse other people's teams.
  // Switching the view does NOT change your identity — that's set at login.
  const [selectedPerson, setSelectedPerson] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    if (!groupKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem('sweepstake_group_key');
      if (!stored) {
        router.push('/');
        return;
      }
    }
    loadData();
  }, [groupKey]);

  // Seed the in-view selection from the claimed person (or the first member as a
  // fallback) once data is available, and reset it when switching groups.
  useEffect(() => {
    if (group?.members?.length) {
      const valid = group.members.some((m) => m.name === selectedPerson);
      if (!valid) {
        setSelectedPerson(claimedPerson ?? group.members[0].name);
      }
    }
  }, [group, claimedPerson, selectedPerson]);

  // View-only: tapping a person just changes whose teams are shown. It does NOT
  // re-claim your identity (so the list never re-sorts and the feed keeps using
  // who you logged in as). To change identity, log in again.
  const handleSelect = (name: string) => {
    setSelectedPerson(name);
  };

  if (loading && !group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-green-200">Loading...</div>
      </div>
    );
  }

  if (!group) return null;

  const person = group.members.find((m) => m.name === selectedPerson);
  const personTeams = person
    ? teams.filter((t) => person.teams.includes(t.teamCode))
    : [];

  // Pair each team with its match info, then order by match relevance
  // (live first, then soonest upcoming, then finished).
  const personTeamCards = personTeams
    .map((team) => ({ team, matchInfo: getTeamMatchInfo(team.teamCode, matches) }))
    .sort((a, b) => compareTeamsByMatch(a.matchInfo, b.matchInfo));

  // Show the claimed person (the device owner's identity) first in the selector,
  // keeping everyone else in their original order.
  const orderedMembers = claimedPerson
    ? [
        ...group.members.filter((m) => m.name === claimedPerson),
        ...group.members.filter((m) => m.name !== claimedPerson),
      ]
    : group.members;

  const leaderboard = calculateLeaderboard(group.members, teams);

  const teamsByCode = Object.fromEntries(teams.map((t) => [t.teamCode, t]));

  // Map each owned team code to the group member who owns it, so cards can show
  // who an opponent belongs to. A team belongs to at most one member.
  const ownersByTeam: Record<string, { name: string; imageUrl: string | null }> =
    Object.fromEntries(
      group.members.flatMap((m) =>
        m.teams.map((code) => [code, { name: m.name, imageUrl: m.imageUrl }])
      )
    );

  return (
    <div className="min-h-screen">
      <NavBar groupName={group.groupName} onRefreshed={applyRefresh} />
      <MatchBanner matches={matches} teamsByCode={teamsByCode} ownersByTeam={ownersByTeam} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main content */}
          <div className="lg:col-span-3">
            {/* Per-group identity: prompts "Who are you?" until claimed, then
                doubles as the person selector (claiming persists the choice). */}
            <PersonClaim
              members={orderedMembers}
              claimedPerson={selectedPerson || claimedPerson}
              onClaim={handleSelect}
              allowSwitch
            />

            {/* Stats summary */}
            {person && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <StatBox
                  label="Teams Still in tournament"
                  value={`${personTeams.filter((t) => !t.eliminated).length}/${personTeams.length}`}
                />
                <StatBox
                  label="Total Points"
                  value={String(personTeams.reduce((s, t) => s + t.stats.points, 0))}
                />
                <StatBox
                  label="Total Goals"
                  value={String(personTeams.reduce((s, t) => s + t.stats.goalsFor, 0))}
                />
                <StatBox
                  label="Win Probability"
                  value={`${((leaderboard.find((l) => l.name === person.name)?.winProbability || 0) * 100).toFixed(1)}%`}
                />
              </div>
            )}

            {/* Team cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {personTeamCards.map(({ team, matchInfo }) => (
                <TeamCard
                  key={team.teamCode}
                  team={team}
                  progress={teamProgress(team, getGroupPosition(team, teams), matches)}
                  matchInfo={matchInfo}
                  teamsByCode={teamsByCode}
                  ownersByTeam={ownersByTeam}
                />
              ))}
            </div>

            {personTeams.length === 0 && (
              <div className="text-center text-green-200 py-12">
                No teams assigned yet. Ask your admin to assign teams via the admin page.
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Leaderboard entries={leaderboard} />
          </div>
        </div>
      </div>
    </div>
  );
}

function getGroupPosition(team: Team, allTeams: Team[]): number {
  const groupTeams = allTeams
    .filter((t) => t.groupLetter === team.groupLetter)
    .sort((a, b) => {
      if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
      if (b.stats.goalDifference !== a.stats.goalDifference) return b.stats.goalDifference - a.stats.goalDifference;
      return b.stats.goalsFor - a.stats.goalsFor;
    });
  return groupTeams.findIndex((t) => t.teamCode === team.teamCode) + 1;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/30 border border-white/20 rounded-lg p-3 text-center">
      <div className="text-xs text-white/70">{label}</div>
      <div className="text-lg font-bold text-gold">{value}</div>
    </div>
  );
}
