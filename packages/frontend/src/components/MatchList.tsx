'use client';

import { Match } from '@sweepstake/shared';
import { formatMatchDate, formatMatchTime } from '@/lib/format';
import LiveBadge from '@/components/LiveBadge';
import MatchScoreline from '@/components/MatchScoreline';

interface MatchListProps {
  matches: Match[];
  teamOwners?: Record<string, { name: string; imageUrl: string | null }>;
  teamFlags?: Record<string, string>;
}

// Fallbacks for when the source omits a channel's colours.
const DEFAULT_CHANNEL_BG = '#374151';
const DEFAULT_CHANNEL_FG = '#ffffff';

export default function MatchList({ matches, teamOwners, teamFlags }: MatchListProps) {
  const statusBadge = (match: Match) => {
    switch (match.status) {
      case 'LIVE':
        return <LiveBadge minute={match.minute} layout="stacked" />;
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
          <div className="flex items-start gap-2">
            {/* Date — fixed width, forced onto one line so every row is consistently two lines */}
            <div className="w-16 shrink-0 text-center text-xs leading-tight text-white/70">
              <div className="whitespace-nowrap">{formatMatchDate(match.datetime).replace(',', '')}</div>
              <div>{formatMatchTime(match.datetime)}</div>
            </div>

            {/* Matchup + channels share one centred column so the channels always
                line up under the team names, whatever the status column's width. */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <MatchScoreline match={match} teamOwners={teamOwners} teamFlags={teamFlags} />

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

            {/* Mirrors the date column's width on sm+ to keep the matchup centred in
                the card. On mobile it collapses to the badge width (0 when SCHEDULED)
                so the owner names aren't starved of horizontal space. */}
            <div className="w-auto shrink-0 text-right text-xs sm:w-16">
              {statusBadge(match)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
