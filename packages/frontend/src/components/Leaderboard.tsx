'use client';

import { LeaderboardEntry } from '@sweepstake/shared';
import Avatar from '@/components/Avatar';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

export default function Leaderboard({ entries }: LeaderboardProps) {
  return (
    <div className="bg-black/30 rounded-lg border border-white/20 p-4">
      <h3 className="text-lg font-bold mb-4 text-gold">🏆 Leaderboard</h3>
      <div className="space-y-3">
        {entries.map((entry, index) => (
          <div
            key={entry.name}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-black/20"
          >
            <span className="text-lg font-bold text-white/70 w-6">
              {index + 1}
            </span>
            <Avatar name={entry.name} imageUrl={entry.imageUrl} size="lg" />
            <div className="flex-1">
              <div className="font-medium text-sm text-white">{entry.name}</div>
              <div className="text-xs text-white/70">
                {entry.teamsAlive}/{entry.totalTeams} remaining •{' '}
                {entry.bestStage}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-gold">
                {(entry.winProbability * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-white/70">win prob</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
