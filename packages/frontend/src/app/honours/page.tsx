'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Spinner from '@/components/Spinner';
import Avatar from '@/components/Avatar';
import { useGroup } from '@/hooks/GroupContext';
import { computeHonours, HonourPrize, HonourRow, Person } from '@sweepstake/shared';

export default function HonoursPage() {
  const { groupKey, group, teams, loading, claimedPerson } = useGroup();
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

  if (loading && !group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (!group) return null;

  // Pure derivation from already-fetched teams + group members — no new fetch.
  const { prizes } = computeHonours(teams, group.members);

  // Avatars / imageUrl come from the group members, keyed by name.
  const membersByName: Record<string, Person> = Object.fromEntries(
    group.members.map((m) => [m.name, m]),
  );

  const hasMembers = group.members.length > 0;

  return (
    <div className="min-h-screen">
      <NavBar groupName={group.groupName} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-2">🏅 Honours Board</h1>
        <p className="text-sm text-green-200 mb-6">
          Secondary prizes from your teams&apos; tournament stats — bragging
          rights even once you&apos;re knocked out.
        </p>

        {!hasMembers ? (
          <div className="text-center text-green-200 py-12">
            No members in this group yet. Honours will appear once teams are
            assigned.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {prizes.map((prize) => (
              <PrizeCard
                key={prize.id}
                prize={prize}
                membersByName={membersByName}
                claimedPerson={claimedPerson}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PrizeCardProps {
  prize: HonourPrize;
  membersByName: Record<string, Person>;
  claimedPerson: string | null;
}

function PrizeCard({ prize, membersByName, claimedPerson }: PrizeCardProps) {
  const [winner, ...runnersUp] = prize.rows;
  const winnerImg = winner ? membersByName[winner.person]?.imageUrl ?? null : null;
  const winnerIsClaimed = !!claimedPerson && winner?.person === claimedPerson;

  return (
    <div
      data-testid="prize-card"
      data-prize={prize.id}
      className="rounded-lg border p-4 bg-black/30 border-white/20"
    >
      <h3 className="text-lg font-bold mb-1 text-gold">
        🏆 {prize.title}
      </h3>
      <p className="text-xs text-white/60 mb-4">{prize.description}</p>

      {!winner ? (
        <div className="text-sm text-white/60">No entrants yet.</div>
      ) : (
        <>
          {/* Winner, shown prominently. */}
          <div
            data-testid="prize-winner"
            data-claimed={winnerIsClaimed ? 'true' : 'false'}
            className={`flex items-center gap-3 p-3 rounded-lg ${
              winnerIsClaimed ? 'bg-gold/10 ring-1 ring-gold/60' : 'bg-white/5'
            }`}
          >
            <Avatar name={winner.person} imageUrl={winnerImg} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate">
                {winner.person}
              </div>
              <div className="text-xs text-white/70">
                {formatValue(prize, winner)}
              </div>
            </div>
            <div className="text-xl font-bold text-gold">
              {headlineValue(prize, winner)}
            </div>
          </div>

          {/* Runners-up. */}
          {runnersUp.length > 0 && (
            <ol className="mt-3 space-y-1">
              {runnersUp.map((row, index) => {
                const isClaimed = !!claimedPerson && row.person === claimedPerson;
                return (
                  <li
                    key={row.person}
                    data-testid="prize-runner-up"
                    data-claimed={isClaimed ? 'true' : 'false'}
                    className={`flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm ${
                      isClaimed ? 'bg-gold/10 ring-1 ring-gold/60' : ''
                    }`}
                  >
                    <span className="w-5 text-right text-white/50 font-medium">
                      {index + 2}
                    </span>
                    <Avatar
                      name={row.person}
                      imageUrl={membersByName[row.person]?.imageUrl ?? null}
                      size="sm"
                    />
                    <span className="flex-1 min-w-0 truncate text-white/90">
                      {row.person}
                    </span>
                    <span className="text-white/70 font-medium">
                      {headlineValue(prize, row)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

// The big number/label shown on the right of a row. Deepest Run is a stage
// label rather than a count; everything else is a plain number.
function headlineValue(prize: HonourPrize, row: HonourRow): string {
  if (prize.id === 'deepestRun') return row.breakdown.bestStageLabel;
  return String(row.value);
}

// The secondary line under the winner, with the prize's unit where it helps.
function formatValue(prize: HonourPrize, row: HonourRow): string {
  if (prize.id === 'deepestRun') {
    // The stage is already the headline, so this line just gives "still in /
    // total" context — mirroring the Leaderboard's "5/8 remaining".
    return `${row.teamsAlive}/${row.teams} remaining`;
  }
  const unit = prize.unit ? ` ${prize.unit}` : '';
  return `${row.value}${unit} • ${row.teams} team${row.teams === 1 ? '' : 's'}`;
}
