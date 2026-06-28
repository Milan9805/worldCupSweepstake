'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { Match } from '@sweepstake/shared';
import { formatMatchDate, formatMatchTime, formatStage } from '@/lib/format';
import StageLink from '@/components/StageLink';
import { isMatchMine } from '@/lib/fixtures';
import LiveBadge from '@/components/LiveBadge';
import MatchScoreline from '@/components/MatchScoreline';
import ChannelPills from '@/components/ChannelPills';

interface MatchListProps {
  matches: Match[];
  teamOwners?: Record<string, { name: string; imageUrl: string | null }>;
  teamFlags?: Record<string, string>;
  // Show the tournament stage ("Group E", "Round of 16") under the date. Off by
  // default — the groups/tree/bracket lists are already scoped to one stage, so
  // it's only useful on the all-fixtures list.
  showStage?: boolean;
  // When set, matches the claimed person owns a team in are highlighted blue —
  // mirroring the feed's "my games" treatment. Lists that don't pass it (groups,
  // tree, bracket) get no highlight.
  claimedPerson?: string | null;
  // List position before which to render the "Today" divider (see
  // todayDividerIndex). null/undefined renders no divider — only the all-fixtures
  // list passes it; the stage-scoped lists don't.
  todayDividerIndex?: number | null;
  // When set, a LIVE match's status badge links to this page (the live feed) so
  // you can jump straight to watching it. Opt-in — the fixtures page uses its own
  // live banner instead, so it leaves this unset.
  liveFeedHref?: string;
  // Render the stage label (when showStage is on) as plain text instead of a
  // StageLink. The knockout list links back to the page you're already on, so a
  // link there is pointless; the all-fixtures list keeps the link.
  stagePlain?: boolean;
}

export default function MatchList({
  matches,
  teamOwners,
  teamFlags,
  showStage,
  claimedPerson,
  todayDividerIndex,
  liveFeedHref,
  stagePlain,
}: MatchListProps) {
  const statusBadge = (match: Match) => {
    switch (match.status) {
      case 'LIVE': {
        const badge = <LiveBadge minute={match.minute} layout="stacked" />;
        if (!liveFeedHref) return badge;
        // Link straight to the live feed; the small caption makes the badge read
        // as tappable rather than decorative.
        return (
          <Link
            href={liveFeedHref}
            aria-label="Watch this live match in the feed"
            className="group flex flex-col items-end gap-0.5"
          >
            {badge}
            <span className="text-[10px] leading-tight text-red-300 group-hover:text-red-200">
              Watch live →
            </span>
          </Link>
        );
      }
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
      {matches.map((match, index) => {
        const mine = isMatchMine(match, teamOwners ?? {}, claimedPerson ?? null);
        return (
        <Fragment key={match.matchId}>
        {index === todayDividerIndex && (
          <div id="today-divider" className="flex items-center gap-3 py-1" data-testid="today-divider">
            <div className="h-px flex-1 bg-amber-400/40" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              Today
            </span>
            <div className="h-px flex-1 bg-amber-400/40" />
          </div>
        )}
        <div
          data-involves-claimed={mine ? 'true' : 'false'}
          className={`flex flex-col gap-2 p-3 rounded-lg border transition-all ${
            mine
              ? 'border-sky-400/60 bg-sky-400/10 hover:bg-sky-400/20'
              : 'border-white/10 bg-white/5 hover:bg-white/10'
          }`}
        >
          <div className="flex items-start gap-2">
            {/* Date — fixed width, forced onto one line so every row is consistently two lines */}
            <div className="w-16 shrink-0 text-center text-xs leading-tight text-white/70">
              <div className="whitespace-nowrap">{formatMatchDate(match.datetime).replace(',', '')}</div>
              <div>{formatMatchTime(match.datetime)}</div>
              {showStage && (
                stagePlain ? (
                  <span className="block mt-0.5 text-[10px] leading-tight text-white/50">
                    {formatStage(match)}
                  </span>
                ) : (
                  <StageLink match={match} className="block mt-0.5 text-[10px] leading-tight text-white/50 hover:text-white/70" />
                )
              )}
            </div>

            {/* Matchup + channels share one centred column so the channels always
                line up under the team names, whatever the status column's width. */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <MatchScoreline match={match} teamOwners={teamOwners} teamFlags={teamFlags} />

              <ChannelPills channels={match.channels} />
            </div>

            {/* Mirrors the date column's width on sm+ to keep the matchup centred in
                the card. On mobile it collapses to the badge width (0 when SCHEDULED)
                so the owner names aren't starved of horizontal space. */}
            <div className="w-auto shrink-0 text-right text-xs sm:w-16">
              {statusBadge(match)}
            </div>
          </div>
        </div>
        </Fragment>
        );
      })}
    </div>
  );
}
