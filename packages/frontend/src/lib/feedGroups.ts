import { FeedEvent, Match, MatchStatus } from '@sweepstake/shared';
import { TeamOwner } from '@/lib/owners';

// The three views offered by the feed's filter. 'all' is the default.
export type FeedFilter = 'all' | 'mine' | 'live';

// Events that aren't tied to a loaded match (e.g. BRACKET_DRAWN, or a matchId we
// don't have a Match for) collapse into one synthetic group under this key.
export const OTHER_GROUP_KEY = '__other__';

// A match's events bundled together for the grouped feed. `match` is null for the
// synthetic "other" group; `status` is null when there's no match to read it from.
export interface MatchEventGroup {
  key: string;
  matchId: string | null;
  match: Match | null;
  status: MatchStatus | null;
  homeTeam?: string;
  awayTeam?: string;
  teamCodes: string[];
  events: FeedEvent[]; // newest-first
  latestTs: number; // ms of the newest event, for ordering groups
}

// The team codes an event involves, used for owner resolution + highlighting.
// Match-scoped events (goals, cards, kickoff/HT/FT) involve BOTH sides — it's
// your match whether your team scored or conceded, booked or got booked — so we
// return both teams and highlight if the viewer owns either. ELIMINATION is
// about a single team; BRACKET_DRAWN involves none.
export function eventTeamCodes(event: FeedEvent): string[] {
  if (event.type === 'ELIMINATION') {
    const code = (event.payload.teamCode as string) ?? event.teamCode;
    return code ? [code] : [];
  }
  if (event.type === 'BRACKET_DRAWN') return [];
  const home = event.payload.homeTeam as string | undefined;
  const away = event.payload.awayTeam as string | undefined;
  return [home, away].filter((c): c is string => !!c);
}

// ISO string -> epoch ms, treating an unparseable timestamp as 0 (sorts oldest).
function tsMs(ts: string): number {
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Bundle a flat, tournament-wide feed into per-match groups for display.
 *
 * Events are keyed by `matchId` when we have a loaded Match for it; everything
 * else (BRACKET_DRAWN, or a match we don't hold) falls into one synthetic
 * `OTHER_GROUP_KEY` group so nothing is dropped. Within each group events are
 * sorted newest-first; groups are ordered LIVE-first (mirroring the dashboard's
 * live = 0 ranking) then by most-recent activity, with the synthetic group
 * ranking among the non-live groups by its own latest event.
 */
export function groupEventsByMatch(events: FeedEvent[], matches: Match[]): MatchEventGroup[] {
  const matchesById = new Map(matches.map((m) => [m.matchId, m]));
  const buckets = new Map<string, FeedEvent[]>();

  for (const event of events) {
    const known = event.matchId ? matchesById.has(event.matchId) : false;
    const key = known ? (event.matchId as string) : OTHER_GROUP_KEY;
    const list = buckets.get(key);
    if (list) list.push(event);
    else buckets.set(key, [event]);
  }

  const groups: MatchEventGroup[] = [];
  for (const [key, groupEvents] of buckets) {
    const sorted = [...groupEvents].sort((a, b) => tsMs(b.ts) - tsMs(a.ts));
    const latestTs = sorted.length ? tsMs(sorted[0].ts) : 0;

    if (key === OTHER_GROUP_KEY) {
      groups.push({
        key,
        matchId: null,
        match: null,
        status: null,
        teamCodes: [],
        events: sorted,
        latestTs,
      });
      continue;
    }

    const match = matchesById.get(key) ?? null;
    groups.push({
      key,
      matchId: key,
      match,
      status: match?.status ?? null,
      homeTeam: match?.homeTeam,
      awayTeam: match?.awayTeam,
      teamCodes: match ? [match.homeTeam, match.awayTeam] : [],
      events: sorted,
      latestTs,
    });
  }

  return groups.sort((a, b) => {
    const rank = (g: MatchEventGroup) => (g.status === 'LIVE' ? 0 : 1);
    const byRank = rank(a) - rank(b);
    return byRank !== 0 ? byRank : b.latestTs - a.latestTs;
  });
}

// Whether the claimed person owns one of the match's teams.
export function isGroupMine(
  group: MatchEventGroup,
  ownersByTeam: Record<string, TeamOwner>,
  claimedPerson: string | null,
): boolean {
  if (!claimedPerson) return false;
  return group.teamCodes.some((code) => ownersByTeam[code]?.name === claimedPerson);
}

// Apply the active filter: 'live' keeps in-progress matches, 'mine' keeps the
// claimed person's matches, 'all' keeps everything.
export function filterFeedGroups(
  groups: MatchEventGroup[],
  filter: FeedFilter,
  ownersByTeam: Record<string, TeamOwner>,
  claimedPerson: string | null,
): MatchEventGroup[] {
  if (filter === 'live') return groups.filter((g) => g.status === 'LIVE');
  if (filter === 'mine') return groups.filter((g) => isGroupMine(g, ownersByTeam, claimedPerson));
  return groups;
}

// Live games are expanded so attention lands on what's in play; finished games
// collapse to keep the page tidy. Unknown/scheduled stay open so a group is never
// hidden with no way to tell why.
export function isGroupExpandedByDefault(group: MatchEventGroup): boolean {
  return group.status !== 'FINISHED';
}
