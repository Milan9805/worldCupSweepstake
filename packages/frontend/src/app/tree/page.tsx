'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Spinner from '@/components/Spinner';
import TreeView from '@/components/TreeView';
import MatchList from '@/components/MatchList';
import { getTree } from '@/lib/api';
import { useGroup } from '@/hooks/GroupContext';
import { buildOwnersByTeam } from '@/lib/owners';
import { TreeSlot } from '@sweepstake/shared';

export default function TreePage() {
  const [slots, setSlots] = useState<TreeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const { group, matches } = useGroup();
  const router = useRouter();

  // Group + matches come from the shared group context — this page only guards
  // against visiting without a key and owns the bracket slots.
  useEffect(() => {
    const key = localStorage.getItem('sweepstake_group_key');
    if (!key) {
      router.push('/');
    }
  }, []);

  // Fetch the bracket initially and refetch whenever the shared matches update
  // (poll tick or manual refresh) — the server recomputes slots from results.
  useEffect(() => {
    let cancelled = false;
    getTree()
      .then((treeData) => { if (!cancelled) setSlots(treeData as TreeSlot[]); })
      .catch((err) => console.error('Error loading tree:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [matches]);

  // Team code → owning member, for the tree slots and fixtures.
  const teamOwners = buildOwnersByTeam(group?.members ?? []);

  // Filter knockout stage matches
  const knockoutMatches = matches
    .filter((m) => m.stage !== 'GROUP_STAGE')
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar groupName={group?.groupName} />
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
