'use client';

import { Match } from '@sweepstake/shared';

interface MatchListProps {
  matches: Match[];
  teamOwners?: Record<string, { name: string; imageUrl: string | null }>;
}

// Fallbacks for when the source omits a channel's colours.
const DEFAULT_CHANNEL_BG = '#374151';
const DEFAULT_CHANNEL_FG = '#ffffff';

export default function MatchList({ matches, teamOwners }: MatchListProps) {
  const formatDate = (datetime: string) => {
    const date = new Date(datetime);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/London',
    });
  };

  const formatTime = (datetime: string) => {
    const date = new Date(datetime);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London',
    });
  };

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
          <div className="flex items-center gap-3">
          <div className="text-xs text-white/70 w-20 text-center">
            <div>{formatDate(match.datetime)}</div>
            <div>{formatTime(match.datetime)}</div>
          </div>

          <div className="flex-1 flex items-center justify-center gap-2">
            <div className="flex items-center gap-1 w-28 justify-end">
              {teamOwners?.[match.homeTeam] && (
                <>
                  <span className="text-[10px] text-white/70 truncate max-w-[60px]">
                    {teamOwners[match.homeTeam].name}
                  </span>
                  <div className="w-5 h-5 rounded-full bg-accent/30 flex items-center justify-center text-[10px] shrink-0">
                    {teamOwners[match.homeTeam].name[0]}
                  </div>
                </>
              )}
              <span className="text-sm font-medium">{match.homeTeam}</span>
            </div>

            <div className="w-20 text-center">
              {match.status === 'SCHEDULED' ? (
                <span className="text-white/70 text-sm">vs</span>
              ) : (
                <span className="font-bold">
                  {match.homeScore} - {match.awayScore}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 w-28">
              <span className="text-sm font-medium">{match.awayTeam}</span>
              {teamOwners?.[match.awayTeam] && (
                <>
                  <div className="w-5 h-5 rounded-full bg-accent/30 flex items-center justify-center text-[10px] shrink-0">
                    {teamOwners[match.awayTeam].name[0]}
                  </div>
                  <span className="text-[10px] text-white/70 truncate max-w-[60px]">
                    {teamOwners[match.awayTeam].name}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="w-20 text-right text-xs">
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
