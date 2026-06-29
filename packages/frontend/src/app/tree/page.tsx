'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Spinner from '@/components/Spinner';
import KnockoutTree from '@/components/KnockoutTree';
import MatchList from '@/components/MatchList';
import { useGroup } from '@/hooks/GroupContext';
import { buildOwnersByTeam } from '@/lib/owners';

export default function TreePage() {
  const { group, teams, matches, claimedPerson, loading } = useGroup();
  const router = useRouter();

  // Group/teams/matches come from the shared group context (kept fresh while
  // matches are live) — this page only guards against visiting without a key.
  useEffect(() => {
    const key = localStorage.getItem('sweepstake_group_key');
    if (!key) {
      router.push('/');
    }
  }, [router]);

  // Team code → owning member, for the tree slots and fixtures.
  const teamOwners = buildOwnersByTeam(group?.members ?? []);

  // Team code → flag, so the tree and fixtures show flags alongside the codes.
  const teamFlags: Record<string, string> = Object.fromEntries(
    teams.map((t) => [t.teamCode, t.flag]),
  );

  // The knockout matchups + the chronological fixtures list are both driven by
  // the real matches, so they can never disagree.
  const knockoutMatches = matches.filter((m) => m.stage !== 'GROUP_STAGE');
  const knockoutByDate = [...knockoutMatches].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
  );

  // Only show the full-screen loader on a cold start — a background reload
  // shouldn't flash it when the shared context is already populated.
  if (loading && teams.length === 0) {
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

        {knockoutMatches.length > 0 ? (
          <KnockoutTree
            matches={knockoutMatches}
            teamOwners={teamOwners}
            teamFlags={teamFlags}
            claimedPerson={claimedPerson}
          />
        ) : (
          <div className="text-center text-green-200 py-12">
            <p className="text-lg mb-2">Tree not yet available</p>
            <p className="text-sm">
              The knockout stage tree will appear once group stage results are confirmed.
            </p>
          </div>
        )}

        {/* Knockout fixtures, in date order — the same matches the tree groups by round. */}
        {knockoutByDate.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-bold mb-4">Knockout Fixtures</h2>
            <MatchList
              matches={knockoutByDate}
              teamOwners={teamOwners}
              teamFlags={teamFlags}
              claimedPerson={claimedPerson}
              showStage
              stagePlain
              liveFeedHref="/feed"
            />
          </div>
        )}
      </div>
    </div>
  );
}
