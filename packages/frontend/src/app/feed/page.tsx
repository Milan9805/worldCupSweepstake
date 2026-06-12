'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import { useGroup } from '@/hooks/GroupContext';
import { usePollScores } from '@/hooks/usePollScores';
import { getFeed } from '@/lib/api';
import { buildTeamsByCode } from '@/lib/owners';
import { FeedEvent, FeedEventType, Person, Team } from '@sweepstake/shared';

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

export default function FeedPage() {
  const { groupKey, group, teams, matches, claimedPerson } = useGroup();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // A 1-minute ticker so relative timestamps ("just now" → "1m ago") keep
  // advancing while the page is open, independent of when the feed re-fetches
  // (the poll only runs while a match is live).
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Pull the feed (public, no group needed). Kept separate from the group/teams
  // load so the adaptive poll can re-fetch just the timeline cheaply.
  const loadFeed = useCallback(async () => {
    try {
      const data = await getFeed();
      setEvents(data);
    } catch (err) {
      // Polling/initial failures are non-fatal — keep the last good timeline.
      console.error('Error loading feed:', err);
    }
  }, []);

  useEffect(() => {
    if (!groupKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem('sweepstake_group_key');
      if (!stored) {
        router.push('/');
        return;
      }
    }
    // The group/teams/matches load is owned by the shared GroupProvider; only
    // the feed itself is fetched here.
    loadFeed().finally(() => setLoading(false));
  }, [groupKey, loadFeed, router]);

  // Reuse the adaptive poll: `matches` drives the cadence (30s while live, off
  // when idle, visibility-aware) and each tick re-fetches the feed.
  usePollScores(matches, loadFeed);

  if (loading && events.length === 0 && !group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-green-200">Loading...</div>
      </div>
    );
  }

  // Team code → team, for resolving flags/names from the event payload.
  const teamsByCode = buildTeamsByCode(teams);

  // Team code → the active group's member who owns it (a team belongs to at most
  // one member). Used to attach an owner name to each event.
  const ownersByTeam: Record<string, Person> = {};
  if (group) {
    for (const member of group.members) {
      for (const code of member.teams) {
        ownersByTeam[code] = member;
      }
    }
  }

  // Newest first. The API already returns events in descending order, but sort
  // defensively so the timeline is correct regardless of source ordering.
  const sorted = [...events].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );

  return (
    <div className="min-h-screen">
      <NavBar groupName={group?.groupName} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">Live Feed</h1>

        {sorted.length === 0 ? (
          <div className="text-center text-green-200 py-12">
            Nothing has happened yet. Events will appear here as matches kick off,
            goals go in, and teams are knocked out.
          </div>
        ) : (
          <ol className="space-y-3">
            {sorted.map((event) => (
              <FeedRow
                key={event.eventId}
                event={event}
                teamsByCode={teamsByCode}
                ownersByTeam={ownersByTeam}
                claimedPerson={claimedPerson}
                now={now}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

interface FeedRowProps {
  event: FeedEvent;
  teamsByCode: Record<string, Team>;
  ownersByTeam: Record<string, Person>;
  claimedPerson: string | null;
  now: number;
}

function FeedRow({ event, teamsByCode, ownersByTeam, claimedPerson, now }: FeedRowProps) {
  const meta = EVENT_META[event.type];

  // Team codes this event involves: a single team (GOAL/ELIMINATION) or both
  // sides of a match (KICKOFF/HALF_TIME/FULL_TIME). BRACKET_DRAWN involves no team.
  const teamCodes = eventTeamCodes(event);

  // Highlight when the claimed person owns one of the involved teams.
  const ownerNames = uniqueOwners(teamCodes, ownersByTeam).map((o) => o.name);
  const involvesClaimed = claimedPerson != null && ownerNames.includes(claimedPerson);

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
            dateTime={event.ts}
            className="text-xs text-white/60 whitespace-nowrap shrink-0"
            title={new Date(event.ts).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
          >
            {relativeTime(event.ts, now)}
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
  ownersByTeam: Record<string, Person>;
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
  ownersByTeam: Record<string, Person>;
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
    </span>
  );
}

// The team codes an event involves, used for owner resolution + highlighting.
// Match-scoped events (goals, cards, kickoff/HT/FT) involve BOTH sides — it's
// your match whether your team scored or conceded, booked or got booked — so we
// return both teams and highlight if the viewer owns either. ELIMINATION is
// about a single team; BRACKET_DRAWN involves none.
function eventTeamCodes(event: FeedEvent): string[] {
  if (event.type === 'ELIMINATION') {
    const code = (event.payload.teamCode as string) ?? event.teamCode;
    return code ? [code] : [];
  }
  if (event.type === 'BRACKET_DRAWN') return [];
  const home = event.payload.homeTeam as string | undefined;
  const away = event.payload.awayTeam as string | undefined;
  return [home, away].filter((c): c is string => !!c);
}

// Distinct owners (by name) of the given team codes, preserving order.
function uniqueOwners(
  codes: string[],
  ownersByTeam: Record<string, Person>,
): Person[] {
  const seen = new Set<string>();
  const owners: Person[] = [];
  for (const code of codes) {
    const owner = ownersByTeam[code];
    if (owner && !seen.has(owner.name)) {
      seen.add(owner.name);
      owners.push(owner);
    }
  }
  return owners;
}

// Compact relative timestamp ("just now", "5m ago", "2h ago"), falling back to
// a clock time for older events. UK locale to match the rest of the app. `now`
// is passed in (and ticks every minute) so the label keeps advancing.
function relativeTime(ts: string, now: number = Date.now()): string {
  const then = new Date(ts).getTime();
  const diffMs = now - then;
  if (Number.isNaN(then)) return '';
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}
