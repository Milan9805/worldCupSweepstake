import { Match } from '@sweepstake/shared';

export interface TeamMatchInfo {
  live: Match | null; // a game currently in progress
  next: Match | null; // earliest upcoming fixture
  previous: Match | null; // most recent finished game
}

// Derive the most relevant matches for a single team from the full fixture list.
// Teams are keyed by TLA, which matches Match.homeTeam / Match.awayTeam.
export function getTeamMatchInfo(teamCode: string, matches: Match[]): TeamMatchInfo {
  const teamMatches = matches.filter(
    (m) => m.homeTeam === teamCode || m.awayTeam === teamCode
  );

  const live = teamMatches.find((m) => m.status === 'LIVE') ?? null;

  const next =
    teamMatches
      .filter((m) => m.status === 'SCHEDULED')
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())[0] ?? null;

  const previous =
    teamMatches
      .filter((m) => m.status === 'FINISHED')
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())[0] ?? null;

  return { live, next, previous };
}

export interface TournamentMatchInfo {
  live: Match[]; // every in-progress match (group stage runs them in parallel)
  next: Match | null; // earliest upcoming fixture across all teams
}

// Derive the tournament-wide live/next picture from the full fixture list, for
// the dashboard banner. Unlike getTeamMatchInfo this keeps ALL live matches
// (several group-stage games kick off together) and finds the single soonest
// upcoming fixture regardless of who owns the teams.
export function getTournamentMatchInfo(matches: Match[]): TournamentMatchInfo {
  const live = matches
    .filter((m) => m.status === 'LIVE')
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  const next =
    matches
      .filter((m) => m.status === 'SCHEDULED')
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())[0] ?? null;

  return { live, next };
}

// Rank teams for dashboard display by match relevance:
// 1. A team with a LIVE match comes first.
// 2. Then teams with an upcoming match, soonest kickoff first.
// 3. Then teams with no upcoming fixture (eliminated / done), most recent past
//    match first. Teams with no matches at all sink to the bottom.
export function compareTeamsByMatch(a: TeamMatchInfo, b: TeamMatchInfo): number {
  const rank = (info: TeamMatchInfo) => (info.live ? 0 : info.next ? 1 : 2);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;

  // Both upcoming: soonest first.
  if (ra === 1 && a.next && b.next) {
    return new Date(a.next.datetime).getTime() - new Date(b.next.datetime).getTime();
  }

  // Both have no upcoming fixture: most recent past match first.
  if (ra === 2) {
    const at = a.previous ? new Date(a.previous.datetime).getTime() : -Infinity;
    const bt = b.previous ? new Date(b.previous.datetime).getTime() : -Infinity;
    return bt - at;
  }

  return 0;
}
