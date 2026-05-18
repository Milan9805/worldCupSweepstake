'use client';

import { Team } from '@sweepstake/shared';

interface TeamCardProps {
  team: Team;
  ownerName?: string;
  ownerImage?: string | null;
  groupPosition?: number;
  totalInGroup?: number;
}

export default function TeamCard({ team, ownerName, ownerImage, groupPosition, totalInGroup: _totalInGroup }: TeamCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 transition-all ${
        team.eliminated
          ? 'border-red-900/50 bg-black/40 opacity-60'
          : 'border-white/20 bg-black/30 hover:bg-black/40'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{team.flag}</span>
          <div>
            <h3 className="font-semibold text-sm text-white">{team.name}</h3>
            <span className="text-xs text-white/70">
              Group {team.groupLetter} • #{team.fifaRanking}
            </span>
          </div>
          {groupPosition && (
            <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded ${
              groupPosition <= 2 ? 'bg-green-700/60 text-green-200' :
              groupPosition === 3 ? 'bg-yellow-700/60 text-yellow-200' :
              'bg-red-800/60 text-red-200'
            }`}>
              {team.eliminated
                ? team.eliminatedAt?.replace(/_/g, ' ') || 'Out'
                : `${getOrdinal(groupPosition)} in group`}
            </span>
          )}
        </div>
        {team.eliminated && (
          <span className="text-xs bg-red-900/50 text-red-300 px-2 py-1 rounded">
            Eliminated
            {team.eliminatedAt && ` (${team.eliminatedAt.replace(/_/g, ' ')})`}
          </span>
        )}
        {ownerName && (
          <div className="flex items-center gap-1">
            {ownerImage ? (
              <img
                src={ownerImage}
                alt={ownerName}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-accent/50 flex items-center justify-center text-xs">
                {ownerName[0]}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs mt-3">
        <div className="text-center">
          <div className="text-white/70">P</div>
          <div className="font-medium text-white">{team.stats.points}</div>
        </div>
        <div className="text-center">
          <div className="text-white/70">W/D/L</div>
          <div className="font-medium text-white">
            {team.stats.wins}/{team.stats.draws}/{team.stats.losses}
          </div>
        </div>
        <div className="text-center">
          <div className="text-white/70">GD</div>
          <div className="font-medium text-white">
            {team.stats.goalDifference > 0 ? '+' : ''}
            {team.stats.goalDifference}
          </div>
        </div>
        <div className="text-center">
          <div className="text-white/70">GF/GA</div>
          <div className="font-medium text-white">
            {team.stats.goalsFor}/{team.stats.goalsAgainst}
          </div>
        </div>
        <div className="text-center">
          <div className="text-white/70">Cards</div>
          <div className="font-medium text-white">
            🟨{team.stats.yellowCards} 🟥{team.stats.redCards}
          </div>
        </div>
        {team.stats.possession !== null && (
          <div className="text-center">
            <div className="text-white/70">Poss</div>
            <div className="font-medium text-white">{team.stats.possession}%</div>
          </div>
        )}
      </div>
    </div>
  );
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
