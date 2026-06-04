'use client';

import { Match } from '@sweepstake/shared';
import { formatMatchDate, formatMatchTime } from '@/lib/format';
import Avatar from '@/components/Avatar';

interface MatchListProps {
  matches: Match[];
  teamOwners?: Record<string, { name: string; imageUrl: string | null }>;
  teamFlags?: Record<string, string>;
}

// Fallbacks for when the source omits a channel's colours.
const DEFAULT_CHANNEL_BG = '#374151';
const DEFAULT_CHANNEL_FG = '#ffffff';

export default function MatchList({ matches, teamOwners, teamFlags }: MatchListProps) {
  const statusBadge = (status: string) => {
    switch (status) {
      case 'LIVE':
        return (
          <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded animate-pulse">
            LIVE
          </span>
        );
      case 'FINISHED':
        return (
          <span className="bg-gray-600 text-white text-xs px-2 py-0.5 rounded">
            FT
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      {matches.map((match) => (
        <div
          key={match.matchId}
          className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
        >
          <div className="flex items-center gap-2">
          {/* Date — fixed width, forced onto one line so every row is consistently two lines */}
          <div className="w-16 shrink-0 text-center text-xs leading-tight text-white/70">
            <div className="whitespace-nowrap">{formatMatchDate(match.datetime).replace(',', '')}</div>
            <div>{formatMatchTime(match.datetime)}</div>
          </div>

          <div className="flex-1 flex items-start gap-1 min-w-0">
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

          {/* Mirrors the date column's width on sm+ to keep the match block centred.
              On mobile it collapses to the badge width (0 when SCHEDULED) so the
              owner names aren't starved of horizontal space. */}
          <div className="w-auto shrink-0 text-right text-xs sm:w-16">
            {statusBadge(match.status)}
          </div>
          </div>

          {match.channels && match.channels.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center">
              {match.channels.map((channel) => (
                <span
                  key={channel.name}
                  style={{
                    backgroundColor: channel.bg || DEFAULT_CHANNEL_BG,
                    color: channel.fg || DEFAULT_CHANNEL_FG,
                  }}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm"
                >
                  {channel.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
