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
