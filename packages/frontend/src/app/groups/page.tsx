'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import MatchList from '@/components/MatchList';
import { getMatches, getTeams, getGroup } from '@/lib/api';
import { Match, Team, Group } from '@sweepstake/shared';

export default function GroupsPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('A');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const key = localStorage.getItem('sweepstake_group_key');
    if (!key) {
      router.push('/');
      return;
    }
    loadData(key);
  }, []);

  async function loadData(key: string) {
    try {
      const [matchesData, teamsData, groupData] = await Promise.all([
        getMatches(),
        getTeams(),
        getGroup(key),
      ]);
      setMatches(matchesData as Match[]);
      setTeams(teamsData as Team[]);
      setGroup(groupData as Group);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }

  const groupLetters = [...new Set(teams.map((t) => t.groupLetter))].sort();
  const groupTeams = teams
    .filter((t) => t.groupLetter === selectedGroup)
    .sort((a, b) => b.stats.points - a.stats.points || b.stats.goalDifference - a.stats.goalDifference);

  const groupMatches = matches
    .filter((m) => m.group === selectedGroup)
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  // Build team owners map
  const teamOwners: Record<string, { name: string; imageUrl: string | null }> = {};
  if (group) {
    group.members.forEach((member) => {
      member.teams.forEach((teamCode) => {
        teamOwners[teamCode] = { name: member.name, imageUrl: member.imageUrl };
      });
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-green-200">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar
        groupName={group?.groupName}
        onRefreshed={(result) => {
          setMatches(result.matches);
          setTeams(result.teams);
        }}
      />
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
        <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-green-200 text-xs">
                <th className="py-3 px-4 text-left">#</th>
                <th className="py-3 px-4 text-left">Team</th>
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
                  className={`border-b border-white/5 ${
                    idx < 2 ? 'bg-green-900/10' : idx === 2 ? 'bg-yellow-900/10' : ''
                  }`}
                >
                  <td className="py-2 px-4">{idx + 1}</td>
                  <td className="py-2 px-4 font-medium">
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

        {/* Fixtures */}
        <h2 className="text-lg font-bold mb-4">Fixtures - Group {selectedGroup}</h2>
        <MatchList matches={groupMatches} teamOwners={teamOwners} />

        {groupMatches.length === 0 && (
          <div className="text-center text-green-200 py-8">
            No matches loaded yet. Try refreshing scores.
          </div>
        )}
      </div>
    </div>
  );
}
