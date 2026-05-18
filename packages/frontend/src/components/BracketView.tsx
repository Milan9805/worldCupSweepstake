'use client';

import { TreeSlot } from '@sweepstake/shared';

interface TreeViewProps {
  slots: TreeSlot[];
  teamOwners?: Record<string, { name: string; imageUrl: string | null }>;
}

const ROUND_ORDER = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'];
const ROUND_LABELS: Record<string, string> = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter Finals',
  SEMI_FINAL: 'Semi Finals',
  FINAL: 'Final',
};

export default function TreeView({ slots, teamOwners }: TreeViewProps) {
  const rounds = ROUND_ORDER.map((round) => ({
    name: ROUND_LABELS[round],
    matches: slots
      .filter((s) => s.round === round)
      .sort((a, b) => a.position - b.position),
  }));

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-max p-4">
        {rounds.map((round, roundIndex) => (
          <div key={round.name} className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-gold text-center mb-2">
              {round.name}
            </h3>
            <div
              className="flex flex-col justify-around flex-1 gap-2"
              style={{ paddingTop: `${roundIndex * 20}px` }}
            >
              {round.matches.map((slot) => (
                <div
                  key={`${slot.round}-${slot.position}`}
                  className="bg-white/5 border border-white/10 rounded-lg p-2 w-48"
                >
                  <TreeMatch slot={slot} teamOwners={teamOwners} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeMatch({
  slot,
  teamOwners,
}: {
  slot: TreeSlot;
  teamOwners?: Record<string, { name: string; imageUrl: string | null }>;
}) {
  const formatTime = (datetime: string | null) => {
    if (!datetime) return '';
    const date = new Date(datetime);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London',
    });
  };

  return (
    <div className="text-xs space-y-1">
      {slot.datetime && !slot.winner && (
        <div className="text-white/70 text-center text-[10px]">
          {formatTime(slot.datetime)}
        </div>
      )}
      <div
        className={`flex items-center justify-between p-1 rounded ${
          slot.winner === slot.team1 ? 'bg-green-900/30' : ''
        }`}
      >
        <div className="flex items-center gap-1">
          {slot.team1 ? (
            <>
              <span className="font-medium">{slot.team1}</span>
              {teamOwners?.[slot.team1] && (
                <span className="text-[10px] text-white/70">
                  ({teamOwners[slot.team1].name})
                </span>
              )}
            </>
          ) : (
            <span className="text-white/50">TBD</span>
          )}
        </div>
        {slot.score1 !== null && <span className="font-bold">{slot.score1}</span>}
      </div>
      <div
        className={`flex items-center justify-between p-1 rounded ${
          slot.winner === slot.team2 ? 'bg-green-900/30' : ''
        }`}
      >
        <div className="flex items-center gap-1">
          {slot.team2 ? (
            <>
              <span className="font-medium">{slot.team2}</span>
              {teamOwners?.[slot.team2] && (
                <span className="text-[10px] text-white/70">
                  ({teamOwners[slot.team2].name})
                </span>
              )}
            </>
          ) : (
            <span className="text-white/50">TBD</span>
          )}
        </div>
        {slot.score2 !== null && <span className="font-bold">{slot.score2}</span>}
      </div>
    </div>
  );
}
