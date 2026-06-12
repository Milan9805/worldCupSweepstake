'use client';

import { Match, Team } from '@sweepstake/shared';
import { getTournamentMatchInfo } from '@/lib/teamMatches';
import { formatMatchDate, formatMatchTime, formatTimeUntil } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import LiveBadge from '@/components/LiveBadge';
import ChannelPills from '@/components/ChannelPills';
import OwnerTag from '@/components/OwnerTag';

type Owner = { name: string; imageUrl: string | null };

interface MatchBannerProps {
  matches: Match[];
  teamsByCode: Record<string, Team>;
  ownersByTeam: Record<string, Owner>;
}

// Dashboard hero strip: when anything is in play it lists every live match
// (score + ticking minute); otherwise it shows the single soonest upcoming
// fixture with a live countdown and where to watch. Fed from the dashboard's
// `matches`, so it re-renders for free as the score poll updates them.
export default function MatchBanner({ matches, teamsByCode, ownersByTeam }: MatchBannerProps) {
  const { live, next } = getTournamentMatchInfo(matches);

  // Nothing on now and nothing to come — don't render an empty strip.
  if (live.length === 0 && !next) return null;

  const teamLabel = (code: string) => {
    const team = teamsByCode[code];
    return `${team?.flag ?? ''} ${code}`.trim();
  };

  const isLive = live.length > 0;

  return (
    <div
      className={`border-b ${
        isLive ? 'border-red-500/40 bg-red-950/30' : 'border-white/15 bg-black/30'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {isLive ? (
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-x-8 sm:gap-y-2">
            {live.map((match) => (
              <LiveMatchRow
                key={match.matchId}
                match={match}
                teamLabel={teamLabel}
                ownersByTeam={ownersByTeam}
              />
            ))}
          </div>
        ) : (
          <NextMatchRow match={next!} teamLabel={teamLabel} ownersByTeam={ownersByTeam} />
        )}
      </div>
    </div>
  );
}

function LiveMatchRow({
  match,
  teamLabel,
  ownersByTeam,
}: {
  match: Match;
  teamLabel: (code: string) => string;
  ownersByTeam: Record<string, Owner>;
}) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base flex-wrap">
      <LiveBadge minute={match.minute} layout="inline" />
      <span className="font-semibold text-white">{teamLabel(match.homeTeam)}</span>
      <OwnerTag owner={ownersByTeam[match.homeTeam] ?? null} />
      <span className="font-bold text-white tabular-nums">
        {match.homeScore ?? 0} - {match.awayScore ?? 0}
      </span>
      <span className="font-semibold text-white">{teamLabel(match.awayTeam)}</span>
      <OwnerTag owner={ownersByTeam[match.awayTeam] ?? null} />
    </div>
  );
}

function NextMatchRow({
  match,
  teamLabel,
  ownersByTeam,
}: {
  match: Match;
  teamLabel: (code: string) => string;
  ownersByTeam: Record<string, Owner>;
}) {
  // Tick the countdown once a second. Mounted only when a next match is shown.
  const now = useNow();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base flex-wrap">
        <span className="text-white/60 uppercase tracking-wide text-[11px] font-semibold shrink-0">
          Next up
        </span>
        <span className="font-semibold text-white">{teamLabel(match.homeTeam)}</span>
        <OwnerTag owner={ownersByTeam[match.homeTeam] ?? null} />
        <span className="text-white/60">vs</span>
        <span className="font-semibold text-white">{teamLabel(match.awayTeam)}</span>
        <OwnerTag owner={ownersByTeam[match.awayTeam] ?? null} />
      </div>
      <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm flex-wrap">
        <span className="text-gold font-semibold whitespace-nowrap">
          {formatTimeUntil(match.datetime, now)}
        </span>
        <span className="text-white/70 whitespace-nowrap">
          {formatMatchDate(match.datetime)}, {formatMatchTime(match.datetime)}
        </span>
        <ChannelPills channels={match.channels} />
      </div>
    </div>
  );
}
