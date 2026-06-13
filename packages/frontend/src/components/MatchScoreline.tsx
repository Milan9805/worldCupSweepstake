'use client';

import { Match } from '@sweepstake/shared';
import Avatar from '@/components/Avatar';
import { TeamOwner } from '@/lib/owners';

interface MatchScorelineProps {
  match: Match;
  teamOwners?: Record<string, TeamOwner>;
  teamFlags?: Record<string, string>;
}

/**
 * The home–score–away matchup row: each side's flag, team code and owner tag with
 * the scoreline (or "vs" before kick-off) between them. Extracted from MatchList
 * so the live feed's match-group headers render an identical, mobile-proven
 * matchup (min-w-0 / truncate / shrink-0) instead of re-implementing it.
 */
export default function MatchScoreline({ match, teamOwners, teamFlags }: MatchScorelineProps) {
  return (
    <div className="flex items-start gap-1 min-w-0">
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center justify-end gap-1">
          {teamFlags?.[match.homeTeam] && (
            <span className="text-base leading-none">{teamFlags[match.homeTeam]}</span>
          )}
          <span className="text-sm font-medium">{match.homeTeam}</span>
        </div>
        {teamOwners?.[match.homeTeam] && (
          <div className="flex items-center justify-end gap-1 min-w-0 text-[11px] text-gold/80">
            <Avatar name={teamOwners[match.homeTeam].name} size="sm" />
            <span className="truncate">({teamOwners[match.homeTeam].name})</span>
          </div>
        )}
      </div>

      <div className="w-12 shrink-0 text-center">
        {match.status === 'SCHEDULED' ? (
          <span className="text-white/70 text-sm">vs</span>
        ) : (
          <span className="font-bold">
            {match.homeScore} - {match.awayScore}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">{match.awayTeam}</span>
          {teamFlags?.[match.awayTeam] && (
            <span className="text-base leading-none">{teamFlags[match.awayTeam]}</span>
          )}
        </div>
        {teamOwners?.[match.awayTeam] && (
          <div className="flex items-center gap-1 min-w-0 text-[11px] text-gold/80">
            <span className="truncate">({teamOwners[match.awayTeam].name})</span>
            <Avatar name={teamOwners[match.awayTeam].name} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}
