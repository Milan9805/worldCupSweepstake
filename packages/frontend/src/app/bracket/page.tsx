'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import TreeView from '@/components/BracketView';
import MatchList from '@/components/MatchList';
import { getTree, getGroup, getMatches } from '@/lib/api';
import { usePollScores } from '@/hooks/usePollScores';
import { TreeSlot, Group, Match } from '@sweepstake/shared';

export default function TreePage() {
  const [slots, setSlots] = useState<TreeSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
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
      const [treeData, groupData, matchesData] = await Promise.all([
        getTree(),
        getGroup(key),
        getMatches(),
      ]);
      setSlots(treeData as TreeSlot[]);
      setGroup(groupData as Group);
      setMatches(matchesData as Match[]);
    } catch (err) {
      console.error('Error loading tree:', err);
    } finally {
      setLoading(false);
    }
  }

  // Auto-refresh knockout scores + bracket in the background while a match is live.
  usePollScores(matches, () => {
    const key = localStorage.getItem('sweepstake_group_key');
    if (key) loadData(key);
  });

  // Build team owners map
  const teamOwners: Record<string, { name: string; imageUrl: string | null }> = {};
  if (group) {
    group.members.forEach((member) => {
      member.teams.forEach((teamCode) => {
        teamOwners[teamCode] = { name: member.name, imageUrl: member.imageUrl };
      });
    });
  }

  // Filter knockout stage matches
  const knockoutMatches = matches
    .filter((m) => m.stage !== 'GROUP_STAGE')
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

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
        onRefreshed={async (result) => {
          setMatches(result.matches);
          // The refresh recomputes the bracket server-side; re-fetch the slots
          // so the bracket graphic reflects the latest results too.
          try {
            setSlots((await getTree()) as TreeSlot[]);
          } catch (err) {
            console.error('Error refreshing bracket:', err);
          }
        }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">Tournament Tree</h1>

        {slots.length > 0 ? (
          <TreeView slots={slots} teamOwners={teamOwners} />
        ) : (
          <div className="text-center text-green-200 py-12">
            <p className="text-lg mb-2">Tree not yet available</p>
            <p className="text-sm">
              The knockout stage tree will appear once group stage results are confirmed.
            </p>
          </div>
        )}

        {/* Knockout stage fixtures */}
        {knockoutMatches.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-bold mb-4">Knockout Fixtures</h2>
            <MatchList matches={knockoutMatches} teamOwners={teamOwners} />
          </div>
        )}
      </div>
    </div>
  );
}
