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
