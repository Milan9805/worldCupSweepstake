'use client';

import Link from 'next/link';
import { Match } from '@sweepstake/shared';
import Avatar from '@/components/Avatar';
import LiveBadge from '@/components/LiveBadge';
import ChannelPills from '@/components/ChannelPills';
import { formatMatchDate, formatMatchTime } from '@/lib/format';
import { TeamOwner } from '@/lib/owners';

// Knockout rounds left-to-right, biggest first. Headers use the plural the
// bracket reads with; the sizes drive the "to be confirmed" placeholders so the
// full path to the final is visible before later rounds are scheduled.
const ROUND_ORDER = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'];
const ROUND_LABELS: Record<string, string> = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter Finals',
  SEMI_FINAL: 'Semi Finals',
  FINAL: 'Final',
};
const ROUND_SIZES: Record<string, number> = {
  ROUND_OF_32: 16,
  ROUND_OF_16: 8,
  QUARTER_FINAL: 4,
  SEMI_FINAL: 2,
  FINAL: 1,
};

interface KnockoutTreeProps {
  matches: Match[];
  teamOwners?: Record<string, TeamOwner>;
  teamFlags?: Record<string, string>;
}

/**
 * The knockout bracket: a left-to-right column per round (horizontally
 * scrollable), driven entirely by the real scraped matches so the matchups can
 * never diverge from the fixtures. Each card is compact — flag, code, owner and
 * score per side — with the kick-off time, a winner highlight, and a live badge
 * that links to the feed. Rounds not yet scheduled show "to be confirmed"
 * placeholders so the path to the final is always visible.
 */
export default function KnockoutTree({ matches, teamOwners, teamFlags }: KnockoutTreeProps) {
  const rounds = ROUND_ORDER.map((round) => ({
    round,
    label: ROUND_LABELS[round],
    matches: matches
      .filter((m) => m.stage === round)
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()),
  }));

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-max p-1">
        {rounds.map((r, roundIndex) => (
          <div key={r.round} className="flex flex-col gap-4" data-testid={`round-column-${r.round}`}>
            <h3 className="text-sm font-bold text-gold text-center mb-1">{r.label}</h3>
            {/* Progressive top padding nudges each round's cards toward the
                vertical centre of the previous round — the classic bracket look. */}
            <div
              className="flex flex-col justify-around flex-1 gap-3"
              style={{ paddingTop: `${roundIndex * 24}px` }}
            >
              {r.matches.length > 0
                ? r.matches.map((m) => (
                    <TreeMatch key={m.matchId} match={m} teamOwners={teamOwners} teamFlags={teamFlags} />
                  ))
                : Array.from({ length: ROUND_SIZES[r.round] }).map((_, i) => (
                    <TreePlaceholder key={i} />
                  ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeMatch({
  match,
  teamOwners,
  teamFlags,
}: {
  match: Match;
  teamOwners?: Record<string, TeamOwner>;
  teamFlags?: Record<string, string>;
}) {
  const finished = match.status === 'FINISHED';
  const live = match.status === 'LIVE';
  const homeWon = finished && (match.homeScore ?? 0) > (match.awayScore ?? 0);
  const awayWon = finished && (match.awayScore ?? 0) > (match.homeScore ?? 0);

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-2 w-56 text-xs">
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[10px] text-white/60 whitespace-nowrap">
          {formatMatchDate(match.datetime).replace(',', '')} · {formatMatchTime(match.datetime)}
        </span>
        {live ? (
          <Link href="/feed" aria-label="Watch this live match in the feed" className="shrink-0">
            <LiveBadge minute={match.minute} layout="inline" />
          </Link>
        ) : finished ? (
          <span className="shrink-0 rounded bg-gray-600 px-1.5 py-0.5 text-[10px] text-white">FT</span>
        ) : null}
      </div>
      {match.channels && match.channels.length > 0 && (
        <div className="mb-1">
          <ChannelPills channels={match.channels} />
        </div>
      )}
      <TeamRow
        code={match.homeTeam}
        flag={teamFlags?.[match.homeTeam]}
        owner={teamOwners?.[match.homeTeam]}
        score={match.status === 'SCHEDULED' ? null : match.homeScore}
        won={homeWon}
      />
      <TeamRow
        code={match.awayTeam}
        flag={teamFlags?.[match.awayTeam]}
        owner={teamOwners?.[match.awayTeam]}
        score={match.status === 'SCHEDULED' ? null : match.awayScore}
        won={awayWon}
      />
    </div>
  );
}

function TeamRow({
  code,
  flag,
  owner,
  score,
  won,
}: {
  code: string;
  flag?: string;
  owner?: TeamOwner;
  score: number | null;
  won: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 rounded p-1 ${won ? 'bg-green-900/40' : ''}`}>
      {flag && <span className="text-base leading-none shrink-0">{flag}</span>}
      <span className="font-semibold shrink-0">{code}</span>
      {owner && (
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-gold/80">
          <Avatar name={owner.name} size="xs" />
          <span className="truncate">({owner.name})</span>
        </span>
      )}
      <span className="ml-auto shrink-0 font-bold tabular-nums">{score ?? ''}</span>
    </div>
  );
}

function TreePlaceholder() {
  return (
    <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-lg p-2 w-56 text-xs">
      <div className="flex items-center gap-1 rounded p-1 text-white/30">TBD</div>
      <div className="flex items-center gap-1 rounded p-1 text-white/30">TBD</div>
    </div>
  );
}
