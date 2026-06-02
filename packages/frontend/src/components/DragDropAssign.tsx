'use client';

import { useState, DragEvent } from 'react';
import { getGroup, getTeams, adminAssignTeams } from '@/lib/api';
import { Team, Person } from '@sweepstake/shared';

interface Props {
  token: string;
  onStatus: (msg: string) => void;
}

interface Assignment {
  [personName: string]: string[];
}

export default function DragDropAssign({ token, onStatus }: Props) {
  const [groupKey, setGroupKey] = useState('');
  const [members, setMembers] = useState<Person[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [assignments, setAssignments] = useState<Assignment>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draggedTeam, setDraggedTeam] = useState<string | null>(null);

  const handleLoad = async () => {
    if (!groupKey.trim()) return;
    setLoading(true);
    try {
      const [group, teams] = await Promise.all([
        getGroup(groupKey) as Promise<{ groupKey: string; groupName: string; members: Person[] }>,
        getTeams() as Promise<Team[]>,
      ]);
      setMembers(group.members);
      setAllTeams(teams);

      // Initialize assignments from existing member data
      const initial: Assignment = {};
      group.members.forEach((m: Person) => {
        initial[m.name] = [...m.teams];
      });
      setAssignments(initial);
      setLoaded(true);
      onStatus('Group loaded. Drag teams to assign them to members.');
    } catch (err) {
      onStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const assignedTeamCodes = Object.values(assignments).flat();
  const unassignedTeams = allTeams.filter((t) => !assignedTeamCodes.includes(t.teamCode));

  const handleDragStart = (e: DragEvent, teamCode: string) => {
    e.dataTransfer.setData('text/plain', teamCode);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTeam(teamCode);
  };

  const handleDragEnd = () => {
    setDraggedTeam(null);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnMember = (e: DragEvent, personName: string) => {
    e.preventDefault();
    const teamCode = e.dataTransfer.getData('text/plain');
    if (!teamCode) return;

    // Remove from any current assignment
    const updated = { ...assignments };
    Object.keys(updated).forEach((name) => {
      updated[name] = updated[name].filter((t) => t !== teamCode);
    });

    // Add to this member
    updated[personName] = [...(updated[personName] || []), teamCode];
    setAssignments(updated);
    setDraggedTeam(null);
  };

  const handleDropOnPool = (e: DragEvent) => {
    e.preventDefault();
    const teamCode = e.dataTransfer.getData('text/plain');
    if (!teamCode) return;

    // Remove from any current assignment
    const updated = { ...assignments };
    Object.keys(updated).forEach((name) => {
      updated[name] = updated[name].filter((t) => t !== teamCode);
    });
    setAssignments(updated);
    setDraggedTeam(null);
  };

  const handleSave = async () => {
    try {
      const assignmentList = Object.entries(assignments).map(([personName, teams]) => ({
        personName,
        teams,
      }));
      await adminAssignTeams(token, groupKey, assignmentList);
      onStatus('Teams assigned successfully!');
    } catch (err) {
      onStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleClear = () => {
    setGroupKey('');
    setMembers([]);
    setAllTeams([]);
    setAssignments({});
    setLoaded(false);
    onStatus('');
  };

  const getTeamInfo = (teamCode: string) => allTeams.find((t) => t.teamCode === teamCode);

  if (!loaded) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Assign Teams</h2>
        <p className="text-sm text-white/60">
          Load a group to drag and drop teams to each member.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={groupKey}
            onChange={(e) => setGroupKey(e.target.value)}
            placeholder="Group key..."
            className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-accent"
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
          />
          <button
            onClick={handleLoad}
            disabled={loading || !groupKey.trim()}
            className="px-6 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded-lg"
          >
            {loading ? 'Loading...' : 'Load Group'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">
          Assign Teams &mdash; {groupKey}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg text-sm font-medium"
          >
            Save All
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Unassigned team pool */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDropOnPool}
        className="p-4 rounded-lg bg-black/20 border border-white/10 min-h-[80px]"
      >
        <h3 className="text-sm font-medium text-white/70 mb-3">
          Unassigned Teams ({unassignedTeams.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          {unassignedTeams.map((team) => (
            <div
              key={team.teamCode}
              draggable
              onDragStart={(e) => handleDragStart(e, team.teamCode)}
              onDragEnd={handleDragEnd}
              className={`px-3 py-1.5 rounded-md bg-white/10 border border-white/20 text-sm cursor-grab active:cursor-grabbing select-none flex items-center gap-1.5 transition-opacity ${
                draggedTeam === team.teamCode ? 'opacity-40' : 'hover:bg-white/20'
              }`}
            >
              <span>{team.flag}</span>
              <span>{team.teamCode}</span>
            </div>
          ))}
          {unassignedTeams.length === 0 && (
            <span className="text-white/40 text-sm italic">
              All teams assigned. Drag teams here to unassign.
            </span>
          )}
        </div>
      </div>

      {/* Member drop zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.map((member) => {
          const memberTeams = assignments[member.name] || [];
          return (
            <div
              key={member.name}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnMember(e, member.name)}
              className="p-4 rounded-lg bg-black/30 border-2 border-dashed border-white/20 hover:border-accent/50 transition-colors min-h-[100px]"
            >
              <h3 className="text-sm font-bold mb-3 text-gold">
                {member.name}
                <span className="ml-2 font-normal text-white/50">
                  ({memberTeams.length} teams)
                </span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {memberTeams.map((teamCode) => {
                  const team = getTeamInfo(teamCode);
                  return (
                    <div
                      key={teamCode}
                      draggable
                      onDragStart={(e) => handleDragStart(e, teamCode)}
                      onDragEnd={handleDragEnd}
                      className={`px-3 py-1.5 rounded-md bg-accent/20 border border-accent/40 text-sm cursor-grab active:cursor-grabbing select-none flex items-center gap-1.5 transition-opacity ${
                        draggedTeam === teamCode ? 'opacity-40' : 'hover:bg-accent/30'
                      }`}
                    >
                      <span>{team?.flag || '🏳️'}</span>
                      <span>{teamCode}</span>
                    </div>
                  );
                })}
                {memberTeams.length === 0 && (
                  <span className="text-white/30 text-sm italic">
                    Drop teams here
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
