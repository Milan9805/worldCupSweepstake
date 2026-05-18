'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import TeamCard from '@/components/TeamCard';
import Leaderboard from '@/components/Leaderboard';
import { useGroup } from '@/hooks/useGroup';
import { calculateLeaderboard, Team } from '@sweepstake/shared';

export default function DashboardPage() {
  const { groupKey, group, teams, loading, loadData } = useGroup();
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

  useEffect(() => {
    if (group?.members?.length && !selectedPerson) {
      setSelectedPerson(group.members[0].name);
    }
  }, [group, selectedPerson]);

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

  const leaderboard = calculateLeaderboard(group.members, teams);

  return (
    <div className="min-h-screen">
      <NavBar groupName={group.groupName} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main content */}
          <div className="lg:col-span-3">
            {/* Person selector */}
            <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2">
              {group.members.map((member) => (
                <button
                  key={member.name}
                  onClick={() => setSelectedPerson(member.name)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    selectedPerson === member.name
                      ? 'bg-accent text-white'
                      : 'bg-black/30 text-white hover:bg-black/40'
                  }`}
                >
                  {member.imageUrl ? (
                    <img
                      src={member.imageUrl}
                      alt={member.name}
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-accent/30 flex items-center justify-center text-xs">
                      {member.name[0]}
                    </div>
                  )}
                  {member.name}
                </button>
              ))}
            </div>

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
              {personTeams.map((team) => (
                <TeamCard
                  key={team.teamCode}
                  team={team}
                  groupPosition={getGroupPosition(team, teams)}
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
