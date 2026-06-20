import { Match } from '@sweepstake/shared';
import { TeamOwner } from '@/lib/owners';

// The two views offered by the fixtures filter. 'all' is the default; team search
// is layered on top of the 'all' view.
export type FixturesFilter = 'all' | 'mine';

// ISO string -> epoch ms, treating an unparseable timestamp as 0 so a bad
// datetime sorts deterministically (oldest) rather than scrambling the order.
function tsMs(ts: string): number {
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

// A match is "mine" if the claimed person owns either side — it's your fixture
// whether your team is at home or away.
export function isMatchMine(
  match: Match,
  ownersByTeam: Record<string, TeamOwner>,
  claimedPerson: string | null,
): boolean {
  if (!claimedPerson) return false;
  return (
    ownersByTeam[match.homeTeam]?.name === claimedPerson ||
    ownersByTeam[match.awayTeam]?.name === claimedPerson
  );
}

/**
 * The fixtures display pipeline.
 *
 * Works on a copy (never mutates the input), sorting oldest -> newest with a
 * NaN-safe comparator. Then applies the active view: 'mine' keeps the claimed
 * person's matches; 'all' keeps everything. Team search narrows to a single
 * team but is an "All view" feature only — it's applied only when filter==='all'
 * and a teamCode is set, and is ignored entirely under the 'mine' filter.
 */
export function filterFixtures(
  matches: Match[],
  opts: { filter: FixturesFilter; teamCode: string | null },
  ownersByTeam: Record<string, TeamOwner>,
  claimedPerson: string | null,
): Match[] {
  const sorted = [...matches].sort((a, b) => tsMs(a.datetime) - tsMs(b.datetime));

  if (opts.filter === 'mine') {
    return sorted.filter((m) => isMatchMine(m, ownersByTeam, claimedPerson));
  }

  if (opts.teamCode) {
    const code = opts.teamCode;
    return sorted.filter((m) => m.homeTeam === code || m.awayTeam === code);
  }

  return sorted;
}

// Europe/London calendar day for a timestamp, as a sortable YYYY-MM-DD string
// (en-CA renders ISO order). Bucketing by the UK match day — not the raw UTC
// instant — keeps an evening kick-off on the right side of "today" under BST.
export function londonDayKey(ts: number | string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

// Index in a chronologically-sorted fixtures list before which the "Today"
// marker belongs: the first fixture kicking off today or later (Europe/London).
// A rest day has no fixture dated today, so the marker lands before the next
// upcoming one — it always shows where "now" sits in the list. Returns null once
// every fixture is in the past (tournament over), so the marker simply drops out.
// Expects the list already sorted oldest -> newest (filterFixtures guarantees it).
export function todayDividerIndex(sortedMatches: Match[], now: number): number | null {
  const today = londonDayKey(now);
  const idx = sortedMatches.findIndex((m) => londonDayKey(m.datetime) >= today);
  return idx === -1 ? null : idx;
}

// Earliest upcoming match belonging to the claimed person, or null if there is
// none (their teams are all done, or no claimed person). Used by the My Fixtures
// tab to surface the "Next match" line.
export function nextMyMatch(
  matches: Match[],
  ownersByTeam: Record<string, TeamOwner>,
  claimedPerson: string | null,
): Match | null {
  if (!claimedPerson) return null;
  return (
    matches
      .filter((m) => m.status === 'SCHEDULED' && isMatchMine(m, ownersByTeam, claimedPerson))
      .sort((a, b) => tsMs(a.datetime) - tsMs(b.datetime))[0] ?? null
  );
}

// Empty-state copy, chosen by why the list is empty. Priority: nothing loaded at
// all wins first, then a team search with no hits, then the 'mine' view with no
// owned fixtures, then a generic fallback.
export function fixturesEmptyMessage(
  total: number,
  filter: FixturesFilter,
  teamCode: string | null,
): string {
  if (total === 0) return 'No fixtures available yet. Check back once the schedule is published.';
  if (teamCode) return 'No fixtures for the selected team.';
  if (filter === 'mine') return 'None of your teams have any fixtures.';
  return 'No fixtures match the current filters.';
}
