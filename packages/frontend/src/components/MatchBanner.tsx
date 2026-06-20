'use client';

import Link from 'next/link';
import { Match, Team } from '@sweepstake/shared';
import { getTournamentMatchInfo } from '@/lib/teamMatches';
import { formatMatchDate, formatMatchTime, formatTimeUntil, formatStage } from '@/lib/format';
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
      data-testid="match-banner"
      // `top-16` is hard-coupled to the NavBar's `h-16` (64px) so the banner
      // pins flush beneath it; `z-40` < the nav's `z-50` so an open mobile menu
      // (which expands inside <nav>) paints over the banner rather than under it.
      className={`sticky top-16 z-40 backdrop-blur-sm border-b ${
        isLive ? 'border-red-500/40 bg-red-950/30' : 'border-white/15 bg-black/30'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-1">
        {isLive ? (
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-x-8 sm:gap-y-2 max-h-[40vh] overflow-y-auto sm:max-h-none sm:overflow-visible">
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
        <div className="mt-2 flex items-center gap-5">
          {isLive && (
            <Link
              href="/feed"
              className="inline-flex items-center min-h-[44px] py-2 text-xs font-semibold uppercase tracking-wide text-gold hover:text-gold/80 underline underline-offset-2 transition-colors"
            >
              See live feed
            </Link>
          )}
          <Link
            href="/fixtures?scroll=today"
            className="inline-flex items-center min-h-[44px] py-2 text-xs font-semibold uppercase tracking-wide text-gold hover:text-gold/80 underline underline-offset-2 transition-colors"
          >
            See all fixtures
          </Link>
        </div>
      </div>
    </div>
  );
}

// One live match. On a phone it's a tidy two-line block (badge + stage, then
// teams + score); on sm+ it collapses back to a single inline row. Tight gaps /
// leading-tight keep each block short so several stacked live games stay compact.
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
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 text-sm sm:text-base leading-tight">
      <div className="flex items-center gap-1.5 shrink-0">
        <LiveBadge minute={match.minute} layout="inline" />
        <span className="text-red-200 uppercase tracking-wide text-[11px] font-semibold shrink-0">
          ({formatStage(match)})
        </span>
      </div>
      <div className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 flex-wrap">
        <span className="font-semibold text-white">{teamLabel(match.homeTeam)}</span>
        <OwnerTag owner={ownersByTeam[match.homeTeam] ?? null} />
        <span className="font-bold text-white tabular-nums">
          {match.homeScore ?? 0} - {match.awayScore ?? 0}
        </span>
        <span className="font-semibold text-white">{teamLabel(match.awayTeam)}</span>
        <OwnerTag owner={ownersByTeam[match.awayTeam] ?? null} />
      </div>
      <ChannelPills channels={match.channels} />
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

  // On a phone this reads as clean, tightly-spaced lines — label / matchup /
  // times / channels — so nothing wraps into the middle of the matchup. On sm+
  // it regroups into the original two horizontal clusters (label+matchup,
  // times+channels) so the desktop layout is unchanged.
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 leading-tight">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
        <span className="text-white/60 uppercase tracking-wide text-[11px] font-semibold shrink-0">
          Next up ({formatStage(match)})
        </span>
        <div className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 text-sm sm:text-base flex-wrap">
          <span className="font-semibold text-white">{teamLabel(match.homeTeam)}</span>
          <OwnerTag owner={ownersByTeam[match.homeTeam] ?? null} />
          <span className="text-white/60">vs</span>
          <span className="font-semibold text-white">{teamLabel(match.awayTeam)}</span>
          <OwnerTag owner={ownersByTeam[match.awayTeam] ?? null} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3 text-xs sm:text-sm">
        <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3 flex-wrap">
          <span className="text-gold font-semibold whitespace-nowrap">
            {formatTimeUntil(match.datetime, now)}
          </span>
          <span className="text-white/70 whitespace-nowrap">
            {formatMatchDate(match.datetime)}, {formatMatchTime(match.datetime)}
          </span>
        </div>
        <ChannelPills channels={match.channels} />
      </div>
    </div>
  );
}
