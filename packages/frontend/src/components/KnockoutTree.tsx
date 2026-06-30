'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Match, BracketSlot, KnockoutFeeder, buildKnockoutTree } from '@sweepstake/shared';
import Avatar from '@/components/Avatar';
import LiveBadge from '@/components/LiveBadge';
import ChannelPills from '@/components/ChannelPills';
import { formatMatchDate, formatMatchTime, formatPens, feederLabel } from '@/lib/format';
import { TeamOwner } from '@/lib/owners';

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
  // The claimed member, so ties involving one of their teams are highlighted
  // blue — the same "my games" treatment the fixtures list uses.
  claimedPerson?: string | null;
}

/**
 * The knockout bracket: a left-to-right column per round (horizontally
 * scrollable). Every tie sits at its fixed bracket position (see
 * buildKnockoutTree) — the matchups come from the real scraped fixtures, the
 * positions from the fixed 2026 structure — so the tree never re-orders as
 * results come in; a slot not yet filled shows the feeding tie ("Winner Match
 * 77"). Each card is compact — flag, code, owner and score per side — with the
 * kick-off time, a winner highlight, and a live badge that links to the feed.
 * The round headings sit in a sticky bar that pins beneath the nav while the
 * tree scrolls and tracks the bracket's horizontal scroll. Measured SVG elbow
 * lines connect each tie to the next-round tie it feeds, drawing the bracket.
 */
export default function KnockoutTree({
  matches,
  teamOwners,
  teamFlags,
  claimedPerson,
}: KnockoutTreeProps) {
  const rounds = useMemo(() => buildKnockoutTree(matches), [matches]);
  // Which tie feeds which is now fixed by the bracket structure (buildKnockoutTree
  // places every tie at its true position), so the connectors are structural: slot
  // i of a round feeds slot i>>1 of the next. That draws the complete bracket — every
  // path to the final, decided or not — rather than only the resolved links.
  const feederLinks = useMemo(() => {
    const links: { round: number; from: number; to: number }[] = [];
    for (let r = 0; r < rounds.length - 1; r++) {
      rounds[r].slots.forEach((_, from) => {
        links.push({ round: r, from, to: from >> 1 });
      });
    }
    return links;
  }, [rounds]);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [connectors, setConnectors] = useState<string[]>([]);
  // The round-headings bar pins below the sticky NavBar (h-16 = 64px) AND, when
  // shown, the sticky MatchBanner that NavBar renders on every page at top-16.
  // Without this the headings pin at the same 64px and hide behind the banner;
  // measuring the banner lets them sit flush beneath it (mirrors the fixtures
  // page's sticky filter bar).
  const [headerTop, setHeaderTop] = useState(64);
  useIsomorphicLayoutEffect(() => {
    const NAV_H = 64;
    const banner = document.querySelector<HTMLElement>('[data-testid="match-banner"]');
    if (!banner) {
      setHeaderTop(NAV_H);
      return;
    }
    const measure = () => setHeaderTop(NAV_H + banner.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(banner);
    return () => ro.disconnect();
  }, []);

  // Keep the sticky round-headings bar aligned with the bracket's horizontal
  // scroll. Translating the header's content (rather than re-rendering) keeps it
  // cheap on every scroll frame.
  const syncHeader = () => {
    if (headerInnerRef.current && scrollRef.current) {
      headerInnerRef.current.style.transform = `translateX(${-scrollRef.current.scrollLeft}px)`;
    }
  };

  // Draw bracket connectors by measuring real card positions, so the lines stay
  // correct however flexbox lays the cards out, whatever a round's match count,
  // and at any width. The which-feeds-which pairing comes from feederLinks (the
  // fixed bracket structure), so the full set of paths to the final is drawn.
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
      for (const { round, from, to } of feederLinks) {
        const fromRect = byRound.get(round)?.get(from);
        const toRect = byRound.get(round + 1)?.get(to);
        if (!fromRect || !toRect) continue;
        paths.push(
          elbowPath(
            fromRect.right - origin.left,
            fromRect.top - origin.top + fromRect.height / 2,
            toRect.left - origin.left,
            toRect.top - origin.top + toRect.height / 2,
          ),
        );
      }
      setConnectors(paths);
      syncHeader();
    };

    compute();
    // Recompute when card sizes shift (flags/fonts loading, content reflow).
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [feederLinks]);

  return (
    <div className="relative">
      {/* Round headings, pinned beneath the nav while the tree scrolls and
          released once the page scrolls past the bracket. Lives outside the
          horizontal scroll container (whose implicit overflow-y would break a
          vertical sticky) and tracks that scroll via syncHeader. */}
      <div
        data-testid="tree-round-headings"
        style={{ top: headerTop }}
        className="sticky z-20 overflow-hidden border-b border-white/10 bg-[#0f2e1c]"
      >
        <div ref={headerInnerRef} className="flex gap-4 min-w-max px-1 py-2">
          {rounds.map((r) => (
            <h3 key={r.round} className="w-56 shrink-0 text-sm font-bold text-gold text-center">
              {r.label}
            </h3>
          ))}
        </div>
      </div>

      <div ref={scrollRef} onScroll={syncHeader} className="overflow-x-auto">
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
              className="relative z-10 flex flex-col justify-around gap-3"
              data-testid={`round-column-${r.round}`}
            >
              {r.slots.map((slot, i) => (
                <TreeMatch
                  key={slot.slotId}
                  slot={slot}
                  teamOwners={teamOwners}
                  teamFlags={teamFlags}
                  claimedPerson={claimedPerson}
                  roundIndex={roundIndex}
                  cellIndex={i}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeMatch({
  slot,
  teamOwners,
  teamFlags,
  claimedPerson,
  roundIndex,
  cellIndex,
}: {
  slot: BracketSlot;
  teamOwners?: Record<string, TeamOwner>;
  teamFlags?: Record<string, string>;
  claimedPerson?: string | null;
  roundIndex: number;
  cellIndex: number;
}) {
  const finished = slot.status === 'FINISHED';
  const live = slot.status === 'LIVE';

  // A tie the claimed member owns a team in, highlighted blue like the fixtures
  // list so it's easy to spot where your teams are.
  const mine =
    !!claimedPerson &&
    ((!!slot.homeTeam && teamOwners?.[slot.homeTeam]?.name === claimedPerson) ||
      (!!slot.awayTeam && teamOwners?.[slot.awayTeam]?.name === claimedPerson));

  // A tie with neither side decided is a "to be confirmed" placeholder, so the
  // full path to the final stays visible before later rounds are calculated.
  if (!slot.homeTeam && !slot.awayTeam && !finished) {
    return (
      <div
        data-round-index={roundIndex}
        data-cell-index={cellIndex}
        className="bg-white/[0.02] border border-dashed border-white/10 rounded-lg p-2 w-56 text-xs"
      >
        <div className="flex items-center gap-1 rounded p-1 text-white/30">
          {feederLabel(slot.homeFeeder) ?? 'TBD'}
        </div>
        <div className="flex items-center gap-1 rounded p-1 text-white/30">
          {feederLabel(slot.awayFeeder) ?? 'TBD'}
        </div>
      </div>
    );
  }

  // Winner highlight: the higher score, or — when level after extra time — the
  // higher penalty shootout tally, so the team that advanced on pens stays green.
  const homeScore = slot.homeScore ?? 0;
  const awayScore = slot.awayScore ?? 0;
  const pensHome = slot.penaltyHome ?? null;
  const pensAway = slot.penaltyAway ?? null;
  const levelOnPens = homeScore === awayScore && pensHome != null && pensAway != null;
  const homeWon =
    finished && (homeScore > awayScore || (levelOnPens && pensHome! > pensAway!));
  const awayWon =
    finished && (awayScore > homeScore || (levelOnPens && pensAway! > pensHome!));
  const pensLine = formatPens(slot.penaltyHome, slot.penaltyAway);

  return (
    <div
      data-round-index={roundIndex}
      data-cell-index={cellIndex}
      data-involves-claimed={mine ? 'true' : 'false'}
      className={`rounded-lg border p-2 w-56 text-xs ${
        mine ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[10px] text-white/60 whitespace-nowrap">
          {slot.datetime
            ? `${formatMatchDate(slot.datetime).replace(',', '')} · ${formatMatchTime(slot.datetime)}`
            : ''}
        </span>
        {live ? (
          <Link href="/feed" aria-label="Watch this live match in the feed" className="shrink-0">
            <LiveBadge minute={slot.minute} layout="inline" />
          </Link>
        ) : finished ? (
          <span className="shrink-0 rounded bg-gray-600 px-1.5 py-0.5 text-[10px] text-white">FT</span>
        ) : null}
      </div>
      {slot.channels && slot.channels.length > 0 && (
        <div className="mb-1">
          <ChannelPills channels={slot.channels} />
        </div>
      )}
      <TeamRow
        code={slot.homeTeam}
        feeder={slot.homeFeeder}
        flag={slot.homeTeam ? teamFlags?.[slot.homeTeam] : undefined}
        owner={slot.homeTeam ? teamOwners?.[slot.homeTeam] : undefined}
        score={slot.status === 'SCHEDULED' ? null : slot.homeScore}
        won={homeWon}
      />
      <TeamRow
        code={slot.awayTeam}
        feeder={slot.awayFeeder}
        flag={slot.awayTeam ? teamFlags?.[slot.awayTeam] : undefined}
        owner={slot.awayTeam ? teamOwners?.[slot.awayTeam] : undefined}
        score={slot.status === 'SCHEDULED' ? null : slot.awayScore}
        won={awayWon}
      />
      {pensLine && (
        <div className="mt-0.5 pr-1 text-right text-[10px] text-white/50">{pensLine}</div>
      )}
    </div>
  );
}

function TeamRow({
  code,
  feeder,
  flag,
  owner,
  score,
  won,
}: {
  code: string | null;
  feeder?: KnockoutFeeder | null;
  flag?: string;
  owner?: TeamOwner;
  score: number | null;
  won: boolean;
}) {
  const label = code ?? feederLabel(feeder) ?? 'TBD';
  return (
    <div className={`flex items-center gap-1 rounded p-1 ${won ? 'bg-green-900/40' : ''}`}>
      {flag && <span className="text-base leading-none shrink-0">{flag}</span>}
      <span className={`font-semibold shrink-0 ${code ? '' : 'text-white/30'}`}>{label}</span>
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
