'use client';

import { FeedEvent, FeedEventType, Team } from '@sweepstake/shared';
import { displayTs, eventTeamCodes } from '@/lib/feedGroups';
import { relativeTime } from '@/lib/format';
import { TeamOwner } from '@/lib/owners';

// Icon + human label per event type, used for the timeline row marker.
const EVENT_META: Record<FeedEventType, { icon: string; label: string }> = {
  GOAL: { icon: '⚽', label: 'Goal' },
  YELLOW_CARD: { icon: '🟨', label: 'Yellow card' },
  RED_CARD: { icon: '🟥', label: 'Red card' },
  KICKOFF: { icon: '🟢', label: 'Kick-off' },
  HALF_TIME: { icon: '⏸️', label: 'Half time' },
  FULL_TIME: { icon: '🏁', label: 'Full time' },
  ELIMINATION: { icon: '💀', label: 'Eliminated' },
  BRACKET_DRAWN: { icon: '🗂️', label: 'Bracket drawn' },
};

interface FeedRowProps {
  event: FeedEvent;
  teamsByCode: Record<string, Team>;
  ownersByTeam: Record<string, TeamOwner>;
  claimedPerson: string | null;
  now: number;
}

export function FeedRow({ event, teamsByCode, ownersByTeam, claimedPerson, now }: FeedRowProps) {
  const meta = EVENT_META[event.type];

  // Team codes this event involves: a single team (GOAL/ELIMINATION) or both
  // sides of a match (KICKOFF/HALF_TIME/FULL_TIME). BRACKET_DRAWN involves no team.
  const teamCodes = eventTeamCodes(event);

  // Highlight when the claimed person owns one of the involved teams.
  const ownerNames = uniqueOwners(teamCodes, ownersByTeam).map((o) => o.name);
  const involvesClaimed = claimedPerson != null && ownerNames.includes(claimedPerson);

  // When the event happened in the match (goals back-date via payload.occurredAt;
  // everything else falls back to its detection ts).
  const when = displayTs(event);

  return (
    <li
      data-testid="feed-event"
      data-involves-claimed={involvesClaimed ? 'true' : 'false'}
      className={`flex items-start gap-3 rounded-lg border p-4 ${
        involvesClaimed
          ? 'border-sky-400/60 bg-sky-400/10'
          : 'border-white/10 bg-white/5'
      }`}
    >
      <span className="text-2xl leading-none shrink-0" aria-hidden="true">
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-green-200">
            {meta.label}
          </span>
          <time
            dateTime={when}
            className="text-xs text-white/60 whitespace-nowrap shrink-0"
            title={new Date(when).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
          >
            {relativeTime(when, now)}
          </time>
        </div>
        <div className="mt-1 text-sm font-medium">
          <EventHeadline event={event} teamsByCode={teamsByCode} ownersByTeam={ownersByTeam} />
        </div>
      </div>
    </li>
  );
}

// A team's flag + name, with its owner in brackets (gold) right after — matching
// how the groups standings table surfaces owners. Falls back to the raw team
// code when the team isn't loaded yet; renders no bracket when unowned.
function TeamLabel({
  code,
  teamsByCode,
  ownersByTeam,
}: {
  code: string | undefined;
  teamsByCode: Record<string, Team>;
  ownersByTeam: Record<string, TeamOwner>;
}) {
  if (!code) return null;
  const team = teamsByCode[code];
  const owner = ownersByTeam[code];
  return (
    <span className="whitespace-nowrap">
      {team ? `${team.flag} ${team.name}` : code}
      {owner && (
        <span className="ml-1 text-xs text-gold/80 font-normal">({owner.name})</span>
      )}
    </span>
  );
}

// Headline line per event type: flags + names (+ owner brackets) + scoreline
// pulled from the payload.
function EventHeadline({
  event,
  teamsByCode,
  ownersByTeam,
}: {
  event: FeedEvent;
  teamsByCode: Record<string, Team>;
  ownersByTeam: Record<string, TeamOwner>;
}) {
  const p = event.payload;

  if (event.type === 'BRACKET_DRAWN') {
    return <span>Knockout bracket has been drawn</span>;
  }

  if (event.type === 'ELIMINATION') {
    const code = (p.teamCode as string) ?? event.teamCode;
    const at = p.eliminatedAt as string | null | undefined;
    return (
      <span>
        <TeamLabel code={code} teamsByCode={teamsByCode} ownersByTeam={ownersByTeam} /> knocked
        out{at ? ` (${at})` : ''}
      </span>
    );
  }

  // A booking: the booked player's team, then the player name + minute.
  if (event.type === 'YELLOW_CARD' || event.type === 'RED_CARD') {
    const code = (p.teamCode as string) ?? event.teamCode;
    const player = p.player as string | undefined;
    const minute = p.minute as string | undefined;
    return (
      <span>
        <TeamLabel code={code} teamsByCode={teamsByCode} ownersByTeam={ownersByTeam} />{' '}
        <span className="text-green-100">
          — {player}
          {minute ? ` ${minute}'` : ''}
        </span>
      </span>
    );
  }

  const home = p.homeTeam as string | undefined;
  const away = p.awayTeam as string | undefined;
  const homeScore = p.homeScore as number | undefined;
  const awayScore = p.awayScore as number | undefined;
  const hasScore = typeof homeScore === 'number' && typeof awayScore === 'number';

  // GOAL events may carry the scorer (+ minute) when it's known; show it after
  // the scoreline. Other match events (KICKOFF/HALF_TIME/FULL_TIME) never do.
  const scorer = event.type === 'GOAL' ? (p.scorer as string | undefined) : undefined;
  const scorerMinute = p.scorerMinute as string | undefined;

  // A Full Time on a knockout tie decided on penalties states the shootout
  // result (winner first), so a 1–1 reads as the win it actually was.
  const pens = penaltyResult(event, teamsByCode);

  return (
    <span>
      <TeamLabel code={home} teamsByCode={teamsByCode} ownersByTeam={ownersByTeam} />{' '}
      {hasScore && <span className="font-bold">{homeScore}–{awayScore}</span>}{' '}
      <TeamLabel code={away} teamsByCode={teamsByCode} ownersByTeam={ownersByTeam} />
      {scorer && (
        <span className="text-green-100">
          {' '}· {scorer}
          {scorerMinute ? ` ${scorerMinute}'` : ''}
        </span>
      )}
      {pens && <span className="text-green-100"> · {pens}</span>}
    </span>
  );
}

// "MAR win 3–2 on pens" for a FULL_TIME event carrying a shootout result, or
// null otherwise. Reads the winner + tally from the payload; orders the score
// winner-first so it reads as a win regardless of home/away.
function penaltyResult(
  event: FeedEvent,
  teamsByCode: Record<string, Team>,
): string | null {
  if (event.type !== 'FULL_TIME') return null;
  const p = event.payload;
  const winner = p.shootoutWinner as string | undefined;
  const home = p.homeTeam as string | undefined;
  const penaltyHome = p.penaltyHome as number | undefined;
  const penaltyAway = p.penaltyAway as number | undefined;
  if (!winner || typeof penaltyHome !== 'number' || typeof penaltyAway !== 'number') {
    return null;
  }
  const winnerPens = winner === home ? penaltyHome : penaltyAway;
  const loserPens = winner === home ? penaltyAway : penaltyHome;
  const winnerName = teamsByCode[winner]?.name ?? winner;
  return `${winnerName} win ${winnerPens}–${loserPens} on pens`;
}

// Distinct owners (by name) of the given team codes, preserving order.
function uniqueOwners(
  codes: string[],
  ownersByTeam: Record<string, TeamOwner>,
): TeamOwner[] {
  const seen = new Set<string>();
  const owners: TeamOwner[] = [];
  for (const code of codes) {
    const owner = ownersByTeam[code];
    if (owner && !seen.has(owner.name)) {
      seen.add(owner.name);
      owners.push(owner);
    }
  }
  return owners;
}
