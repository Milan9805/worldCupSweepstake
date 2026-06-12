'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import MatchList from '@/components/MatchList';
import { useGroup } from '@/hooks/GroupContext';
import { buildOwnersByTeam } from '@/lib/owners';
import { GroupZone, groupZones } from '@sweepstake/shared';

// Left accent bar + subtle fill per qualification zone. Bright emerald/amber
// reads clearly against the dark-green app background; a confirmed (clinched)
// top-two place gets a stronger green than a place that's only live.
const ZONE_CLASSES: Record<GroupZone, string> = {
  QUALIFIED: 'border-l-emerald-400 bg-emerald-400/15',
  TOP_TWO: 'border-l-emerald-400/40 bg-emerald-400/5',
  THIRD: 'border-l-amber-400/70 bg-amber-400/10',
  NONE: 'border-l-transparent',
};

export default function GroupsPage() {
  const { group, teams, matches, loading } = useGroup();
  const [selectedGroup, setSelectedGroup] = useState<string>('A');
  const router = useRouter();

  // Data comes from the shared group context (which also keeps it fresh while
  // matches are live) — this page only guards against visiting without a key.
  useEffect(() => {
    const key = localStorage.getItem('sweepstake_group_key');
    if (!key) {
      router.push('/');
    }
  }, []);

  const groupLetters = [...new Set(teams.map((t) => t.groupLetter))].sort();
  const groupTeams = teams
    .filter((t) => t.groupLetter === selectedGroup)
    .sort((a, b) => b.stats.points - a.stats.points || b.stats.goalDifference - a.stats.goalDifference);

  // Qualification zone per team (confirmed top two, live top two, third, out).
  const zones = groupZones(groupTeams);

  const groupMatches = matches
    .filter((m) => m.group === selectedGroup)
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  // Team code → owning member, for the standings and fixtures.
  const teamOwners = buildOwnersByTeam(group?.members ?? []);

  // Team code → flag, so fixtures can show flags alongside the codes.
  const teamFlags: Record<string, string> = Object.fromEntries(
    teams.map((t) => [t.teamCode, t.flag]),
  );

  // Only show the full-screen loader on a cold start — when the shared context
  // is already populated, a background reload shouldn't flash it.
  if (loading && teams.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-green-200">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar groupName={group?.groupName} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">Group Stages</h1>

        {/* Group tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {groupLetters.map((letter) => (
            <button
              key={letter}
              onClick={() => setSelectedGroup(letter)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedGroup === letter
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-green-100 hover:bg-white/10'
              }`}
            >
              Group {letter}
            </button>
          ))}
        </div>

        {/* Standings table */}
        <div className="bg-white/5 border border-white/10 rounded-lg overflow-x-auto mb-6">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-white/10 text-green-200 text-xs">
                <th className="py-3 px-4 text-left">#</th>
                <th className="py-3 px-4 text-left whitespace-nowrap">Team</th>
                <th className="py-3 px-4 text-center">P</th>
                <th className="py-3 px-4 text-center">W</th>
                <th className="py-3 px-4 text-center">D</th>
                <th className="py-3 px-4 text-center">L</th>
                <th className="py-3 px-4 text-center">GF</th>
                <th className="py-3 px-4 text-center">GA</th>
                <th className="py-3 px-4 text-center">GD</th>
                <th className="py-3 px-4 text-center font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {groupTeams.map((team, idx) => (
                <tr
                  key={team.teamCode}
                  className={`border-b border-b-white/5 border-l-4 ${
                    ZONE_CLASSES[zones.get(team.teamCode) ?? 'NONE']
                  }`}
                >
                  <td className="py-2 px-4">{idx + 1}</td>
                  <td className="py-2 px-4 font-medium whitespace-nowrap">
                    <span className="mr-2">{team.flag}</span>
                    {team.name}
                    {teamOwners[team.teamCode] && (
                      <span className="ml-2 text-xs text-gold/80 font-normal">({teamOwners[team.teamCode].name})</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-center">{team.stats.played}</td>
                  <td className="py-2 px-4 text-center">{team.stats.wins}</td>
                  <td className="py-2 px-4 text-center">{team.stats.draws}</td>
                  <td className="py-2 px-4 text-center">{team.stats.losses}</td>
                  <td className="py-2 px-4 text-center">{team.stats.goalsFor}</td>
                  <td className="py-2 px-4 text-center">{team.stats.goalsAgainst}</td>
                  <td className="py-2 px-4 text-center">
                    {team.stats.goalDifference > 0 ? '+' : ''}
                    {team.stats.goalDifference}
                  </td>
                  <td className="py-2 px-4 text-center font-bold">{team.stats.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Qualification key */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-green-200 mb-6">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400" />
            Qualified
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400/40" />
            Qualifying spot
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-400/70" />
            3rd place
          </span>
        </div>

        {/* Fixtures */}
        <h2 className="text-lg font-bold mb-4">Fixtures - Group {selectedGroup}</h2>
        <MatchList matches={groupMatches} teamOwners={teamOwners} teamFlags={teamFlags} />

        {groupMatches.length === 0 && (
          <div className="text-center text-green-200 py-8">
            No matches loaded yet. Try refreshing scores.
          </div>
        )}
      </div>
    </div>
  );
}
