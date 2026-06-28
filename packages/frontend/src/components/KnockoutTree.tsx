'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

// useLayoutEffect warns when run during SSR; fall back to useEffect on the
// server so the measured connectors paint without a flash on the client.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const CORNER_RADIUS = 6;
const r1 = (n: number) => Math.round(n * 10) / 10;

// A rounded right-angle "elbow" from a parent card's right edge (x1,y1) to a
// child card's left edge (x2,y2): horizontal stub out, vertical run at the
// mid-x between the columns, horizontal stub in, with rounded bends. Degrades to
// a straight line when the two cards are level.
function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  if (Math.abs(y2 - y1) < 0.5) {
    return `M ${r1(x1)} ${r1(y1)} L ${r1(x2)} ${r1(y2)}`;
  }
  const dir = y2 > y1 ? 1 : -1;
  const r = Math.min(CORNER_RADIUS, Math.abs(midX - x1), Math.abs(x2 - midX), Math.abs(y2 - y1) / 2);
  return [
    `M ${r1(x1)} ${r1(y1)}`,
    `L ${r1(midX - r)} ${r1(y1)}`,
    `Q ${r1(midX)} ${r1(y1)} ${r1(midX)} ${r1(y1 + dir * r)}`,
    `L ${r1(midX)} ${r1(y2 - dir * r)}`,
    `Q ${r1(midX)} ${r1(y2)} ${r1(midX + r)} ${r1(y2)}`,
    `L ${r1(x2)} ${r1(y2)}`,
  ].join(' ');
}

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

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [connectors, setConnectors] = useState<string[]>([]);

  // Draw bracket connectors by measuring real card positions, so the lines stay
  // correct however flexbox lays the cards out, whatever a round's match count,
  // and at any width. Each card (cell n in round r) links to its successor
  // (cell ⌊n/2⌋ in round r+1) — when that successor exists, keeping partially
  // scheduled rounds and the successor-less final from drawing dangling lines.
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const compute = () => {
      const origin = container.getBoundingClientRect();
      setSize({ w: origin.width, h: origin.height });

      const byRound = new Map<number, Map<number, DOMRect>>();
      for (const el of container.querySelectorAll<HTMLElement>('[data-round-index]')) {
        const round = Number(el.dataset.roundIndex);
        const cell = Number(el.dataset.cellIndex);
        if (!byRound.has(round)) byRound.set(round, new Map());
        byRound.get(round)!.set(cell, el.getBoundingClientRect());
      }

      const paths: string[] = [];
      for (const [round, cells] of byRound) {
        const next = byRound.get(round + 1);
        if (!next) continue;
        for (const [cell, rect] of cells) {
          const target = next.get(Math.floor(cell / 2));
          if (!target) continue;
          paths.push(
            elbowPath(
              rect.right - origin.left,
              rect.top - origin.top + rect.height / 2,
              target.left - origin.left,
              target.top - origin.top + target.height / 2,
            ),
          );
        }
      }
      setConnectors(paths);
    };

    compute();
    // Recompute when card sizes shift (flags/fonts loading, content reflow).
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [matches]);

  return (
    <div className="overflow-x-auto">
      <div ref={containerRef} className="relative flex gap-4 min-w-max p-1">
        <svg
          className="absolute inset-0 pointer-events-none z-0"
          width={size.w}
          height={size.h}
          aria-hidden="true"
        >
          {connectors.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="white"
              strokeOpacity={0.2}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        {rounds.map((r, roundIndex) => (
          <div
            key={r.round}
            className="relative z-10 flex flex-col gap-4"
            data-testid={`round-column-${r.round}`}
          >
            <h3 className="text-sm font-bold text-gold text-center mb-1">{r.label}</h3>
            <div className="flex flex-col justify-around flex-1 gap-3">
              {r.matches.length > 0
                ? r.matches.map((m, i) => (
                    <TreeMatch
                      key={m.matchId}
                      match={m}
                      teamOwners={teamOwners}
                      teamFlags={teamFlags}
                      roundIndex={roundIndex}
                      cellIndex={i}
                    />
                  ))
                : Array.from({ length: ROUND_SIZES[r.round] }).map((_, i) => (
                    <TreePlaceholder key={i} roundIndex={roundIndex} cellIndex={i} />
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
  roundIndex,
  cellIndex,
}: {
  match: Match;
  teamOwners?: Record<string, TeamOwner>;
  teamFlags?: Record<string, string>;
  roundIndex: number;
  cellIndex: number;
}) {
  const finished = match.status === 'FINISHED';
  const live = match.status === 'LIVE';
  const homeWon = finished && (match.homeScore ?? 0) > (match.awayScore ?? 0);
  const awayWon = finished && (match.awayScore ?? 0) > (match.homeScore ?? 0);

  return (
    <div
      data-round-index={roundIndex}
      data-cell-index={cellIndex}
      className="bg-white/5 border border-white/10 rounded-lg p-2 w-56 text-xs"
    >
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

function TreePlaceholder({ roundIndex, cellIndex }: { roundIndex: number; cellIndex: number }) {
  return (
    <div
      data-round-index={roundIndex}
      data-cell-index={cellIndex}
      className="bg-white/[0.02] border border-dashed border-white/10 rounded-lg p-2 w-56 text-xs"
    >
      <div className="flex items-center gap-1 rounded p-1 text-white/30">TBD</div>
      <div className="flex items-center gap-1 rounded p-1 text-white/30">TBD</div>
    </div>
  );
}
